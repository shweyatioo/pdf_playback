import { useEffect, useRef, useState } from 'react';
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist';
import worker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { buildSentences, extractArticle, type Article } from './document';
import PdfPage from './PdfPage';
GlobalWorkerOptions.workerSrc = worker;
type Clip = { url: string; duration: number };
const time = (seconds: number) => `${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;

export default function App() {
  const [pdf,setPdf] = useState<PDFDocumentProxy>();
  const [article,setArticle] = useState<Article>();
  const [fileName,setFileName] = useState('');
  const [status,setStatus] = useState('');
  const [error,setError] = useState('');
  const [voices,setVoices] = useState<string[]>([]);
  const [voice,setVoice] = useState('');
  const [clips,setClips] = useState<Record<number,Clip>>({});
  const [active,setActive] = useState(0);
  const [playing,setPlaying] = useState(false);
  const [position,setPosition] = useState(0);
  const [speed,setSpeed] = useState(1);
  const [follow,setFollow] = useState(true);
  const [zoom,setZoom] = useState(1);
  const [review,setReview] = useState(false);
  const [generating,setGenerating] = useState(false);
  const [retry,setRetry] = useState(0);
  const audio = useRef<HTMLAudioElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const viewer = useRef<HTMLDivElement>(null);
  const wantsPlay = useRef(false);
  const pendingOffset = useRef(0);
  const documentKey = useRef('');
  const generation = useRef(0);
  const loadToken = useRef(0);
  const [viewerWidth,setViewerWidth] = useState(750);
  useEffect(() => {
    fetch('/api/voices').then(r => r.json()).then(data => {
      setVoices(data.voices || []);
      setVoice(data.voices?.includes('Samantha') ? 'Samantha' : data.voices?.[0] || '');
      if (!data.available) setError('The local voice service needs macOS. Start this app on your Mac to generate narration.');
    }).catch(() => setError('Cannot reach the audio server. Start the app with npm run dev.'));
  }, []);
  useEffect(() => {
    if (!viewer.current) return;
    const observer = new ResizeObserver(([entry]) => setViewerWidth(entry.contentRect.width));
    observer.observe(viewer.current); return () => observer.disconnect();
  }, [pdf]);
  useEffect(() => () => { void pdf?.loadingTask.destroy(); }, [pdf]);

  async function upload(file?: File) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf')) { setError('Please choose a PDF file.'); return; }
    if (file.size > 50*1024*1024) { setError('Choose a PDF smaller than 50 MB.'); return; }
    const token = ++loadToken.current;
    generation.current++; wantsPlay.current = false; audio.current?.pause(); setPlaying(false);
    setStatus('Finding the article in your PDF…'); setError('');
    let doc: PDFDocumentProxy | undefined;
    try {
      const buffer = await file.arrayBuffer();
      const hash = await crypto.subtle.digest('SHA-256', buffer.slice(0));
      const key = [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2,'0')).join('');
      doc = await getDocument({ data: buffer }).promise;
      if (doc.numPages > 80) throw new Error('This first version supports articles up to 80 pages.');
      const parsed = await extractArticle(doc);
      if (!parsed.sentences.length) throw new Error('No readable text was found. Scanned PDFs need OCR, which is not supported yet.');
      if (token !== loadToken.current) { await doc.loadingTask.destroy(); return; }
      documentKey.current = key;
      let saved = 0; try { saved = Number(localStorage.getItem(`folio:${key}`)) || 0; } catch { /* storage optional */ }
      setActive(Math.min(Math.max(0,saved),parsed.sentences.length-1)); setPosition(0); pendingOffset.current = 0;
      setClips({}); setPdf(doc); setArticle(parsed); setFileName(file.name); setReview(false); setStatus('');
    } catch (e) { await doc?.loadingTask.destroy(); if (token === loadToken.current) { setStatus(''); setError(e instanceof Error ? e.message : 'Could not open this PDF.'); } }
  }

  // Generate real, separately seekable audio clips. A generation token prevents
  // old documents or voices from replacing the currently selected recording.
  useEffect(() => {
    if (!article || !voice) return;
    const token = ++generation.current;
    const controller = new AbortController();
    setGenerating(true);
    (async () => {
      try {
        for (let step=0;step<article.sentences.length;step++) {
          const i = (active+step)%article.sentences.length;
          const response = await fetch('/api/audio', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ text:article.sentences[i].text, voice }), signal:controller.signal });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || 'Could not generate audio.');
          if (token !== generation.current) return;
          setClips(previous => ({ ...previous, [i]:data }));
        }
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Audio generation failed.'); }
      finally { if (token === generation.current) setGenerating(false); }
    })();
    return () => { controller.abort(); generation.current++; };
    // Active is the initial queue priority, not a reason to restart synthesis.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [article, voice, retry]);

  useEffect(() => {
    if (!article) return;
    try { localStorage.setItem(`folio:${documentKey.current}`, String(active)); } catch { /* storage optional */ }
    const target = document.querySelector(`[data-sentence="${active}"]`);
    const container = viewer.current;
    if (follow && target && container) container.scrollTo({ top:container.scrollTop + target.getBoundingClientRect().top - container.getBoundingClientRect().top - container.clientHeight/2, behavior:'smooth' });
  }, [active, article, follow]);
  const clip = clips[active];
  useEffect(() => {
    if (!article || !voice || clip) return;
    const controller = new AbortController();
    const token = generation.current;
    // A jump gets priority over the background queue, so an unprepared passage
    // does not wait for every preceding sentence to finish generating.
    fetch('/api/audio', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ text:article.sentences[active].text,voice }), signal:controller.signal })
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error); return data as Clip; })
      .then(data => { if (token === generation.current) setClips(previous=>({...previous,[active]:data})); })
      .catch(e => { if (!controller.signal.aborted) setError(e.message || 'Could not prepare the selected passage.'); });
    return () => controller.abort();
  }, [active, article, voice, clip, retry]);
  useEffect(() => {
    const player = audio.current;
    if (!player) return;
    player.pause(); setPosition(pendingOffset.current);
    if (!clip) { player.removeAttribute('src'); player.load(); return; }
    player.src = clip.url; player.load();
  }, [active, clip?.url]);
  useEffect(() => { if (audio.current) audio.current.playbackRate = speed; }, [speed]);
  function toggle() {
    wantsPlay.current = !wantsPlay.current; setPlaying(wantsPlay.current);
    if (!wantsPlay.current) audio.current?.pause();
    else if (clip) void audio.current?.play().catch(() => { wantsPlay.current=false; setPlaying(false); setError('Playback could not start. Press play to try again.'); });
  }
  function seek(index: number, offset = 0) {
    if (!article) return;
    const n = Math.max(0,Math.min(index,article.sentences.length-1));
    pendingOffset.current = offset; setPosition(offset);
    if (n === active && audio.current && clip) audio.current.currentTime = Math.min(offset,clip.duration);
    setActive(n);
  }
  const durations = article?.sentences.map((s,i) => clips[i]?.duration || Math.max(1,s.text.split(/\s+/).length/175*60)) || [];
  const total = durations.reduce((a,b)=>a+b,0);
  const elapsed = durations.slice(0,active).reduce((a,b)=>a+b,0)+position;
  const ready = !!article && Object.keys(clips).length === article.sentences.length;
  function seekTime(value: number) {
    let remaining = Math.max(0,Math.min(value,total));
    for (let i=0;i<durations.length;i++) { if (remaining < durations[i] || i === durations.length-1) { seek(i,remaining); return; } remaining -= durations[i]; }
  }
  function changeVoice(value: string) {
    wantsPlay.current=false; audio.current?.pause(); setPlaying(false); setClips({}); setVoice(value); pendingOffset.current=0; setPosition(0);
  }
  function restore(id: string) {
    if (!article) return;
    wantsPlay.current=false; audio.current?.pause(); setPlaying(false); setClips({}); setActive(0); pendingOffset.current=0;
    const items = article.items.map(i => i.id === id ? { ...i, skipped:undefined } : i);
    setArticle({ ...article,items,sentences:buildSentences(items) });
  }
  const skipped = article?.items.filter(i=>i.skipped) || [];
  return <div className="app">
    <header><a className="brand" href="/" aria-label="Folio home"><span className="brand-icon">◧</span> folio<span className="brand-dot">.</span></a><span className="tagline">A little less screen. A little more listening.</span><button className="upload-button" onClick={()=>input.current?.click()}>＋ Open PDF</button><input ref={input} type="file" accept="application/pdf" hidden onChange={e=>{void upload(e.target.files?.[0]);e.target.value='';}} /></header>
    {error && <div className="notice" role="alert">{error}<button onClick={()=>{setError('');setRetry(n=>n+1);}}>Retry</button><button onClick={()=>setError('')}>Dismiss</button></div>}
    {status && <div className="notice neutral" role="status">{status}</div>}
    {!article || !pdf ? <main className="welcome" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();void upload(e.dataTransfer.files[0]);}}>
      <div className="eyebrow">YOUR READING, IN A NEW RHYTHM</div><h1>Good articles.<br/><em>Now, on play.</em></h1><p>Drop in a PDF. Leave the page clutter behind.<br/>Listen along, and pick up anywhere.</p>
      <button className="dropzone" onClick={()=>input.current?.click()}><span className="document-icon">▤</span><strong>Choose an article</strong><span>or drop your PDF here · up to 50 MB</span><span className="pill">PDF → clean narration</span></button>
      <div className="welcome-notes"><span>✦ Synchronized highlights</span><span>↔ Select text to seek</span><span>◷ Your pace, your place</span></div><p className="privacy">Your PDF stays in your browser. Narration is generated locally on your Mac.</p>
    </main> : <main className="workspace">
      <section className="document-pane"><div className="document-toolbar"><div><span className="file-dot"/> <span title={fileName}>{fileName}</span></div><div className="zoom"><button aria-label="Zoom out" onClick={()=>setZoom(z=>Math.max(.6,z-.1))}>−</button><span>{Math.round(zoom*100)}%</span><button aria-label="Zoom in" onClick={()=>setZoom(z=>Math.min(1.8,z+.1))}>＋</button></div></div>
        <div className="pdf-scroll" ref={viewer}>{article.pages.map((page,n)=>{const scale=Math.min((viewerWidth-64)/page.width,1.15)*zoom;return <div key={n} className="page-wrap" style={{width:page.width*scale,height:page.height*scale}}><PdfPage pdf={pdf} number={n} items={article.items.filter(i=>i.page===n)} sentences={article.sentences} active={active} scale={scale} onSeek={n=>seek(n)}/></div>;})}</div>
        <footer className="document-footer"><span>Page {article.sentences[active]?.page+1} of {pdf.numPages}</span><span>Select a passage to move playback</span><label><input type="checkbox" checked={follow} onChange={e=>setFollow(e.target.checked)}/> Auto-follow</label></footer>
      </section>
      <aside className="player-pane"><div className="eyebrow">YOUR LISTENING SPACE <span className="live-dot"/></div>
        <div className="cover"><div className="cover-label">THE ARTICLE COLLECTION</div><div className="cover-shape"><i/><i/><i/><i/><i/></div><span>Read. Listen. Take it in.</span><b>f.</b></div>
        <div className="article-heading"><span className="eyebrow">NOW {playing?'PLAYING':'QUEUED'}</span><h2>{article.title}</h2><p>{pdf.numPages} pages <span>·</span> {ready?'':'About '}{Math.ceil(total/60/speed)} min at {speed}×</p></div>
        <div className="current-passage"><span className="eyebrow">IN YOUR EARS</span><p>{article.sentences[active]?.text}</p></div>
        <div className="timeline"><input aria-label="Playback position" type="range" min="0" max={total||1} step=".1" value={Math.min(elapsed,total)} onChange={e=>seekTime(Number(e.target.value))}/><div><span>{time(elapsed/speed)}</span><span>{ready?'':'~'}{time(total/speed)}</span></div></div>
        <div className="transport"><button aria-label="Previous sentence" title="Previous sentence" onClick={()=>seek(active-1)}>│◀</button><button aria-label="Back 10 seconds" onClick={()=>seekTime(elapsed-10)}>↶<small>10</small></button><button className="play" aria-label={playing?'Pause':'Play'} onClick={toggle} disabled={!voice}>{playing?'Ⅱ':'▶'}</button><button aria-label="Forward 10 seconds" onClick={()=>seekTime(elapsed+10)}>↷<small>10</small></button><button aria-label="Next sentence" title="Next sentence" onClick={()=>seek(active+1)}>▶│</button></div>
        <div className="settings"><label>Playback speed<select value={speed} onChange={e=>setSpeed(Number(e.target.value))}>{[.75,1,1.25,1.5,1.75,2,2.5].map(s=><option key={s} value={s}>{s}×{s===1?' · Normal':''}</option>)}</select></label><label>Narrator<select aria-label="Narrator" value={voice} onChange={e=>changeVoice(e.target.value)}>{voices.map(v=><option key={v}>{v}</option>)}</select></label></div>
        <div className="cleanup"><div><span>✦</span><strong>A cleaner listen</strong><button onClick={()=>setReview(!review)}>{review?'Close':'Review'}</button></div><p>{skipped.length} text fragments skipped: repeated margins, credits, and related content.</p>{review && <div className="review-list">{skipped.map(i=><div key={i.id}><span>{i.text}<small>Page {i.page+1} · {i.skipped}</small></span><button onClick={()=>restore(i.id)}>Include</button></div>)}</div>}</div>
        <div className="generation" role="status">{generating?`Preparing audio · ${Object.keys(clips).length}/${article.sentences.length} passages`:ready?'✓ Audio ready · saved on this Mac':'Audio paused'}{playing&&!clip?' · Buffering selected passage…':''}</div>
      </aside>
    </main>}
    <audio ref={audio} onLoadedMetadata={()=>{const a=audio.current!;a.currentTime=Math.min(pendingOffset.current,a.duration||0);pendingOffset.current=0;a.playbackRate=speed;if(wantsPlay.current) void a.play().catch(()=>{wantsPlay.current=false;setPlaying(false);setError('Press play to start audio.');});}} onTimeUpdate={()=>setPosition(audio.current?.currentTime||0)} onEnded={()=>{if(article&&active<article.sentences.length-1)seek(active+1);else{wantsPlay.current=false;setPlaying(false);seek(0);}}} onError={()=>{if(clip){wantsPlay.current=false;setPlaying(false);setError('Could not load this audio passage. Retry generating it.');}}}/>
  </div>;
}
