# Progress

## What Works

- Chat service supports file attachments (audio, video, images, documents) with inline playback and preview in the chat UI.
- Attachments are rendered using direct CDN links (e.g., Discord CDN), which work for streaming and preview.
- Audio, video, and image files are displayed inline; other files are provided as download links.
- File uploads are handled via Discord webhook for reliable, public, streamable URLs.

## What's Left to Build

- Optional: Implement a backend proxy route for streaming files from sources that do not provide direct links (e.g., Google Drive).
- Optional: Add more robust error handling and user feedback for failed media loads.
- Optional: Add support for additional file types or advanced media controls.

## Current Status

- All major file handling and media playback features are working as intended.
- The system is stable for sending, receiving, and previewing attachments in chat.

## Known Issues

- Google Drive links do not support inline playback due to CORS and redirect limitations; use Discord CDN or a backend proxy for streaming media.
