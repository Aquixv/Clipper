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
            .then(async (manifestText) => {
                let workingManifest = manifestText;
                let baseUrl = targetManifest.substring(0, targetManifest.lastIndexOf('/') + 1);

                // 1. Check if this is a Master Playlist (contains other m3u8 files instead of chunks)
                if (workingManifest.includes('#EXT-X-STREAM-INF')) {
                    console.log("[Clipper] Master playlist detected. Routing to highest quality...");
                    const lines = workingManifest.split('\n');
                    let resolutionUrl = '';
                    
                    for (let i = 0; i < lines.length; i++) {
                        // Grab the first resolution playlist it offers (usually the highest)
                        if (lines[i].includes('.m3u8')) {
                            resolutionUrl = lines[i].trim();
                            if (!resolutionUrl.startsWith('http')) {
                                resolutionUrl = baseUrl + resolutionUrl;
                            }
                            break;
                        }
                    }

                    if (resolutionUrl) {
                        const subRes = await fetch(resolutionUrl);
                        workingManifest = await subRes.text();
                        // Update the baseUrl for the new chunks
                        baseUrl = resolutionUrl.substring(0, resolutionUrl.lastIndexOf('/') + 1);
                    }
                }

                console.log("[Clipper] Target playlist loaded. Parsing chunks...");
                
                let chunksToDownload = [];
                
                if (workingManifest.includes('#EXTINF')) {
                    const lines = workingManifest.split('\n');
                    let currentTime = 0; 

                    for (let i = 0; i < lines.length; i++) {
                        const line = lines[i].trim();
                        
                        if (line.startsWith('#EXTINF:')) {
                            const duration = parseFloat(line.split(':')[1].split(',')[0]);
                            
                            if (currentTime + duration >= message.start && currentTime <= message.end) {
                                let chunkUrl = lines[i + 1].trim();
                                
                                if (!chunkUrl.startsWith('http')) {
                                    chunkUrl = baseUrl + chunkUrl;
                                }
                                chunksToDownload.push(chunkUrl);
                            }
                            
                            currentTime += duration;
                            if (currentTime > message.end) break;
                        }
                    }
                    
                    console.log(`[Clipper] Success! Found ${chunksToDownload.length} chunks.`);
                    sendResponse({ 
                        status: `Found ${chunksToDownload.length} chunks!`,
                        chunks: chunksToDownload 
                    });
                } else {
                    sendResponse({ status: "Invalid Manifest Format" });
                }
            })
            .catch(err => {
                console.error("Failed to fetch manifest", err);
                sendResponse({ status: "Fetch Error" });
            });
        })

        // Tells Chrome to keep the messaging channel open until the async fetch finishes
        return true; 
    }
});