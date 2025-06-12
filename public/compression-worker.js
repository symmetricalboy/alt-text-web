// FFmpeg-WASM v0.11.x Compression Worker
// This worker handles video compression without blocking the main UI thread.

// We do NOT import ffmpeg.min.js here as it contains document references
// which are not available in a worker.

// These will be defined when the main script loads them.
const { createFFmpeg, fetchFile } = FFmpeg;
let ffmpeg;

async function initializeFFmpeg() {
    if (ffmpeg && ffmpeg.isLoaded()) {
        postMessage({ type: 'log', data: 'FFmpeg is already loaded.' });
        return;
    }
    postMessage({ type: 'log', data: 'Initializing FFmpeg v0.11.x in worker...' });

    // Use a try-catch block for robust initialization
    try {
        ffmpeg = createFFmpeg({
            corePath: `${self.location.origin}/assets/ffmpeg/ffmpeg-core.js`,
            // IMPORTANT: This is the key change for Web Worker compatibility
            workerPath: `${self.location.origin}/assets/ffmpeg/ffmpeg-core.worker.js`,
            log: true,
            logger: ({ type, message }) => {
                if (type === 'fferr') { // Only log actual errors/info from stderr
                    postMessage({ type: 'log', data: `[FFmpeg]: ${message}` });
                }
            },
            progress: (progress) => {
                postMessage({ type: 'progress', data: progress });
            },
        });

        await ffmpeg.load();
        postMessage({ type: 'log', data: 'FFmpeg loaded successfully in worker.' });

    } catch (error) {
        postMessage({ type: 'error', data: { message: `FFmpeg initialization failed: ${error.message}` } });
        // Prevent further attempts if initialization fails
        ffmpeg = null; 
    }
}

async function compressVideo(file) {
    try {
        if (!ffmpeg || !ffmpeg.isLoaded()) {
            await initializeFFmpeg();
        }

        const { name, size } = file;
        const originalSizeMB = (size / 1024 / 1024).toFixed(2);
        postMessage({ type: 'log', data: `Starting compression of ${name} (${originalSizeMB}MB)` });

        ffmpeg.FS('writeFile', name, await fetchFile(file));

        // Tiered compression settings
        const qualitySettings = {
            codec: 'libx264',
            crf: 28, // Medium quality
            preset: 'veryfast',
            audioBitrate: '128k',
            movflags: '+faststart',
            vf: []
        };
        
        if (size > 50 * 1024 * 1024) { // > 50MB
            postMessage({ type: 'log', data: 'Very large file, using aggressive compression.' });
            qualitySettings.crf = 32; // Lower quality, smaller size
            qualitySettings.preset = 'ultrafast';
            qualitySettings.vf.push('fps=30'); // Cap framerate
            qualitySettings.vf.push('scale=min(iw\\,1280):min(ih\\,720):force_original_aspect_ratio=decrease');
        } else if (size > 20 * 1024 * 1024) { // > 20MB
             postMessage({ type: 'log', data: 'Large file, using stronger compression.' });
            qualitySettings.crf = 30;
            qualitySettings.preset = 'faster';
            qualitySettings.vf.push('scale=min(iw\\,1920):min(ih\\,1080):force_original_aspect_ratio=decrease');
        }

        // Ensure dimensions are divisible by 2 for H.264
        qualitySettings.vf.push('scale=trunc(iw/2)*2:trunc(ih/2)*2');

        const ffmpegArgs = [
            '-i', name,
            '-c:v', qualitySettings.codec,
            '-crf', qualitySettings.crf.toString(),
            '-preset', qualitySettings.preset,
            '-c:a', 'aac',
            '-b:a', qualitySettings.audioBitrate,
        ];
        
        if (qualitySettings.vf.length > 0) {
            ffmpegArgs.push('-vf', qualitySettings.vf.join(','));
        }
        
        ffmpegArgs.push('-movflags', qualitySettings.movflags, 'output.mp4');

        postMessage({ type: 'log', data: `Running FFmpeg command: ${ffmpegArgs.join(' ')}` });
        
        await ffmpeg.run(...ffmpegArgs);
        
        const data = ffmpeg.FS('readFile', 'output.mp4');
        const compressedBlob = new Blob([data.buffer], { type: 'video/mp4' });

        postMessage({ type: 'log', data: `FFmpeg processing finished. Cleaning up filesystem.` });
        
        // Cleanup filesystem
        ffmpeg.FS('unlink', name);
        ffmpeg.FS('unlink', 'output.mp4');
        
        postMessage({ type: 'result', data: { blob: compressedBlob } });

    } catch (error) {
        postMessage({ type: 'error', data: { message: `Compression failed: ${error.message}` } });
        // Attempt to clean up even if there's an error
        try {
            ffmpeg.FS('unlink', file.name);
            ffmpeg.FS('unlink', 'output.mp4');
        } catch (e) {
            // Ignore cleanup errors
        }
    }
}

self.onmessage = async (event) => {
    const { file } = event.data;
    if (file) {
        await compressVideo(file);
    }
};

// Initial health check
postMessage({ type: 'log', data: 'Compression worker loaded and ready.' });
initializeFFmpeg(); 