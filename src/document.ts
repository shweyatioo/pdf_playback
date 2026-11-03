import type { PDFDocumentProxy } from 'pdfjs-dist';
export type Item = { id: string; page: number; text: string; x: number; y: number; width: number; height: number; font: string; skipped?: string };
export type Sentence = { text: string; refs: { id: string; start: number; end: number }[]; page: number };
export type Article = { title: string; items: Item[]; sentences: Sentence[]; pages: { width: number; height: number }[] };
const normalized = (s: string) => s.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();

export function cleanItems(items: Item[], pages: Article['pages']) {
  const repeats = new Map<string, Set<number>>();
  for (const item of items) {
    const h = pages[item.page].height;
    if (item.y < h * .08 || item.y > h * .92) {
      const key = normalized(item.text);
      if (!repeats.has(key)) repeats.set(key, new Set());
      repeats.get(key)!.add(item.page);
    }
  }
  let endMatter = '', summaryPage = -1;
  const author = items.find(i => i.page === 0 && /^by\s+/i.test(i.text))?.text.replace(/^by\s+/i, '').trim();
  const bodySizes = items.filter(i => i.text.length > 45).map(i => i.height).sort((a,b) => a-b);
  const bodySize = bodySizes[Math.floor(bodySizes.length / 2)] || 12;
  return items.map((item, index) => {
    const h = pages[item.page].height, text = item.text.trim();
    let skipped: string | undefined;
    if ((item.y < h * .08 || item.y > h * .92) && (repeats.get(normalized(text))?.size || 0) >= 2) skipped = 'Repeated header or footer';
    if (item.y > h * .9 && (/https?:\/\/|^Page\s+\d|^\d+\s*(of|\/)\s*\d+|^\d+$/i.test(text))) skipped = 'Page footer';
    if (/^(Recommended For You|Related Articles|You may also like|More from this author)\s*$/i.test(text)) endMatter = 'Related content';
    const line = items.slice(index,index+4).filter(i=>i.page===item.page && Math.abs(i.y-item.y)<4).map(i=>i.text).join(' ');
    if (author && item.page === pages.length-1 && line.startsWith(`${author} is `)) endMatter = 'Author biography';
    if (endMatter) skipped = endMatter;
    if (/Getty Images|Shutterstock|Photo credit|Image credit/i.test(text) && item.height < bodySize * .9) skipped = 'Image credit';
    if (/^Summary\./.test(text) && item.page === 0) summaryPage = item.page;
    if (item.page === summaryPage) skipped ||= 'Article summary';
    if (item.page === summaryPage && /\bmore\s*$/i.test(text)) summaryPage = -1;
    return { ...item, skipped };
  });
}

export function buildSentences(items: Item[]): Sentence[] {
  const kept = items.filter(i => !i.skipped);
  let text = '';
  const spans: { item: Item; start: number; end: number }[] = [];
  for (let i = 0; i < kept.length; i++) {
    const item = kept[i], previous = kept[i-1];
    if (previous) {
      const differentLine = Math.abs((item.y+item.height)-(previous.y+previous.height)) > 4;
      const newBlock = previous.page === item.page && differentLine && (Math.abs(previous.height - item.height) > 2 || item.y - previous.y > previous.height * 2);
      text += newBlock ? '\n\n' : /^[,.;:!?]/.test(item.text) ? '' : ' ';
    }
    const start = text.length;
    text += item.text;
    spans.push({ item, start, end: text.length });
  }
  const result: Sentence[] = [];
  const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
  // Explicit paragraph boundaries preserve headings; cross-page sentences remain joined.
  const blocks = [...text.matchAll(/[^\n]+/g)];
  for (const block of blocks) {
    const segments = /^by\s/i.test(block[0]) ? [{ index:0, segment:block[0] }] : [...segmenter.segment(block[0])];
    for (const segment of segments) {
    const start = block.index! + segment.index, end = start + segment.segment.length;
    const refs = spans.filter(s => s.end > start && s.start < end).map(s => ({ id: s.item.id, start: Math.max(0, start-s.start), end: Math.min(s.item.text.length, end-s.start) }));
    if (segment.segment.trim() && refs.length) result.push({ text: segment.segment.trim(), refs, page: spans.find(s => s.item.id === refs[0].id)!.item.page });
    }
  }
  return result;
}

export async function extractArticle(pdf: PDFDocumentProxy): Promise<Article> {
  const items: Item[] = [], pages: Article['pages'] = [];
  for (let p = 0; p < pdf.numPages; p++) {
    const page = await pdf.getPage(p+1), viewport = page.getViewport({ scale: 1 });
    pages.push({ width: viewport.width, height: viewport.height });
    const content = await page.getTextContent();
    content.items.forEach((raw, index) => {
      if (!('str' in raw) || !raw.str.trim()) return;
      const [x,y] = viewport.convertToViewportPoint(raw.transform[4], raw.transform[5]);
      const height = Math.hypot(raw.transform[2], raw.transform[3]);
      items.push({ id: `${p}-${index}`, page: p, text: raw.str, x, y: y-height, width: raw.width, height, font: content.styles[raw.fontName]?.fontFamily || 'serif' });
    });
  }
  const cleaned = cleanItems(items, pages);
  const largest = cleaned.filter(i => i.page === 0 && !i.skipped).sort((a,b) => b.height-a.height)[0];
  const title = largest ? cleaned.filter(i => i.page === 0 && !i.skipped && Math.abs(i.height-largest.height) < 1).map(i => i.text).join(' ') : 'Untitled article';
  return { title, items: cleaned, pages, sentences: buildSentences(cleaned) };
}
