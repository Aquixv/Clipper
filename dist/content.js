let isRecording = false;
let isDownloadingTwitch = false;
let mediaRecorder = null;
let twitchAbortController = null;
let recordedChunks = [];
let floatingBtn = null;

// --- DYNAMIC FLOATING BUTTON UI ---
function createFloatingButton(text, callback) {
    if (document.getElementById('clipper-float-btn')) return; 
    floatingBtn = document.createElement('button');
    floatingBtn.id = 'clipper-float-btn';
    floatingBtn.innerText = text;
    floatingBtn.style.cssText = `
        position: fixed; top: 20px; right: 20px; z-index: 999999;
        padding: 12px 20px; background: #dc3545; color: white;
        border: none; border-radius: 8px; font-weight: bold; font-family: sans-serif;
        cursor: pointer; box-shadow: 0 4px 6px rgba(0,0,0,0.3); transition: 0.2s;
    `;
    floatingBtn.addEventListener('click', callback);
    document.body.appendChild(floatingBtn);
}

function removeFloatingButton() {
    if (floatingBtn) {
        floatingBtn.remove();
        floatingBtn = null;
    }
}

// --- CANCELLATION HANDLERS ---
function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== "inactive") mediaRecorder.stop();
    isRecording = false;
    removeFloatingButton();
}

function cancelTwitchDownload() {
    isDownloadingTwitch = false;
    if (twitchAbortController) twitchAbortController.abort(); // Kills active network fetches
    removeFloatingButton();
    console.log("[Clipper] Twitch download cancelled by user.");
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "GET_VIDEO_STATE") {
        const video = document.querySelector('video');
        sendResponse({ url: window.location.href, time: video ? video.currentTime : 0 });
    
    } else if (request.action === "CHECK_RECORD_STATE") {
        sendResponse({ isRecording });
    
    // --- TIKTOK MEDIARECORDER ---
    } else if (request.action === "START_RECORD") {
        const video = document.querySelector('video');
        if (!video) return sendResponse({ status: "Error" });

        try {
            const stream = video.captureStream();
            mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
            recordedChunks = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) recordedChunks.push(e.data);
            };

            mediaRecorder.onstop = () => {
                const blob = new Blob(recordedChunks, { type: 'video/webm' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;
                a.download = `Clipped_Live_${Date.now()}.webm`;
                document.body.appendChild(a);
                a.click();
                setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
            };

            mediaRecorder.start();
            isRecording = true;
            createFloatingButton("🛑 Stop Recording", stopRecording);
            sendResponse({ status: "Started" });
        } catch (err) {
            console.error("[Clipper] MediaRecorder failed:", err);
            sendResponse({ status: "Error" });
        }
    
    } else if (request.action === "STOP_RECORD") {
        stopRecording();
        sendResponse({ status: "Stopped" });
    
    // --- TWITCH BACKGROUND STITCHING (WITH ABORT) 
} else if (request.action === "CHECK_DOWNLOAD_STATE") {
        sendResponse({ isDownloading: isDownloadingTwitch });
        
    } else if (request.action === "CANCEL_DOWNLOAD") {
        cancelTwitchDownload();
        sendResponse({ status: "Cancelled" });

    // --- TWITCH BACKGROUND STITCHING (WITH ABORT) ---
    } else if (request.action === "DOWNLOAD_CHUNKS") {
        isDownloadingTwitch = true;
        twitchAbortController = new AbortController();

        (async () => {
            try {
                let combinedBuffers = [];
                const totalChunks = request.chunks.length;
                
                for (let i = 0; i < totalChunks; i++) {
                    if (!isDownloadingTwitch) throw new Error("Cancelled by user");
                    
                    // Update button UI to show progress
                    if (floatingBtn) floatingBtn.innerText = `🛑 Cancel (${i + 1}/${totalChunks})`;
                    
                    const chunkRes = await fetch(request.chunks[i], { signal: twitchAbortController.signal });
                    combinedBuffers.push(await chunkRes.arrayBuffer());
                }

                const blob = new Blob(combinedBuffers, { type: 'video/mp2t' });
                const blobUrl = URL.createObjectURL(blob);

                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = blobUrl;
                a.download = request.filename;
                document.body.appendChild(a);
                a.click();
                
                setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(blobUrl); }, 1000);
            } catch (err) {
                if (err.name === 'AbortError' || err.message === "Cancelled by user") {
                    console.log("[Clipper] Download aborted successfully.");
                } else {
                    console.error("[Clipper] Stitching failed:", err);
                }
            } finally {
                isDownloadingTwitch = false;
                removeFloatingButton();
            }
        })();
        sendResponse({ status: "Downloading in background..." });
    }
    return true; 
});