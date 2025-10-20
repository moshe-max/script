// ================================
// 🎥 AUTO YT EMAIL DOWNLOADER v5.0
// Scans "yt" subject emails → Downloads → Replies
// ================================

// 🔧 CONFIGURATION
const API_BASE_URL = 'https://yt-downloader-api-2rhl.onrender.com';
const MAX_DURATION_MINUTES = 20;  // Skip >20min videos
const MAX_ATTACHMENT_MB = 25;     // Gmail limit
const DEFAULT_RESOLUTION = '360p';

// ================================
// 🚀 MAIN FUNCTION - RUN THIS!
// ================================

/**
 * 🎯 MAIN: Scan "yt" emails → Download → Reply
 * Run manually or setup trigger
 */
function processYtEmails() {
  console.log('🔍 Scanning Gmail for "yt" subject emails...');
  
  try {
    // 1. Find emails with "yt" in subject
    const threads = GmailApp.search('subject:yt -in:trash', 0, 50); // Last 50 emails
    console.log(`📧 Found ${threads.length} "yt" email threads`);
    
    let processed = 0, success = 0, skipped = 0, failed = 0;
    const results = [];
    
    threads.forEach(thread => {
      const messages = thread.getMessages();
      messages.forEach(message => {
        // Skip processed emails
        if (message.isStarred()) {
          console.log('⏭️ Skipping starred (processed)');
          return;
        }
        
        // Extract YouTube URLs from email body
        const urls = extractYouTubeUrls(message.getBody());
        console.log(`📧 From ${message.getFrom()}: Found ${urls.length} URLs`);
        
        if (urls.length === 0) return;
        
        processed++;
        
        // Process each URL
        urls.forEach(url => {
          try {
            const result = downloadAndReply(message, url);
            results.push(result);
            
            if (result.success) success++;
            else if (result.skipped) skipped++;
            else failed++;
            
            // Rate limit
            Utilities.sleep(3000); // 3s between downloads
            
          } catch (error) {
            console.error(`❌ URL failed: ${url}`, error);
            failed++;
          }
        });
        
        // Mark thread as processed
        thread.star(); // Visual indicator
      });
    });
    
    // Summary
    console.log(`\n📊 SUMMARY: ${success}✅ ${skipped}⏭️ ${failed}❌ / ${processed} processed`);
    
    if (success > 0) {
      sendSummaryEmail(success, skipped, failed, results);
    }
    
    return { processed, success, skipped, failed, results };
    
  } catch (error) {
    console.error('💥 CRITICAL ERROR:', error);
    sendAdminAlert('YT Email Processor Failed', error.toString());
    throw error;
  }
}

// ================================
// 📥 EMAIL PROCESSING
// ================================

/**
 * Extract YouTube URLs from email body
 */
function extractYouTubeUrls(emailBody) {
  const patterns = [
    /https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/g,
    /https?:\/\/(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/g,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/g
  ];
  
  const urls = [];
  let match;
  
  patterns.forEach(pattern => {
    while ((match = pattern.exec(emailBody)) !== null) {
      const videoId = match[1];
      // Convert to full watch URL
      urls.push(`https://www.youtube.com/watch?v=${videoId}`);
    }
  });
  
  return [...new Set(urls)]; // Remove duplicates
}

/**
 * Download video → Reply to sender
 */
function downloadAndReply(message, videoUrl) {
  const sender = message.getFrom().match(/<(.+?)>/)?.[1] || message.getFrom();
  console.log(`⬇️ Processing for ${sender}: ${videoUrl}`);
  
  try {
    // 1. Get video info
    const info = getVideoInfo(videoUrl);
    
    // 2. Check duration limit
    if (info.length > MAX_DURATION_MINUTES * 60) {
      const reason = `Too long (${formatDuration(info.length)} > ${MAX_DURATION_MINUTES}min)`;
      replyToSender(message, info, { skipped: true, reason });
      return { success: false, skipped: true, reason, info, sender };
    }
    
    // 3. Download video
    const downloadResponse = UrlFetchApp.fetch(`${API_BASE_URL}/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      payload: JSON.stringify({ url: videoUrl, resolution: DEFAULT_RESOLUTION }),
      muteHttpExceptions: true
    });
    
    if (downloadResponse.getResponseCode() !== 200) {
      throw new Error(`Download failed: ${downloadResponse.getContentText()}`);
    }
    
    const blob = downloadResponse.getBlob();
    const fileSizeMB = blob.getBytes().length / 1024 / 1024;
    const fileName = `${info.title.substring(0, 50)} [${DEFAULT_RESOLUTION}].mp4`;
    blob.setName(fileName);
    
    console.log(`📁 ${fileName} (${fileSizeMB.toFixed(1)}MB)`);
    
    let replyData;
    
    // 4. Smart delivery
    if (fileSizeMB <= MAX_ATTACHMENT_MB) {
      // 📎 Attachment
      replyData = { method: 'attachment', sizeMB: fileSizeMB.toFixed(1) };
      replyToSender(message, info, replyData, blob);
    } else {
      // 💾 Drive (private)
      const file = DriveApp.createFile(blob);
      setPrivateSharing(file, sender);
      replyData = { 
        method: 'drive', 
        fileId: file.getId(), 
        driveUrl: file.getUrl(),
        sizeMB: fileSizeMB.toFixed(1)
      };
      replyToSender(message, info, replyData, null, file);
    }
    
    return { success: true, info, sender, ...replyData };
    
  } catch (error) {
    console.error('❌ Download failed:', error);
    replyToSender(message, null, { error: error.toString() });
    return { success: false, error: error.toString(), sender };
  }
}

/**
 * Reply to sender with download
 */
function replyToSender(message, info, result, attachment = null, driveFile = null) {
  const subject = `Re: ${message.getSubject()}`;
  const sender = message.getFrom();
  
  let htmlBody;
  
  if (result.skipped) {
    // ⏭️ Skipped
    htmlBody = `
      <h2>⏭️ Video Skipped</h2>
      <p><strong>${escapeHtml(info.title)}</strong></p>
      <p><em>${result.reason}</em></p>
      <p>👤 ${escapeHtml(info.author)} • ⏱️ ${info.duration}</p>
      <p><a href="${info.url}">Watch on YouTube →</a></p>
    `;
    
  } else if (result.error) {
    // ❌ Error
    htmlBody = `
      <h2>❌ Download Failed</h2>
      <p>Could not download video from your email.</p>
      <p><strong>Error:</strong> ${escapeHtml(result.error)}</p>
      <p>Please try again or contact admin.</p>
    `;
    
  } else if (result.method === 'attachment') {
    // 📎 Attachment
    htmlBody = `
      <div style="font-family: Arial; max-width: 600px;">
        <h1 style="color: #4CAF50;">✅ Video Downloaded!</h1>
        <div style="background: #e8f5e8; padding: 20px; border-radius: 10px; text-align: center;">
          <h2>📎 VIDEO ATTACHED!</h2>
          <p><strong>${escapeHtml(info.title)}</strong></p>
          <p>📎 ${attachment.getName()} • ${(attachment.getBytes().length/1024/1024).toFixed(1)}MB</p>
        </div>
        <img src="${info.thumbnail}" style="width: 100%; max-width: 400px; border-radius: 10px; margin: 20px 0;">
        <p>👤 ${escapeHtml(info.author)} • ⏱️ ${info.duration} • 📁 ${DEFAULT_RESOLUTION}</p>
        <hr>
        <p><em>Powered by YT Email Downloader 🚀</em></p>
      </div>
    `;
    
    // Send with attachment
    message.reply({
      subject: subject,
      htmlBody: htmlBody,
      attachments: [attachment]
    });
    
  } else {
    // 💾 Drive
    htmlBody = `
      <div style="font-family: Arial; max-width: 600px;">
        <h1 style="color: #2196F3;">💾 Video Ready in Drive!</h1>
        <div style="background: #e3f2fd; padding: 20px; border-radius: 10px; text-align: center;">
          <h2>🔒 PRIVATE DOWNLOAD</h2>
          <p><strong>${escapeHtml(info.title)}</strong></p>
          <p>📁 ${driveFile.getName()} • ${result.sizeMB}MB</p>
        </div>
        <div style="text-align: center; margin: 20px 0;">
          <a href="${result.driveUrl}" style="background: #2196F3; color: white; 
             padding: 15px 30px; text-decoration: none; border-radius: 25px; 
             font-size: 16px; display: inline-block;">
            📁 Open in Drive
          </a>
        </div>
        <img src="${info.thumbnail}" style="width: 100%; max-width: 400px; border-radius: 10px;">
        <div style="background: #fff3e0; padding: 15px; border-radius: 8px; margin: 15px 0;">
          <p><strong>🔒 Private Access:</strong></p>
          <ul style="color: #f57c00; padding-left: 20px; margin: 10px 0;">
            <li>✅ You: Full access</li>
            <li>✅ ${escapeHtml(sender)}: View + Download</li>
            <li>❌ Public: Blocked</li>
          </ul>
        </div>
        <p>👤 ${escapeHtml(info.author)} • ⏱️ ${info.duration} • 📁 ${DEFAULT_RESOLUTION}</p>
        <hr>
        <p><em>Powered by YT Email Downloader 🚀</em></p>
      </div>
    `;
    
    message.reply({ subject: subject, htmlBody: htmlBody });
  }
  
  if (!result.skipped && !result.error) {
    console.log(`✅ Replied to ${sender}: ${info ? info.title : 'Error/Skipped'}`);
  }
}

// ================================
// 🔍 API HELPERS
// ================================

function getVideoInfo(videoUrl) {
  const response = UrlFetchApp.fetch(
    `${API_BASE_URL}/info?url=${encodeURIComponent(videoUrl)}`,
    { muteHttpExceptions: true }
  );
  
  if (response.getResponseCode() !== 200) {
    throw new Error(`API failed: ${response.getContentText()}`);
  }
  
  const data = JSON.parse(response.getContentText());
  if (!data.success) {
    throw new Error(`Video error: ${data.error}`);
  }
  
  data.duration = formatDuration(data.length);
  return data;
}

function setPrivateSharing(file, recipientEmail) {
  try {
    file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.EDIT);
    if (recipientEmail && recipientEmail !== Session.getActiveUser().getEmail()) {
      file.addViewer(recipientEmail);
    }
    console.log('🔒 Private sharing set');
  } catch (error) {
    console.error('Sharing error:', error);
  }
}

// ================================
// 📧 NOTIFICATIONS
// ================================

function sendSummaryEmail(success, skipped, failed, results) {
  const html = `
    <h2>📊 YT Email Processing Complete</h2>
    <p><strong>${success} successful</strong> | ${skipped} skipped | ${failed} failed</p>
    
    ${success > 0 ? `
      <h3>✅ Successful Downloads:</h3>
      <ul>
        ${results.filter(r => r.success).map(r => 
          `<li>${escapeHtml(r.info.title)} → ${r.sender} (${r.method})</li>`
        ).join('')}
      </ul>
    ` : ''}
    
    ${skipped > 0 ? `
      <h3>⏭️ Skipped:</h3>
      <ul style="color: #ff9800;">
        ${results.filter(r => r.skipped).map(r => 
          `<li>${escapeHtml(r.info.title)} (${r.reason})</li>`
        ).join('')}
      </ul>
    ` : ''}
    
    ${failed > 0 ? `
      <h3>❌ Failed:</h3>
      <ul style="color: red;">
        ${results.filter(r => !r.success && !r.skipped).map(r => 
          `<li>${r.error || 'Unknown error'}</li>`
        ).join('')}
      </ul>
    ` : ''}
  `;
  
  MailApp.sendEmail({
    to: Session.getActiveUser().getEmail(),
    subject: `📧 YT Emails: ${success}/${success+skipped+failed} processed`,
    htmlBody: html
  });
}

function sendAdminAlert(subject, error) {
  MailApp.sendEmail({
    to: Session.getActiveUser().getEmail(),
    subject: `🚨 ${subject}`,
    body: `Error: ${error}\nTime: ${new Date()}\nCheck script logs.`
  });
}

// ================================
// 🤖 AUTOMATION SETUP
// ================================

/**
 * Setup hourly trigger (recommended)
 */
function setupHourlyTrigger() {
  // Remove old triggers
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (trigger.getHandlerFunction() === 'processYtEmails') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  
  // New hourly trigger
  ScriptApp.newTrigger('processYtEmails')
    .timeBased()
    .everyHours(1)
    .create();
    
  console.log('✅ Hourly trigger setup: Checks "yt" emails every hour');
}

/**
 * Setup daily trigger (9 AM)
 */
function setupDailyTrigger() {
  // Remove old triggers
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (trigger.getHandlerFunction() === 'processYtEmails') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  
  // Daily at 9 AM
  ScriptApp.newTrigger('processYtEmails')
    .timeBased()
    .everyDays(1)
    .atHour(9)
    .create();
    
  console.log('✅ Daily trigger: 9 AM every day');
}

// ================================
// 🧪 TEST FUNCTIONS
// ================================

/**
 * 🧪 Test with sample email
 */
function testWithSampleEmail() {
  // Create test email in your inbox
  const testUrls = [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ', // Rickroll
    'https://youtu.be/kJQP7kiw5Fk'                // Ed Sheeran
  ];
  
  const body = `
    Please download these videos:
    ${testUrls.join('\n')}
    
    Thanks!
  `;
  
  GmailApp.sendEmail(
    Session.getActiveUser().getEmail(),
    'yt test download request',
    body,
    { htmlBody: body.replace(/\n/g, '<br>') }
  );
  
  console.log('✅ Test email sent to yourself');
  console.log('⏳ Wait 1 min → Run processYtEmails()');
}

/**
 * 🔍 Show recent "yt" emails
 */
function showRecentYtEmails() {
  const threads = GmailApp.search('subject:yt -in:trash', 0, 10);
  console.log(`📧 Recent "yt" emails (${threads.length}):`);
  
  threads.forEach((thread, i) => {
    const msg = thread.getMessages()[0];
    const urls = extractYouTubeUrls(msg.getBody());
    console.log(`\n${i+1}. ${msg.getSubject()}`);
    console.log(`   From: ${msg.getFrom()}`);
    console.log(`   URLs: ${urls.join(', ')}`);
    console.log(`   Date: ${msg.getDate()}`);
  });
}

// ================================
// 🛠️ UTILITIES
// ================================

function formatDuration(seconds) {
  if (!seconds) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function escapeHtml(text) {
  if (!text) return '';
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return text.replace(/[&<>"']/g, m => map[m]);
}

// ================================
// 🎯 QUICK START
// ================================

/**
 * 🚀 ONE-CLICK SETUP + TEST
 */
function quickSetup() {
  console.log('🔧 Setting up YT Email Downloader...');
  
  // 1. Setup hourly trigger
  setupHourlyTrigger();
  
  // 2. Send test email
  testWithSampleEmail();
  
  // 3. Process immediately
  const result = processYtEmails();
  
  console.log('\n🎉 SETUP COMPLETE!');
  console.log('✅ Hourly auto-processing enabled');
  console.log(`✅ Test: ${result.success || 0} videos processed`);
  console.log('\n📧 HOW TO USE:');
  console.log('1. Email yourself: Subject "yt anything"');
  console.log('2. Body: Paste YouTube URLs');
  console.log('3. Auto-downloads + replies within 1 hour');
}