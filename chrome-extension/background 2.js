// background.js

// Called when the user clicks on the browser action.
chrome.browserAction.onClicked.addListener(function(tab) {
    // get the frontend_url
    chrome.storage.sync.get({
        frontend_url: 'http://localhost',
        audio_only: false
    }, function(items) {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            var activeTab = tabs[0];
            var url = activeTab.url;
            if (url.includes('youtube.com')) {
                var new_url = items.frontend_url + '/#/home;url=' + encodeURIComponent(url) + ';audioOnly=' + items.audio_only;
              chrome.tabs.create({ url: new_url });
            }
        });
    });
    
});