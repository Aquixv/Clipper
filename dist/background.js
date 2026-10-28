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
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "PROCESS_CLIP") {
        const tabId = message.tabId;
        const manifestUrls = activeStreamMaps[tabId];

        if (!manifestUrls || manifestUrls.length === 0) {
            sendResponse({ status: "No stream found" });
            return true;
        }

        // Grab the most recently sniffed manifest
        const targetManifest = manifestUrls[manifestUrls.length - 1];
        console.log(`[Clipper] Fetching manifest for math:`, targetManifest);

        // Fetch the text of the playlist to parse the chunks
        fetch(targetManifest)
            .then(res => res.text())
            .then(manifestText => {
                console.log("[Clipper] Manifest loaded. Ready to parse chunks.");
                // Next step: Math
                sendResponse({ status: "Manifest Parsed!" });
            })
            .catch(err => {
                console.error("Failed to fetch manifest", err);
                sendResponse({ status: "Fetch Error" });
            });

        return true; 
    }
});