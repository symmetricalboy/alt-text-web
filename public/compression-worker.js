// FFmpeg-WASM v0.11.x Compression Worker
// This worker handles video compression without blocking the main UI thread.

// Set up helper function to load scripts in the worker context
function loadScript(url) {
  return new Promise((resolve, reject) => {
    try {
      importScripts(url);
      resolve();
    } catch (error) {
      reject(new Error(`Failed to load script: ${url} - ${error.message}`));
    }
  });
}

// We can't access the FFmpeg object from the main page, so we need to initialize our own
let ffmpegLoaded = false;
let ffmpeg = null;

// Initialize FFmpeg directly in the worker
async function initializeFFmpeg() {
  if (ffmpegLoaded) {
    postMessage({ type: 'log', data: 'FFmpeg is already loaded.' });
    return;
  }

  try {
    postMessage({ type: 'log', data: 'Loading FFmpeg libraries in worker...' });
    
    // Step 1: First load the main FFmpeg script
    await loadScript(`${self.location.origin}/assets/ffmpeg/ffmpeg.min.js`);
    
    // Step 2: Now we can access the FFmpeg object which should be in the global scope
    // Note: In workers, it's just 'FFmpeg', not 'self.FFmpeg'
    const { createFFmpeg, fetchFile } = FFmpeg;
    
    postMessage({ type: 'log', data: 'Creating FFmpeg instance...' });
    
    // Step 3: Create the FFmpeg instance with the proper configuration
    ffmpeg = createFFmpeg({
      corePath: `${self.location.origin}/assets/ffmpeg/ffmpeg-core.js`,
      // The worker path is critical for proper threading in a worker context
      workerPath: `${self.location.origin}/assets/ffmpeg/ffmpeg-core.worker.js`,
      log: true,
      logger: ({ type, message }) => {
        if (type === 'fferr') {
          postMessage({ type: 'log', data: `[FFmpeg]: ${message}` });
        }
      },
      progress: (progress) => {
        postMessage({ type: 'progress', data: progress });
      },
    });
    
    // Store fetchFile globally for later use
    self.fetchFile = fetchFile;
    
    // Step 4: Load the WASM module
    postMessage({ type: 'log', data: 'Loading FFmpeg WASM module...' });
    await ffmpeg.load();
    
    ffmpegLoaded = true;
    postMessage({ type: 'log', data: 'FFmpeg successfully loaded in worker!' });
    
  } catch (error) {
    postMessage({ type: 'error', data: { message: `FFmpeg initialization failed: ${error.message}` } });
    console.error('FFmpeg initialization failed:', error);
  }
}

// Process video with compression
async function compressVideo(file) {
  try {
    if (!ffmpegLoaded) {
      await initializeFFmpeg();
    }
    
    if (!ffmpeg) {
      throw new Error('FFmpeg failed to initialize properly');
    }

    const { name, size } = file;
    const originalSizeMB = (size / 1024 / 1024).toFixed(2);
    postMessage({ type: 'log', data: `Starting compression of ${name} (${originalSizeMB}MB)` });

    // In worker context, we need to fetch the file data
    const fileData = await self.fetchFile(file);
    ffmpeg.FS('writeFile', name, fileData);

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
    console.error('Compression failed:', error);
    
    // Attempt to clean up even if there's an error
    try {
      if (ffmpeg) {
        ffmpeg.FS('unlink', file.name);
        ffmpeg.FS('unlink', 'output.mp4');
      }
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}

// Handle messages from the main thread
self.onmessage = async (event) => {
  const { file } = event.data;
  if (file) {
    await compressVideo(file);
  }
};

// Initial health check
postMessage({ type: 'log', data: 'Compression worker loaded and ready.' }); 