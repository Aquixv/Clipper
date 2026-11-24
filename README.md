# Clipper

Browser Extension for quickly clipping Twitch VODs/lives and recording YouTube and TikTok live streams in-browser.

## What this is

Clipper is a Chrome/Chromium browser extension for capturing stream clips and live recordings. It creates retroactive clips from Twitch VODs and live broadcasts, while YouTube and TikTok use different recording workflows. The extension is designed for viewers who want to save recent moments or manually record a live stream without using external software.

## Stack

- **Languages:** JavaScript, HTML, CSS
- **Runtime:** Chrome Extension Manifest V3
- **Browser APIs:** `chrome.runtime`, `chrome.tabs`, `chrome.storage`, `chrome.webRequest`, `chrome.downloads`
- **Media APIs:** `MediaRecorder`, `captureStream()`, `Fetch`, `Blob`, `AbortController`
- **Media formats:** HLS (`.m3u8`), MPEG Transport Stream (`.ts`), MP4/DASH (`.mpd`), WebM

## How it's organized

```text
dist/
  manifest.json       Extension permissions and entry points
  background.js       Stream sniffing and Twitch VOD processing
  content.js          Page integration and media downloading
  popup.html          Extension popup interface
  popup.js            Popup controls and message routing
  style.css           Dark popup and control styles
  Scissors.png        Extension icon
```

`manifest.json` registers `background.js` as the MV3 service worker and `content.js` on supported streaming sites. The service worker captures HLS/DASH manifests through `chrome.webRequest`, while `content.js` interacts with page video elements and downloads assembled media. `popup.js` chooses either retroactive Twitch clipping or manual recording based on the active URL, then communicates with the other scripts through `chrome.runtime` and `chrome.tabs`.

## Recording behavior

- **Twitch:** Retrieves the timeline position and a hidden archive playlist for live streams, calculates matching HLS segments, downloads them as `.ts`, and supports cancellation.
- **Twitch VODs:** Searches captured stream manifests and extracts the requested segment range.
- **YouTube:** Presents the recording interface and uses `MediaRecorder` on the page video stream.
- **TikTok:** Detects continuous media and records it with `MediaRecorder`, producing a `.webm` file.

## How to run it

Clipper has no package manifest or build script. The repository contains the unpacked extension directly in `dist/`.

```text
1. Clone or download the repository.
2. Open chrome://extensions in Chrome or a Chromium-based browser.
3. Enable Developer mode.
4. Click Load unpacked.
5. Select the repository's dist directory.
6. Pin Clipper and press Ctrl+Q, or click the extension icon.
```

No environment variables or API keys need to be configured locally. The Twitch GraphQL implementation uses a public Twitch `Client-ID` embedded in `dist/background.js`.
