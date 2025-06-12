# Alt Text Web Client

This is the public web client for the Alt Text Generator project. It's a static web application designed to be deployed on [Railway](https://railway.app).

## Features

-   User-friendly interface for uploading images and videos.
-   Direct interaction with the [Alt Text Server](https://github.com/your-github/alt-text-server) for AI processing.
-   In-browser video processing and compression using FFmpeg.wasm.

## Getting Started

### Prerequisites

-   Node.js v18

### Installation & Development

This is a static web application. To serve it locally for development, you can use the `serve` package.

1.  Clone the repository:
    ```bash
    git clone https://github.com/your-github/alt-text-web.git
    cd alt-text-web
    ```
2.  Install the `serve` dependency:
    ```bash
    npm install
    ```
3.  Start the local development server:
    ```bash
    npm run dev
    ```
4.  The web app will be available at `http://localhost:3000`.

## Deployment to Railway

This web app is configured for easy deployment on Railway.

1.  Create a new project on Railway and link this GitHub repository.
2.  Railway will use the `start` command from `package.json` (`serve -p $PORT`) to start the web server. It will automatically detect the correct buildpack and serve the `index.html` file and other static assets.
3.  No special environment variables are needed for the web client itself, as the API endpoint is configured within the client-side JavaScript to point to your `alt-text-server` deployment.

## Project Structure

The project consists of static HTML, JavaScript, and CSS files.

```
alt-text-web/
├── assets/             # FFmpeg and other assets
├── icons/              # Site and manifest icons
├── index.html          # Main application page
├── video-processing-web.js # Client-side video logic
├── service-worker.js   # PWA service worker
├── manifest.json       # Web app manifest
├── package.json        # Contains the 'serve' dependency for deployment
└── README.md           # This file
```
