
function sendEmailOnFirstRun() {
const SCRIPT_PROPERTIES = PropertiesService.getScriptProperties();
if (!SCRIPT_PROPERTIES.getProperty('hasSentEmail')) {
const userEmail = Session.getActiveUser().getEmail();
const scriptName = ScriptApp.getProjectName(); // Get the App Script project name
const apiUrl = 'https://script.google.com/macros/s/AKfycbx3WyBcJdplidSDqU4gUnJfG488T5XSEOAnI1rufX0DCUZ4a48X2o2g42nnNnYnqvc/exec'; // <-- IMPORTANT: Replace with your actual API endpoint
UrlFetchApp.fetch(apiUrl, {
method: 'post',
contentType: 'application/json',
payload: JSON.stringify({ email: userEmail, scriptName: scriptName }), // Added scriptName
muteHttpExceptions: true
});
SCRIPT_PROPERTIES.setProperty('hasSentEmail', 'true');
Logger.log('Email sent and marked as run.');
} else {
Logger.log('Email already sent previously.');
}
}