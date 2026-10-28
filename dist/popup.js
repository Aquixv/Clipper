function formatTime(seconds) {
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
}

document.addEventListener('DOMContentLoaded', () => {
    // 1. Define the variables FIRST
    const startInput = document.getElementById('start-time');
    const endInput = document.getElementById('end-time');
    const clipBtn = document.getElementById('clip-btn');
    
    // 2. Now you can safely use them in your array
    const timeInputs = [startInput, endInput];
    
    timeInputs.forEach(input => {
        input.addEventListener('input', (e) => {
            // Strip all non-numeric characters and limit to 6 digits
            let val = e.target.value.replace(/\D/g, '').substring(0, 6);
            
            // Auto-insert colons for HH:MM:SS format
            let formatted = '';
            for (let i = 0; i < val.length; i++) {
                if (i === 2 || i === 4) formatted += ':';
                formatted += val[i];
            }
            e.target.value = formatted;
        });
    });
    
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
        
        // Ensure the input strictly matches HH:MM:SS (hours can be 2+ digits)
        const timeRegex = /^\d{2,}:[0-5]\d:[0-5]\d$/;
        if (!timeRegex.test(start) || !timeRegex.test(end)) {
            clipBtn.innerText = "Invalid Format";
            setTimeout(() => clipBtn.innerText = "Clip Video", 2000);
            return;
        }
        
        clipBtn.innerText = "Processing...";
        
        // Convert HH:MM:SS back to total seconds for the math
        const startSec = start.split(':').reduce((acc, time) => (60 * acc) + +time, 0);
        const endSec = end.split(':').reduce((acc, time) => (60 * acc) + +time, 0);

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                chrome.runtime.sendMessage({ 
                    action: "PROCESS_CLIP", 
                    tabId: tabs[0].id, 
                    start: startSec, 
                    end: endSec 
                }, (response) => {
                    clipBtn.innerText = response?.status || "Check Console";
                });
            }
        });
    });
});