# Folio — PDF playback

A laptop-first PDF reader with synchronized sentence highlighting, click/selection-to-seek, an audio timeline, ±10-second skips, sentence navigation, adjustable speed, and saved reading position.

## Run locally

Requires **macOS**, **Node.js 22.12+**, and an installed macOS English voice. The PDF stays in the browser; extracted passages are sent only to the local audio service. No API key is needed.

```sh
npm install
npm run dev
```

Open http://127.0.0.1:5173. Upload a PDF containing selectable text. Audio is prepared sentence by sentence and playback can begin before the entire article is ready. The timeline uses estimated durations until every clip is generated. Selecting PDF text seeks to the beginning of its sentence and preserves the play/pause state.

```sh
npm run check
npm test
npm run build
npm start
```

The built app is served at http://127.0.0.1:3001.

## How it works

- PDF.js renders the original pages and extracts text positions.
- Cleanup heuristics remove repeated page margins, page numbers/URLs, image credits, summary blocks, and related-content lists. Review skipped fragments and restore them in the player.
- Sentence references retain original PDF text offsets, including across page boundaries.
- The local Express service calls macOS `say` with file input (no shell interpolation), writes WAV clips, and calculates exact clip durations.
- The player uses normal HTML audio seeking and pitch-preserving playback rate. A sentence remains highlighted while its clip plays.
- Reading position is stored locally by document hash. Reopen the same PDF to resume at the last sentence.
- Generated clips are cached under `.audio-cache/`, excluded from Git. Delete that directory to clear locally stored narration.

## Current scope

Designed for single-column, English web articles printed to PDF (up to 80 pages / 50 MB). Scanned documents, complex columns, rotated text, mathematical narration, and precise word highlighting are not supported. Cleanup is heuristic: unfamiliar author biographies may remain, and summary detection may skip too much when there is no ending marker; use Review to restore fragments. A truncated source summary cannot be reconstructed.

This is a working **local macOS web app**, not a deployed hosted service. Hosted deployment requires replacing the macOS speech adapter with a cloud or portable TTS provider, plus appropriate authentication and storage. The backend binds to loopback only. Google Fonts is used for interface typography; system fonts are the fallback. Document content is not sent to that service.

## GitHub

Target repository: https://github.com/shweyatioo/pdf_playback

User PDFs, generated audio, secrets, dependencies, and build outputs are excluded from version control.
