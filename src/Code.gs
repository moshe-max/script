// ================================
// 🎥 YOUTUBE DOWNLOADER + EMAIL SYSTEM v4.0
// ================================

// 🔧 CONFIGURATION - UPDATE THESE!
const API_BASE_URL = 'https://yt-downloader-api-2rhl.onrender.com';
const DEFAULT_EMAIL = 'grossmoshe999@gmail.com'; // ← CHANGE THIS!
const MAX_DURATION_MINUTES = 20;              // Skip videos > 20 min
const DEFAULT_RESOLUTION = '360p';            // Always 360p (fast/small)
const LOG_SHEET_ID = '1PgjJi7nI7Q6MvD_z6IHSgESFNUR1xjdqw7gAzkV0K3I';                      // Optional: Leave empty

// ================================
// 🧪 TEST FUNCTIONS - RUN IN ORDER!
// ================================

/**
 * 1️⃣ Test API health
 */
function test1_healthCheck() {
  try {
    const response = UrlFetchApp.fetch(`${API_BASE_URL}/health`);
    const data = JSON.parse(response.getContentText());
    console.log('✅ API Status:', data.status);
    console.log('🟢 System ready!');
    return data;
  } catch (error) {
    console.error('❌ API DOWN:', error);
    throw error;
  }
}

/**
 * 2️⃣ Test video info with duration limit
 */
function test2_videoInfo() {
  const testUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'; // Rickroll (3:33 ✅)
  
  try {
    const info = getVideoInfo(testUrl);
    
    console.log('📹 Title:', info.title);
    console.log('⏱️ Duration:', info.duration);
    console.log('✅ Duration OK:', info.length <= MAX_DURATION_MINUTES * 60);
    console.log('👤 Author:', info.author);
    
    return info;
  } catch (error) {
    console.error('❌ Video info failed:', error);
    throw error;
  }
}

/**
 * 3️⃣ FULL PIPELINE: Download → Drive → Email
 */
function test3_fullPipeline() {
  try {
    console.log('🚀 === FULL SYSTEM TEST ===');
    
    const videoUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    const result = downloadVideoWithEmail(videoUrl, DEFAULT_EMAIL);
    
    if (result.success) {
      console.log('🎉 ✅ FULL SUCCESS!');
      console.log('📧 Email sent:', DEFAULT_EMAIL);
      console.log('💾 Drive:', result.driveUrl);
      console.log('⬇️ Download:', result.downloadUrl);
    } else {
      console.log('❌ Failed:', result.error);
    }
    
    return result;
  } catch (error) {
    console.error('💥 CRITICAL ERROR:', error);
    sendErrorEmail(DEFAULT_EMAIL, videoUrl, error.toString());
    throw error;
  }
}

/**
 * 4️⃣ AUTHORIZE PERMISSIONS (Run first!)
 */
function authorizePermissions() {
  console.log('🔑 Authorizing Gmail + Drive...');
  MailApp.sendEmail(DEFAULT_EMAIL, '🔑 Permissions', 'Click "Allow" to continue');
  DriveApp.getRootFolder();
  console.log('✅ Permissions granted! Run tests 1-3');
}

// ================================
// 🚀 CORE DOWNLOAD FUNCTION
// ================================

/**
 * 🎬 MAIN FUNCTION: Download → Email → Drive
 * Auto-skips videos > 20 minutes, always 360p
 */
function downloadVideoWithEmail(videoUrl, recipientEmail = DEFAULT_EMAIL) {
  console.log(`🎬 Processing: ${videoUrl}`);
  
  try {
    // 1. Get video info + check duration
    const info = getVideoInfo(videoUrl);
    
    if (info.length > MAX_DURATION_MINUTES * 60) {
      const reason = `Video too long (${Math.round(info.length/60)} min > ${MAX_DURATION_MINUTES} min limit)`;
      console.log('⏭️ SKIPPED:', reason);
      sendSkipEmail(recipientEmail, info, reason);
      return { success: false, skipped: true, reason, info };
    }
    
    // 2. Download 360p video
    console.log(`⬇️ Downloading ${DEFAULT_RESOLUTION}...`);
    const downloadResponse = UrlFetchApp.fetch(`${API_BASE_URL}/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      payload: JSON.stringify({ 
        url: videoUrl, 
        resolution: DEFAULT_RESOLUTION 
      }),
      muteHttpExceptions: true
    });
    
    if (downloadResponse.getResponseCode() !== 200) {
      throw new Error(`Download failed: ${downloadResponse.getContentText()}`);
    }
    
    // 3. Save to Google Drive
    const fileName = `${info.title.substring(0, 50)} [${DEFAULT_RESOLUTION}].mp4`;
    const blob = downloadResponse.getBlob().setName(fileName);
    const file = DriveApp.createFile(blob);
    
    // Make shareable
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    // 4. Send beautiful HTML email
    const result = sendSuccessEmail(recipientEmail, info, file);
    
    // 5. Log success
    logToSheet(videoUrl, info, 'SUCCESS', result.downloadUrl);
    
    console.log(`✅ SUCCESS: ${info.title}`);
    return {
      success: true,
      title: info.title,
      fileId: file.getId(),
      driveUrl: file.getUrl(),
      downloadUrl: result.downloadUrl,
      size: blob.getBytes().length / 1024 / 1024 + ' MB'
    };
    
  } catch (error) {
    console.error('❌ FAILED:', error);
    logToSheet(videoUrl, null, 'FAILED', error.toString());
    sendErrorEmail(recipientEmail, videoUrl, error.toString());
    return { success: false, error: error.toString() };
  }
}

// ================================
// 🔍 HELPER FUNCTIONS
// ================================

/**
 * Get video info from API
 */
function getVideoInfo(videoUrl) {
  const response = UrlFetchApp.fetch(
    `${API_BASE_URL}/info?url=${encodeURIComponent(videoUrl)}`,
    { muteHttpExceptions: true }
  );
  
  if (response.getResponseCode() !== 200) {
    throw new Error(`API Error ${response.getResponseCode()}: ${response.getContentText()}`);
  }
  
  const data = JSON.parse(response.getContentText());
  
  if (!data.success) {
    throw new Error(`Video error: ${data.error}`);
  }
  
  // Add computed fields
  data.duration = formatDuration(data.length);
  return data;
}

/**
 * Send success email with thumbnail + download button
 */
function sendSuccessEmail(email, info, file) {
  const downloadUrl = `https://drive.google.com/uc?export=download&id=${file.getId()}`;
  const driveUrl = file.getUrl();
  
  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="color: #4285f4;">🎬 Download Ready!</h1>
      
      <!-- Thumbnail -->
      <div style="text-align: center; margin: 20px 0;">
        <img src="${info.thumbnail}" 
             style="width: 100%; max-width: 400px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
      </div>
      
      <!-- Download Button -->
      <div style="text-align: center; margin: 30px 0;">
        <a href="${downloadUrl}" 
           style="background: linear-gradient(135deg, #4285f4, #34a853); 
                  color: white; padding: 18px 40px; text-decoration: none; 
                  border-radius: 50px; font-size: 18px; font-weight: bold;
                  box-shadow: 0 4px 15px rgba(66,133,244,0.3);
                  display: inline-block;">
          ⬇️ DOWNLOAD ${DEFAULT_RESOLUTION} MP4
        </a>
      </div>
      
      <!-- Video Details -->
      <div style="background: #f8f9fa; padding: 20px; border-radius: 12px; margin: 20px 0;">
        <h3 style="margin-top: 0;">📺 Video Details</h3>
        <p><strong>${escapeHtml(info.title)}</strong></p>
        <p>👤 <strong>${escapeHtml(info.author)}</strong></p>
        <p>⏱️ <strong>${info.duration}</strong> • 👀 <strong>${formatViews(info.views)}</strong></p>
        <p>📁 <strong>${DEFAULT_RESOLUTION}</strong> • 💾 ${file.getSize() / 1024 / 1024 | 0} MB</p>
      </div>
      
      <!-- Links -->
      <div style="background: #e3f2fd; padding: 15px; border-radius: 8px; margin: 20px 0; text-align: center;">
        <p>
          🔗 <a href="${driveUrl}">View in Google Drive</a> | 
          🌐 <a href="${info.url}" target="_blank">Watch on YouTube</a>
        </p>
      </div>
      
      <hr style="margin: 30px 0;">
      <p style="color: #666; font-size: 14px;">
        <em>Powered by YouTube Downloader API 🚀<br>
        Processed: ${new Date().toLocaleString()}</em>
      </p>
    </div>
  `;
  
  MailApp.sendEmail({
    to: email,
    subject: `🎥 ${info.title.substring(0, 60)}${info.title.length > 60 ? '...' : ''}`,
    htmlBody: htmlBody
  });
  
  return { downloadUrl, driveUrl };
}

/**
 * Send skip notification (too long)
 */
function sendSkipEmail(email, info, reason) {
  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 500px;">
      <h2 style="color: #ff9800;">⏭️ Video Skipped</h2>
      <img src="${info.thumbnail}" style="width: 100%; max-width: 300px; border-radius: 8px;">
      <h3>${escapeHtml(info.title)}</h3>
      <p><strong>Reason:</strong> ${reason}</p>
      <p>⏱️ Duration: ${info.duration}</p>
      <p>👤 ${escapeHtml(info.author)}</p>
      <p><a href="${info.url}" style="color: #4285f4;">Watch on YouTube →</a></p>
    </div>
  `;
  
  MailApp.sendEmail({
    to: email,
    subject: `⏭️ Skipped: ${info.title.substring(0, 50)}...`,
    htmlBody: htmlBody
  });
}

/**
 * Send error notification
 */
function sendErrorEmail(email, videoUrl, error) {
  MailApp.sendEmail({
    to: email,
    subject: '⚠️ YouTube Download Failed',
    body: `Failed to download: ${videoUrl}\n\nError: ${error}\n\nCheck script logs for details.`
  });
}

// ================================
// 🔄 BATCH PROCESSING
// ================================

/**
 * Process multiple videos (with 20min/360p limits)
 */
function batchProcessWithEmails(videoUrls, recipientEmail = DEFAULT_EMAIL) {
  console.log(`🔄 Batch processing ${videoUrls.length} videos...`);
  
  const results = [];
  let success = 0, skipped = 0, failed = 0;
  
  videoUrls.forEach((url, index) => {
    console.log(`\n[${index + 1}/${videoUrls.length}] ${url}`);
    
    const result = downloadVideoWithEmail(url, recipientEmail);
    
    if (result.success) {
      success++;
    } else if (result.skipped) {
      skipped++;
    } else {
      failed++;
    }
    
    results.push(result);
    
    // Rate limiting: 10s between downloads
    if (index < videoUrls.length - 1) {
      console.log('⏳ Waiting 10s...');
      Utilities.sleep(10000);
    }
  });
  
  // Summary email
  sendBatchSummaryEmail(recipientEmail, success, skipped, failed, results);
  
  console.log(`\n📊 SUMMARY: ${success}✅ ${skipped}⏭️ ${failed}❌`);
  return results;
}

/**
 * Process URLs from Google Sheet Column A
 */
function processSheetVideos(sheetId, recipientEmail = DEFAULT_EMAIL) {
  if (!sheetId) {
    console.log('❌ Set LOG_SHEET_ID or pass sheetId parameter');
    return;
  }
  
  const sheet = SpreadsheetApp.openById(sheetId).getActiveSheet();
  const data = sheet.getRange('A:A').getValues();
  const urls = data
    .flat()
    .filter(row => row && typeof row === 'string' && row.includes('youtube.com'))
    .map(url => url.toString().trim());
  
  if (urls.length === 0) {
    console.log('❌ No YouTube URLs found in Column A');
    return;
  }
  
  console.log(`📋 Found ${urls.length} URLs in sheet`);
  return batchProcessWithEmails(urls, recipientEmail);
}

/**
 * Batch summary email
 */
function sendBatchSummaryEmail(email, success, skipped, failed, results) {
  let html = `
    <h2>📊 Batch Processing Complete</h2>
    <p><strong>${success} successful</strong> | ${skipped} skipped | ${failed} failed</p>
    
    <h3>✅ Successful Downloads:</h3>
    <ul>
  `;
  
  results
    .filter(r => r.success)
    .forEach(r => {
      html += `<li>${escapeHtml(r.title)} <a href="${r.downloadUrl}">⬇️</a></li>`;
    });
  
  if (skipped > 0) {
    html += `
      <h3>⏭️ Skipped (Too Long):</h3>
      <ul style="color: #ff9800;">
    `;
    results
      .filter(r => r.skipped)
      .forEach(r => {
        html += `<li>${escapeHtml(r.info.title)} (${r.reason})</li>`;
      });
  }
  
  if (failed > 0) {
    html += `
      <h3>❌ Failed:</h3>
      <ul style="color: red;">
    `;
    results
      .filter(r => !r.success && !r.skipped)
      .forEach(r => {
        html += `<li>${r.url || 'Unknown'}<br><small>${r.error || r.reason}</small></li>`;
      });
  }
  
  html += `
    </ul>
    <p><em>Completed: ${new Date().toLocaleString()}</em></p>
  `;
  
  MailApp.sendEmail({
    to: email,
    subject: `📊 Batch Complete: ${success}/${success + skipped + failed} videos`,
    htmlBody: html
  });
}

// ================================
// 📊 LOGGING
// ================================

/**
 * Log to Google Sheet (optional)
 */
function logToSheet(videoUrl, info, status, details) {
  if (!LOG_SHEET_ID) return;
  
  try {
    const ss = SpreadsheetApp.openById(LOG_SHEET_ID);
    let sheet = ss.getActiveSheet();
    
    // Setup headers if new
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, 7).setValues([[
        'Date', 'URL', 'Title', 'Status', 'Duration', 'Details', 'Download URL'
      ]]);
      sheet.getRange(1, 1, 1, 7)
        .setFontWeight('bold')
        .setBackground('#4285f4')
        .setFontColor('white');
    }
    
    const row = [
      new Date(),
      videoUrl,
      info?.title || 'N/A',
      status,
      info?.duration || 'N/A',
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
 * Create logging sheet
 */
function setupLoggingSheet() {
  const ss = SpreadsheetApp.create(`YouTube Downloads ${new Date().toLocaleDateString()}`);
  const sheet = ss.getActiveSheet();
  
  sheet.getRange(1, 1, 1, 7).setValues([[
    'Date', 'URL', 'Title', 'Status', 'Duration', 'Details', 'Download URL'
  ]]);
  
  sheet.getRange(1, 1, 1, 7)
    .setFontWeight('bold')
    .setBackground('#4285f4')
    .setFontColor('white')
    .setHorizontalAlignment('center');
  
  sheet.autoResizeColumns(1, 7);
  console.log('✅ Logging sheet created:');
  console.log('📋 URL:', ss.getUrl());
  console.log('🔧 Copy Sheet ID to LOG_SHEET_ID in Code.gs');
  
  return ss.getUrl();
}

// ================================
// 🤖 AUTOMATION
// ================================

/**
 * Setup daily trigger (9 AM)
 */
function setupDailyTrigger() {
  // Remove old triggers
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (trigger.getHandlerFunction().includes('process')) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  
  // Daily at 9 AM
  ScriptApp.newTrigger('processSheetVideos')
    .timeBased()
    .everyDays(1)
    .atHour(9)
    .create();
    
  console.log('✅ Daily trigger: 9 AM → Processes sheet Column A');
}

// ================================
// 🛠️ UTILITIES
// ================================

/**
 * Format seconds to MM:SS
 */
function formatDuration(seconds) {
  if (!seconds) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format large numbers (1.2B, 5.3M, 1.4K)
 */
function formatViews(views) {
  if (!views) return '0';
  if (views >= 1e9) return (views / 1e9).toFixed(1) + 'B';
  if (views >= 1e6) return (views / 1e6).toFixed(1) + 'M';
  if (views >= 1e3) return (views / 1e3).toFixed(0) + 'K';
  return views.toLocaleString();
}

/**
 * Escape HTML for safe email display
 */
function escapeHtml(text) {
  if (!text) return '';
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return text.replace(/[&<>"']/g, m => map[m]);
}

// ================================
// 🔥 QUICK START COMMANDS
// ================================

/**
 * 🎯 QUICK TEST: Single video
 */
function quickTest() {
  authorizePermissions(); // Uncomment if first run
  return test3_fullPipeline();
}

/**
 * 📋 PROCESS SHEET: URLs in Column A
 */
function processMySheet() {
  // UPDATE WITH YOUR SHEET ID
  return processSheetVideos('YOUR_SHEET_ID_HERE', DEFAULT_EMAIL);
}

/**
 * 🔄 BATCH TEST: 3 popular videos
 */
function batchQuickTest() {
  const testUrls = [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',  // Rickroll (3:33 ✅)
    'https://www.youtube.com/watch?v=kJQP7kiw5Fk',  // Ed Sheeran (3:44 ✅)
    'https://www.youtube.com/watch?v=9bZkp7q19f0'   // PS1 Demo (1:30 ✅)
  ];
  return batchProcessWithEmails(testUrls, DEFAULT_EMAIL);
}

/**
 * 📱 URL FROM CLIPBOARD: Interactive prompt
 */
function processClipboardUrls() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt(
    '📋 Paste YouTube URLs', 
    'One URL per line:', 
    ui.ButtonSet.OK_CANCEL
  );
  
  if (response.getSelectedButton() === ui.Button.OK) {
    const urls = response.getResponseText()
      .split('\n')
      .map(url => url.trim())
      .filter(url => url.includes('youtube.com/watch'));
    
    if (urls.length > 0) {
      ui.alert(`🔄 Processing ${urls.length} videos...`);
      return batchProcessWithEmails(urls, DEFAULT_EMAIL);
    } else {
      ui.alert('❌ No valid YouTube URLs found');
    }
  }
}