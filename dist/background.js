let activeStreamMaps = {};

chrome.webRequest.onCompleted.addListener(
    (details) => {
        const url = details.url;
        // Catch HLS (.m3u8), DASH (.mpd), and YouTube's custom videoplayback streams
        if (url.includes('.m3u8') || url.includes('.mpd') || url.includes('videoplayback')) {
            
            // Get the tab ID to map the stream to the correct webpage
            const tabId = details.tabId;
            if (tabId >= 0) {
                if (!activeStreamMaps[tabId]) activeStreamMaps[tabId] = [];
                activeStreamMaps[tabId].push(url);
                
                console.log(`[Network Sniffer] Caught stream map for tab ${tabId}:`, url);
            }
        }
    },
    { urls: ["<all_urls>"] } // We filter inside the function to avoid missing obscure domains
);