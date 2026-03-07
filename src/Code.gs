/**
* Saves image attachments from specific email addresses to a Google Drive folder.
* Marks processed emails as read and only processes new emails since the last run.
*/
function saveImageAttachmentsToDrive() {
// --- Configuration ---
const TARGET_FOLDER_NAME = "Saved Email Images"; // Name of the Google Drive folder to save images
const SENDER_EMAIL_ADDRESSES = [
"sender1@example.com", // Replace with the actual email addresses
"sender2@anotherdomain.com", // Add more email addresses as needed
// "another_specific_sender@yourcompany.com"
];
const LAST_PROCESSED_DATE_PROPERTY_KEY = 'lastProcessedDate'; // Key to store the last run date

// --- End Configuration ---

if (SENDER_EMAIL_ADDRESSES.length === 0) {
Logger.log("ERROR: No sender email addresses configured. Please update SENDER_EMAIL_ADDRESSES array.");
Browser.msgBox("Configuration Error", "Please update the 'SENDER_EMAIL_ADDRESSES' array in the script with valid email addresses.", Browser.Buttons.OK);
return;
}

const properties = PropertiesService.getScriptProperties();
let lastProcessedDateString = properties.getProperty(LAST_PROCESSED_DATE_PROPERTY_KEY);
let currentRunDate = new Date(); // To be saved for the *next* run

// 1. Get or create the target Google Drive folder
let targetFolder;
const folders = DriveApp.getFoldersByName(TARGET_FOLDER_NAME);
if (folders.hasNext()) {
targetFolder = folders.next();
Logger.log('Found existing folder: ' + TARGET_FOLDER_NAME + ' (ID: ' + targetFolder.getId() + ')');
} else {
targetFolder = DriveApp.createFolder(TARGET_FOLDER_NAME);
Logger.log('Created new folder: ' + TARGET_FOLDER_NAME + ' (ID: ' + targetFolder.getId() + ')');
}

// 2. Build the Gmail search query
let searchQuery = 'has:attachment '; // Always look for attachments

// Add sender filter
const senderQueries = SENDER_EMAIL_ADDRESSES.map(email => `from:${email}`).join(' OR ');
searchQuery += `(${senderQueries}) `;

// Add date filter to only process new emails
if (lastProcessedDateString) {
const lastProcessedDate = new Date(lastProcessedDateString);
// Format date as YYYY/MM/DD for Gmail search
const formattedDate = Utilities.formatDate(lastProcessedDate, Session.getScriptTimeZone(), 'yyyy/MM/dd');
searchQuery += `after:${formattedDate} `;
Logger.log('Searching for emails after: ' + formattedDate);
} else {
// If no last processed date, search for all unread emails from specified senders
searchQuery += 'is:unread ';
Logger.log('First run or no previous date, searching for unread emails from specified senders.');
}

let savedCount = 0;
const processedMessageIds = new Set(); // To ensure we mark messages read only once

try {
// 3. Search for Gmail threads
Logger.log('Executing Gmail search query: "' + searchQuery + '"');
const threads = GmailApp.search(searchQuery);

if (threads.length === 0) {
Logger.log('No new threads found matching the criteria.');
return; // Exit if no threads found
}

Logger.log(`Found ${threads.length} threads matching the query.`);

for (const thread of threads) {
const messages = thread.getMessages();
for (const message of messages) {
// Skip messages already processed in this run (if multiple messages in same thread)
if (processedMessageIds.has(message.getId())) {
continue;
}

// Double-check sender (redundant if search query is perfect, but good for safety)
const messageSender = message.getFrom();
const isFromConfiguredSender = SENDER_EMAIL_ADDRESSES.some(
configuredSender => messageSender.toLowerCase().includes(configuredSender.toLowerCase())
);

if (!isFromConfiguredSender) {
Logger.log(`Skipping message from unconfigured sender: ${messageSender}`);
continue;
}

const attachments = message.getAttachments();
let attachmentsSavedInMessage = 0;

for (const attachment of attachments) {
// Check if the attachment is an image
if (attachment.getContentType().startsWith('image/')) {
const fileName = attachment.getName();
// Create a more unique filename to avoid overwriting and provide context
const timestamp = Utilities.formatDate(message.getDate(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss');
const uniqueFileName = `${timestamp}_${fileName}`;

// Check if a file with this name already exists in the target folder to prevent duplicates
// This is a basic check and won't detect content duplicates if filenames differ.
// For a more robust duplicate check, you'd need to compare file hashes, which is more complex.
const existingFiles = targetFolder.getFilesByName(uniqueFileName);
if (existingFiles.hasNext()) {
Logger.log(`Skipping existing file: ${uniqueFileName}`);
continue;
}

targetFolder.createFile(attachment.setName(uniqueFileName));
Logger.log(`Saved image: ${uniqueFileName} from "${message.getFrom()}" (Subject: "${message.getSubject()}")`);
savedCount++;
attachmentsSavedInMessage++;
}
}

// Mark the message as read ONLY if it contained relevant attachments
if (attachmentsSavedInMessage > 0) {
message.markRead();
processedMessageIds.add(message.getId());
Logger.log(`Marked message as read: ${message.getSubject()}`);
} else {
// If no images were saved from this message, but it matched the sender,
// we might want to mark it read anyway if we only care about images.
// For now, only marking if images were found.
Logger.log(`No image attachments found or saved in message: ${message.getSubject()}`);
}
}
}

// 4. Update the last processed date for the next run
properties.setProperty(LAST_PROCESSED_DATE_PROPERTY_KEY, currentRunDate.toISOString());
Logger.log('Updated last processed date to: ' + currentRunDate.toISOString());

if (savedCount > 0) {
Browser.msgBox("Script Complete", `Successfully saved ${savedCount} image attachments to "${TARGET_FOLDER_NAME}"!`, Browser.Buttons.OK);
} else {
Browser.msgBox("Script Complete", `No new image attachments found from specified senders since last run.`, Browser.Buttons.OK);
}

} catch (e) {
Logger.log('Error: ' + e.toString());
Browser.msgBox("Script Error", "An error occurred: " + e.message + "\nCheck the Apps Script 'Executions' or 'Logs' for details.", Browser.Buttons.OK);
}
}