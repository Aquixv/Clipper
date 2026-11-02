// --- GLOBAL STATE ---
let activeTikTokStreams = {}; 

// --- 1. HLS/DASH SNIFFER (Twitch, YouTube) ---
chrome.webRequest.onCompleted.addListener(
    async (details) => {
        const url = details.url;
        if (url.includes('.m3u8') || url.includes('.mpd') || url.includes('videoplayback')) {
            const tabId = details.tabId.toString(); 
            if (tabId >= 0) {
                const data = await chrome.storage.session.get('activeStreamMaps');
                const maps = data.activeStreamMaps || {};
                
                if (!maps[tabId]) maps[tabId] = [];
                maps[tabId].push(url);
                
                if (maps[tabId].length > 5) maps[tabId].shift(); 
                
                await chrome.storage.session.set({ activeStreamMaps: maps });
                console.log(`[Network Sniffer] Caught stream map for tab ${tabId}:`, url);
            }
        }
    },
    { urls: ["<all_urls>"] } 
);

// --- 2. CONTINUOUS STREAM SNIFFER (TikTok) ---
chrome.webRequest.onResponseStarted.addListener(
    (details) => {
        const url = details.url;
        if (url.includes('.flv') || url.includes('.m4s') || (url.includes('tiktok') && url.includes('video'))) {
            if (!url.includes('.js')) { 
                activeTikTokStreams[details.tabId] = url;
                console.log(`[TikTok Sniffer] Logged FLV stream for tab ${details.tabId}`);
            }
        }
    },
    { urls: ["*://*.tiktokcdn.com/*", "*://*.tiktokv.com/*", "*://*.tiktok.com/*"] } 
);

// --- 3. MESSAGE ROUTER ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    
    // Route A: TikTok URL Request
    if (message.action === "GET_TIKTOK_URL") {
        sendResponse({ url: activeTikTokStreams[message.tabId] });
        return true;
    }

    // Route B: Twitch/YouTube Chunk Math
    if (message.action === "PROCESS_CLIP") {
        const tabId = message.tabId.toString();
        
        chrome.storage.session.get('activeStreamMaps').then(data => {
            const maps = data.activeStreamMaps || {};
            const manifestUrls = maps[tabId];

            if (!manifestUrls || manifestUrls.length === 0) {
                sendResponse({ status: "No stream found" });
                return;
            }

            const targetManifest = manifestUrls[manifestUrls.length - 1];
            
            fetch(targetManifest)
            .then(res => res.text())
            .then(async (manifestText) => {
                let workingManifest = manifestText;
                let baseUrl = targetManifest.substring(0, targetManifest.lastIndexOf('/') + 1);

                if (workingManifest.includes('#EXT-X-STREAM-INF')) {
                    const lines = workingManifest.split('\n');
                    let resolutionUrl = '';
                    
                    for (let i = 0; i < lines.length; i++) {
                        if (lines[i].includes('.m3u8')) {
                            resolutionUrl = lines[i].trim();
                            if (!resolutionUrl.startsWith('http')) resolutionUrl = baseUrl + resolutionUrl;
                            break;
                        }
                    }

                    if (resolutionUrl) {
                        const subRes = await fetch(resolutionUrl);
                        workingManifest = await subRes.text();
                        baseUrl = resolutionUrl.substring(0, resolutionUrl.lastIndexOf('/') + 1);
                    }
                }
                
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
                                if (!chunkUrl.startsWith('http')) chunkUrl = baseUrl + chunkUrl;
                                chunksToDownload.push(chunkUrl);
                            }
                            
                            currentTime += duration;
                            if (currentTime > message.end) break;
                        }
                    }
                    sendResponse({ status: `Found ${chunksToDownload.length} chunks!`, chunks: chunksToDownload });
                } else {
                    sendResponse({ status: "Invalid Manifest Format" });
                }
            })
            .catch(err => {
                console.error("Failed to fetch manifest", err);
                sendResponse({ status: "Fetch Error" });
            });
        });
        return true; 
    }
});