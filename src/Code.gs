/**
* Saves images and logs: Date, Sender, Subject, Filename, and Link.
*/
function saveImagesWithLogging() {
// --- CONFIGURATION ---
const SS_ID = "1mV4_7SZidjhlyTTB0U9qxc7M2L7Wi-XsBSOyQNkQeJI";
const TARGET_FOLDER_NAME = "SavedImages";
const LAST_PROCESSED_KEY = 'lastProcessedDate';

try {
const ss = SpreadsheetApp.openById(SS_ID);
const configSheet = ss.getSheetByName("Config");
const logSheet = ss.getSheetByName("Log");
const properties = PropertiesService.getScriptProperties();

if (!configSheet || !logSheet) {
throw new Error("Could not find tabs named 'Config' or 'Log'.");
}

// 1. GetEmails from Config Sheet
const lastRow = configSheet.getLastRow();
if (lastRow === 0) return;

const emails = configSheet.getRange("A1:A" + lastRow).getValues()
.flat()
.filter(email => email && email.includes("@"));

// 2. Setup Main Folder
const folders = DriveApp.getFoldersByName(TARGET_FOLDER_NAME);
const mainFolder = folders.hasNext() ? folders.next() : DriveApp.createFolder(TARGET_FOLDER_NAME); // Renamed 'folder' to 'mainFolder'

// 3. Build Search Query
let lastRun = properties.getProperty(LAST_PROCESSED_KEY);
let query = `has:attachment (${emails.map(e => `from:${e}`).join(' OR ')})`;

if (lastRun) {
let formattedDate = Utilities.formatDate(new Date(lastRun), Session.getScriptTimeZone(), 'yyyy/MM/dd');
query += ` after:${formattedDate}`;
} else {
query += ` is:unread`;
}

// 4. Process Messages
const threads = GmailApp.search(query);
let savedCount = 0;
threads.forEach(thread => {
const threadId = thread.getId();
const threadSubject = thread.getSubject();
// Sanitize subject for folder name: remove illegal characters, limit length
const sanitizedSubject = threadSubject.replace(/[\\/:*?"<>|]/g, '').substring(0, 100).trim();
const subfolderName = `${sanitizedSubject || 'No_Subject'}_${threadId}`;

// Get or create the specific subfolder for this thread
const threadFolder = findOrCreateSubfolder(mainFolder, subfolderName);

thread.getMessages().forEach(message => {
const sender = message.getFrom().toLowerCase();
if (!emails.some(e => sender.includes(e.toLowerCase()))) return;

const attachments = message.getAttachments();
const subject = message.getSubject();
let index = 1;

attachments.forEach(attachment => {
if (attachment.getContentType().startsWith('image/')) {
const timestamp = Utilities.formatDate(message.getDate(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmm');
const uniqueName = `${timestamp}_${index}_${attachment.getName()}`;

// Check existence and save into the thread-specific subfolder
if (!threadFolder.getFilesByName(uniqueName).hasNext()) {
const file = threadFolder.createFile(attachment.setName(uniqueName));

// 5. Log with Subject Line
logSheet.appendRow([
new Date(),

message.getFrom(),
subject,
uniqueName,
file.getUrl()
]);

savedCount++;
index++;
}
}
});
message.markRead();
});
});

properties.setProperty(LAST_PROCESSED_KEY, new Date().toISOString());
Logger.log(`Finished. Saved ${savedCount} images.`);

} catch (e) {
Logger.log("Error: " + e.message);
}
}

/**
* Helper function to find an existing subfolder or create a new one within a parent folder.
* @param {GoogleAppsScript.Drive.Folder} parentFolder The parent folder.
* @param {string} subfolderName The name of the subfolder to find or create.
* @returns {GoogleAppsScript.Drive.Folder} The found or newly created subfolder.
*/
function findOrCreateSubfolder(parentFolder, subfolderName) {
const folders = parentFolder.getFoldersByName(subfolderName);
if (folders.hasNext()) {
return folders.next();
} else {
return parentFolder.createFolder(subfolderName);
}
}

/**
* Run this to clear the "Last Run" memory.
*/
function resetLastProcessedDate() {
PropertiesService.getScriptProperties().deleteProperty('lastProcessedDate');
Logger.log("Memory reset. Next run will scan all unread emails.");
}
/**
* Saves images and logs: Date, Sender, Subject, Filename, and Link.
*/
function saveImagesWithLogging() {
// --- CONFIGURATION ---
const SS_ID = "1mV4_7SZidjhlyTTB0U9qxc7M2L7Wi-XsBSOyQNkQeJI";
const TARGET_FOLDER_NAME = "SavedImages";
const LAST_PROCESSED_KEY = 'lastProcessedDate';

try {
const ss = SpreadsheetApp.openById(SS_ID);
const configSheet = ss.getSheetByName("Config");
const logSheet = ss.getSheetByName("Log");
const properties = PropertiesService.getScriptProperties();

if (!configSheet || !logSheet) {
throw new Error("Could not find tabs named 'Config' or 'Log'.");
}

// 1. GetEmails from Config Sheet
const lastRow = configSheet.getLastRow();
if (lastRow === 0) return;

const emails = configSheet.getRange("A1:A" + lastRow).getValues()
.flat()
.filter(email => email && email.includes("@"));

// 2. Setup Main Folder
const folders = DriveApp.getFoldersByName(TARGET_FOLDER_NAME);
const mainFolder = folders.hasNext() ? folders.next() : DriveApp.createFolder(TARGET_FOLDER_NAME); // Renamed 'folder' to 'mainFolder'

// 3. Build Search Query
let lastRun = properties.getProperty(LAST_PROCESSED_KEY);
let query = `has:attachment (${emails.map(e => `from:${e}`).join(' OR ')})`;

if (lastRun) {
let formattedDate = Utilities.formatDate(new Date(lastRun), Session.getScriptTimeZone(), 'yyyy/MM/dd');
query += ` after:${formattedDate}`;
} else {
query += ` is:unread`;
}

// 4. Process Messages
const threads = GmailApp.search(query);
let savedCount = 0;
threads.forEach(thread => {
const threadId = thread.getId();
Logger.log(typeof thread + ' ' + (thread ? thread.constructor.name : 'N/A'));
const threadSubject = thread.getMessages()[0].getSubject();
// Sanitize subject for folder name: remove illegal characters, limit length
const sanitizedSubject = threadSubject.replace(/[\\/:*?"<>|]/g, '').substring(0, 100).trim();
const subfolderName = `${sanitizedSubject || 'No_Subject'}_${threadId}`;

// Get or create the specific subfolder for this thread
const threadFolder = findOrCreateSubfolder(mainFolder, subfolderName);

thread.getMessages().forEach(message => {
const sender = message.getFrom().toLowerCase();
if (!emails.some(e => sender.includes(e.toLowerCase()))) return;

const attachments = message.getAttachments();
const subject = message.getSubject();
let index = 1;

attachments.forEach(attachment => {
if (attachment.getContentType().startsWith('image/')) {
const timestamp = Utilities.formatDate(message.getDate(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmm');
const uniqueName = `${timestamp}_${index}_${attachment.getName()}`;

// Check existence and save into the thread-specific subfolder
if (!threadFolder.getFilesByName(uniqueName).hasNext()) {
const file = threadFolder.createFile(attachment.setName(uniqueName));

// 5. Log with Subject Line
logSheet.appendRow([
new Date(),

message.getFrom(),
subject,
uniqueName,
file.getUrl()
]);

savedCount++;
index++;
}
}
});
message.markRead();
});
});

properties.setProperty(LAST_PROCESSED_KEY, new Date().toISOString());
Logger.log(`Finished. Saved ${savedCount} images.`);

} catch (e) {
Logger.log("Error: " + e.message);
}
}

/**
* Helper function to find an existing subfolder or create a new one within a parent folder.
* @param {GoogleAppsScript.Drive.Folder} parentFolder The parent folder.
* @param {string} subfolderName The name of the subfolder to find or create.
* @returns {GoogleAppsScript.Drive.Folder} The found or newly created subfolder.
*/
function findOrCreateSubfolder(parentFolder, subfolderName) {
const folders = parentFolder.getFoldersByName(subfolderName);
if (folders.hasNext()) {
return folders.next();
} else {
return parentFolder.createFolder(subfolderName);
}
}

/**
* Run this to clear the "Last Run" memory.
*/
function resetLastProcessedDate() {
PropertiesService.getScriptProperties().deleteProperty('lastProcessedDate');
Logger.log("Memory reset. Next run will scan all unread emails.");
}
