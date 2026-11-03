# Folio — listen to your PDFs

Folio turns downloaded articles into a listening experience. See the **original PDF on the left** and a **music-style audio player on the right**, with the current sentence highlighted as it plays.

This version runs locally on **macOS**. It uses your Mac's speech voices; no account or paid voice API is required.

## What you can do

- Upload an article PDF and listen while following highlights on the original pages.
- Click a sentence or select text to jump to that sentence.
- Seek with the timeline, skip ten seconds, or move one sentence at a time.
- Adjust speed from 0.75× to 2.5×.
- Choose **Samantha (US), Daniel (UK), or Karen (Australia)**. Only installed voices appear.
- Skip repeated headers, footers, page numbers, image credits, summaries, and recognized end matter. Review and restore skipped text.
- Reopen the same PDF to resume at your last sentence.

## Start the app

Requirements: **macOS**, **Node.js 24 LTS**, and at least one of the three voices above.

```sh
git clone https://github.com/shweyatioo/pdf_playback.git
cd pdf_playback
npm ci
npm run dev
```

Open **http://127.0.0.1:5173**, choose **Open PDF**, and press **Play**. Keep the terminal running. Stop the app with **Ctrl+C**.

When reviewing an open pull request, check out its branch before running `npm ci`.

Audio is prepared a passage at a time. Playback can begin before the whole article is ready. A jump to an unprepared passage briefly buffers; timeline durations are approximate until preparation finishes.

### Switching narrators

Changing the narrator restarts the current sentence in the new voice. If you were listening, playback resumes automatically when that clip is ready. If you were paused, it stays paused. Generated speech levels are normalized to reduce volume differences between voices and passages.

## Documentation

- [User guide](docs/user-guide.md): controls, setup, privacy, and troubleshooting.
- [Developer guide](docs/development.md): project structure, audio flow, API, tests, and limitations.

## Development and checks

```sh
npm run check   # TypeScript
npm test        # PDF cleanup/mapping and audio processing tests
npm run build  # Production frontend
npm start      # Serve the built app at http://127.0.0.1:3001
```

Restart `npm run dev` after changing backend files. Frontend changes reload automatically. GitHub Actions runs the type check, tests, and build on pushes and pull requests.

## Privacy and storage

PDF files are parsed in your browser. Extracted sentences go to the local server to generate narration. Audio is stored in `.audio-cache/` on your Mac; the last sentence position is kept in browser local storage. These files and user PDFs are excluded from Git. Google Fonts supplies interface fonts; document content is not sent to Google.

## Current limits

Best for **single-column English articles with selectable text**, up to **80 pages / 50 MB**. OCR, complex columns, rotated text, equation narration, and word-by-word highlights are not supported. Cleanup uses rules and can make mistakes; the Review panel lets you restore skipped fragments.

This is a local Mac app. Hosting on a public website requires a different speech provider and appropriate access controls. GitHub Pages alone cannot run the audio backend.
