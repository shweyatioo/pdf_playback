import { useEffect, useRef } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { Item, Sentence } from './document';

export default function PdfPage({ pdf, number, items, sentences, active, scale, onSeek }: { pdf: PDFDocumentProxy; number: number; items: Item[]; sentences: Sentence[]; active: number; scale: number; onSeek: (n: number) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const shell = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancelled = false, task: { cancel: () => void } | undefined;
    const observer = new IntersectionObserver(async entries => {
      if (!entries.some(e => e.isIntersecting)) return;
      observer.disconnect();
      const page = await pdf.getPage(number+1);
      if (cancelled || !canvas.current) return;
      const ratio = window.devicePixelRatio || 1, viewport = page.getViewport({ scale });
      const c = canvas.current;
      c.width = viewport.width * ratio; c.height = viewport.height * ratio;
      c.style.width = `${viewport.width}px`; c.style.height = `${viewport.height}px`;
      const render = page.render({ canvas: c, viewport, transform: [ratio,0,0,ratio,0,0] });
      task = render;
      try { await render.promise; } catch (e) { if (!cancelled) console.error(e); }
    }, { rootMargin: '900px' });
    observer.observe(shell.current!);
    return () => { cancelled = true; observer.disconnect(); task?.cancel(); };
  }, [pdf, number, scale]);
  useEffect(() => {
    layer.current?.querySelectorAll<HTMLElement>('.text-item').forEach(el => {
      el.style.transform = '';
      const desired = Number(el.dataset.width);
      if (el.offsetWidth) el.style.transform = `scaleX(${desired / el.offsetWidth})`;
    });
  }, [items, scale, sentences]);
  const byItem = new Map<string, { start: number; end: number; sentence: number }[]>();
  sentences.forEach((s, sentence) => s.refs.forEach(ref => {
    if (!byItem.has(ref.id)) byItem.set(ref.id, []);
    byItem.get(ref.id)!.push({ ...ref, sentence });
  }));
  function seekSelection(event: React.MouseEvent) {
    const selection = window.getSelection();
    let el: Element | null = null;
    if (selection && !selection.isCollapsed && selection.rangeCount) {
      const range = selection.getRangeAt(0);
      const node = range.startContainer;
      el = node instanceof Element ? node : node.parentElement;
    } else el = event.target as Element;
    const target = el?.closest<HTMLElement>('[data-sentence]');
    if (target && layer.current?.contains(target)) onSeek(Number(target.dataset.sentence));
  }
  return <div className="pdf-page" ref={shell} id={`page-${number}`}>
    <canvas ref={canvas} aria-label={`PDF page ${number+1}`} />
    <div className="text-layer" ref={layer} onMouseUp={seekSelection}>
      {items.map(item => {
        const refs = byItem.get(item.id) || [];
        const parts: React.ReactNode[] = []; let cursor = 0;
        for (const ref of refs) {
          if (ref.start > cursor) parts.push(item.text.slice(cursor, ref.start));
          parts.push(<span key={`${ref.sentence}-${ref.start}`} data-sentence={ref.sentence} className={active === ref.sentence ? 'spoken' : ''}>{item.text.slice(ref.start, ref.end)}</span>);
          cursor = ref.end;
        }
        if (cursor < item.text.length) parts.push(item.text.slice(cursor));
        return <span key={item.id} className="text-item" data-width={item.width*scale} style={{ left:item.x*scale, top:item.y*scale, fontSize:item.height*scale, fontFamily:item.font }}>{parts}</span>;
      })}
    </div>
  </div>;
}
