import express from 'express';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { AUDIO_VERSION, NARRATORS, normalizeWav } from './audio.ts';

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
  const installed = stdout.split('\n').map(line => line.match(/^(.+?)\s+en_\w+\s+#/)?.[1]?.trim());
  voices = NARRATORS.filter(voice => installed.includes(voice));
}
app.get('/api/voices', (_req, res) => res.json({ voices, provider: 'macOS', available: voices.length > 0 }));
const jobs = new Map<string, Promise<{ url: string; duration: number }>>();
let queue: Promise<unknown> = Promise.resolve();
app.post('/api/audio', async (req, res) => {
  const { text, voice } = req.body ?? {};
  if (typeof text !== 'string' || !text.trim() || text.length > 4000 || !voices.includes(voice)) {
    res.status(400).json({ error: 'Choose an installed voice and a passage of 1–4000 characters.' }); return;
  }
  const id = createHash('sha256').update(JSON.stringify([text, voice, 175, AUDIO_VERSION])).digest('hex');
  if (!jobs.has(id)) {
    if (jobs.size > 500) jobs.clear();
    const job = queue.then(async () => {
      const output = path.join(cache, `${id}.wav`);
      let duration: number;
      try { duration = normalizeWav(await readFile(output)); }
      catch {
        const input = path.join(cache, `${id}.txt`);
        const raw = path.join(cache, `${id}.raw.wav`);
        // Passing a file avoids interpreting article text as command-line options.
        await writeFile(input, text.replace(/\[\[.*?\]\]/gs, ''));
        try {
          await exec('/usr/bin/say', ['-v', voice, '-r', '175', '-f', input, '-o', raw, '--file-format=WAVE', '--data-format=LEI16@22050'], { timeout: 60000 });
          const bytes = await readFile(raw);
          duration = normalizeWav(bytes);
          await writeFile(output, bytes);
        } finally { await Promise.all([unlink(input).catch(() => {}), unlink(raw).catch(() => {})]); }
      }
      return { url: `/api/media/${id}.wav`, duration };
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
