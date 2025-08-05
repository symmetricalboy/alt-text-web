# Alt Text Generator - Web Application

Progressive Web App (PWA) for generating accessible alt text and captions from any device. Features drag-and-drop interface, real-time video compression, and offline support. No installation required - just visit and start generating!

## ✨ Features

- **🌐 Universal Access:** Works on any device with a web browser - no installation required
- **📱 Progressive Web App:** Installable for app-like experience with offline support
- **🎯 Drag & Drop Interface:** Intuitive file upload with visual feedback
- **🤖 AI-Powered Generation:** Google Gemini AI creates descriptive alt text and VTT captions
- **📹 Advanced Video Processing:** FFmpeg.wasm compression with real-time progress logs
- **⚡ Web Worker Processing:** Non-blocking compression prevents UI freezing
- **📋 Copy to Clipboard:** Instant result copying for easy use anywhere
- **🔒 Privacy-First:** All processing happens locally or through secure API calls

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
4.  The web app will be available at `http://localhost:8080`

**Live Version:** [https://alttext.symm.app](https://alttext.symm.app)

## 🚢 Deployment

This application is configured for seamless deployment on Railway and is currently live at [alttext.symm.app](https://alttext.symm.app).

### Railway Deployment
1.  Create a new project on Railway and link this GitHub repository
2.  Railway automatically detects the `start` command from `package.json` (`node server.js`)
3.  The app automatically connects to the backend server deployed separately
4.  Custom Express server provides required COEP/COOP headers for FFmpeg.wasm

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

## 🌐 Related Repositories

This web application is part of a comprehensive ecosystem:

- **🏠 [gen-alt-text](https://github.com/symmetricalboy/gen-alt-text)** - Main project hub and documentation
- **🧩 [alt-text-ext](https://github.com/symmetricalboy/alt-text-ext)** - Browser extension for Bluesky integration
- **⚙️ [alt-text-server](https://github.com/symmetricalboy/alt-text-server)** - Backend API server

## 📊 Current Status

- **Version:** 1.0.0
- **Status:** ✅ Production Ready
- **Deployment:** Live at [alttext.symm.app](https://alttext.symm.app)
- **Platform:** Railway with auto-scaling

## 🎯 Usage

1. **Visit:** [https://alttext.symm.app](https://alttext.symm.app)
2. **Upload:** Drag and drop or select your image/video file
3. **Process:** Watch real-time compression logs (for large videos)
4. **Generate:** AI creates accessible alt text or VTT captions
5. **Copy:** Use the generated text anywhere you need it

## 🔧 Technical Features

### Security Headers
Required for FFmpeg.wasm SharedArrayBuffer support:
- `Cross-Origin-Embedder-Policy: require-corp`
- `Cross-Origin-Opener-Policy: same-origin`

### Compression Pipeline
- **Automatic:** Files >19MB compressed automatically
- **Multi-codec:** H.264, VP8, VP9 support with quality settings
- **Web Worker:** Background processing prevents UI blocking
- **Progress Tracking:** Real-time compression feedback

### PWA Features
- **Service Worker:** Offline page caching
- **Manifest:** App-like installation experience
- **Responsive:** Mobile-friendly touch interface

## 🤝 Contributing

For web app specific issues and contributions:

1. **Bug Reports:** [Web App Issues](https://github.com/symmetricalboy/alt-text-web/issues)
2. **Feature Requests:** [Main Project Issues](https://github.com/symmetricalboy/gen-alt-text/issues)
3. **Development:** See [Development Guide](https://github.com/symmetricalboy/gen-alt-text/blob/main/docs/development-guide.md)

## 📖 Documentation

Comprehensive documentation available in the main project:
- **[Technical Architecture](https://github.com/symmetricalboy/gen-alt-text/blob/main/docs/technical-architecture.md)**
- **[Development Guide](https://github.com/symmetricalboy/gen-alt-text/blob/main/docs/development-guide.md)**
- **[Web Application Details](https://github.com/symmetricalboy/gen-alt-text/blob/main/docs/web-application.md)**

## 📜 License

MIT License - see [LICENSE](./LICENSE) file for details.

## 🔗 Links

- **🌐 Live App:** [alttext.symm.app](https://alttext.symm.app)
- **🧩 Browser Extension:** Available on [Chrome](https://chromewebstore.google.com/detail/bdgpkmjnfildfjhpjagjibfnfpdieddp) and [Firefox](https://addons.mozilla.org/en-US/firefox/addon/bluesky-alt-text-generator/)
- **🏠 Main Project:** [gen-alt-text](https://github.com/symmetricalboy/gen-alt-text)
- **📱 Bluesky:** [@symm.app](https://bsky.app/profile/symm.app)

---

*Accessible AI generation from any device, anywhere! 🌟*
