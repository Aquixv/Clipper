let isRecording = false;
let abortController = null;
let recordedChunks = [];

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "GET_VIDEO_STATE") {
        const video = document.querySelector('video');
        const currentTime = video ? video.currentTime : 0;
        sendResponse({ url: window.location.href, time: currentTime });
    
    } else if (request.action === "CHECK_RECORD_STATE") {
        // Tells the popup if we are currently recording so the button matches
        sendResponse({ isRecording });
    
    } else if (request.action === "START_RECORD") {
        isRecording = true;
        recordedChunks = [];
        abortController = new AbortController();
        
        // Open a continuous pipeline to the FLV file
        fetch(request.url, { signal: abortController.signal }).then(async res => {
            const reader = res.body.getReader();
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                recordedChunks.push(value); // Buffer binary data in the webpage's RAM
            }
        }).catch(err => {
            if (err.name !== 'AbortError') console.error("Recording error:", err);
        });
        
        sendResponse({ status: "Started" });
    
    } else if (request.action === "STOP_RECORD") {
        if (abortController) abortController.abort(); // Cut the network pipe
        isRecording = false;
        
        if (recordedChunks.length > 0) {
            // Smash the binary arrays together into a single FLV video
            const blob = new Blob(recordedChunks, { type: 'video/x-flv' });
            const url = URL.createObjectURL(blob);
            
            // Generate a hidden link and click it to trigger the native Chrome download UI
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = `TikTok_Live_${Date.now()}.flv`;
            document.body.appendChild(a);
            a.click();
            
            // Clean up memory
            setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
        }
        sendResponse({ status: "Stopped" });
    }
    return true; 
});