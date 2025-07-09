document.addEventListener('DOMContentLoaded', () => {
    // Configuration
    const CLOUD_FUNCTION_URL = 'https://alttextserver.symm.app/generate-alt-text';
    const SINGLE_FILE_UPLOAD_LIMIT = 19 * 1024 * 1024; // 19MB for individual processed files
    const TOTAL_MEDIA_SIZE_LIMIT = 100 * 1024 * 1024; // 100MB total for original media file
    const MAX_COMPRESSION_TARGET_MB = 25; // Target for compressed files
    const ALT_TEXT_MAX_LENGTH = 2000; // Bluesky's limit
    const COMPRESSION_THRESHOLD = 20 * 1024 * 1024; // 20MB threshold for compression warning

    // DOM Elements - New Structure
    const fileInput = document.getElementById('file-input');
    const dropArea = document.getElementById('drop-area');
    
    // Sections
    const uploadSection = document.getElementById('upload-section');
    const previewSection = document.getElementById('preview-section');
    const processingSection = document.getElementById('processing-section');
    const resultsSection = document.getElementById('results-section');
    
    // Preview elements
    const previewContent = document.getElementById('preview');
    
    // Buttons
    const generateBtn = document.getElementById('generate-btn');
    const clearBtn = document.getElementById('clear-btn');
    const copyBtn = document.getElementById('copy-btn');
    const downloadVttBtn = document.getElementById('download-vtt-btn');
    const downloadCompressedBtn = document.getElementById('download-compressed-btn');
    const startOverBtn = document.getElementById('start-over-btn');
    
    // Status and progress elements
    const progressFill = document.getElementById('progress-fill');
    const progressText = document.getElementById('progress-text');
    const statusDot = document.getElementById('status-dot');
    const statusText = document.getElementById('status-text');
    
    // Results
    const altTextResult = document.getElementById('alt-text-result');
    
    // Logs overlay elements
    const viewLogsBtn = document.getElementById('view-logs-btn');
    const logsOverlay = document.getElementById('logs-overlay');
    const closeLogsBtn = document.getElementById('close-logs-btn');
    const emailLogsBtn = document.getElementById('email-logs-btn');
    const logContainer = document.getElementById('log-container');
    
    // Modal elements
    const compressionModal = document.getElementById('compression-modal');
    const modalClose = document.getElementById('modal-close');
    const modalCancel = document.getElementById('modal-cancel');
    const modalContinue = document.getElementById('modal-continue');
    const dontShowAgain = document.getElementById('dont-show-again');
    
    // PWA Install Button
    const pwaInstallBtn = document.getElementById('pwa-install-btn');
    


    // Current file data
    let originalFile = null;
    let currentMediaElement = null;
    let compressionPromiseResolve = null;
    let compressionPromiseReject = null;
    let generatedResults = null;
    
    // FFmpeg instance for compression
    let ffmpeg = null;
    let ffmpegLoaded = false;
    
    // PWA Install prompt
    let deferredPrompt = null;
    
    // App version
    let appVersion = null;

    // ===== SECTION MANAGEMENT =====
    
    function showSection(sectionToShow) {
        const sections = [uploadSection, previewSection, processingSection, resultsSection];
        sections.forEach(section => {
            section.style.display = 'none';
        });
        sectionToShow.style.display = 'flex';
    }

    function resetToUpload() {
        originalFile = null;
        currentMediaElement = null;
        generatedResults = null;
        
        // Reset file input
        fileInput.value = '';
        

        
        // Clear preview
        previewContent.innerHTML = '';
        
        // Reset status
        updateStatus('Ready to generate alt text', 'ready');
        
        // Show upload section
        showSection(uploadSection);
    }

    // ===== STATUS MANAGEMENT =====
    
    function updateStatus(message, type = 'normal') {
        statusText.textContent = message;
        
        // Update dot color based on type
        statusDot.className = 'status-dot';
        if (type === 'error') {
            statusDot.classList.add('error');
        } else if (type === 'success') {
            statusDot.classList.add('success');
        } else if (type === 'warning') {
            statusDot.classList.add('warning');
        } else if (type === 'processing') {
            statusDot.classList.add('processing');
        }
        
        // Log to console and logs overlay
        logToUI(message);
    }

    function updateProgress(percent, text) {
        progressFill.style.width = `${percent}%`;
        progressText.textContent = text;
    }

    // ===== PWA INSTALLATION MANAGEMENT =====
    
    // Listen for the beforeinstallprompt event
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        pwaInstallBtn.style.display = 'flex';
        logToUI('📱 PWA install prompt available');
    });

    // Handle PWA install button click
    pwaInstallBtn.addEventListener('click', async () => {
        if (!deferredPrompt) {
            logToUI('❌ PWA install prompt not available');
            return;
        }

        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        
        if (outcome === 'accepted') {
            logToUI('✅ PWA install accepted');
            showToast('App installed successfully!', 'success');
        } else {
            logToUI('❌ PWA install dismissed');
            showToast('App installation cancelled', 'warning');
        }
        
        deferredPrompt = null;
        pwaInstallBtn.style.display = 'none';
    });

    // Listen for the appinstalled event
    window.addEventListener('appinstalled', (e) => {
        logToUI('✅ PWA installed successfully');
        showToast('Welcome to the Alt Text Generator app!', 'success');
        pwaInstallBtn.style.display = 'none';
        deferredPrompt = null;
    });

    // Check if app is already installed (running in standalone mode)
    function checkIfInstalled() {
        if (window.matchMedia('(display-mode: standalone)').matches || 
            window.navigator.standalone === true) {
            pwaInstallBtn.style.display = 'none';
            logToUI('📱 App is running in standalone mode');
        }
    }

    // ===== THEME MANAGEMENT =====
    window.handleThemeToggle = function(checkbox) {
        const theme = checkbox.checked ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
        logToUI(`🎨 Switched to ${theme} mode`);
    };

    function initializeTheme() {
        const savedTheme = localStorage.getItem('theme') || 'light';
        const checkbox = document.getElementById('theme-toggle-checkbox');
        
        document.documentElement.setAttribute('data-theme', savedTheme);
        if (checkbox) {
            checkbox.checked = savedTheme === 'dark';
        }
    }

    // ===== SETTINGS MANAGEMENT =====
    function loadSettings() {
        const settings = JSON.parse(localStorage.getItem('altTextSettings') || '{}');
        return settings;
    }

    function saveSettings() {
        // Settings are now simplified since we always generate everything
        const settings = {};
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
        logToUI('📋 Setting up compression warning modal...');
        return new Promise((resolve, reject) => {
            logToUI('📋 Creating promise for compression modal');
            compressionPromiseResolve = resolve;
            compressionPromiseReject = reject;
            logToUI('📋 Promise handlers set, showing modal');
            compressionModal.style.display = 'flex';
            logToUI('📋 Modal should now be visible');
        });
    }

    function hideCompressionWarning() {
        logToUI('📋 Hiding compression modal...');
        compressionModal.style.display = 'none';
        logToUI('📋 Clearing promise handlers');
        compressionPromiseResolve = null;
        compressionPromiseReject = null;
        logToUI('📋 Modal cleanup completed');
    }

    // ===== LOGS MANAGEMENT =====
    
    function initializeLogs() {
        logContainer.innerHTML = '';
        logToUI('🚀 Alt Text Generator initialized');
    }

    function showLogsOverlay() {
        logsOverlay.style.display = 'flex';
    }

    function hideLogsOverlay() {
        logsOverlay.style.display = 'none';
    }

    function emailLogs() {
        const logs = Array.from(logContainer.children).map(p => p.textContent).join('\n');
        const subject = encodeURIComponent('Alt Text Generator - Support Request');
        const body = encodeURIComponent(`Hello,

I need help with the Alt Text Generator. Here are my logs:

${logs}

Please help me resolve this issue.

Thank you!`);
        
        const mailtoLink = `mailto:dylangregoriis+alttextgenapp@gmail.com?subject=${subject}&body=${body}`;
        
        try {
            window.open(mailtoLink, '_blank');
            logToUI('📧 Email client opened with logs');
            showToast('Email client opened with logs attached', 'success');
        } catch (error) {
            logToUI(`❌ Could not open email client: ${error.message}`);
            showToast('Could not open email client', 'error');
            
            // Fallback: copy logs to clipboard
            navigator.clipboard.writeText(logs).then(() => {
                showToast('Logs copied to clipboard instead', 'warning');
            }).catch(() => {
                showToast('Could not copy logs to clipboard', 'error');
            });
        }
    }

    // ===== FILE HANDLING =====
    
    function initializeClipboardPaste() {
        document.addEventListener('paste', handlePaste);
        logToUI('📋 Clipboard paste support enabled');
    }

    async function handlePaste(e) {
        const items = e.clipboardData.items;
        
        for (let item of items) {
            if (item.type.indexOf('image') !== -1 || item.type.indexOf('video') !== -1) {
                e.preventDefault();
                const file = item.getAsFile();
                
                if (file) {
                    logToUI(`📋 Pasted ${file.type} from clipboard (${(file.size / 1024 / 1024).toFixed(2)}MB)`);
                    handleFile(file);
                    return;
                }
            }
        }
    }

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    function highlight() {
        dropArea.classList.add('highlight');
    }

    function unhighlight() {
        dropArea.classList.remove('highlight');
    }

    function handleDrop(e) {
        preventDefaults(e);
        unhighlight();
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFile(files[0]);
        }
    }

    function handleFileSelect() {
        const file = fileInput.files[0];
        if (file) {
            handleFile(file);
        }
    }

    async function handleFile(file) {
        updateStatus('Processing file...', 'processing');
        
        // Validate file type
        const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'video/mp4', 'video/webm', 'video/mov', 'video/avi', 'video/mkv'];
        if (!validTypes.includes(file.type)) {
            updateStatus('Unsupported file type', 'error');
            showToast('Please upload a supported image or video file', 'error');
            return;
        }

        // Validate file size
        if (file.size > TOTAL_MEDIA_SIZE_LIMIT) {
            updateStatus('File too large', 'error');
            showToast('File exceeds 100MB limit', 'error');
            return;
        }

        originalFile = file;

        // Display preview and check for video sound
        await displayPreview(file);
        
        updateStatus('File ready for processing', 'ready');
        showSection(previewSection);
    }

    async function displayPreview(file) {
        previewContent.innerHTML = '';
        
        if (file.type.startsWith('image/')) {
            const img = document.createElement('img');
            img.src = URL.createObjectURL(file);
            img.onload = () => URL.revokeObjectURL(img.src);
            previewContent.appendChild(img);
            currentMediaElement = img;
            
            // Images don't need captions
            logToUI('🖼️ Image file - alt text only');
            
        } else if (file.type.startsWith('video/')) {
            const video = document.createElement('video');
            video.src = URL.createObjectURL(file);
            video.controls = true;
            video.muted = true;
            previewContent.appendChild(video);
            currentMediaElement = video;
            
            // Check if video has audio track for captions generation
            const hasAudio = await checkVideoHasAudio(video);
            if (hasAudio) {
                logToUI('🎵 Video has audio track - captions will be generated');
            } else {
                logToUI('🔇 Video has no audio track - no captions will be generated');
            }
            
            // Store whether this video has audio for later use
            currentMediaElement.hasAudio = hasAudio;
        }
    }

    async function checkVideoHasAudio(videoElement) {
        return new Promise((resolve) => {
            const checkAudio = () => {
                try {
                    // Create audio context to analyze the video
                    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                    const source = audioContext.createMediaElementSource(videoElement);
                    
                    // If we can create a source, the video likely has audio
                    resolve(true);
                    audioContext.close();
                } catch (error) {
                    // If there's an error, assume no audio
                    resolve(false);
                }
            };
            
            if (videoElement.readyState >= 1) {
                checkAudio();
            } else {
                videoElement.addEventListener('loadedmetadata', checkAudio, { once: true });
                setTimeout(() => resolve(false), 2000); // Timeout after 2 seconds
            }
        });
    }

    // ===== PROCESSING =====
    
    async function processMediaGeneration() {
        try {
            showSection(processingSection);
            updateStatus('Starting generation process...', 'processing');
            
            updateProgress(5, 'Preparing file...');
            
            // Debug original file
            logToUI(`🔍 Original file check: ${originalFile ? 'Present' : 'Missing'}`);
            if (originalFile) {
                logToUI(`📄 File details: ${originalFile.name}, ${(originalFile.size / 1024 / 1024).toFixed(2)}MB, ${originalFile.type}`);
            }
            
            let fileToProcess = originalFile;
            let compressionResults = null;
            
            // Handle compression if file is large
            if (originalFile.size > COMPRESSION_THRESHOLD) {
                logToUI('🔍 Compression needed - file size exceeds 20MB threshold');
                if (shouldShowCompressionWarning()) {
                    logToUI('⚠️ Need to show compression warning to user');
                    try {
                        logToUI('🔄 Showing compression warning...');
                        await showCompressionWarning();
                        logToUI('✅ User accepted compression warning - proceeding with compression');
                    } catch (error) {
                        logToUI(`❌ User cancelled compression warning: ${error.message}`);
                        updateStatus('Generation cancelled', 'ready');
                        showSection(previewSection);
                        return;
                    }
                } else {
                    logToUI('ℹ️ Compression warning disabled - proceeding directly to compression');
                }
                
                updateProgress(10, 'Preparing file for compression...');
                logToUI('🔄 Converting file to array buffer...');
                logToUI(`📊 Original file info: ${originalFile.name} (${(originalFile.size / 1024 / 1024).toFixed(2)}MB, ${originalFile.type})`);
                
                try {
                    // Add timeout for array buffer conversion
                    const arrayBufferPromise = originalFile.arrayBuffer();
                    const timeoutPromise = new Promise((_, reject) => {
                        setTimeout(() => {
                            reject(new Error('File reading timed out after 15 seconds'));
                        }, 15000);
                    });
                    
                    logToUI('⏱️ Starting array buffer conversion with 15s timeout...');
                    const arrayBuffer = await Promise.race([arrayBufferPromise, timeoutPromise]);
                    logToUI(`✅ File converted to buffer (${(arrayBuffer.byteLength / 1024 / 1024).toFixed(2)}MB)`);
                    
                    updateProgress(15, 'Starting compression...');
                    logToUI('🔄 Calling handleCompression function...');
                    compressionResults = await handleCompression({
                        buffer: arrayBuffer,
                        name: originalFile.name,
                        size: originalFile.size,
                        type: originalFile.type
                    });
                    
                    logToUI('✅ Compression completed successfully');
                    fileToProcess = compressionResults.blob;
                } catch (error) {
                    logToUI(`❌ Compression failed: ${error.message}`);
                    logToUI(`❌ Error stack: ${error.stack}`);
                    throw error;
                }
            }

            updateProgress(30, 'Uploading to server...');
            
            // Prepare the request
            const base64Data = await fileToBase64(fileToProcess);
            
            // Check if this is an animated image (like GIF) that should be treated as video-like content
            const animatedImageTypes = ['image/gif', 'image/webp', 'image/apng'];
            const isAnimatedImage = animatedImageTypes.includes(fileToProcess.type);
            const isVideoContent = fileToProcess.type.startsWith('video/') || isAnimatedImage;
            
            // If this is a video with audio, generate captions
            if (isVideoContent && currentMediaElement?.hasAudio) {
                const captionRequestData = {
                    action: 'generateCaptions',
                    base64Data: base64Data,
                    mimeType: fileToProcess.type
                };
                
                // First, get captions
                const captionResponse = await fetch(CLOUD_FUNCTION_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(captionRequestData)
                });
                
                if (captionResponse.ok) {
                    const captionResult = await captionResponse.json();
                    if (captionResult.vttContent) {
                        // Store captions for later use
                        generatedResults = {
                            ...(generatedResults || {}),
                            vttContent: captionResult.vttContent
                        };
                        logToUI('📄 Captions generated successfully');
                    }
                }
            }
            
            // Regular alt text request
            const requestData = {
                base64Data: base64Data,
                mimeType: fileToProcess.type,
                isVideo: isAnimatedImage // Flag animated images (like GIFs) as video-like content
            };

            updateProgress(50, 'Generating content...');
            
            // Make the API request
            const response = await fetch(CLOUD_FUNCTION_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestData)
            });

            if (!response.ok) {
                throw new Error(`Server error: ${response.status}`);
            }

            updateProgress(80, 'Processing results...');

            const result = await response.json();
            
            updateProgress(100, 'Complete!');
            
            // Store results for later use - preserve existing vttContent if already set
            generatedResults = {
                altText: result.altText,
                vttContent: generatedResults?.vttContent || result.vttContent,
                compressionResults: compressionResults
            };

            // Display results
            displayResults(result, compressionResults);
            
        } catch (error) {
            logToUI(`❌ Generation error: ${error.message}`);
            updateStatus('Generation failed', 'error');
            showToast(`Generation failed: ${error.message}`, 'error');
            showSection(previewSection);
        }
    }

    function displayResults(result, compressionResults) {
        // Show alt text
        if (result.altText) {
            altTextResult.textContent = result.altText;
            updateStatus('Alt text generated successfully', 'success');
        } else {
            altTextResult.textContent = 'No alt text was generated.';
            updateStatus('No content generated', 'warning');
        }

        // Show download button for .vtt file if available
        if (generatedResults?.vttContent) {
            downloadVttBtn.style.display = 'inline-flex';
            logToUI('📄 Captions download button shown');
        } else {
            downloadVttBtn.style.display = 'none';
        }

        // Show compressed download if available
        if (compressionResults) {
            downloadCompressedBtn.style.display = 'inline-flex';
            logToUI('📦 Compressed video download button shown');
        } else {
            downloadCompressedBtn.style.display = 'none';
        }

        showSection(resultsSection);
    }

    function autoDownloadVtt(vttContent) {
        const blob = new Blob([vttContent], { type: 'text/vtt' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${originalFile.name.split('.')[0]}_captions.vtt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        logToUI('📥 Captions file auto-downloaded');
    }

    // ===== EVENT LISTENERS =====
    
    // File handling
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, preventDefaults);
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        dropArea.addEventListener(eventName, highlight);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, unhighlight);
    });

    dropArea.addEventListener('drop', handleDrop);
    
    // Handle upload button click (prevent bubbling to dropArea)
    const uploadButton = document.getElementById('upload-button');
    uploadButton.addEventListener('click', (e) => {
        e.stopPropagation();
        fileInput.click();
    });
    
    // Handle drop area click (only if not clicking the button)
    dropArea.addEventListener('click', (e) => {
        if (e.target !== uploadButton && !uploadButton.contains(e.target)) {
            fileInput.click();
        }
    });
    
    fileInput.addEventListener('change', handleFileSelect);

    // Buttons
    generateBtn.addEventListener('click', processMediaGeneration);
    clearBtn.addEventListener('click', resetToUpload);
    startOverBtn.addEventListener('click', resetToUpload);

    copyBtn.addEventListener('click', () => {
        if (generatedResults?.altText) {
            navigator.clipboard.writeText(generatedResults.altText).then(() => {
                showToast('Alt text copied to clipboard!', 'success');
                logToUI('📋 Alt text copied to clipboard');
            }).catch(err => {
                showToast('Failed to copy to clipboard', 'error');
                logToUI(`❌ Clipboard error: ${err.message}`);
            });
        }
    });

    downloadVttBtn.addEventListener('click', () => {
        if (generatedResults?.vttContent) {
            autoDownloadVtt(generatedResults.vttContent);
        }
    });

    downloadCompressedBtn.addEventListener('click', () => {
        if (generatedResults?.compressionResults) {
            const blob = generatedResults.compressionResults.blob;
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${originalFile.name.split('.')[0]}_compressed.mp4`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            logToUI('📥 Compressed video downloaded');
            showToast('Compressed video downloaded', 'success');
        }
    });

    // Logs
    viewLogsBtn.addEventListener('click', showLogsOverlay);
    closeLogsBtn.addEventListener('click', hideLogsOverlay);
    emailLogsBtn.addEventListener('click', emailLogs);

    // Modal
    modalClose.addEventListener('click', () => {
        hideCompressionWarning();
        if (compressionPromiseReject) compressionPromiseReject(new Error('User cancelled'));
    });
    
    modalCancel.addEventListener('click', () => {
        hideCompressionWarning();
        if (compressionPromiseReject) compressionPromiseReject(new Error('User cancelled'));
    });
    
    modalContinue.addEventListener('click', () => {
        logToUI('📝 User clicked Continue button in compression modal');
        if (dontShowAgain.checked) {
            setCookie('hideCompressionWarning', 'true', 30);
            logToUI('✅ "Don\'t show again" preference saved');
        }
        
        // Store the resolve function before clearing it
        const resolveFunction = compressionPromiseResolve;
        logToUI('📝 Stored promise resolve function, resolving...');
        
        // Hide modal and clear promise handlers
        hideCompressionWarning();
        
        // Now resolve the promise using the stored function
        if (resolveFunction) {
            resolveFunction();
            logToUI('✅ Compression promise resolved successfully');
        } else {
            logToUI('❌ Warning: compressionPromiseResolve was null!');
        }
    });



    // ===== UTILITY FUNCTIONS =====
    
    async function fetchAppVersion() {
        try {
            const response = await fetch('/api/version');
            const data = await response.json();
            appVersion = data.version;
            logToUI(`🎯 App version: v${appVersion}`);
            
            // Update footer version display
            const versionElement = document.getElementById('app-version');
            if (versionElement) {
                versionElement.textContent = `v${appVersion}`;
            }
        } catch (error) {
            logToUI('⚠️ Could not fetch app version');
            appVersion = 'unknown';
            
            // Update footer with unknown version
            const versionElement = document.getElementById('app-version');
            if (versionElement) {
                versionElement.textContent = 'v?.?.?';
            }
        }
    }
    
    function logToUI(message) {
        const p = document.createElement('p');
        const timestamp = new Date().toLocaleTimeString();
        p.textContent = `[${timestamp}] ${message}`;
        logContainer.appendChild(p);
        logContainer.scrollTop = logContainer.scrollHeight;
    }

    async function loadFFmpeg() {
        if (ffmpegLoaded) {
            logToUI('FFmpeg is already loaded.');
            return { ffmpeg, fetchFile: FFmpeg.fetchFile };
        }
        
        try {
            logToUI('⚙️ Loading FFmpeg...');
            
            // Check if FFmpeg is available
            if (typeof FFmpeg === 'undefined') {
                throw new Error('FFmpeg library not loaded. Please refresh the page and try again.');
            }
            
            const { createFFmpeg, fetchFile } = FFmpeg;
            
            logToUI('⚙️ Creating FFmpeg instance...');
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
            
            logToUI('⚙️ Loading FFmpeg core...');
            
            // Add a timeout to prevent indefinite hanging
            const loadPromise = ffmpeg.load();
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => {
                    reject(new Error('FFmpeg loading timed out after 30 seconds. Please refresh the page and try again.'));
                }, 30000);
            });
            
            await Promise.race([loadPromise, timeoutPromise]);
            ffmpegLoaded = true;
            logToUI('✅ FFmpeg loaded successfully!');
            return { ffmpeg, fetchFile };
        } catch (error) {
            logToUI(`❌ Error loading FFmpeg: ${error.message}`);
            logToUI('💡 Try refreshing the page if the problem persists');
            throw error;
        }
    }
    
    async function handleCompression(fileData) {
        try {
            logToUI('🔄 Main thread received file for compression');
            updateProgress(16, 'Loading FFmpeg...');
            
            const { ffmpeg, fetchFile } = await loadFFmpeg();
            logToUI('✅ FFmpeg loaded, starting compression process');
            
            const { buffer, name, size, type } = fileData;
            const originalSizeMB = (size / 1024 / 1024).toFixed(2);
            logToUI(`🔄 Starting compression of ${name} (${originalSizeMB}MB)`);
            
            updateProgress(17, 'Writing file to FFmpeg filesystem...');
            const fileBytes = new Uint8Array(buffer);
            ffmpeg.FS('writeFile', name, fileBytes);
            logToUI('✅ File written to FFmpeg filesystem');
            
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
            updateProgress(18, 'Running FFmpeg compression...');
            
            await ffmpeg.run(...ffmpegArgs);
            logToUI('✅ FFmpeg compression completed');
            
            updateProgress(25, 'Reading compressed file...');
            const data = ffmpeg.FS('readFile', 'output.mp4');
            const compressedBlob = new Blob([data.buffer], { type: 'video/mp4' });
            
            logToUI(`✅ FFmpeg processing finished. Original: ${originalSizeMB}MB → Compressed: ${(compressedBlob.size / 1024 / 1024).toFixed(2)}MB`);
            
            updateProgress(26, 'Cleaning up temporary files...');
            ffmpeg.FS('unlink', name);
            ffmpeg.FS('unlink', 'output.mp4');
            logToUI('✅ Temporary files cleaned up');
            
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
                const base64 = reader.result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = error => reject(error);
        });
    }

    function showToast(message, type = 'success', duration = 3000) {
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

    // ===== INITIALIZATION =====
    
    async function initialize() {
        initializeTheme();
        loadSettings();
        checkIfInstalled();
        initializeLogs();
        initializeClipboardPaste();
        
        // Fetch app version first
        await fetchAppVersion();
        
        // Start with upload section
        showSection(uploadSection);
        updateStatus('Ready to generate alt text', 'ready');
        
        logToUI(`✅ Application initialized successfully (v${appVersion || 'unknown'})`);
    }

    // Initialize the application
    initialize();
}); 