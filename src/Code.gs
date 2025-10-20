function scanEmailsAndProcess() {
  const labelName = "ProcessedByScript";
  const label = GmailApp.getUserLabelByName(labelName) || GmailApp.createLabel(labelName);
  const threads = GmailApp.search("newer_than:1d has:attachment -label:" + labelName);

  for (const thread of threads) {
    const messages = thread.getMessages();
    for (const msg of messages) {
      if (msg.isInTrash() || msg.isDraft()) continue;

      const attachments = msg.getAttachments();
      let docContent = null;
      let scriptAttachment = null;

      for (const file of attachments) {
        const name = file.getName().toLowerCase();
        if (name.endsWith(".docx") || name.endsWith(".doc")) {
          const blob = file.copyBlob();
          const converted = Drive.Files.insert({ title: file.getName(), mimeType: MimeType.GOOGLE_DOCS }, blob);
          docContent = DocumentApp.openById(converted.id).getBody().getText();
          DriveApp.getFileById(converted.id).setTrashed(true);
        } else if (name.endsWith(".gs") || name.endsWith(".txt")) {
          scriptAttachment = file;
        }
      }

      if (docContent && scriptAttachment) {
        const originalName = scriptAttachment.getName();
        const newFile = DriveApp.createFile(originalName, docContent, MimeType.PLAIN_TEXT);

        GmailApp.sendEmail(msg.getFrom(),
          "✅ Your file has been processed successfully!",
          `Hello,

Your Google Doc has been merged into your script file and saved to Drive.

📄 File name: ${originalName}
🔗 Drive link: ${newFile.getUrl()}

The updated file is attached below.

Best,
Your Automation Bot 🤖`,
          { attachments: [newFile.getBlob()] }
        );

        thread.addLabel(label);

        // Basic logging
        Logger.log(`Processed email from ${msg.getFrom()} with file ${originalName}`);
      }
    }
  }
}
