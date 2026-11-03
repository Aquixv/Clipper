document.addEventListener('DOMContentLoaded', () => {
    const retroUi = document.getElementById('retro-ui');
    const recordUi = document.getElementById('record-ui');
    const clipBtn = document.getElementById('clip-btn');
    const recordBtn = document.getElementById('record-btn');
    const durationSelect = document.getElementById('clip-duration');

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs[0];
        if (!activeTab) return;

        // --- TIKTOK UI (MediaRecorder) ---
        if (activeTab.url.includes('tiktok.com') || activeTab.url.includes('youtube.com')) {
            recordUi.style.display = 'block';
            
            chrome.tabs.sendMessage(activeTab.id, { action: "CHECK_RECORD_STATE" }, (res) => {
                if (res && res.isRecording) {
                    recordBtn.innerText = "Stop Recording";
                    recordBtn.style.background = "#6c757d"; 
                    recordBtn.dataset.state = "recording";
                } else {
                    recordBtn.dataset.state = "idle";
                }
            });

            recordBtn.addEventListener('click', () => {
                if (recordBtn.dataset.state === "idle") {
                    recordBtn.innerText = "Connecting...";
                    chrome.tabs.sendMessage(activeTab.id, { action: "START_RECORD" }, () => {
                        recordBtn.innerText = "Stop Recording";
                        recordBtn.style.background = "#6c757d";
                        recordBtn.dataset.state = "recording";
                    });
                } else {
                    recordBtn.innerText = "Saving...";
                    chrome.tabs.sendMessage(activeTab.id, { action: "STOP_RECORD" }, () => {
                        recordBtn.innerText = "Clip Saved! ✅";
                        recordBtn.style.background = "#28a745";
                        setTimeout(() => {
                            recordBtn.innerText = "Start Recording";
                            recordBtn.style.background = "#dc3545";
                            recordBtn.dataset.state = "idle";
                        }, 3000);
                    });
                }
            });
            return; 
        }

// --- TWITCH UI (Retroactive Chunks) ---
        retroUi.style.display = 'block';
        const customMinutes = document.getElementById('custom-minutes');
        const cancelBtn = document.getElementById('cancel-btn');

        durationSelect.addEventListener('change', () => {
            customMinutes.style.display = durationSelect.value === 'custom' ? 'block' : 'none';
        });

        // 1. Check if a download is already running when the popup opens
        chrome.tabs.sendMessage(activeTab.id, { action: "CHECK_DOWNLOAD_STATE" }, (res) => {
            if (res && res.isDownloading) {
                clipBtn.innerText = "Downloading in background...";
                clipBtn.disabled = true;
                cancelBtn.style.display = 'block';
            }
        });
        
        clipBtn.addEventListener('click', () => {
            let duration = 0;
            if (durationSelect.value === 'custom') {
                const mins = parseFloat(customMinutes.value);
                if (!mins || mins <= 0) {
                    clipBtn.innerText = "Enter valid minutes";
                    setTimeout(() => clipBtn.innerText = "Clip That!", 2000);
                    return;
                }
                duration = mins * 60; 
            } else {
                duration = parseInt(durationSelect.value);
            }

            clipBtn.innerText = "Grabbing Timestamp...";
            clipBtn.disabled = true;

            chrome.tabs.sendMessage(activeTab.id, { action: "GET_VIDEO_STATE" }, (videoState) => {
                if (!videoState || typeof videoState.time !== 'number') {
                    clipBtn.innerText = "Error: Video not found";
                    setTimeout(() => { clipBtn.innerText = "Clip That!"; clipBtn.disabled = false; }, 3000);
                    return;
                }

                const endSec = videoState.time;
                const startSec = Math.max(0, endSec - duration);
                clipBtn.innerText = "Extracting Chunks...";

                chrome.runtime.sendMessage({ 
                    action: "PROCESS_CLIP", 
                    tabId: activeTab.id, 
                    url: activeTab.url,
                    start: startSec, 
                    end: endSec 
                }, (response) => {
                    if (!response || !response.chunks || response.chunks.length === 0) {
                        clipBtn.innerText = response?.status || "No chunks found";
                        setTimeout(() => { clipBtn.innerText = "Clip That!"; clipBtn.disabled = false; }, 3000);
                        return;
                    }

                    // 2. Show the cancel button and start the download
                    clipBtn.innerText = "Downloading...";
                    cancelBtn.style.display = 'block';

                    chrome.tabs.sendMessage(activeTab.id, { 
                        action: "DOWNLOAD_CHUNKS", 
                        chunks: response.chunks,
                        filename: `Clipped_${duration}s_from_${Math.floor(endSec)}.ts`
                    }, () => {
                        clipBtn.innerText = "Clip Saved! ✅";
                        cancelBtn.style.display = 'none';
                        setTimeout(() => { clipBtn.innerText = "Clip That!"; clipBtn.disabled = false; }, 2000);
                    });
                });
            });
        });

        // 3. The Cancel Action
        cancelBtn.addEventListener('click', () => {
            chrome.tabs.sendMessage(activeTab.id, { action: "CANCEL_DOWNLOAD" });
            cancelBtn.style.display = 'none';
            clipBtn.innerText = "Cancelled ❌";
            setTimeout(() => { clipBtn.innerText = "Clip That!"; clipBtn.disabled = false; }, 2000);
        });
    });
});