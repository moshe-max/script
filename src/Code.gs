/**
 * Automatically saves image attachments based on a Google Sheet config
 * and logs the results back to the sheet.
 */
function saveImagesWithLogging() {
  // --- CONFIGURATION ---
  const SS_ID = "1mV4_7SZidjhlyTTB0U9qxc7M2L7Wi-XsBSOyQNkQeJI"; // <--- Put your Sheet ID here
  const TARGET_FOLDER_NAME = "SavedImages";
  const LAST_PROCESSED_KEY = 'lastProcessedDate';
  
  const ss = SpreadsheetApp.openById(SS_ID);
  const configSheet = ss.getSheetByName("Config");
  const logSheet = ss.getSheetByName("Log");
  const properties = PropertiesService.getScriptProperties();
  
  // 1. Get Emails from Config Sheet
  const emails = configSheet.getRange("A1:A" + configSheet.getLastRow()).getValues()
                 .flat()
                 .filter(email => email.includes("@"));

  if (emails.length === 0) {
    Logger.log("No email addresses found in Config sheet.");
    return;
  }

  // 2. Setup Folder
  let folder;
  const folders = DriveApp.getFoldersByName(TARGET_FOLDER_NAME);
  folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(TARGET_FOLDER_NAME);

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
    thread.getMessages().forEach(message => {
      // Only process if it's actually from one of our list (extra safety)
      const sender = message.getFrom().toLowerCase();
      if (!emails.some(e => sender.includes(e.toLowerCase()))) return;

      const attachments = message.getAttachments();
      let index = 1;

      attachments.forEach(attachment => {
        if (attachment.getContentType().startsWith('image/')) {
          const timestamp = Utilities.formatDate(message.getDate(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmm');
          const uniqueName = `${timestamp}_${index}_${attachment.getName()}`;
          
          // Check for duplicates
          if (!folder.getFilesByName(uniqueName).hasNext()) {
            const file = folder.createFile(attachment.setName(uniqueName));
            
            // Log to Google Sheet
            logSheet.appendRow([
              new Date(), 
              message.getFrom(), 
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

  // 5. Cleanup
  properties.setProperty(LAST_PROCESSED_KEY, new Date().toISOString());
  Logger.log(`Process complete. Saved ${savedCount} images.`);
}