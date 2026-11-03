# Developer guide

## Architecture

Folio is a React/Vite frontend and a small Express audio server. PDF processing runs in the browser. Speech generation runs locally through macOS `say`. There is no database, user account system, or cloud speech dependency.

```text
PDF → PDF.js text and coordinates → cleanup → sentences with PDF references
                                                 ↓
                                        POST /api/audio
                                                 ↓
                              macOS say → PCM WAV → level normalization
                                                 ↓
                           HTML audio playback ↔ PDF sentence highlights
```

## File map

| File | Responsibility |
| --- | --- |
| `src/App.tsx` | Upload state, audio preparation, playback, seeking, narrator changes, and player UI. |
| `src/PdfPage.tsx` | PDF canvas, selectable text overlay, sentence highlights, and selection events. |
| `src/document.ts` | Extract text coordinates, classify clutter, and build sentences retaining source offsets. |
| `src/style.css` | Split-screen layout and visual styling. |
| `server/index.ts` | Local API, supported-voice discovery, speech queue, and audio cache. |
| `server/audio.ts` | Three-narrator allowlist, cache processing version, PCM validation, normalization, and duration. |
| `scripts/dev.mjs` | Runs the frontend and audio server together. |
| `tests/` | Unit tests for PDF cleanup/source mapping and audio normalization. |
| `.github/workflows/ci.yml` | Type check, tests, and production build on Linux. |

## PDF mapping

Every extracted text item keeps its page, coordinates, font size, and identifier. Cleanup marks skipped items rather than changing the source PDF. Sentence references retain character offsets into the kept items. A sentence may reference multiple lines or pages.

The PDF canvas displays the original document. A transparent text overlay supports selection; matching sentence fragments receive the highlight. Selection seeks to the beginning of a sentence. Paragraph reconstruction and visual alignment assume ordinary horizontal, single-column text.

## Audio generation and volume

The browser prepares clips sequentially and also requests the selected passage immediately after a jump. The server deduplicates requests and serializes synthesis. Each clip is a 22,050 Hz, signed 16-bit PCM WAV generated at 175 words per minute. Browser playback rate implements the speed control.

`normalizeWav` validates RIFF/WAVE chunks, rejects empty or silent output, and calculates speech RMS excluding samples below 2% of the clip's peak. It targets **−16 dBFS active RMS**, limits peaks to **95% of full scale**, and caps amplification at **4×**. The stricter limit wins; some clips therefore remain below the target. This is RMS leveling, not perceptual LUFS normalization.

Only **Samantha, Daniel, and Karen** are allowed, and only installed members of that list are returned by the API. New voices should be measured and tested before changing this list.

Cache names hash the text, voice, speech rate, and `AUDIO_VERSION`. Bump the version whenever processing changes so browsers receive new audio URLs rather than old, unprocessed files. Temporary speech files are cleaned up after synthesis. Final WAV files are retained locally.

A narrator change cancels the previous generation, clears the old clips, and starts at the current sentence. It preserves the play/pause intent. Generation tokens prevent old responses from replacing the new voice's clips. An expected `AbortError` from replacing a playing audio source must not turn playback off.

## API

| Endpoint | Input | Output |
| --- | --- | --- |
| `GET /api/voices` | None | `{ voices: string[], provider: "macOS", available: boolean }` |
| `POST /api/audio` | JSON `{ text, voice }` | `{ url, duration }`, duration in seconds |
| `GET /api/media/<hash>.wav` | Generated clip URL | WAV audio with normal static-file/range support |

Audio requests require a supported installed voice and 1–4000 text characters. Invalid input returns 400; speech-generation failures return 500. Requests with an unrecognized browser Origin return 403. The service binds to `127.0.0.1`, and only final hash-named WAV files are served from the cache. These local checks are not a public-hosting authentication system.

## Running and testing

```sh
npm ci
npm run dev
npm run check
npm test
npm run build
```

Development uses port **5173** with `/api` proxied to **3001**. Production runs `npm start` after building and serves everything on **3001**. Restart the server after backend changes.

The unit tests run without macOS speech access, so they can run in GitHub Actions on Linux. Actual narration requires a Mac. Before changing playback behavior, manually check:

1. Play through several sentences, including a page boundary.
2. Select PDF text while playing and while paused.
3. Seek and use ±10-second controls.
4. Switch each narrator while playing; confirm it resumes at the same sentence.
5. Switch while paused; confirm it remains paused.
6. Switch rapidly; confirm old audio does not resume or produce a spurious error.
7. Confirm a consistent voice level with no clipped samples.

Do not commit test PDFs, generated narration, or private document contents. Use synthetic fixtures for automated checks.

## Boundaries and known limitations

- Scans, complicated columns, rotated text, and equations need further parsing work.
- Cleanup is heuristic; it can skip legitimate content or retain unfamiliar clutter.
- Timeline lengths are estimates until all clips finish. Selected text seeks by sentence, not exact word.
- Resume saves the last sentence, not the offset within it.
- Audio cache has no automatic expiration; users can clear it locally.
- Generation is a single local queue, intended for personal use rather than concurrent public traffic.
- Hosting requires replacing `say`, adding access controls, and choosing storage/retention rules.
