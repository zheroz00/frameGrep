# Gemini 4 FPS Files API smoke check

This check is manual because it uploads a real video and consumes a configured Gemini API key.

1. Start frameGrep and select a video-input/text-output model from Settings.
2. Set Gemini sampling to 4 FPS and choose a short, known-duration clip.
3. Call the Gemini SDK `models.countTokens` method with the same Files API `fileData` part and `videoMetadata: { fps: 4 }` used by `analyzeVideo`.
4. Repeat with `fps: 1`. The 4 FPS request must report a higher input token count for the same file. Record the model ID, duration, and both counts.

Do not run this in CI: it requires credentials, uploads user media, and depends on a live metered service. The model registry in `src/services/geminiModels.ts` contains only models whose documented inputs include video and whose output is text. Gemini Omni Flash is excluded because its documented output is video.
