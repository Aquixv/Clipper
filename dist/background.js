chrome.webRequest.onCompleted.addListener(
    async (details) => {
        const url = details.url;
        
        if (url.includes('.m3u8') || url.includes('.mpd') || url.includes('videoplayback')) {
            const tabId = details.tabId.toString(); 
            
            if (tabId >= 0) {
                // Retrieve the surviving maps from session storage
                const data = await chrome.storage.session.get('activeStreamMaps');
                const maps = data.activeStreamMaps || {};
                
                if (!maps[tabId]) maps[tabId] = [];
                maps[tabId].push(url);
                
                // Keep only the last 5 manifests to prevent storage bloat
                if (maps[tabId].length > 5) maps[tabId].shift(); 
                
                await chrome.storage.session.set({ activeStreamMaps: maps });
                console.log(`[Network Sniffer] Caught stream map for tab ${tabId}:`, url);
            }
        }
    },
    { urls: ["<all_urls>"] } 
);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "PROCESS_CLIP") {
        const tabId = message.tabId.toString();
        
        // Fetch from session storage asynchronously
        chrome.storage.session.get('activeStreamMaps').then(data => {
            const maps = data.activeStreamMaps || {};
            const manifestUrls = maps[tabId];

            if (!manifestUrls || manifestUrls.length === 0) {
                sendResponse({ status: "No stream found" });
                return;
            }

            const targetManifest = manifestUrls[manifestUrls.length - 1];
            console.log(`[Clipper] Fetching manifest for math:`, targetManifest);

            fetch(targetManifest)
            .then(res => res.text())
            .then(manifestText => {
                console.log("[Clipper] Manifest loaded. Parsing chunks...");
                
                let chunksToDownload = [];
                
                // Currently focusing on HLS (.m3u8) streams
                if (targetManifest.includes('.m3u8')) {
                    const lines = manifestText.split('\n');
                    let currentTime = 0; // Tracks our position in the video

                    for (let i = 0; i < lines.length; i++) {
                        const line = lines[i].trim();
                        
                        // Look for the duration marker
                        if (line.startsWith('#EXTINF:')) {
                            const duration = parseFloat(line.split(':')[1].split(',')[0]);
                            
                            // Check if this chunk falls inside the user's selected timecode
                            if (currentTime + duration >= message.start && currentTime <= message.end) {
                                let chunkUrl = lines[i + 1].trim();
                                
                                // If the URL is relative (e.g., "chunk_4.ts"), attach the base domain to it
                                if (!chunkUrl.startsWith('http')) {
                                    const baseUrl = targetManifest.substring(0, targetManifest.lastIndexOf('/') + 1);
                                    chunkUrl = baseUrl + chunkUrl;
                                }
                                chunksToDownload.push(chunkUrl);
                            }
                            
                            currentTime += duration;
                            
                            // Stop doing math once we've passed the end time
                            if (currentTime > message.end) break;
                        }
                    }
                    
                    console.log(`[Clipper] Success! Found ${chunksToDownload.length} chunks for your time range.`);
                    sendResponse({ status: `Found ${chunksToDownload.length} chunks!` });
                } else {
                    console.log("[Clipper] MPD/DASH parsing coming next.");
                    sendResponse({ status: "MPD not yet supported" });
                }
            })
            .catch(err => {
                console.error("Failed to fetch manifest", err);
                sendResponse({ status: "Fetch Error" });
            });
        });

        // Tells Chrome to keep the messaging channel open until the async fetch finishes
        return true; 
    }
});