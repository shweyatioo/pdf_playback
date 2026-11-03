# Using Folio

## Open and listen

1. Start the app using the [README](../README.md#start-the-app).
2. Choose **Open PDF**, or drop a PDF onto the welcome screen.
3. Press **Play**. Audio preparation continues in the background.
4. Keep the app and its terminal running while listening.

Use PDFs with selectable text. An image-only scan cannot be read in this version.

## Controls

| Control | What it does |
| --- | --- |
| Play / pause | Starts or pauses narration. |
| Previous / next sentence | Moves to the beginning of a neighboring sentence. |
| Back / forward 10 seconds | Moves along the audio timeline. |
| Progress bar | Seeks to another point in the article. Durations are estimated while audio is preparing. |
| Click or select PDF text | Moves playback to the start of that sentence. A paused player stays paused. |
| Playback speed | Changes speed between 0.75× and 2.5×. |
| Narrator | Chooses Samantha, Daniel, or Karen; resumes the current sentence if already playing. |
| Auto-follow | Scrolls the PDF to follow the current sentence. Turn off to browse freely. |
| − / + above the PDF | Changes PDF zoom. |
| Review → Include | Restores a skipped text fragment. This rebuilds narration and returns to the beginning, paused. |

Highlights follow whole sentences, including those crossing a page boundary. Selecting part of a sentence starts at that sentence, not the exact selected word. Selecting a skipped header or footer does not seek.

## Narrators and volume

The app offers three English voices: **Samantha (US), Daniel (UK), and Karen (Australia)**. Available choices depend on which voices macOS reports as installed. To inspect your installed voices, run:

```sh
say -v '?'
```

If a voice is missing, add it through macOS Accessibility's speech/voice settings, then restart the app. Settings labels vary by macOS version.

Switching voices requires new audio, so a short buffering pause is expected. Folio preserves whether you were playing or paused and restarts the current sentence when the new clip is ready.

Audio is leveled before playback, with a peak limit to avoid clipping and a limit on amplification. The app does not change your Mac's output volume. Different voice tones can still sound somewhat different in loudness.

If playback becomes very quiet:

1. Refresh the page and reopen the PDF after updating the app. Your last sentence is remembered.
2. Check the Mac's output volume and selected speakers/headphones.
3. Try another of the three narrators.
4. If it repeats, note the narrator, sentence, output device, and whether you had just switched voice or speed. Those details help distinguish generated audio from an output-device issue.

## Cleanup and accuracy

Folio looks for repeated page margins, page numbers and URLs, image credits, article summaries, related links, and recognizable author biographies. These are rules, not a guarantee that every website layout will work. Use **Review** to inspect excluded fragments and choose **Include** to restore one. Cleanup corrections are not saved across reloads.

The app preserves the article's wording; it does not summarize or rewrite it. Missing or truncated content in the PDF cannot be recovered.

## Saved data

- **PDF:** held in browser memory; reopen it after refreshing.
- **Position:** last sentence, saved in this browser for the same PDF contents. The precise second is not saved.
- **Audio:** `.audio-cache/` in the project folder, retained between runs and excluded from Git.
- **Voice/speed/cleanup choices:** reset on refresh.

To remove generated narration, stop the app and delete `.audio-cache/` in Finder. It is a hidden folder; use **Command+Shift+.** to show hidden files. The folder is recreated automatically. Clearing site data in your browser removes saved positions.

## Troubleshooting

| Symptom | Try this |
| --- | --- |
| Cannot reach audio server | Run `npm run dev` and leave its terminal open. |
| No narrator options | Confirm you are on macOS with at least one supported voice installed, then restart. |
| Narration buffers after a jump | Wait for the selected passage to finish generating. |
| No readable text found | Use a selectable-text PDF; scans need OCR outside this app. |
| Port already in use | Stop the previous Folio terminal before starting another instance. |
| Changes to the backend are not visible | Stop and restart `npm run dev`, then refresh the browser. |
