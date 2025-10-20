function processYouTubeDownloads() {
  // Read emails with YouTube URLs
  var threads = GmailApp.search('from:user@example.com subject:Download YouTube');
  for (var i = 0; i < threads.length; i++) {
    var messages = threads[i].getMessages();
    for (var j = 0; j < messages.length; j++) {
      var message = messages[j];
      var url = message.getPlainBody().match(/https:\/\/www\.youtube\.com\/watch\?v=[^\s]+/);
      if (url) {
        // Call Render API with API key
        var response = callDownloaderAPI(url[0]);
        // Log to Google Sheets
        logToSheet(url[0], response.status, response.message || response.file);
        // Send email notification
        GmailApp.sendEmail(message.getFrom(), 'YouTube Download Status', 
          response.status === 'success' ? 
          'Download successful: ' + response.file : 
          'Download failed: ' + response.message);
      }
    }
  }
}

function callDownloaderAPI(url) {
  var apiUrl = 'https://youtube-downloader-api.onrender.com/download';
  var apiKey = PropertiesService.getScriptProperties().getProperty('API_KEY');
  var payload = { url: url };
  var options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    headers: { 'Authorization': 'Bearer ' + apiKey }
  };
  try {
    var response = UrlFetchApp.fetch(apiUrl, options);
    return JSON.parse(response.getContentText());
  } catch (e) {
    return { status: 'error', message: 'API call failed: ' + e };
  }
}

function logToSheet(url, status, message) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Downloads');
  sheet.appendRow([new Date(), url, status, message]);
}

// Trigger setup: Run every 5 minutes
function setupTrigger() {
  ScriptApp.newTrigger('processYouTubeDownloads')
    .timeBased()
    .everyMinutes(5)
    .create();
}