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
// Helper function containing your exact, existing VOD math
function extractChunks(targetManifest, startSec, endSec, sendResponse) {
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
                    
                    if (currentTime + duration >= startSec && currentTime <= endSec) {
                        let chunkUrl = lines[i + 1].trim();
                        if (!chunkUrl.startsWith('http')) chunkUrl = baseUrl + chunkUrl;
                        chunksToDownload.push(chunkUrl);
                    }
                    
                    currentTime += duration;
                    if (currentTime > endSec) break;
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
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "GET_TIKTOK_URL") {
        sendResponse({ url: activeTikTokStreams[message.tabId] });
        return true;
    }

    if (message.action === "PROCESS_CLIP") {
        const tabId = message.tabId.toString();
        const tabUrl = message.url || "";

        // --- TWITCH LIVE HIJACK ---
        // If it is Twitch, and NOT a past broadcast page
        if (tabUrl.includes('twitch.tv/') && !tabUrl.includes('/videos/')) {
            const channelName = tabUrl.split('twitch.tv/')[1].split('/')[0];
            console.log(`[Twitch Hijack] Locating hidden VOD for ${channelName}...`);
            
            // 1. Get the secret VOD ID from Twitch GraphQL
            fetch('https://gql.twitch.tv/gql', {
                method: 'POST',
                headers: { 'Client-ID': 'kimne78kx3ncx6brgo4mv6wki5h1ko' }, // Twitch Public Web Client ID
                body: JSON.stringify({ query: `query { user(login: "${channelName}") { stream { archiveVideo { id } } } }` })
            })
            .then(res => res.json())
            .then(json => {
                const vodId = json.data?.user?.stream?.archiveVideo?.id;
                if (!vodId) throw new Error("Live VOD not ready yet");
                
                console.log(`[Twitch Hijack] Found hidden VOD ID: ${vodId}. Generating token...`);
                
                // 2. Request playback authorization for the VOD
                return fetch('https://gql.twitch.tv/gql', {
                    method: 'POST',
                    headers: { 'Client-ID': 'kimne78kx3ncx6brgo4mv6wki5h1ko' },
                    body: JSON.stringify({ query: `query { videoPlaybackAccessToken(id: "${vodId}", params: {platform: "web", playerBackend: "mediaplayer", playerType: "site"}) { value signature } }` })
                }).then(res => res.json()).then(tokenJson => { return { vodId, tokenJson }; });
            })
            .then(({ vodId, tokenJson }) => {
                const { value, signature } = tokenJson.data.videoPlaybackAccessToken;
                
                // 3. Construct the permanent CloudFront master playlist URL
                const targetManifest = `https://usher.ttvnw.net/vod/${vodId}.m3u8?nauth=${encodeURIComponent(value)}&nauthsig=${signature}&allow_source=true&allow_audio_only=true`;
                
                console.log(`[Twitch Hijack] Executing math on permanent map.`);
                
                // 4. Run your exact VOD math logic on the live stream
                extractChunks(targetManifest, message.start, message.end, sendResponse);
            })
            .catch(err => {
                console.error("Hijack failed", err);
                sendResponse({ status: "VOD Hijack Failed" });
            });
            
            return true; 
        }

        // --- STANDARD YOUTUBE / VOD LOGIC ---
        chrome.storage.session.get('activeStreamMaps').then(data => {
            const maps = data.activeStreamMaps || {};
            const manifestUrls = maps[tabId];

            if (!manifestUrls || manifestUrls.length === 0) {
                sendResponse({ status: "No stream found" });
                return;
            }

            const targetManifest = manifestUrls[manifestUrls.length - 1];
            console.log(`[Clipper] Using sniffed manifest:`, targetManifest);
            
            // Run the exact same math on the sniffed map
            extractChunks(targetManifest, message.start, message.end, sendResponse);
        });

        return true; 
    }
});