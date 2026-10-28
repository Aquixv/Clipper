function formatTime(seconds) {
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
}

document.addEventListener('DOMContentLoaded', () => {
    const startInput = document.getElementById('start-time');
    const endInput = document.getElementById('end-time');
    const clipBtn = document.getElementById('clip-btn');
    
    // Ping content.js for the exact video timestamp
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, { action: "GET_VIDEO_STATE" }, (response) => {
                if (response && response.time) {
                    startInput.value = formatTime(response.time);
                    endInput.value = formatTime(response.time + 60); 
                }
            });
        }
    });

    clipBtn.addEventListener('click', () => {
        const start = startInput.value;
        const end = endInput.value;
        if (!start || !end) return;
        
        clipBtn.innerText = "Processing...";
        // Next phase: translate these timecodes into stream chunk indices
        console.log(`Ready to extract chunks from ${start} to ${end}`);
    });
});