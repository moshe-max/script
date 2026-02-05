function doGet(e) {
  var phone = e.parameter.ApiPhone;
  var rowId = parseInt(e.parameter.id); 
  
  if (!phone || isNaN(rowId)) {
    return ContentService.createTextOutput("Error: Missing ApiPhone or id parameter.")
                         .setMimeType(ContentService.MimeType.TEXT);
  }

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getActiveSheet();
    
    // Row mapping: rowId 1 is Row 2
    var targetRow = rowId + 1;
    var lastCol = sheet.getLastColumn();
    var rowData = sheet.getRange(targetRow, 1, 1, lastCol).getValues()[0];
    
    // Assume Column B (index 1) has the secret data
    var storedSecret = rowData[1]; 

    // Generate 6-digit OTP
    var otpCode = Math.floor(100000 + Math.random() * 900000).toString();

    // --- LOGGING SECTION ---
    // This will write the OTP and current time to columns after your data
    // Assuming you want to log in the next two available columns
    sheet.getRange(targetRow, lastCol + 1).setValue(new Date()); // Timestamp
    sheet.getRange(targetRow, lastCol + 2).setValue(otpCode);   // Sent OTP
    // -----------------------

    // Send to external API
    var externalApiUrl = "https://api.yourexternalprovider.com/send";
    var options = {
      "method": "post",
      "contentType": "application/json",
      "payload": JSON.stringify({
        "to": phone,
        "otp": otpCode,
        "key": storedSecret
      })
    };

    UrlFetchApp.fetch(externalApiUrl, options);

    return ContentService.createTextOutput(otpCode)
                         .setMimeType(ContentService.MimeType.TEXT);

  } catch (err) {
    return ContentService.createTextOutput("Execution Error: " + err.message)
                         .setMimeType(ContentService.MimeType.TEXT);
  }
}