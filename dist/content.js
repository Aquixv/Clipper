let isRecording = false;
let mediaRecorder = null;
let recordedChunks = [];
let floatingBtn = null;

// --- FLOATING BUTTON UI ---
function createFloatingButton() {
    if (document.getElementById('clipper-float-btn')) return; // Prevent duplicates
    floatingBtn = document.createElement('button');
    floatingBtn.id = 'clipper-float-btn';
    floatingBtn.innerText = "🛑";
    floatingBtn.style.cssText = `
        position: fixed; top: 20px; right: 20px; z-index: 999999;
        padding: 12px 20px; background: #dc3545; color: white;
        border: none; border-radius: 8px; font-weight: bold; font-family: sans-serif;
        cursor: pointer; box-shadow: 0 4px 6px rgba(0,0,0,0.3);
    `;
    floatingBtn.addEventListener('click', stopRecording);
    document.body.appendChild(floatingBtn);
}

function removeFloatingButton() {
    if (floatingBtn) {
        floatingBtn.remove();
        floatingBtn = null;
    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
    }
    isRecording = false;
    removeFloatingButton();
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
        if (!video) {
            console.error("[Clipper] No video element found on page");
            sendResponse({ status: "Error" });
            return;
        }

        try {
            // Intercept the browser's live video feed
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
                a.download = `TikTok_Live_${Date.now()}.webm`;
                document.body.appendChild(a);
                a.click();
                setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
            };

            mediaRecorder.start();
            isRecording = true;
            createFloatingButton();
            sendResponse({ status: "Started" });
        } catch (err) {
            console.error("[Clipper] MediaRecorder failed:", err);
            sendResponse({ status: "Error" });
        }
    
    } else if (request.action === "STOP_RECORD") {
        stopRecording();
        sendResponse({ status: "Stopped" });
    
    // --- TWITCH BACKGROUND STITCHING ---
    } else if (request.action === "DOWNLOAD_CHUNKS") {
        (async () => {
            try {
                let combinedBuffers = [];
                const totalChunks = request.chunks.length;
                
                for (let i = 0; i < totalChunks; i++) {
                    const chunkRes = await fetch(request.chunks[i]);
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
                console.error("[Clipper] Stitching failed:", err);
            }
        })();
        sendResponse({ status: "Downloading in background..." });
    }
    return true; 
});