// FFmpeg v0.11.x initialization (global variable approach)
const { createFFmpeg, fetchFile } = FFmpeg;
let ffmpeg;

async function initializeFFmpeg() {
    console.log("[VideoProcessing] Initializing FFmpeg v0.11.x...");
    
    // Check if SharedArrayBuffer is available
    if (typeof SharedArrayBuffer === 'undefined') {
        console.warn("[VideoProcessing] SharedArrayBuffer is not available. This may be due to missing security headers.");
        console.warn("[VideoProcessing] FFmpeg may not work properly. Please ensure the site is served with:");
        console.warn("  - Cross-Origin-Embedder-Policy: require-corp");
        console.warn("  - Cross-Origin-Opener-Policy: same-origin");
        
        if (document.getElementById('ffmpeg-status')) {
            document.getElementById('ffmpeg-status').textContent = 'FFmpeg requires additional security headers to work.';
        }
        
        // Still try to initialize in case it works
    }
    
    if (!ffmpeg || !ffmpeg.isLoaded()) {
        ffmpeg = createFFmpeg({
            log: true,
            corePath: `${window.location.origin}/assets/ffmpeg/ffmpeg-core.js`,
            // Try to disable threading to avoid SharedArrayBuffer requirement
            mainName: 'main',
        });

        ffmpeg.setLogger(({ type, message }) => {
            console.log(`[FFmpeg-${type}] ${message}`);
        });

        try {
            await ffmpeg.load();
            console.log("[VideoProcessing] FFmpeg loaded successfully.");
            if (document.getElementById('ffmpeg-status')) {
                document.getElementById('ffmpeg-status').textContent = 'FFmpeg loaded!';
            }
        } catch (error) {
            console.error("[VideoProcessing] Failed to load FFmpeg:", error);
            
            let errorMessage = 'Error loading FFmpeg.';
            if (error.message && error.message.includes('SharedArrayBuffer')) {
                errorMessage = 'FFmpeg requires SharedArrayBuffer support. Please check browser security headers.';
            }
            
            if (document.getElementById('ffmpeg-status')) {
                document.getElementById('ffmpeg-status').textContent = errorMessage;
            }
            
            // Don't throw the error - let the page continue to function
            // throw error;
        }
    }
}

window.addEventListener('load', initializeFFmpeg);

// Global VideoProcessing object for the main page
window.VideoProcessing = {
    async compressVideo(videoFile, options = {}, onProgress) {
        if (!ffmpeg || !ffmpeg.isLoaded()) {
            throw new Error('FFmpeg is not loaded yet. Please wait for initialization.');
        }

        if (typeof onProgress === 'function') {
            ffmpeg.setProgress(({ ratio }) => {
                onProgress({ ratio });
            });
        }

        console.log(`[VideoProcessing] Starting compression of ${videoFile.name} (${(videoFile.size / 1024 / 1024).toFixed(2)}MB)`);
        
        const inputFileName = 'input.mp4';
        const outputFileName = 'output.mp4';
        
        try {
            await ffmpeg.FS('writeFile', inputFileName, await fetchFile(videoFile));

            const fileSizeMB = videoFile.size / (1024 * 1024);
            const codec = options.codec || this.getRecommendedCodec(fileSizeMB);
            const quality = options.quality || (fileSizeMB > 20 ? 'low' : 'medium');
            
            let ffmpegArgs;
            if (codec === 'h264') {
                let crf, preset, videoFilter;
                
                if (fileSizeMB > 50) {
                    console.log("[VideoProcessing] Very large file, using aggressive compression.");
                    crf = 32;
                    preset = 'ultrafast';
                    videoFilter = 'fps=30,scale=min(iw\\,1280):min(ih\\,720):force_original_aspect_ratio=decrease,scale=trunc(iw/2/2)*2:trunc(ih/2/2)*2';
                } else if (fileSizeMB > 20) {
                    console.log("[VideoProcessing] Large file, using medium compression.");
                    crf = 30;
                    preset = 'veryfast';
                    videoFilter = 'fps=30,scale=trunc(iw/2/2)*2:trunc(ih/2/2)*2';
                } else {
                    console.log("[VideoProcessing] Standard file size, using default compression.");
                    crf = quality === 'medium' ? 26 : 28;
                    preset = 'veryfast';
                    videoFilter = 'scale=trunc(iw/2/2)*2:trunc(ih/2/2)*2';
                }
                
                ffmpegArgs = [
                    '-i', inputFileName,
                    '-c:v', 'libx264',
                    '-crf', crf.toString(),
                    '-preset', preset,
                    '-c:a', 'aac',
                    '-b:a', '128k',
                    '-vf', videoFilter,
                    '-movflags', '+faststart',
                    outputFileName
                ];
            } else {
                ffmpegArgs = ['-i', inputFileName, '-c:v', 'libx264', '-c:a', 'aac', '-b:a', '128k', '-crf', '26', outputFileName];
            }
            
            console.log(`[VideoProcessing] Running FFmpeg with codec: ${codec}, quality: ${quality}, CRF: ${ffmpegArgs[ffmpegArgs.indexOf('-crf') + 1]}`);
            await ffmpeg.run(...ffmpegArgs);
            
            // Reset progress handler
            ffmpeg.setProgress(() => {});
            
            // Read the compressed file
            const data = ffmpeg.FS('readFile', outputFileName);
            const compressedBlob = new Blob([data.buffer], { type: 'video/mp4' });
            
            // Clean up files
            ffmpeg.FS('unlink', inputFileName);
            ffmpeg.FS('unlink', outputFileName);
            
            const compressionRatio = ((videoFile.size - compressedBlob.size) / videoFile.size * 100).toFixed(1);
            
            console.log(`[VideoProcessing] Processing complete! Final size: ${(compressedBlob.size / 1024 / 1024).toFixed(2)}MB. Reduction: ${compressionRatio}%`);
            
            return {
                blob: compressedBlob,
                originalSize: videoFile.size,
                compressedSize: compressedBlob.size,
                compressionRatio: parseFloat(compressionRatio),
                codec: codec,
                quality: quality
            };
            
        } catch (error) {
            console.error('[VideoProcessing] Compression failed:', error);
            // Clean up on error
            try {
                ffmpeg.FS('unlink', inputFileName);
                ffmpeg.FS('unlink', outputFileName);
            } catch (cleanupError) {
                // Ignore cleanup errors
            }
            // Reset progress handler on error too
            ffmpeg.setProgress(() => {});
            throw error;
        }
    },

    getRecommendedCodec(fileSizeMB) {
        // According to memories, prefer H.264 for high quality
        return 'h264';
    },

    isReady() {
        return ffmpeg && ffmpeg.isLoaded();
    }
}; 