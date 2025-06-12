# Alt Text Web Client

This is the public web client for the Alt Text Generator project. It's a standalone Progressive Web App (PWA) designed to be deployed on services like [Railway](https://railway.app). It provides a user-friendly interface for generating alt text and captions for images and videos using Google Gemini AI.

## ✨ Features

-   **Easy Media Upload:** Supports file picker and drag-and-drop for images and videos.
-   **AI-Powered Generation:** Generates descriptive alt text for images and time-stamped `VTT` captions for videos.
-   **In-Browser Compression:** Automatically compresses videos larger than 19MB using FFmpeg.wasm inside a Web Worker to prevent UI freezing during processing.
-   **Progressive Web App (PWA):** Installable for an app-like experience with offline support for the main interface.
-   **Real-time Feedback:** A dedicated log panel shows the step-by-step progress of media processing and compression.

## 🛠️ Tech Stack

-   **Frontend:** Vanilla HTML5, CSS3, and JavaScript (ES6+).
-   **Application Server:** Node.js and Express for serving static files and setting required security headers.
-   **Video Processing:** [FFmpeg.wasm](https://ffmpegwasm.netlify.app/) (v0.11.0) for client-side video manipulation.
-   **PWA:** Service Worker for offline caching.

## 🚀 Getting Started

### Prerequisites

-   Node.js v18 or later

### Local Development

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/symmetricalboy/alt-text-web.git
    cd alt-text-web
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Start the development server:**
    ```bash
    npm start
    ```
4.  The web app will be available at `http://localhost:8080`.

## 🚢 Deployment

This application is configured for seamless deployment on Railway.

1.  Create a new project on Railway and link this GitHub repository.
2.  Railway will use the `start` command from `package.json` (`node server.js`) to start the web server.
3.  The API endpoint for the backend server is configured in `index.html` to point to the `alt-text-server` deployment.

## 📁 Project Structure

```
alt-text-web/
├── public/                 # All public-facing assets, served as the web root.
│   ├── assets/             # FFmpeg.wasm core files.
│   ├── icons/              # PWA and favicon icons.
│   ├── index.html          # Main application page and UI.
│   ├── manifest.json       # PWA manifest file.
│   └── service-worker.js   # PWA service worker for offline caching.
├── compression-worker.js   # Web Worker script for background video compression.
├── server.js               # Node.js/Express server to serve the `public` directory.
├── package.json            # Project dependencies and scripts.
└── README.md               # This file.
```
*(Note: Some files from a previous extension-based architecture may still exist but are not used by the web app and are slated for removal.)*
