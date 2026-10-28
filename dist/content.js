chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "GET_VIDEO_STATE") {
        const video = document.querySelector('video');
        const currentTime = video ? video.currentTime : 0;
        sendResponse({ url: window.location.href, time: currentTime });
    }
    return true; 
});