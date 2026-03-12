/**
 * Main function to save images and log them to a sheet.
 */
function saveImagesWithLogging() {
  // --- CONFIGURATION ---
  const SS_ID = "1mV4_7SZidjhlyTTB0U9qxc7M2L7Wi-XsBSOyQNkQeJI"; // <--- Replace with the long ID from your Sheet URL
  const TARGET_FOLDER_NAME = "SavedImages";
  const LAST_PROCESSED_KEY = 'lastProcessedDate';
  
  try {
    const ss = SpreadsheetApp.openById(SS_ID);
    const configSheet = ss.getSheetByName("Config");
    const logSheet = ss.getSheetByName("Log");
    const properties = PropertiesService.getScriptProperties();

    if (!configSheet || !logSheet) {
      throw new Error("Could not find tabs named 'Config' or 'Log'. Please check your Sheet tab names.");
    }

    // 1. Get Emails from Config Sheet
    const lastRow = configSheet.getLastRow();
    if (lastRow === 0) {
      Logger.log("Config sheet is empty.");
      return;
    }
    const emails = configSheet.getRange("A1:A" + lastRow).getValues()
                   .flat()
                   .filter(email => email && email.includes("@"));

    if (emails.length === 0) {
      Logger.log("No valid email addresses found in Config sheet.");
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
      Logger.log("Searching for emails after: " + formattedDate);
    } else {
      query += ` is:unread`;
      Logger.log("First run: Searching for unread emails.");
    }

    // 4. Process Messages
    const threads = GmailApp.search(query);
    let savedCount = 0;

    threads.forEach(thread => {
      thread.getMessages().forEach(message => {
        const sender = message.getFrom().toLowerCase();
        if (!emails.some(e => sender.includes(e.toLowerCase()))) return;

        const attachments = message.getAttachments();
        let index = 1;

        attachments.forEach(attachment => {
          if (attachment.getContentType().startsWith('image/')) {
            const timestamp = Utilities.formatDate(message.getDate(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmm');
            const uniqueName = `${timestamp}_${index}_${attachment.getName()}`;
            
            if (!folder.getFilesByName(uniqueName).hasNext()) {
              const file = folder.createFile(attachment.setName(uniqueName));
              logSheet.appendRow([new Date(), message.getFrom(), uniqueName, file.getUrl()]);
              savedCount++;
              index++;
            }
          }
        });
        message.markRead();
      });
    });

    properties.setProperty(LAST_PROCESSED_KEY, new Date().toISOString());
    Logger.log(`Process complete. Saved ${savedCount} images.`);

  } catch (e) {
    Logger.log("Error: " + e.message);
  }
}

/**
 * RUN THIS MANUALLY TO RESET THE DATE
 * This will make the script look at all unread emails again.
 */
function resetLastProcessedDate() {
  const properties = PropertiesService.getScriptProperties();
  properties.deleteProperty('lastProcessedDate');
  Logger.log("The last processed date has been reset. The next run will scan all unread emails.");
}