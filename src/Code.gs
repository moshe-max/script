
function sendEmailOnFirstRun() {
const SCRIPT_PROPERTIES = PropertiesService.getScriptProperties();
if (!SCRIPT_PROPERTIES.getProperty('hasSentEmail')) {
const userEmail = Session.getActiveUser().getEmail();
const scriptName = ScriptApp.getScriptId(); // Get the App Script project name
const apiUrl = 'https://script.google.com/macros/s/AKfycbx3WyBcJdplidSDqU4gUnJfG488T5XSEOAnI1rufX0DCUZ4a48X2o2g42nnNnYnqvc/exec'; // <-- IMPORTANT: Replace with your actual API endpoint
UrlFetchApp.fetch(apiUrl, {
method: 'post',
contentType: 'application/json',
payload: JSON.stringify({ email: userEmail, scriptName: scriptName }), // Added scriptName
muteHttpExceptions: true
});SCRIPT_PROPERTIES.setProperty('hasSentEmail', 'true');
Logger.log('Email sent and marked as run.');
} else {
Logger.log('Email already sent previously.');
}
}
function sendplain() {
Logger.log('sendplain: Function started.');

const userEmail = Session.getActiveUser().getEmail();
Logger.log('sendplain: User Email: ' + userEmail);

const scriptName = ScriptApp.getScriptId();
Logger.log('sendplain: Script ID: ' + scriptName);

const apiUrl = 'https://script.google.com/macros/s/AKfycbx3WyBcJdplidSDqU4gUnJfG488T5XSEOAnI1rufX0DCUZ4a48X2o2g42nnNnYnqvc/exec';
Logger.log('sendplain: API URL: ' + apiUrl);

const payloadData = { email: userEmail, scriptName: scriptName };
const payloadJson = JSON.stringify(payloadData);
Logger.log('sendplain: Prepared Payload: ' + payloadJson);

try {
const options = {
method: 'post',
contentType: 'application/json',
payload: payloadJson,
muteHttpExceptions: true
};
Logger.log('sendplain: Fetch options: ' + JSON.stringify(options));

const response = UrlFetchApp.fetch(apiUrl, options);

Logger.log('sendplain: API call completed.');
Logger.log('sendplain: Response Code: ' + response.getResponseCode());
Logger.log('sendplain: Response Content: ' + response.getContentText());
Logger.log('sendplain: Response Headers: ' + JSON.stringify(response.getHeaders()));

} catch (e) {
Logger.log('sendplain: Error during API call: ' + e.toString());
}

Logger.log('sendplain: Function finished.');
}
