// ================================
// 🎥 AUTO YT EMAIL DOWNLOADER v5.1 - FIXED
// Scans "yt" subject emails → Downloads → Replies
// ================================

// 🔧 CONFIGURATION
const API_BASE_URL = 'https://yt-downloader-api-2rhl.onrender.com';
const MAX_DURATION_MINUTES = 20;
const MAX_ATTACHMENT_MB = 25;
const DEFAULT_RESOLUTION = '360p';

// ================================
// 🚀 MAIN FUNCTION
// ================================

/**
 * 🎯 MAIN: Scan "yt" emails → Download → Reply
 */
function processYtEmails() {
  console.log('🔍 Scanning Gmail for "yt" subject emails...');
  
  try {
    // 1. Find emails with "yt" in subject (UNPROCESSED only)
    const searchQuery = 'subject:yt -in:trash -label:yt-processed';
    const threads = GmailApp.search(searchQuery, 0, 20); // Last 20 emails
    console.log(`📧 Found ${threads.length} unprocessed "yt" threads`);
    
    let processed = 0, success = 0, skipped = 0, failed = 0;
    const results = [];
    
    threads.forEach((thread, threadIndex) => {
      try {
        const messages = thread.getMessages();
        console.log(`\n📧 Thread ${threadIndex + 1}: ${thread.getFirstMessageSubject()}`);
        
        messages.forEach((message, msgIndex) => {
          // Skip if already processed (has label)
          if (message.getLabels().some(label => label.getName() === 'yt-processed')) {
            console.log(`  ⏭️ Message ${msgIndex + 1} already processed`);
            return;
          }
          
          // Extract YouTube URLs
          const urls = extractYouTubeUrls(message.getBody());
          console.log(`  📧 From ${message.getFrom()}: ${urls.length} URLs`);
          
          if (urls.length === 0) return;
          
          processed++;
          
          // Process each URL
          urls.forEach((url, urlIndex) => {
            try {
              console.log(`    ⬇️ [${urlIndex + 1}/${urls.length}] ${url}`);
              const result = downloadAndReply(message, url);
              results.push({ ...result, threadId: thread.getId(), messageId: message.getId() });
              
              if (result.success) success++;
              else if (result.skipped) skipped++;
              else failed++;
              
              // Rate limit: 5s between downloads
              Utilities.sleep(5000);
              
            } catch (urlError) {
              console.error(`    ❌ URL failed: ${url}`, urlError);
              results.push({ 
                success: false, 
                error: urlError.toString(), 
                url, 
                sender: message.getFrom(),
                threadId: thread.getId(),
                messageId: message.getId()
              });
              failed++;
            }
          });
          
          // Mark message as processed
          message.addLabel(GmailApp.getUserLabelByName('yt-processed') || 
                          GmailApp.createLabel('yt-processed'));
          console.log(`  ✅ Message ${msgIndex + 1} marked processed`);
          
        });
        
      } catch (threadError) {
        console.error(`❌ Thread ${threadIndex + 1} failed:`, threadError);
      }
    });
    
    // Summary
    console.log(`\n📊 FINAL SUMMARY:`);
    console.log(`✅ Success: ${success}`);
    console.log(`⏭️ Skipped: ${skipped}`); 
    console.log(`❌ Failed: ${failed}`);
    console.log(`📧 Processed: ${processed} messages`);
    
    if (success > 0 || failed > 0) {
      sendSummaryEmail(success, skipped, failed, results);
    }
    
    return { processed, success, skipped, failed, results };
    
  } catch (error) {
    console.error('💥 CRITICAL ERROR:', error);
    sendAdminAlert('YT Email Processor CRASHED', error.toString());
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
    /https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/gi,
    /https?:\/\/(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/gi,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/gi
  ];
  
  const urls = new Set();
  
  patterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(emailBody)) !== null) {
      const videoId = match[1];
      urls.add(`https://www.youtube.com/watch?v=${videoId}`);
    }
  });
  
  return Array.from(urls);
}

/**
 * Download video → Reply to sender
 */
function downloadAndReply(message, videoUrl) {
  const senderEmail = extractEmail(message.getFrom());
  console.log(`⬇️ Processing for ${senderEmail}: ${videoUrl}`);
  
  try {
    // 1. Get video info (with better error handling)
    let info;
    try {
      info = getVideoInfo(videoUrl);
      console.log(`  ✅ Video: ${info.title} (${info.duration})`);
    } catch (infoError) {
      if (infoError.message.includes('Video not found') || 
          infoError.message.includes('private')) {
        replyToSender(message, null, { 
          error: 'Video unavailable (private/deleted)', 
          videoUrl 
        });
        return { success: false, error: infoError.message, sender: senderEmail, url: videoUrl };
      }
      throw infoError;
    }
    
    // 2. Check duration limit
    if (info.length > MAX_DURATION_MINUTES * 60) {
      const reason = `Too long (${formatDuration(info.length)} > ${MAX_DURATION_MINUTES}min)`;
      replyToSender(message, info, { skipped: true, reason });
      return { success: false, skipped: true, reason, info, sender: senderEmail, url: videoUrl };
    }
    
    // 3. Download video
    console.log(`  ⬇️ Downloading ${DEFAULT_RESOLUTION}...`);
    const downloadResponse = UrlFetchApp.fetch(`${API_BASE_URL}/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      payload: JSON.stringify({ url: videoUrl, resolution: DEFAULT_RESOLUTION }),
      muteHttpExceptions: true
    });
    
    if (downloadResponse.getResponseCode() !== 200) {
      const errorMsg = downloadResponse.getContentText();
      throw new Error(`Download API failed: ${errorMsg}`);
    }
    
    const blob = downloadResponse.getBlob();
    const fileSizeMB = blob.getBytes().length / 1024 / 1024;
    const fileName = `${info.title.substring(0, 50)} [${DEFAULT_RESOLUTION}].mp4`;
    blob.setName(fileName);
    
    console.log(`  📁 ${fileName} (${fileSizeMB.toFixed(1)}MB)`);
    
    let replyData;
    
    // 4. Smart delivery
    if (fileSizeMB <= MAX_ATTACHMENT_MB) {
      // 📎 Attachment
      console.log(`  📎 Sending attachment (${fileSizeMB.toFixed(1)}MB)`);
      replyData = { method: 'attachment', sizeMB: fileSizeMB.toFixed(1) };
      replyToSender(message, info, replyData, blob);
    } else {
      // 💾 Drive
      console.log(`  💾 Saving to private Drive (${fileSizeMB.toFixed(1)}MB)`);
      const file = DriveApp.createFile(blob);
      setPrivateSharing(file, senderEmail);
      replyData = { 
        method: 'drive', 
        fileId: file.getId(), 
        driveUrl: file.getUrl(),
        sizeMB: fileSizeMB.toFixed(1)
      };
      replyToSender(message, info, replyData, null, file);
    }
    
    console.log(`  ✅ SUCCESS: ${info.title}`);
    return { success: true, info, sender: senderEmail, url: videoUrl, ...replyData };
    
  } catch (error) {
    console.error(`  ❌ FAILED: ${error.message}`);
    replyToSender(message, null, { error: error.message, videoUrl });
    return { success: false, error: error.message, sender: senderEmail, url: videoUrl };
  }
}

/**
 * Reply to sender with download/result
 */
function replyToSender(message, info, result, attachment = null, driveFile = null) {
  const subject = `Re: ${message.getSubject()}`;
  
  let htmlBody;
  
  if (result.skipped) {
    // ⏭️ Skipped
    htmlBody = `
      <h2 style="color: #ff9800;">⏭️ Video Skipped</h2>
      <p><strong>${escapeHtml(info.title)}</strong></p>
      <p style="color: #ff9800;"><em>${escapeHtml(result.reason)}</em></p>
      <p>👤 ${escapeHtml(info.author)} • ⏱️ ${info.duration}</p>
      <p><a href="${info.url}" target="_blank">▶️ Watch on YouTube</a></p>
      <hr><p><em>YT Email Downloader</em></p>
    `;
    
  } else if (result.error) {
    // ❌ Error
    htmlBody = `
      <h2 style="color: #f44336;">❌ Download Failed</h2>
      <p><strong>URL:</strong> ${escapeHtml(result.videoUrl || 'Unknown')}</p>
      <p><strong>Error:</strong> ${escapeHtml(result.error)}</p>
      <p>Please check if the video is public and available.</p>
      <hr><p><em>YT Email Downloader</em></p>
    `;
    
  } else if (result.method === 'attachment') {
    // 📎 Attachment
    htmlBody = `
      <div style="font-family: Arial; max-width: 600px;">
        <h1 style="color: #4CAF50;">✅ Video Downloaded!</h1>
        <div style="background: #e8f5e8; padding: 20px; border-radius: 10px; text-align: center;">
          <h2>📎 <strong>VIDEO ATTACHED</strong></h2>
          <p>${escapeHtml(info.title)}</p>
          <p>📎 ${attachment.getName()} • ${result.sizeMB}MB</p>
        </div>
        <div style="text-align: center; margin: 20px 0;">
          <img src="${info.thumbnail}" style="width: 100%; max-width: 400px; border-radius: 10px;">
        </div>
        <p>👤 ${escapeHtml(info.author)} • ⏱️ ${info.duration}</p>
        <hr><p><em>YT Email Downloader 🚀</em></p>
      </div>
    `;
    
    message.reply({
      subject: subject,
      htmlBody: htmlBody,
      attachments: [attachment]
    });
    return;
    
  } else {
    // 💾 Drive
    htmlBody = `
      <div style="font-family: Arial; max-width: 600px;">
        <h1 style="color: #2196F3;">💾 Video Ready!</h1>
        <div style="background: #e3f2fd; padding: 20px; border-radius: 10px; text-align: center;">
          <h2>🔒 <strong>PRIVATE DRIVE LINK</strong></h2>
          <p>${escapeHtml(info.title)}</p>
          <p>📁 ${driveFile.getName()} • ${result.sizeMB}MB</p>
        </div>
        <div style="text-align: center; margin: 20px 0;">
          <a href="${result.driveUrl}" style="background: #2196F3; color: white; 
             padding: 15px 30px; text-decoration: none; border-radius: 25px; 
             font-size: 16px; display: inline-block;">
            📁 Open in Drive
          </a>
        </div>
        <div style="text-align: center; margin: 20px 0;">
          <img src="${info.thumbnail}" style="width: 100%; max-width: 400px; border-radius: 10px;">
        </div>
        <div style="background: #fff3e0; padding: 15px; border-radius: 8px;">
          <p><strong>🔒 Access:</strong> You + me only</p>
        </div>
        <p>👤 ${escapeHtml(info.author)} • ⏱️ ${info.duration}</p>
        <hr><p><em>YT Email Downloader 🚀</em></p>
      </div>
    `;
  }
  
  // Send regular reply (no attachment)
  message.reply({ subject: subject, htmlBody: htmlBody });
}

// ================================
// 🔍 API HELPERS
// ================================

function getVideoInfo(videoUrl) {
  const response = UrlFetchApp.fetch(
    `${API_BASE_URL}/info?url=${encodeURIComponent(videoUrl)}`,
    { 
      muteHttpExceptions: true,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; YT-Email-Downloader)' }
    }
  );
  
  if (response.getResponseCode() !== 200) {
    throw new Error(`HTTP ${response.getResponseCode()}: ${response.getContentText()}`);
  }
  
  const data = JSON.parse(response.getContentText());
  if (!data.success) {
    throw new Error(data.error || 'Unknown API error');
  }
  
  data.duration = formatDuration(data.length);
  return data;
}

function setPrivateSharing(file, recipientEmail) {
  try {
    file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.EDIT);
    if (recipientEmail && recipientEmail.trim()) {
      file.addViewer(recipientEmail);
      console.log(`  🔒 Shared with: ${recipientEmail}`);
    }
  } catch (error) {
    console.error('  ⚠️ Sharing failed:', error);
  }
}

function extractEmail(fromString) {
  const match = fromString.match(/<(.+?)>/);
  return match ? match[1] : fromString.split(' ').pop();
}

// ================================
// 📧 NOTIFICATIONS
// ================================

function sendSummaryEmail(success, skipped, failed, results) {
  let html = `
    <h2>📊 YT Email Processing Summary</h2>
    <p><strong>${success}✅ ${skipped}⏭️ ${failed}❌</strong></p>
    <h3>✅ Successful:</h3><ul>
  `;
  
  results.filter(r => r.success).forEach(r => {
    html += `<li>${escapeHtml(r.info?.title || 'Unknown')} → ${r.sender}</li>`;
  });
  
  if (skipped > 0) {
    html += `<h3 style="color: #ff9800;">⏭️ Skipped:</h3><ul>`;
    results.filter(r => r.skipped).forEach(r => {
      html += `<li>${escapeHtml(r.info?.title || 'Unknown')}: ${r.reason}</li>`;
    });
  }
  
  if (failed > 0) {
    html += `<h3 style="color: #f44336;">❌ Failed:</h3><ul>`;
    results.filter(r => !r.success && !r.skipped).forEach(r => {
      html += `<li>${escapeHtml(r.url || 'Unknown')}<br><small>${r.error}</small></li>`;
    });
  }
  
  html += `</ul><p><em>${new Date().toLocaleString()}</em></p>`;
  
  MailApp.sendEmail({
    to: Session.getActiveUser().getEmail(),
    subject: `📧 YT Emails: ${success}/${success+skipped+failed}`,
    htmlBody: html
  });
}

function sendAdminAlert(subject, error) {
  MailApp.sendEmail({
    to: Session.getActiveUser().getEmail(),
    subject: `🚨 ${subject}`,
    body: `Error: ${error}\nTime: ${new Date()}\nCheck Apps Script logs.`
  });
}

// ================================
// 🤖 AUTOMATION
// ================================

function setupHourlyTrigger() {
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (trigger.getHandlerFunction() === 'processYtEmails') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  
  ScriptApp.newTrigger('processYtEmails')
    .timeBased()
    .everyHours(1)
    .create();
    
  console.log('✅ Hourly trigger: Every hour');
}

function quickSetup() {
  console.log('🔧 YT Email Downloader Setup...');
  
  // Create label
  try {
    GmailApp.createLabel('yt-processed');
    console.log('✅ Created "yt-processed" label');
  } catch (e) {
    console.log('ℹ️ "yt-processed" label exists');
  }
  
  // Setup trigger
  setupHourlyTrigger();
  
  // Test email
  testWithSampleEmail();
  
  console.log('🎉 Setup complete!');
  console.log('📧 Send test email → Wait 1hr → Check replies');
}

// ================================
// 🧪 TESTS
// ================================

function testWithSampleEmail() {
  const testBody = `
    Please download this video:
    https://www.youtube.com/watch?v=dQw4w9WgXcQ
    
    And this one:
    https://youtu.be/kJQP7kiw5Fk
  `;
  
  GmailApp.sendEmail(
    Session.getActiveUser().getEmail(),
    'yt test request',
    testBody,
    { htmlBody: testBody.replace(/\n/g, '<br>') }
  );
  
  console.log('✅ Test email sent!');
  console.log('⏳ Run processYtEmails() to process immediately');
}

function showRecentYtEmails() {
  const threads = GmailApp.search('subject:yt -in:trash', 0, 10);
  console.log(`📧 Recent "yt" emails: ${threads.length}`);
  
  threads.forEach((thread, i) => {
    const msg = thread.getMessages()[0];
    const urls = extractYouTubeUrls(msg.getBody());
    const processed = msg.getLabels().some(l => l.getName() === 'yt-processed');
    
    console.log(`\n${i+1}. ${msg.getSubject()} ${processed ? '[PROCESSED]' : ''}`);
    console.log(`   From: ${msg.getFrom()}`);
    console.log(`   URLs: ${urls.join(', ')}`);
    console.log(`   Date: ${msg.getDate().toLocaleString()}`);
  });
}

// ================================
// 🛠️ UTILITIES
// ================================

function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function escapeHtml(text) {
  if (!text) return '';
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return text.replace(/[&<>"']/g, m => map[m]);
}