<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Koza

Koza is an end-to-end encrypted account identity and recovery information manager.

View the app in [Google AI Studio](https://ai.studio/apps/c5aa46ef-ea1a-44c5-9d44-66f8cc3dd102).

## Run locally

**Prerequisites:** Node.js

1. Install dependencies with `npm install`.
2. Set the required environment variables in `.env.local`.
3. Start the web app with `npm run dev`.

## Electron

- Run the desktop app in development with `npm run electron:dev`.
- Build a desktop package for the current platform with `npm run electron:build`.
- Build a Windows installer with `npm run electron:build:win`.

Packaged Electron builds load the Vite output from the app's packaged `dist` directory. Vite uses relative asset paths so the app also works when opened from Electron's `file://` URL.
