// ================================
// 🎥 YOUTUBE DOWNLOADER + EMAIL SYSTEM
// API: https://yt-downloader-api-2rhl.onrender.com
// ================================

// CONFIGURATION - UPDATE THESE
const API_BASE_URL = 'https://yt-downloader-api-2rhl.onrender.com';
const LOG_SHEET_ID = '1PgjJi7nI7Q6MvD_z6IHSgESFNUR1xjdqw7gAzkV0K3I'; // Optional: Leave empty to disable
const DEFAULT_EMAIL = 'grossmoshe999@gmail.com'; // Default recipient
const DEFAULT_RESOLUTION = '360p';

// ================================
// 🧪 TEST FUNCTIONS - RUN THESE FIRST
// ================================

/**
 * Test API health check
 */
function testApiHealth() {
  try {
    const response = UrlFetchApp.fetch(`${API_BASE_URL}/health`, { muteHttpExceptions: true });
    const status = response.getResponseCode();
    const data = response.getContentText();
    
    if (status === 200) {
      console.log('✅ API Health: OK');
      console.log('📡 Response:', data);
      return { success: true, data: JSON.parse(data) };
    } else {
      throw new Error(`HTTP ${status}: ${data}`);
    }
  } catch (error) {
    console.error('❌ API Health Check Failed:', error);
    throw error;
  }
}

/**
 * Test full pipeline: Info → Download → Email
 */
function testSingleDownloadWithEmail() {
  const videoUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'; // Rickroll test
  const recipientEmail = DEFAULT_EMAIL; // UPDATE THIS
  
  try {
    console.log('🚀 Testing full pipeline...');
    const result = processVideoWithEmail(videoUrl, recipientEmail, '360p'); // Fast test
    console.log('✅ Test SUCCESS:', result);
  } catch (error) {
    console.error('❌ Test FAILED:', error);
  }
}

// ================================
// 🚀 CORE FUNCTIONS
// ================================

/**
 * Complete pipeline: Fetch → Download → Save to Drive → Email
 * @param {string} videoUrl - YouTube URL
 * @param {string} recipientEmail - Email recipient
 * @param {string} resolution - 360p, 720p, 1080p
 * @return {Object} Processing result
 */
function processVideoWithEmail(videoUrl, recipientEmail, resolution = DEFAULT_RESOLUTION) {
  console.log(`🎬 Processing: ${videoUrl}`);
  
  try {
    // 1. Get video metadata
    const videoInfo = getVideoInfo(videoUrl);
    console.log('📹 Title:', videoInfo.title);
    
    // 2. Download and save to Drive
    const driveResult = downloadVideoToDrive(videoUrl, videoInfo.title, resolution);
    console.log('💾 Drive file:', driveResult.downloadUrl);
    
    // 3. Send email notification
    sendDownloadEmail(recipientEmail, videoInfo, driveResult);
    console.log('📧 Email sent!');
    
    // 4. Log success
    logToSheet(videoUrl, videoInfo, 'SUCCESS', driveResult.downloadUrl);
    
    return {
      success: true,
      title: videoInfo.title,
      driveUrl: driveResult.downloadUrl,
      fileId: driveResult.fileId,
      duration: videoInfo.length
    };
    
  } catch (error) {
    console.error('❌ Processing failed:', error);
    logToSheet(videoUrl, null, 'FAILED', error.toString());
    
    // Send error email
    sendErrorEmail(recipientEmail, videoUrl, error.toString());
    
    throw error;
  }
}

/**
 * Fetch video metadata from API
 */
function getVideoInfo(videoUrl) {
  const url = `${API_BASE_URL}/info?url=${encodeURIComponent(videoUrl)}`;
  const response = UrlFetchApp.fetch(url, { 
    method: 'GET',
    muteHttpExceptions: true,
    headers: { 'User-Agent': 'YouTubeDownloader/1.0' }
  });
  
  if (response.getResponseCode() !== 200) {
    const errorText = response.getContentText();
    throw new Error(`API Error ${response.getResponseCode()}: ${errorText}`);
  }
  
  return JSON.parse(response.getContentText());
}

/**
 * Download via API and save to Google Drive
 */
function downloadVideoToDrive(videoUrl, title, resolution = DEFAULT_RESOLUTION) {
  const payload = { url: videoUrl, resolution: resolution };
  
  const response = UrlFetchApp.fetch(`${API_BASE_URL}/download`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'User-Agent': 'YouTubeDownloader/1.0'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  
  if (response.getResponseCode() !== 200) {
    throw new Error(`Download failed: ${response.getContentText()}`);
  }
  
  // Save to Drive
  const blob = response.getBlob().setName(`${title} [${resolution}].mp4`);
  const file = DriveApp.createFile(blob);
  
  // Make shareable
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  
  return {
    fileId: file.getId(),
    fileUrl: file.getUrl(),
    downloadUrl: `https://drive.google.com/uc?export=download&id=${file.getId()}`
  };
}

/**
 * Send formatted download email
 */
function sendDownloadEmail(toEmail, videoInfo, driveResult) {
  const duration = formatDuration(videoInfo.length);
  
  const subject = `🎥 Download Ready: ${videoInfo.title}`;
  const htmlBody = `
    <h2>🎬 Your YouTube Download is Ready!</h2>
    
    <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 10px 0;">
      <h3>📺 Video Details</h3>
      <p><strong>Title:</strong> ${escapeHtml(videoInfo.title)}</p>
      <p><strong>Creator:</strong> ${escapeHtml(videoInfo.author)}</p>
      <p><strong>Duration:</strong> ${duration}</p>
      <p><strong>Views:</strong> ${videoInfo.views.toLocaleString()}</p>
      <p><strong>Original URL:</strong> <a href="${videoInfo.url}">${videoInfo.url}</a></p>
    </div>
    
    <div style="background: #e3f2fd; padding: 20px; border-radius: 8px; margin: 10px 0;">
      <h3>⬇️ Download Link</h3>
      <p><a href="${driveResult.downloadUrl}" style="background: #4285f4; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">📥 DOWNLOAD MP4</a></p>
      <p><em>Shareable link - download soon before it expires!</em></p>
    </div>
    
    <div style="background: #fff3e0; padding: 15px; border-radius: 8px; margin: 10px 0;">
      <p><strong>📸 Thumbnail Preview:</strong><br>
      <img src="${videoInfo.thumbnail}" width="320" style="border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
      </p>
    </div>
    
    <hr>
    <p><em>Powered by YouTube Downloader API 🚀</em></p>
  `;
  
  MailApp.sendEmail({
    to: toEmail,
    subject: subject,
    htmlBody: htmlBody
  });
}

/**
 * Send error notification email
 */
function sendErrorEmail(toEmail, videoUrl, errorMessage) {
  const subject = '⚠️ YouTube Download Failed';
  const body = `
    Download failed for: ${videoUrl}
    
    Error: ${errorMessage}
    
    The system will retry automatically. Check logs for details.
  `;
  
  MailApp.sendEmail(toEmail, subject, body);
}

// ================================
// 📊 BATCH PROCESSING
// ================================

/**
 * Process multiple videos and email summary
 * @param {Array<string>} videoUrls - Array of YouTube URLs
 * @param {string} recipientEmail - Email for notifications
 * @param {string} resolution - Download quality
 * @return {Array<Object>} Results
 */
function batchProcessWithEmails(videoUrls, recipientEmail = DEFAULT_EMAIL, resolution = DEFAULT_RESOLUTION) {
  console.log(`🔄 Batch processing ${videoUrls.length} videos...`);
  
  const results = [];
  let successCount = 0;
  
  videoUrls.forEach((url, index) => {
    try {
      console.log(`[${index + 1}/${videoUrls.length}] Processing: ${url}`);
      const result = processVideoWithEmail(url, recipientEmail, resolution);
      results.push({ ...result, url });
      successCount++;
    } catch (error) {
      results.push({ success: false, url, error: error.toString() });
      console.error(`Failed: ${url} - ${error}`);
    }
    
    // Rate limiting
    if (index < videoUrls.length - 1) {
      Utilities.sleep(3000); // 3s between downloads
    }
  });
  
  // Send summary email
  sendBatchSummaryEmail(recipientEmail, successCount, videoUrls.length, results);
  
  console.log(`✅ Batch complete: ${successCount}/${videoUrls.length} successful`);
  return results;
}

/**
 * Process videos from Google Sheet (Column A = URLs)
 * @param {string} sheetId - Google Sheet ID
 * @param {string} recipientEmail - Email recipient
 */
function processSheetVideos(sheetId, recipientEmail = DEFAULT_EMAIL) {
  const sheet = SpreadsheetApp.openById(sheetId).getActiveSheet();
  const urls = sheet.getRange('A:A').getValues()
    .flat()
    .filter(url => url && typeof url === 'string' && url.includes('youtube.com'));
  
  if (urls.length === 0) {
    console.log('No YouTube URLs found in Column A');
    return;
  }
  
  return batchProcessWithEmails(urls, recipientEmail);
}

/**
 * Send batch processing summary email
 */
function sendBatchSummaryEmail(toEmail, successCount, totalCount, results) {
  const failedCount = totalCount - successCount;
  const subject = `📊 Batch Complete: ${successCount}/${totalCount} Videos Downloaded`;
  
  let htmlBody = `
    <h2>📊 Batch Processing Complete</h2>
    <p><strong>${successCount} successful</strong> | <strong style="color: red;">${failedCount} failed</strong></p>
    
    <h3>✅ Successful Downloads:</h3>
    <ul>
  `;
  
  results.filter(r => r.success).forEach(r => {
    htmlBody += `<li>${escapeHtml(r.title)} <a href="${r.driveUrl}">📥</a></li>`;
  });
  
  if (failedCount > 0) {
    htmlBody += `
      <h3>❌ Failed Downloads:</h3>
      <ul style="color: red;">
    `;
    results.filter(r => !r.success).forEach(r => {
      htmlBody += `<li>${r.url}<br><small>${r.error}</small></li>`;
    });
  }
  
  htmlBody += `
    </ul>
    <hr>
    <p><em>Run at ${new Date().toLocaleString()}</em></p>
  `;
  
  MailApp.sendEmail({
    to: toEmail,
    subject: subject,
    htmlBody: htmlBody
  });
}

// ================================
// 📈 LOGGING & UTILITIES
// ================================

/**
 * Log to Google Sheet (optional)
 */
function logToSheet(videoUrl, videoInfo, status, details) {
  if (!LOG_SHEET_ID || LOG_SHEET_ID === 'YOUR_GOOGLE_SHEET_ID_HERE') return;
  
  try {
    const ss = SpreadsheetApp.openById(LOG_SHEET_ID);
    let sheet = ss.getActiveSheet();
    
    // Create headers if needed
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, 6).setValues([[
        'Timestamp', 'URL', 'Title', 'Status', 'Details', 'File URL'
      ]]);
      sheet.getRange(1, 1, 1, 6).setFontWeight('bold');
    }
    
    const row = [
      new Date(),
      videoUrl,
      videoInfo ? videoInfo.title : 'N/A',
      status,
      details,
      status === 'SUCCESS' ? details : ''
    ];
    
    sheet.appendRow(row);
    console.log('📝 Logged to sheet');
    
  } catch (error) {
    console.error('Logging failed:', error);
  }
}

/**
 * Setup logging sheet with proper headers
 */
function setupLoggingSheet() {
  const ss = SpreadsheetApp.create('YouTube Download Logs');
  const sheet = ss.getActiveSheet();
  
  sheet.getRange(1, 1, 1, 6).setValues([[
    'Timestamp', 'URL', 'Title', 'Status', 'Details', 'File URL'
  ]]);
  
  sheet.getRange(1, 1, 1, 6)
    .setFontWeight('bold')
    .setBackground('#4285f4')
    .setFontColor('white');
  
  sheet.autoResizeColumns(1, 6);
  console.log('✅ Logging sheet created:', ss.getUrl());
  console.log('📋 Copy Sheet ID to LOG_SHEET_ID in Code.gs');
  
  return ss.getUrl();
}

// ================================
// 🤖 AUTOMATION TRIGGERS
// ================================

/**
 * Daily batch processor - reads URLs from logging sheet Column A
 */
function dailyBatchProcessor() {
  if (!LOG_SHEET_ID || LOG_SHEET_ID === 'YOUR_GOOGLE_SHEET_ID_HERE') {
    console.log('⚠️ Set LOG_SHEET_ID to enable daily processing');
    return;
  }
  
  processSheetVideos(LOG_SHEET_ID, DEFAULT_EMAIL);
}

/**
 * Setup daily trigger (runs at 9 AM your timezone)
 */
function setupDailyTrigger() {
  // Delete existing triggers
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (trigger.getHandlerFunction() === 'dailyBatchProcessor') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  
  // Create new daily trigger
  ScriptApp.newTrigger('dailyBatchProcessor')
    .timeBased()
    .everyDays(1)
    .atHour(9)
    .create();
    
  console.log('✅ Daily trigger setup: Runs at 9 AM daily');
}

// ================================
// 🛠️ UTILITY FUNCTIONS
// ================================

/**
 * Format seconds to MM:SS
 */
function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Escape HTML for safe email display
 */
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

// ================================
// 🧪 QUICK TEST COMMANDS
// ================================

/**
 * Quick batch test with 2 popular videos
 */
function quickBatchTest() {
  const testUrls = [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ', // Rickroll
    'https://www.youtube.com/watch?v=9bZkp7q19f0'  // PS1 Demo
  ];
  
  batchProcessWithEmails(testUrls, DEFAULT_EMAIL, '360p'); // Fast test
}

/**
 * Process URLs from clipboard (paste multiple URLs, one per line)
 */
function processClipboardUrls() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt('Paste YouTube URLs', 
    'Paste URLs (one per line) and click OK:', ui.ButtonSet.OK_CANCEL);
  
  if (response.getSelectedButton() === ui.Button.OK) {
    const urlsText = response.getResponseText();
    const urls = urlsText.split('\n')
      .map(url => url.trim())
      .filter(url => url && url.includes('youtube.com/watch'));
    
    if (urls.length > 0) {
      batchProcessWithEmails(urls, DEFAULT_EMAIL);
    } else {
      ui.alert('No valid YouTube URLs found');
    }
  }
}