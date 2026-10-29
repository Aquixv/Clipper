document.addEventListener('DOMContentLoaded', () => {
    const clipBtn = document.getElementById('clip-btn');
    const durationSelect = document.getElementById('clip-duration');

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