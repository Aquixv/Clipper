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
        if (activeTab.url.includes('tiktok.com')) {
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
        
        clipBtn.addEventListener('click', () => {
            const duration = parseInt(durationSelect.value);
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

                    // Hand chunks to the webpage so the popup can close
                    chrome.tabs.sendMessage(activeTab.id, { 
                        action: "DOWNLOAD_CHUNKS", 
                        chunks: response.chunks,
                        filename: `Clipped_${duration}s_from_${Math.floor(endSec)}.ts`
                    }, () => {
                        clipBtn.innerText = "Check Page! ✅";
                        setTimeout(() => { clipBtn.innerText = "Clip That!"; clipBtn.disabled = false; }, 2000);
                    });
                });
            });
        });
    });
});