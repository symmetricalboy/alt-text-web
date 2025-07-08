document.addEventListener('DOMContentLoaded', () => {
    // Configuration
    const CLOUD_FUNCTION_URL = 'https://alttextserver.symm.app/generate-alt-text';
    const SINGLE_FILE_UPLOAD_LIMIT = 19 * 1024 * 1024; // 19MB for individual processed files
    const TOTAL_MEDIA_SIZE_LIMIT = 100 * 1024 * 1024; // 100MB total for original media file
    const MAX_COMPRESSION_TARGET_MB = 25; // Target for compressed files
    const ALT_TEXT_MAX_LENGTH = 3000; // Bluesky's limit
    const COMPRESSION_THRESHOLD = 20 * 1024 * 1024; // 20MB threshold for compression warning

    // DOM Elements
    const fileInput = document.getElementById('file-input');
    const dropArea = document.getElementById('drop-area');
    const previewContainer = document.querySelector('.preview-container');
    const optionsSection = document.getElementById('options-section');
    const generateBtn = document.getElementById('generate-btn');
    const resultBox = document.getElementById('result');
    const statusBox = document.getElementById('status-message');
    const copyBtn = document.getElementById('copy-btn');
    const downloadBtn = document.getElementById('download-btn');
    const logContainer = document.getElementById('log-container');
    
    // New elements
    const themeToggle = document.getElementById('theme-toggle');
    const progressContainer = document.getElementById('progress-container');
    const progressFill = document.getElementById('progress-fill');
    const progressText = document.getElementById('progress-text');
    const logHeader = document.getElementById('log-header');
    const logToggle = document.getElementById('log-toggle');
    const logContent = document.getElementById('log-content');
    const compressionModal = document.getElementById('compression-modal');
    const modalClose = document.getElementById('modal-close');
    const modalCancel = document.getElementById('modal-cancel');
    const modalContinue = document.getElementById('modal-continue');
    const dontShowAgain = document.getElementById('dont-show-again');
    
    // Option checkboxes
    const optionAltText = document.getElementById('option-alt-text');
    const optionCaptions = document.getElementById('option-captions');
    const optionCompression = document.getElementById('option-compression');
    const optionCompressionItem = document.getElementById('option-compression-item');

    // Current file data
    let originalFile = null;
    let currentMediaElement = null;
    let compressionPromiseResolve = null;
    let compressionPromiseReject = null;
    
    // FFmpeg instance for compression
    let ffmpeg = null;
    let ffmpegLoaded = false;

    // ===== THEME MANAGEMENT =====
    function initializeTheme() {
        const savedTheme = localStorage.getItem('theme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
        updateThemeToggle(savedTheme);
    }

    function updateThemeToggle(theme) {
        const themeIcon = themeToggle.querySelector('.theme-icon');
        const themeText = themeToggle.querySelector('.theme-text');
        
        if (theme === 'dark') {
            themeIcon.className = 'theme-icon fas fa-moon';
            themeText.textContent = 'Dark';
        } else {
            themeIcon.className = 'theme-icon fas fa-sun';
            themeText.textContent = 'Light';
        }
    }

    function toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        updateThemeToggle(newTheme);
    }

    // ===== SETTINGS MANAGEMENT =====
    function loadSettings() {
        const settings = JSON.parse(localStorage.getItem('altTextSettings') || '{}');
        
        optionAltText.checked = settings.altText !== false; // Default true
        optionCaptions.checked = settings.captions === true; // Default false
        optionCompression.checked = settings.compression === true; // Default false
        
        return settings;
    }

    function saveSettings() {
        const settings = {
            altText: optionAltText.checked,
            captions: optionCaptions.checked,
            compression: optionCompression.checked
        };
        localStorage.setItem('altTextSettings', JSON.stringify(settings));
    }

    // ===== COMPRESSION MODAL MANAGEMENT =====
    function shouldShowCompressionWarning() {
        return !getCookie('hideCompressionWarning');
    }

    function setCookie(name, value, days) {
        const expires = new Date();
        expires.setTime(expires.getTime() + (days * 24 * 60 * 60 * 1000));
        document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/`;
    }

    function getCookie(name) {
        const nameEQ = name + "=";
        const ca = document.cookie.split(';');
        for (let i = 0; i < ca.length; i++) {
            let c = ca[i];
            while (c.charAt(0) === ' ') c = c.substring(1, c.length);
            if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
        }
        return null;
    }

    function showCompressionWarning() {
        return new Promise((resolve, reject) => {
            compressionPromiseResolve = resolve;
            compressionPromiseReject = reject;
            compressionModal.style.display = 'flex';
        });
    }

    function hideCompressionWarning() {
        compressionModal.style.display = 'none';
        compressionPromiseResolve = null;
        compressionPromiseReject = null;
    }

    // ===== PROGRESS BAR MANAGEMENT =====
    function showProgress(text = 'Processing...') {
        progressContainer.style.display = 'block';
        progressText.textContent = text;
        progressFill.style.width = '0%';
    }

    function updateProgress(percent, text) {
        progressFill.style.width = `${Math.min(100, Math.max(0, percent))}%`;
        if (text) progressText.textContent = text;
    }

    function hideProgress() {
        progressContainer.style.display = 'none';
    }

    // ===== LOG MANAGEMENT =====
    function initializeLogs() {
        // Start with logs collapsed
        logContent.classList.remove('expanded');
        logToggle.classList.remove('expanded');
    }

    function toggleLogs() {
        logContent.classList.toggle('expanded');
        logToggle.classList.toggle('expanded');
    }

    // ===== CLIPBOARD PASTE FUNCTIONALITY =====
    function initializeClipboardPaste() {
        // Listen for paste events on the document
        document.addEventListener('paste', handlePaste);
        
        // Update upload area text to mention paste
        const uploadText = dropArea.querySelector('p');
        if (uploadText) {
            uploadText.textContent = 'Drag & drop, click to browse, or paste from clipboard';
        }
    }

    async function handlePaste(e) {
        e.preventDefault();
        
        const items = e.clipboardData?.items;
        if (!items) return;
        
        for (let item of items) {
            if (item.type.startsWith('image/') || item.type.startsWith('video/')) {
                const file = item.getAsFile();
                if (file) {
                    logToUI(`📋 Pasted ${file.type} file from clipboard (${(file.size / 1024 / 1024).toFixed(2)}MB)`);
                    originalFile = file;
                    displayPreview(file);
                    break;
                }
            }
        }
    }

    // ===== EVENT LISTENERS =====
    
    // Theme toggle
    themeToggle.addEventListener('click', toggleTheme);
    
    // Settings
    optionAltText.addEventListener('change', saveSettings);
    optionCaptions.addEventListener('change', saveSettings);
    optionCompression.addEventListener('change', saveSettings);
    
    // Compression modal
    modalClose.addEventListener('click', () => {
        hideCompressionWarning();
        if (compressionPromiseReject) compressionPromiseReject(new Error('User cancelled'));
    });
    
    modalCancel.addEventListener('click', () => {
        hideCompressionWarning();
        if (compressionPromiseReject) compressionPromiseReject(new Error('User cancelled'));
    });
    
    modalContinue.addEventListener('click', () => {
        if (dontShowAgain.checked) {
            setCookie('hideCompressionWarning', 'true', 365); // 1 year
        }
        hideCompressionWarning();
        if (compressionPromiseResolve) compressionPromiseResolve();
    });
    
    // Log toggle
    logHeader.addEventListener('click', toggleLogs);
    
    // File input and drag/drop
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
    dropArea.addEventListener('click', () => fileInput.click());

    function handleDrop(e) {
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            originalFile = files[0];
            displayPreview(files[0]);
        }
    }

    generateBtn.addEventListener('click', processMediaGeneration);
    copyBtn.addEventListener('click', copyToClipboard);

    // ===== INITIALIZATION =====
    function initialize() {
        initializeTheme();
        loadSettings();
        initializeLogs();
        initializeClipboardPaste();
        clearLogs();
        logToUI('🚀 Alt Text Generator ready! Upload, drag & drop, or paste media to begin.');
    }

    // ===== CORE FUNCTIONALITY (Enhanced from original) =====
    
    function handleFileSelect() {
        const file = fileInput.files[0];
        if (file) {
            originalFile = file;
            displayPreview(file);
        }
    }

    function displayPreview(file) {
        const fileSizeMB = (file.size / 1024 / 1024).toFixed(2);
        logToUI(`📁 Selected: ${file.name} (${fileSizeMB}MB, ${file.type})`);
        
        previewContainer.style.display = 'block';
        optionsSection.style.display = 'block';
        
        // Show compression option for large files
        if (file.size > COMPRESSION_THRESHOLD) {
            optionCompressionItem.style.display = 'block';
            document.getElementById('option-compression-desc').style.display = 'block';
        } else {
            optionCompressionItem.style.display = 'none';
            document.getElementById('option-compression-desc').style.display = 'none';
        }
        
        const previewHtml = file.type.startsWith('video/') 
            ? `<video id="preview" controls><source src="${URL.createObjectURL(file)}" type="${file.type}">Your browser does not support video.</video>`
            : `<img id="preview" src="${URL.createObjectURL(file)}" alt="Preview">`;
        
        previewContainer.innerHTML = `<h3>Preview</h3>${previewHtml}`;
        currentMediaElement = document.getElementById('preview');
        generateBtn.disabled = false;
        
        // Validate file size
        if (file.size > TOTAL_MEDIA_SIZE_LIMIT) {
            updateStatus(`⚠️ File too large (${fileSizeMB}MB). Maximum size is 100MB.`, true);
            generateBtn.disabled = true;
        } else if (file.size > COMPRESSION_THRESHOLD) {
            updateStatus(`ℹ️ Large file detected (${fileSizeMB}MB). Will be compressed before processing.`, false);
        } else {
            updateStatus(`✅ Ready to process (${fileSizeMB}MB)`, false);
        }
    }

    async function processMediaGeneration() {
        if (!originalFile) return;
        
        const settings = {
            altText: optionAltText.checked,
            captions: optionCaptions.checked,
            compression: optionCompression.checked
        };
        
        // Check if we need to show compression warning
        if (originalFile.size > COMPRESSION_THRESHOLD && shouldShowCompressionWarning()) {
            try {
                await showCompressionWarning();
            } catch (error) {
                logToUI('❌ Processing cancelled by user');
                return;
            }
        }
        
        try {
            generateBtn.disabled = true;
            copyBtn.disabled = true;
            downloadBtn.disabled = true;
            
            let processedFile = originalFile;
            let compressionResults = null;
            
            showProgress('Preparing file...');
            updateProgress(10, 'Checking file size...');
            
            // Handle compression if needed
            if (originalFile.size > SINGLE_FILE_UPLOAD_LIMIT) {
                updateProgress(20, 'Starting compression...');
                logToUI(`🔄 File size (${(originalFile.size / 1024 / 1024).toFixed(2)}MB) exceeds upload limit. Starting compression...`);
                
                try {
                    compressionResults = await handleCompression({
                        buffer: await originalFile.arrayBuffer(),
                        name: originalFile.name,
                        size: originalFile.size,
                        type: originalFile.type
                    });
                    
                    processedFile = compressionResults.blob;
                    updateProgress(60, 'Compression complete! Uploading...');
                    logToUI(`✅ Compression complete: ${(originalFile.size / 1024 / 1024).toFixed(2)}MB → ${(processedFile.size / 1024 / 1024).toFixed(2)}MB`);
                } catch (error) {
                    throw new Error(`Compression failed: ${error.message}`);
                }
            }
            
            updateProgress(70, 'Uploading to AI service...');
            
            // Convert to base64 for API
            const base64Data = await fileToBase64(processedFile);
            updateProgress(80, 'Generating content...');
            
            // Make API request
            const response = await fetch(CLOUD_FUNCTION_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    image: base64Data,
                    filename: originalFile.name,
                    generateCaptions: settings.captions,
                    fileSize: originalFile.size
                })
            });
            
            if (!response.ok) {
                throw new Error(`Server error: ${response.status} ${response.statusText}`);
            }
            
            updateProgress(95, 'Processing results...');
            const result = await response.json();
            
            updateProgress(100, 'Complete!');
            hideProgress();
            
            // Display results
            displayResults(result, settings, compressionResults);
            
        } catch (error) {
            hideProgress();
            const errorMsg = `❌ Error: ${error.message}`;
            updateStatus(errorMsg, true);
            logToUI(errorMsg);
        } finally {
            generateBtn.disabled = false;
        }
    }

    function displayResults(result, settings, compressionResults) {
        let displayText = '';
        let downloadData = null;
        
        if (settings.altText && result.altText) {
            displayText += `🖼️ Alt Text:\n${result.altText}\n\n`;
            
            if (settings.altText) {
                // Auto-copy to clipboard if alt text is enabled
                navigator.clipboard.writeText(result.altText).then(() => {
                    showToast('✅ Alt text copied to clipboard!', 'success');
                }).catch(() => {
                    logToUI('⚠️ Could not auto-copy to clipboard');
                });
            }
        }
        
        if (settings.captions && result.captions) {
            displayText += `🎥 Captions:\n${result.captions}\n\n`;
            downloadData = {
                content: result.captions,
                filename: `${originalFile.name.split('.')[0]}_captions.vtt`,
                type: 'text/vtt'
            };
        }
        
        if (compressionResults && settings.compression) {
            displayText += `📦 Compressed file available for download\n`;
            displayText += `Original: ${(compressionResults.originalSize / 1024 / 1024).toFixed(2)}MB → Compressed: ${(compressionResults.blob.size / 1024 / 1024).toFixed(2)}MB\n\n`;
            
            if (!downloadData) {
                downloadData = {
                    blob: compressionResults.blob,
                    filename: `compressed_${originalFile.name}`,
                    type: compressionResults.blob.type
                };
            }
        }
        
        resultBox.textContent = displayText || 'No content generated with current settings.';
        
        // Enable buttons
        copyBtn.disabled = !result.altText;
        
        if (downloadData) {
            downloadBtn.style.display = 'inline-block';
            downloadBtn.disabled = false;
            downloadBtn.onclick = () => downloadFile(downloadData);
        } else {
            downloadBtn.style.display = 'none';
        }
        
        updateStatus('✅ Generation complete!', false);
        logToUI('🎉 Content generation completed successfully!');
    }

    function downloadFile(data) {
        const blob = data.blob || new Blob([data.content], { type: data.type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = data.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showToast(`💾 Downloaded: ${data.filename}`, 'success');
    }

    // ===== UTILITY FUNCTIONS (Enhanced from original) =====
    
    function logToUI(message) {
        console.log(message);
        const logEntry = document.createElement('p');
        logEntry.innerHTML = `[${new Date().toLocaleTimeString()}] ${message}`;
        logContainer.appendChild(logEntry);
        logContainer.scrollTop = logContainer.scrollHeight;
        
        // Auto-expand logs if there's an error
        if (message.includes('❌') || message.includes('Error')) {
            if (!logContent.classList.contains('expanded')) {
                toggleLogs();
            }
        }
    }

    function clearLogs() {
        logContainer.innerHTML = '';
    }

    function updateStatus(message, isError = false) {
        const statusElement = statusBox;
        statusElement.textContent = message;
        statusElement.style.color = isError ? 'var(--error-color)' : 'var(--text-secondary)';
        statusElement.style.display = message ? 'block' : 'none';
        logToUI(message);
    }

    // FFmpeg initialization and loading (Enhanced from original)
    async function loadFFmpeg() {
        if (ffmpegLoaded) {
            logToUI('FFmpeg is already loaded.');
            return ffmpeg;
        }
        
        try {
            logToUI('⚙️ Loading FFmpeg...');
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
                        updateProgress(20 + (percent * 0.4), `Compressing video... ${percent}%`);
                    }
                },
            });
            
            await ffmpeg.load();
            ffmpegLoaded = true;
            logToUI('✅ FFmpeg loaded successfully!');
            return { ffmpeg, fetchFile };
        } catch (error) {
            logToUI(`❌ Error loading FFmpeg: ${error.message}`);
            throw error;
        }
    }
    
    // Compression handler (Enhanced from original)
    async function handleCompression(fileData) {
        try {
            logToUI('🔄 Main thread received file for compression');
            
            const { ffmpeg, fetchFile } = await loadFFmpeg();
            
            const { buffer, name, size, type } = fileData;
            const originalSizeMB = (size / 1024 / 1024).toFixed(2);
            logToUI(`🔄 Starting compression of ${name} (${originalSizeMB}MB)`);
            
            // Convert ArrayBuffer to Uint8Array for FFmpeg
            const fileBytes = new Uint8Array(buffer);
            ffmpeg.FS('writeFile', name, fileBytes);
            
            // Tiered compression settings
            const qualitySettings = {
                codec: 'libx264',
                crf: 28,
                preset: 'veryfast',
                audioBitrate: '128k',
                movflags: '+faststart',
                vf: []
            };
            
            if (size > 50 * 1024 * 1024) {
                logToUI('📦 Very large file, using aggressive compression.');
                qualitySettings.crf = 32;
                qualitySettings.preset = 'ultrafast';
                qualitySettings.vf.push('fps=30');
                qualitySettings.vf.push('scale=min(iw\\,1280):min(ih\\,720):force_original_aspect_ratio=decrease');
            } else if (size > 20 * 1024 * 1024) {
                logToUI('📦 Large file, using stronger compression.');
                qualitySettings.crf = 30;
                qualitySettings.preset = 'faster';
                qualitySettings.vf.push('scale=min(iw\\,1920):min(ih\\,1080):force_original_aspect_ratio=decrease');
            }
            
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
            
            logToUI(`⚙️ Running FFmpeg command: ${ffmpegArgs.join(' ')}`);
            
            await ffmpeg.run(...ffmpegArgs);
            
            const data = ffmpeg.FS('readFile', 'output.mp4');
            const compressedBlob = new Blob([data.buffer], { type: 'video/mp4' });
            
            logToUI(`✅ FFmpeg processing finished. Original: ${originalSizeMB}MB → Compressed: ${(compressedBlob.size / 1024 / 1024).toFixed(2)}MB`);
            
            // Cleanup filesystem
            ffmpeg.FS('unlink', name);
            ffmpeg.FS('unlink', 'output.mp4');
            
            return {
                blob: compressedBlob,
                originalSize: size
            };
        } catch (error) {
            logToUI(`❌ Compression error: ${error.message}`);
            throw error;
        }
    }

    function fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => {
                // Remove the data URL prefix (e.g., "data:image/jpeg;base64,")
                const base64 = reader.result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = error => reject(error);
        });
    }

    function copyToClipboard() {
        const text = resultBox.textContent;
        if (!text || text.includes('Generated alt text')) return;
        
        // Extract just the alt text part
        const altTextMatch = text.match(/🖼️ Alt Text:\n(.*?)(?:\n\n|$)/s);
        const textToCopy = altTextMatch ? altTextMatch[1] : text;
        
        navigator.clipboard.writeText(textToCopy).then(() => {
            showToast('✅ Copied to clipboard!', 'success');
            logToUI('📋 Alt text copied to clipboard');
        }).catch(err => {
            showToast('❌ Failed to copy to clipboard', 'error');
            logToUI(`❌ Clipboard error: ${err.message}`);
        });
    }

    function showToast(message, type = 'success', duration = 3000) {
        // Remove existing toasts
        const existingToasts = document.querySelectorAll('.toast');
        existingToasts.forEach(toast => toast.remove());
        
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.style.animation = 'toastSlideOut 0.3s ease forwards';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }

    // Initialize the application
    initialize();
}); 