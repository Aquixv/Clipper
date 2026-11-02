document.addEventListener('DOMContentLoaded', () => {
    const retroUi = document.getElementById('retro-ui');
    const recordUi = document.getElementById('record-ui');
    const clipBtn = document.getElementById('clip-btn');
    const recordBtn = document.getElementById('record-btn');
    const durationSelect = document.getElementById('clip-duration');

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs[0];
        if (!activeTab) return;

        // Route TikTok to the manual recording UI
        if (activeTab.url.includes('tiktok.com')) {
            recordUi.style.display = 'block';
            
            // Sync button state if user closed and reopened the popup
            chrome.tabs.sendMessage(activeTab.id, { action: "CHECK_RECORD_STATE" }, (res) => {
                if (res && res.isRecording) {
                    recordBtn.innerText = "Stop Recording";
                    recordBtn.style.background = "#6c757d"; // Gray
                    recordBtn.dataset.state = "recording";
                } else {
                    recordBtn.dataset.state = "idle";
                }
            });

            recordBtn.addEventListener('click', () => {
                if (recordBtn.dataset.state === "idle") {
                    recordBtn.innerText = "Connecting...";
                    
                    // Fetch the sniffed URL from the background
                    chrome.runtime.sendMessage({ action: "GET_TIKTOK_URL", tabId: activeTab.id }, (bgRes) => {
                        if (!bgRes || !bgRes.url) {
                            recordBtn.innerText = "Stream not found";
                            setTimeout(() => recordBtn.innerText = "Start Recording", 3000);
                            return;
                        }

                        // Send URL to content.js to start buffering
                        chrome.tabs.sendMessage(activeTab.id, { action: "START_RECORD", url: bgRes.url }, () => {
                            recordBtn.innerText = "Stop Recording";
                            recordBtn.style.background = "#6c757d";
                            recordBtn.dataset.state = "recording";
                        });
                    });
                } else {
                    recordBtn.innerText = "Saving...";
                    // Stop buffering and trigger download
                    chrome.tabs.sendMessage(activeTab.id, { action: "STOP_RECORD" }, () => {
                        recordBtn.innerText = "Clip Saved! ✅";
                        recordBtn.style.background = "#28a745"; // Green
                        setTimeout(() => {
                            recordBtn.innerText = "Start Recording";
                            recordBtn.style.background = "#dc3545"; // Red
                            recordBtn.dataset.state = "idle";
                        }, 3000);
                    });
                }
            });
            return; // Stop executing so the Twitch listener below doesn't attach
        }

        retroUi.style.display = 'block';
    
    });

    clipBtn.addEventListener('click', () => {
        const duration = parseInt(durationSelect.value);
        clipBtn.innerText = "Grabbing Timestamp...";
        clipBtn.disabled = true;

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                // 1. Get the current playhead position
                chrome.tabs.sendMessage(tabs[0].id, { action: "GET_VIDEO_STATE" }, (videoState) => {
                    if (!videoState || typeof videoState.time !== 'number') {
                        clipBtn.innerText = "Error: Video not found";
                        setTimeout(() => { clipBtn.innerText = "Clip That!"; clipBtn.disabled = false; }, 3000);
                        return;
                    }

                    // 2. Calculate the retroactive time window
                    const endSec = videoState.time;
                    const startSec = Math.max(0, endSec - duration); // Prevents negative start times

                    clipBtn.innerText = "Extracting Chunks...";

                    // 3. Send the math to the background script
                    chrome.runtime.sendMessage({ 
                        action: "PROCESS_CLIP", 
                        tabId: tabs[0].id, 
                        url: tabs[0].url, // <-- Change this line
                        start: startSec, 
                        end: endSec 
                    }, async (response) => {
                        
                        if (!response || !response.chunks || response.chunks.length === 0) {
                            clipBtn.innerText = response?.status || "No chunks in sliding window";
                            setTimeout(() => { clipBtn.innerText = "Clip That!"; clipBtn.disabled = false; }, 3000);
                            return;
                        }

                        try {
                            let combinedBuffers = [];
                            const totalChunks = response.chunks.length;
                            
                            // 4. Download and stitch the binary data
                            for (let i = 0; i < totalChunks; i++) {
                                clipBtn.innerText = `Fetching chunk ${i + 1} of ${totalChunks}...`;
                                const chunkRes = await fetch(response.chunks[i]);
                                const arrayBuffer = await chunkRes.arrayBuffer();
                                combinedBuffers.push(arrayBuffer);
                            }

                            clipBtn.innerText = "Stitching Video...";

                            const blob = new Blob(combinedBuffers, { type: 'video/mp2t' });
                            const blobUrl = URL.createObjectURL(blob);

                            chrome.downloads.download({
                                url: blobUrl,
                                filename: `Clipped_${duration}s_from_${Math.floor(endSec)}.ts`,
                                saveAs: false
                            }, () => {
                                clipBtn.innerText = "Clip Saved! ✅";
                                setTimeout(() => {
                                    clipBtn.innerText = "Clip That!";
                                    clipBtn.disabled = false;
                                    URL.revokeObjectURL(blobUrl); 
                                }, 3000);
                            });

                        } catch (err) {
                            console.error("[Popup] Stitching failed:", err);
                            clipBtn.innerText = "Download Failed ❌";
                            setTimeout(() => { clipBtn.innerText = "Clip That!"; clipBtn.disabled = false; }, 3000);
                        }
                    });
                });
            }
        });
    });
});