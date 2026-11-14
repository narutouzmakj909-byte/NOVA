# NOVA AI on Replit

## Run

- Start the app with `npm start`.
- The Express server serves the interface and API on port 5000 by default.
- The existing NOVA AI provider, voice, Somali TTS, and search requests continue to use the configured backend endpoint in `index.html`.

## Configuration

Provider credentials and optional services are configured on the existing backend; do not put API keys in the browser or repository. The Settings page reports which providers the backend has configured.

## Browser voice support

Voice input uses the browser's SpeechRecognition API. On Android, use Chrome and allow microphone access when prompted. Voice mode stays active until the microphone button is tapped again.
