import express from 'express';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';

const exec = promisify(execFile);
const app = express();
const cache = path.resolve('.audio-cache');
await mkdir(cache, { recursive: true });
app.use(express.json({ limit: '16kb' }));
// This service is intentionally local. Only our browser origin may invoke it.
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && !/^http:\/\/(localhost|127\.0\.0\.1):(5173|3001)$/.test(origin)) {
    res.status(403).json({ error: 'This audio service only accepts local requests.' }); return;
  }
  next();
});
let voices: string[] = [];
if (process.platform === 'darwin') {
  const { stdout } = await exec('/usr/bin/say', ['-v', '?']);
  voices = stdout.split('\n').map(line => line.match(/^(.+?)\s+en_\w+\s+#/)?.[1]?.trim()).filter((v): v is string => !!v);
}
app.get('/api/voices', (_req, res) => res.json({ voices, provider: 'macOS', available: voices.length > 0 }));
const jobs = new Map<string, Promise<{ url: string; duration: number }>>();
let queue: Promise<unknown> = Promise.resolve();
function wavDuration(bytes: Buffer) {
  let byteRate = 0;
  for (let at = 12; at + 8 <= bytes.length;) {
    const tag = bytes.toString('ascii', at, at + 4), size = bytes.readUInt32LE(at + 4);
    if (tag === 'fmt ') byteRate = bytes.readUInt32LE(at + 16);
    if (tag === 'data' && byteRate) return size / byteRate;
    at += 8 + size + (size % 2);
  }
  throw new Error('Invalid generated audio');
}
app.post('/api/audio', async (req, res) => {
  const { text, voice } = req.body ?? {};
  if (typeof text !== 'string' || !text.trim() || text.length > 4000 || !voices.includes(voice)) {
    res.status(400).json({ error: 'Choose an installed voice and a passage of 1–4000 characters.' }); return;
  }
  const id = createHash('sha256').update(JSON.stringify([text, voice, 175])).digest('hex');
  if (!jobs.has(id)) {
    if (jobs.size > 500) jobs.clear();
    const job = queue.then(async () => {
      const output = path.join(cache, `${id}.wav`);
      let bytes: Buffer;
      try { bytes = await readFile(output); }
      catch {
        const input = path.join(cache, `${id}.txt`);
        // Passing a file avoids interpreting article text as command-line options.
        await writeFile(input, text.replace(/\[\[.*?\]\]/gs, ''));
        try { await exec('/usr/bin/say', ['-v', voice, '-r', '175', '-f', input, '-o', output, '--file-format=WAVE', '--data-format=LEI16@22050'], { timeout: 60000 }); }
        finally { await unlink(input).catch(() => {}); }
        bytes = await readFile(output);
      }
      return { url: `/api/media/${id}.wav`, duration: wavDuration(bytes) };
    });
    jobs.set(id, job);
    queue = job.catch(() => {});
    job.catch(() => jobs.delete(id));
  }
  try { res.json(await jobs.get(id)); }
  catch { res.status(500).json({ error: 'Audio generation failed. Try another installed voice.' }); }
});
app.use('/api/media', (req,res,next) => {
  if (!/^\/[a-f0-9]{64}\.wav$/.test(req.path)) { res.sendStatus(404); return; }
  next();
}, express.static(cache, { index: false, dotfiles: 'deny' }));
app.use(express.static('dist'));
app.listen(3001, '127.0.0.1', () => console.log('Folio audio server: http://127.0.0.1:3001'));
