// Saves options to chrome.storage
function save_options() {
    var frontend_url = document.getElementById('frontend_url').value;
    var audio_only = document.getElementById('audio_only').checked;
    chrome.storage.sync.set({
        frontend_url: frontend_url,
        audio_only: audio_only
    }, function() {
      // Update status to let user know options were saved.
      $('#collapseExample').collapse('show');
      setTimeout(function() {
        $('#collapseExample').collapse('hide');
      }, 2000);
    });
  }
  
  // Restores select box and checkbox state using the preferences
  // stored in chrome.storage.
  function restore_options() {
    chrome.storage.sync.get({
        frontend_url: 'http://localhost',
        audio_only: false
    }, function(items) {
      document.getElementById('frontend_url').value = items.frontend_url;
      document.getElementById('audio_only').checked = items.audio_only;
    });
  }
  document.addEventListener('DOMContentLoaded', restore_options);
  document.getElementById('save').addEventListener('click',
      save_options);