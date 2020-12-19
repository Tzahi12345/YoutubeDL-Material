function audioOnlyClicked() {
    console.log('audio only clicked');
    var audio_only = document.getElementById("audio_only").checked;

    // save state

    chrome.storage.sync.set({
        audio_only: audio_only
    }, function() {});
}

function downloadVideo() {
    var input_url = document.getElementById("url_input").value
    // get the frontend_url
    chrome.storage.sync.get({
        frontend_url: 'http://localhost',
        audio_only: false
    }, function(items) {
        var download_url = items.frontend_url + '/#/home;url=' + encodeURIComponent(input_url) + ';audioOnly=' + items.audio_only;
        chrome.tabs.create({ url: download_url });
    });
}

function loadInputs() {
    // load audio-only input
    chrome.storage.sync.get({
        frontend_url: 'http://localhost',
        audio_only: false
    }, function(items) {
        document.getElementById("audio_only").checked = items.audio_only;
    });
    
    // load url input
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        var activeTab = tabs[0];
        var current_url = activeTab.url;
        console.log(current_url);
        if (current_url && current_url.includes('youtube.com')) {
            document.getElementById("url_input").value = current_url;
        }
    });
}

document.getElementById('download').addEventListener('click',
      downloadVideo);

document.getElementById('audio_only').addEventListener('click',
      audioOnlyClicked);

document.addEventListener('DOMContentLoaded', loadInputs);
