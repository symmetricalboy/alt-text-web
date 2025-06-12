document.addEventListener('DOMContentLoaded', () => {
    // Configuration
    const CLOUD_FUNCTION_URL = 'https://alttextserver.symm.app/generate-alt-text';
    const SINGLE_FILE_UPLOAD_LIMIT = 19 * 1024 * 1024; // 19MB for individual processed files
    const TOTAL_MEDIA_SIZE_LIMIT = 100 * 1024 * 1024; // 100MB total for original media file
    const MAX_COMPRESSION_TARGET_MB = 25; // Target for compressed files
    const ALT_TEXT_MAX_LENGTH = 3000; // Bluesky's limit

    // DOM Elements
    const fileInput = document.getElementById('file-input');
    const dropArea = document.getElementById('drop-area');
    const previewContainer = document.querySelector('.preview-container');
    const generateBtn = document.getElementById('generate-btn');
    const resultBox = document.getElementById('result');
    const statusBox = document.getElementById('status-message');
    const copyBtn = document.getElementById('copy-btn');
    const captionBtn = document.getElementById('caption-btn');
    const logContainer = document.getElementById('log-container');

    // Current file data
    let originalFile = null;
    let currentMediaElement = null;
    
    // FFmpeg instance for compression
    let ffmpeg = null;
    let ffmpegLoaded = false;

    // Event Listeners
    fileInput.addEventListener('change', handleFileSelect);

    // Drag and drop events
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropArea.addEventListener(eventName, highlight, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, unhighlight, false);
    });

    function highlight() {
        dropArea.classList.add('highlight');
    }

    function unhighlight() {
        dropArea.classList.remove('highlight');
    }

    dropArea.addEventListener('drop', handleDrop, false);

    function handleDrop(e) {
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            fileInput.files = files;
            handleFileSelect();
        }
    }

    generateBtn.addEventListener('click', () => processMediaGeneration('altText'));
    copyBtn.addEventListener('click', copyToClipboard);
    captionBtn.addEventListener('click', () => processMediaGeneration('captions'));

    // UI Helpers
    function logToUI(message) {
        console.log(message); // Also log to console for debugging
        const logEntry = document.createElement('p');
        logEntry.innerHTML = `[${new Date().toLocaleTimeString()}] ${message}`;
        logContainer.appendChild(logEntry);
        logContainer.scrollTop = logContainer.scrollHeight; // Auto-scroll
    }

    function clearLogs() {
        logContainer.innerHTML = '';
    }

    function updateStatus(message, isError = false) {
        const statusElement = document.getElementById('status-message');
        statusElement.textContent = message;
        statusElement.style.color = isError ? 'var(--error-color)' : '#666';
        statusElement.style.display = message ? 'block' : 'none';
        logToUI(message);
    }

    // FFmpeg initialization and loading
    async function loadFFmpeg() {
        if (ffmpegLoaded) {
            logToUI('FFmpeg is already loaded.');
            return ffmpeg;
        }
        
        try {
            logToUI('Loading FFmpeg...');
            const { createFFmpeg, fetchFile } = FFmpeg;
            
            ffmpeg = createFFmpeg({
                corePath: `${window.location.origin}/assets/ffmpeg/ffmpeg-core.js`,
                log: true,
                logger: ({ type, message }) => {
                    if (type === 'fferr') {
                        logToUI(`[FFmpeg]: ${message}`);
                    }
                },
                progress: (progress) => {
                    const percent = Math.round(progress.ratio * 100);
                    if (percent < 100) {
                        updateStatus(`Compressing video... ${percent}%`, false);
                    }
                },
            });
            
            await ffmpeg.load();
            ffmpegLoaded = true;
            logToUI('FFmpeg loaded successfully!');
            return { ffmpeg, fetchFile };
        } catch (error) {
            logToUI(`Error loading FFmpeg: ${error.message}`);
            throw error;
        }
    }
    
    // Compression handler for worker-proxied requests
    async function handleCompression(fileData) {
        try {
            logToUI('Main thread received file for compression');
            
            const { ffmpeg, fetchFile } = await loadFFmpeg();
            
            const { buffer, name, size, type } = fileData;
            const originalSizeMB = (size / 1024 / 1024).toFixed(2);
            logToUI(`Starting compression of ${name} (${originalSizeMB}MB)`);
            
            // Convert ArrayBuffer to Uint8Array for FFmpeg
            const fileBytes = new Uint8Array(buffer);
            ffmpeg.FS('writeFile', name, fileBytes);
            
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
                logToUI('Very large file, using aggressive compression.');
                qualitySettings.crf = 32; // Lower quality, smaller size
                qualitySettings.preset = 'ultrafast';
                qualitySettings.vf.push('fps=30'); // Cap framerate
                qualitySettings.vf.push('scale=min(iw\\,1280):min(ih\\,720):force_original_aspect_ratio=decrease');
            } else if (size > 20 * 1024 * 1024) { // > 20MB
                logToUI('Large file, using stronger compression.');
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
            
            logToUI(`Running FFmpeg command: ${ffmpegArgs.join(' ')}`);
            
            await ffmpeg.run(...ffmpegArgs);
            
            const data = ffmpeg.FS('readFile', 'output.mp4');
            const compressedBlob = new Blob([data.buffer], { type: 'video/mp4' });
            
            logToUI(`FFmpeg processing finished. Original size: ${originalSizeMB}MB, Compressed size: ${(compressedBlob.size / 1024 / 1024).toFixed(2)}MB`);
            
            // Cleanup filesystem
            ffmpeg.FS('unlink', name);
            ffmpeg.FS('unlink', 'output.mp4');
            
            return {
                blob: compressedBlob,
                originalSize: size
            };
        } catch (error) {
            logToUI(`Compression error in main thread: ${error.message}`);
            throw error;
        }
    }

    // File handling
    function handleFileSelect() {
        clearLogs();
        logToUI('File selection changed.');
        const file = fileInput.files[0];

        if (!file) return;

        // Check if file exceeds TOTAL_MEDIA_SIZE_LIMIT first
        if (file.size > TOTAL_MEDIA_SIZE_LIMIT) {
            showToast(`File is too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Maximum total size is ${TOTAL_MEDIA_SIZE_LIMIT / (1024 * 1024)}MB.`, 'error');
            updateStatus(`File exceeds maximum allowed size of ${TOTAL_MEDIA_SIZE_LIMIT / (1024 * 1024)}MB.`, true);
            previewContainer.style.display = 'none';
            previewContainer.innerHTML = '<h3>Preview</h3>';
            originalFile = null;
            fileInput.value = '';
            generateBtn.disabled = true;
            captionBtn.style.display = 'none';
            return;
        }

        originalFile = file;

        // Clear previous preview
        previewContainer.innerHTML = '<h3>Preview</h3>';
        currentMediaElement = null;

        // Create appropriate preview
        if (file.type.startsWith('image/')) {
            const img = document.createElement('img');
            img.id = 'preview';
            img.file = file;
            previewContainer.appendChild(img);
            currentMediaElement = img;

            const reader = new FileReader();
            reader.onload = (e) => { img.src = e.target.result; };
            reader.readAsDataURL(file);
        } else if (file.type.startsWith('video/')) {
            const video = document.createElement('video');
            video.id = 'preview';
            video.controls = true;
            video.muted = true;
            video.preload = 'metadata';
            previewContainer.appendChild(video);
            currentMediaElement = video;

            const reader = new FileReader();
            reader.onload = (e) => { video.src = e.target.result; };
            reader.readAsDataURL(file);

            // Add file size info for videos
            if (file.size > SINGLE_FILE_UPLOAD_LIMIT) {
                const info = document.createElement('p');
                info.style.color = 'orange';
                info.style.marginTop = '10px';
                info.textContent = `Note: This video is ${(file.size / (1024 * 1024)).toFixed(1)}MB. Large videos will be compressed for processing.`;
                previewContainer.appendChild(info);
            }
        }

        previewContainer.style.display = 'block';

        // Reset result and status
        resultBox.innerHTML = '<p style="color: #666;">Click "Generate Alt Text" to analyze this media...</p>';
        document.getElementById('status-message').style.display = 'none';
        copyBtn.disabled = true;

        logToUI(`Selected file: <strong>${file.name}</strong>, type: ${file.type}, size: ${(file.size / 1024 / 1024).toFixed(2)}MB`);

        // Enable/disable buttons
        generateBtn.disabled = false;
        if (file.type.startsWith('video/')) {
            captionBtn.style.display = 'block';
        } else {
            captionBtn.style.display = 'none';
        }

        logToUI('Ready to process.');
    }

    // Main processing logic
    async function processMediaGeneration(generationType) {
        if (!originalFile) {
            logToUI('Processing aborted: No file selected.');
            updateStatus('Please select an image or video file first.', true);
            showToast('No file selected.', 'error');
            return;
        }

        const originalBtn = (generationType === 'altText') ? generateBtn : captionBtn;
        const otherBtn = (generationType === 'altText') ? captionBtn : generateBtn;
        const originalBtnText = originalBtn.innerHTML;

        originalBtn.innerHTML = `<span class="loading"></span>Processing...`;
        originalBtn.disabled = true;
        otherBtn.disabled = true;

        logToUI(`Starting generation for: <strong>${generationType}</strong>`);

        if (generationType === 'altText') {
            resultBox.innerHTML = '<p style="color: #666;">Processing for alt text...</p>';
            copyBtn.disabled = true;
        } else {
            resultBox.innerHTML = '<p style="color: #666;">Processing for captions...</p>';
        }

        try {
            let fileToProcess = originalFile;

            // If file is large and video, compress it first
            if (fileToProcess.size > SINGLE_FILE_UPLOAD_LIMIT && fileToProcess.type.startsWith('video/')) {
                logToUI('Large video detected. Offloading to compression worker.');
                updateStatus('Compressing large video... 0%', false);

                const compressionWorker = new Worker('/compression-worker.js');

                fileToProcess = await new Promise((resolve, reject) => {
                    compressionWorker.onmessage = (event) => {
                        const { type, data } = event.data;
                        
                        if (type === 'log') {
                            logToUI(`[Worker]: ${data}`);
                        } else if (type === 'progress') {
                            const percent = Math.round(data.ratio * 100);
                            if (percent < 100) {
                                updateStatus(`Compressing large video... ${percent}%`, false);
                            }
                        } else if (type === 'proxy_compress') {
                            // Worker is asking the main thread to do the FFmpeg compression
                            logToUI('Worker requested main thread to handle compression');
                            
                            // Process the compression in the main thread and send back the result
                            handleCompression(data)
                                .then(result => {
                                    compressionWorker.postMessage({
                                        type: 'compressed_result',
                                        data: result
                                    });
                                })
                                .catch(error => {
                                    compressionWorker.postMessage({
                                        type: 'error',
                                        data: { message: error.message }
                                    });
                                    reject(error);
                                });
                            
                        } else if (type === 'result') {
                            const compressedBlob = data.blob;
                            logToUI(`Compression successful. Original: ${(data.originalSize / 1024 / 1024).toFixed(2)}MB, New: ${(compressedBlob.size / 1024 / 1024).toFixed(2)}MB`);
                            updateStatus('Compression complete. Processing...', false);
                            resolve(new File([compressedBlob], originalFile.name, { type: compressedBlob.type }));
                            compressionWorker.terminate();
                        } else if (type === 'error') {
                            logToUI(`<strong>[Worker Error]:</strong> ${data.message}`);
                            reject(new Error(data.message));
                            compressionWorker.terminate();
                        }
                    };

                    compressionWorker.postMessage({ 
                        type: 'compress', 
                        data: { file: originalFile } 
                    });
                });
            }

            // Process the file (original or compressed)
            logToUI('Converting file to Base64 for upload...');
            const base64 = await fileToBase64(fileToProcess);

            let requestBody = {
                base64Data: base64,
                mimeType: fileToProcess.type,
                isVideo: fileToProcess.type.startsWith('video/') || fileToProcess.type === 'image/gif',
                fileName: originalFile.name,
                fileSize: fileToProcess.size,
                isChunk: false,
                chunkIndex: 1,
                totalChunks: 1
            };

            if (originalFile.type.startsWith('video/') && currentMediaElement instanceof HTMLVideoElement) {
                requestBody.videoDuration = currentMediaElement.duration || 0;
                requestBody.videoWidth = currentMediaElement.videoWidth || 0;
                requestBody.videoHeight = currentMediaElement.videoHeight || 0;
            }

            if (generationType === 'captions') {
                requestBody.action = 'generateCaptions';
            }

            logToUI('Sending data to the AI for analysis...');
            updateStatus('Sending to AI for analysis...', false);

            const response = await fetch(CLOUD_FUNCTION_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                let errorDetail = `Server error: ${response.status} ${response.statusText}`;
                try {
                    const errData = await response.json();
                    errorDetail = errData.error || errorDetail;
                } catch (e) {}
                throw new Error(errorDetail);
            }

            const apiResponseData = await response.json();

            if (generationType === 'altText') {
                if (apiResponseData.altText) {
                    let altText = apiResponseData.altText.trim();
                    logToUI('Successfully received alt text from AI.');

                    if (altText.length > ALT_TEXT_MAX_LENGTH) {
                        logToUI('Alt text is too long, truncating for display.');
                        const truncationPoint = altText.lastIndexOf('.', ALT_TEXT_MAX_LENGTH - 7);
                        if (truncationPoint > ALT_TEXT_MAX_LENGTH * 0.6) {
                            altText = altText.substring(0, truncationPoint + 1) + " (...)";
                        } else {
                            altText = altText.substring(0, ALT_TEXT_MAX_LENGTH - 7) + "... (...)";
                        }
                        showToast('Alt text was truncated to fit Bluesky\'s limit.', 'warning', 4000);
                    }

                    updateResult(altText);
                    updateStatus('Alt text generated successfully!', false);
                    copyBtn.disabled = false;
                    showToast('Alt text generated!', 'success');
                } else {
                    logToUI(`Error from server: ${apiResponseData.error || 'No alt text generated'}`);
                    throw new Error(apiResponseData.error || 'No alt text generated');
                }
            } else {
                if (apiResponseData.vttContent) {
                    logToUI('Successfully received caption data from AI.');
                    const baseFileName = originalFile.name.substring(0, originalFile.name.lastIndexOf('.')) || originalFile.name;
                    downloadVTTFile(apiResponseData.vttContent, `captions-${baseFileName}.vtt`);
                    updateStatus('Captions generated and download started.', false);
                    showToast('Captions generated and download started.', 'success');
                    resultBox.innerHTML = `<p style="color: #666;">Caption file has been downloaded. Check your downloads folder.</p>`;
                } else {
                    logToUI(`Error from server: ${apiResponseData.error || 'No caption data generated'}`);
                    throw new Error(apiResponseData.error || 'No caption data generated');
                }
            }

        } catch (error) {
            console.error(`Error processing ${generationType}:`, error);
            logToUI(`<strong>Error:</strong> ${error.message}`);
            updateStatus(`An error occurred: ${error.message}`, true);
            showToast(`Error: ${error.message}`, 'error', 7000);
            if (generationType === 'altText') {
                resultBox.innerHTML = '<p style="color: var(--error-color);">Failed to generate alt text. Please try again.</p>';
            }
        } finally {
            // Restore button states
            originalBtn.innerHTML = originalBtnText;
            originalBtn.disabled = false;
            otherBtn.disabled = false;
        }
    }

    // Helper function to update the result text area
    function updateResult(text) {
        if (text && text.trim()) {
            resultBox.innerHTML = `<p>${text.replace(/\n/g, '<br>')}</p>`;
        } else {
            resultBox.innerHTML = '<p style="color: #666;">No alt text generated.</p>';
        }
    }

    // Helper function to download the VTT file
    function downloadVTTFile(vttContent, filename) {
        const blob = new Blob([vttContent], { type: 'text/vtt' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();

        // Clean up
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
    }

    // Helper function to convert file to base64
    function fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const sizeMB = file.size / (1024 * 1024);
            if (sizeMB > 5) {
                updateStatus(`Converting file (${sizeMB.toFixed(1)}MB) to base64...`, false);
            }

            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => {
                const result = reader.result;
                const base64 = result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = error => reject(error);

            reader.onprogress = (event) => {
                if (event.lengthComputable && sizeMB > 2) {
                    const percentLoaded = Math.round((event.loaded / event.total) * 100);
                    updateStatus(`Preparing file: ${percentLoaded}% complete`, false);
                }
            };
        });
    }

    // Copy to clipboard
    function copyToClipboard() {
        const text = resultBox.textContent;
        if (!text) return;

        navigator.clipboard.writeText(text)
            .then(() => {
                showToast('Copied to clipboard!', 'success');
            })
            .catch(err => {
                console.error('Could not copy text: ', err);
                showToast('Failed to copy to clipboard', 'error');
            });
    }

    // Show toast notification
    function showToast(message, type = 'success', duration = 3000) {
        document.querySelectorAll('.toast').forEach(t => t.remove());

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);

        void toast.offsetWidth;
        toast.style.opacity = '1';

        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }, duration);
    }
}); 