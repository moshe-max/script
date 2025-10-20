function testYouTubeDownloaderAPI() {
  // Test configuration
  var testUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'; // Rick Roll for testing
  var testEmail = 'test@example.com'; // Replace with your email for notifications
  var apiUrl = 'https://youtube-downloader-api.onrender.com/download';
  var apiKey = PropertiesService.getScriptProperties().getProperty('API_KEY');

  // Make API call
  var payload = { url: testUrl };
  var options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    headers: { 'Authorization': 'Bearer ' + apiKey }
  };

  try {
    var response = UrlFetchApp.fetch(apiUrl, options);
    var result = JSON.parse(response.getContentText());
    var status = result.status;
    var message = result.status === 'success' ? result.file : result.message;

    // Log to Google Sheet
    logToSheet(testUrl, status, message);

    // Send test email notification
    GmailApp.sendEmail(testEmail, 'Test: YouTube Download Status', 
      status === 'success' ? 
      'Test download successful: ' + message : 
      'Test download failed: ' + message);

    // Log result to console
    Logger.log('Test Result: ' + JSON.stringify(result));
    return result;
  } catch (e) {
    var errorMessage = 'Test failed: API call error - ' + e;
    logToSheet(testUrl, 'error', errorMessage);
    GmailApp.sendEmail(testEmail, 'Test: YouTube Download Status', errorMessage);
    Logger.log(errorMessage);
    return { status: 'error', message: errorMessage };
  }
}

function logToSheet(url, status, message) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Downloads');
  if (!sheet) {
    sheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet('Downloads');
    sheet.appendRow(['Timestamp', 'URL', 'Status', 'Message']);
  }
  sheet.appendRow([new Date(), url, status, message]);
}

function processYouTubeDownloads() {
  // Existing function from previous Code.gs
  var threads = GmailApp.search('from:user@example.com subject:Download YouTube');
  for (var i = 0; i < threads.length; i++) {
    var messages = threads[i].getMessages();
    for (var j = 0; j < messages.length; j++) {
      var message = messages[j];
      var url = message.getPlainBody().match(/https:\/\/www\.youtube\.com\/watch\?v=[^\s]+/);
      if (url) {
        var response = callDownloaderAPI(url[0]);
        logToSheet(url[0], response.status, response.message || response.file);
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

function setupTrigger() {
  ScriptApp.newTrigger('processYouTubeDownloads')
    .timeBased()
    .everyMinutes(5)
    .create();
}