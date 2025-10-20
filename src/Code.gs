// ================================
// 🎥 AUTO YT EMAIL DOWNLOADER v5.5 - FIXED
// Scans "yt" subject emails → Downloads → Replies
// ================================

// 🔧 CONFIGURATION - UPDATE THESE
const API_BASE_URL = 'https://yt-downloader-api-2rhl.onrender.com'; // Your Render URL
const MAX_DURATION_MINUTES = 20; // Skip >20 min videos
const MAX_ATTACHMENT_MB = 25; // Gmail limit
const DEFAULT_RESOLUTION = '360p'; // Fast/small files

// ================================
// 🚀 MAIN FUNCTION
// ================================

/**
 * 🎯 MAIN: Scan "yt" emails → Download → Reply
 */
function processYtEmails() {
  console.log('🔍 Scanning Gmail for "yt" subject emails...');
  
  try {
    const threads = GmailApp.search('subject:yt -in:trash -label:yt-processed', 0, 50);
    console.log(`📧 Found ${threads.length} "yt" email threads`);
    
    let processed = 0, success = 0, skipped = 0, failed = 0;
    const results = [];
    
    const processedLabel = GmailApp.getUserLabelByName('yt-processed') || GmailApp.createLabel('yt-processed');
    
    threads.forEach((thread, threadIndex) => {
      console.log(`\n📧 Thread ${threadIndex + 1}: ${thread.getFirstMessageSubject()}`);
      
      const messages = thread.getMessages();
      
      messages.forEach((message, msgIndex) => {
        const urls = extractYouTubeUrls(message.getBody());
        console.log(`📧 From ${message.getFrom()}: Found ${urls.length} URLs`);
        
        if (urls.length === 0) return;
        
        processed += urls.length;
        
        urls.forEach((url, index) => {
          try {
            console.log(`Processing ${index + 1}/${urls.length}: ${url}`);
            const result = downloadAndReply(message, url);
            results.push(result);
            
            if (result.success) success++;
            else if (result.skipped) skipped++;
            else failed++;
            
            Utilities.sleep(1000); // 1s delay between requests
          } catch (error) {
            console.error('❌ URL error:', error);
            failed++;
          }
        });
      });
      
      // Mark thread as processed if any URLs were found
      if (thread.getMessages().some(m => extractYouTubeUrls(m.getBody()).length > 0)) {
        thread.addLabel(processedLabel);
        console.log('✅ Thread marked processed');
      }
    });
    
    console.log(`\n📊 SUMMARY: ${success} successful | ${skipped} skipped | ${failed} failed`);
    
    return results;
    
  } catch (error) {
    console.error('❌ Script error:', error);
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
    /https?:\/\/(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/g,
    /https?:\/\/youtu\.be\/([a-zA-Z0-9_-]{11})/g
  ];
  
  const urls = [];
  patterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(emailBody)) !== null) {
      urls.push(`https://www.youtube.com/watch?v=${match[1]}`);
    }
  });
  
  return urls;
}

/**
 * Download video → Reply to sender
 */
function downloadAndReply(message, videoUrl) {
  const senderEmail = extractEmail(message.getFrom());
  console.log(`⬇️ Processing for ${senderEmail}: ${videoUrl}`);
  
  try {
    // 1. Get video info
    const info = getVideoInfo(videoUrl);
    
    // 2. Check duration
    if (info.length > MAX_DURATION_MINUTES * 60) {
      const reason = `Too long (${formatDuration(info.length)} > ${MAX_DURATION_MINUTES}min)`;
      replyToSender(message, info, { skipped: true, reason });
      return { success: false, skipped: true, reason, info, sender: senderEmail, url: videoUrl };
    }
    
    // 3. Download video
    console.log(`⬇️ Downloading ${DEFAULT_RESOLUTION}...`);
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
    
    // 4. Smart delivery
    if (fileSizeMB <= MAX_ATTACHMENT_MB) {
      console.log(`📎 Sending attachment (${fileSizeMB.toFixed(1)}MB)`);
      replyToSender(message, info, { method: 'attachment', sizeMB: fileSizeMB.toFixed(1) }, blob);
    } else {
      console.log(`💾 Sending Drive link (${fileSizeMB.toFixed(1)}MB)`);
      const file = DriveApp.createFile(blob);
      setPrivateSharing(file, senderEmail);
      replyToSender(message, info, { method: 'drive', driveUrl: file.getUrl(), sizeMB: fileSizeMB.toFixed(1) }, null, file);
    }
    
    return { success: true, info, sender: senderEmail, url: videoUrl };
    
  } catch (error) {
    console.error('❌ Failed:', error);
    replyToSender(message, null, { error: error.toString(), videoUrl });
    return { success: false, error: error.toString(), sender: senderEmail, url: videoUrl };
  }
}

// ================================
// 📧 REPLY FUNCTION
// ================================

/**
 * Reply to sender with result
 */
function replyToSender(message, info, result, attachment = null, driveFile = null) {
  const senderEmail = extractEmail(message.getFrom());
  const subject = `Re: ${message.getSubject()}`;
  
  let htmlBody;
  
  if (result.skipped) {
    htmlBody = `
      <h2 style="color: #ff9800;">⏭️ Video Skipped</h2>
      <p><strong>${escapeHtml(info.title)}</strong></p>
      <p style="color: #ff9800;"><em>${escapeHtml(result.reason)}</em></p>
      <p>👤 ${escapeHtml(info.author)} • ⏱️ ${info.duration}</p>
      <p><a href="${info.url}" target="_blank">▶️ Watch on YouTube</a></p>
      <hr><p><em>YT Email Downloader</em></p>
    `;
    
  } else if (result.error) {
    htmlBody = `
      <h2 style="color: #f44336;">❌ Download Failed</h2>
      <p><strong>URL:</strong> ${escapeHtml(result.videoUrl || 'Unknown')}</p>
      <p><strong>Error:</strong> ${escapeHtml(result.error)}</p>
      <p>💡 Try a <a href="https://www.youtube.com/watch?v=dQw4w9WgXcQ">public video</a> to test.</p>
      <hr><p><em>YT Email Downloader</em></p>
    `;
    
  } else if (result.method === 'attachment') {
    htmlBody = `
      <div style="font-family: Arial; max-width: 600px;">
        <h1 style="color: #4CAF50;">✅ Video Downloaded!</h1>
        <div style="background: #e8f5e8; padding: 20px; border-radius: 10px; text-align: center;">
          <h2>📎 <strong>VIDEO ATTACHED</strong></h2>
          <p><strong>${escapeHtml(info.title)}</strong></p>
          <p>📎 ${attachment.getName()} • ${result.sizeMB}MB</p>
        </div>
        <div style="text-align: center; margin: 20px 0;">
          <img src="${info.thumbnail}" style="width: 100%; max-width: 400px; border-radius: 10px;">
        </div>
        <p>👤 ${escapeHtml(info.author)} • ⏱️ ${info.duration} • 📁 ${DEFAULT_RESOLUTION}</p>
        <hr><p><em>YT Email Downloader 🚀</em></p>
      </div>
    `;
    
    MailApp.sendEmail({
      to: senderEmail,
      subject: subject,
      htmlBody: htmlBody,
      attachments: [attachment]
    });
    return;
    
  } else {
    htmlBody = `
      <div style="font-family: Arial; max-width: 600px;">
        <h1 style="color: #2196F3;">💾 Video Ready in Drive!</h1>
        <div style="background: #e3f2fd; padding: 20px; border-radius: 10px; text-align: center;">
          <h2>🔒 <strong>PRIVATE DRIVE LINK</strong></h2>
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
        <div style="text-align: center; margin: 20px 0;">
          <img src="${info.thumbnail}" style="width: 100%; max-width: 400px; border-radius: 10px;">
        </div>
        <p>👤 ${escapeHtml(info.author)} • ⏱️ ${info.duration} • 📁 ${DEFAULT_RESOLUTION}</p>
        <hr><p><em>YT Email Downloader 🚀</em></p>
      </div>
    `;
  }
  
  MailApp.sendEmail({
    to: senderEmail,
    subject: subject,
    htmlBody: htmlBody
  });
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
    throw new Error(`API failed: ${response.getResponseCode()}`);
  }
  
  const data = JSON.parse(response.getContentText());
  if (!data.success) {
    throw new Error(data.error || 'API error');
  }
  
  data.duration = formatDuration(data.length);
  return data;
}

// ================================
// 🧪 TESTS
// ================================

function quickSetup() {
  console.log('🔧 Setup...');
  
  try {
    GmailApp.createLabel('yt-processed');
    console.log('✅ Label created');
  } catch (e) {
    console.log('ℹ️ Label exists');
  }
  
  // Setup trigger
  setupHourlyTrigger();
  
  // Send test email
  testWithExactYtEmail();
  
  console.log('🎉 Setup complete! USE EXACT SUBJECT: "yt"');
}

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

function testWithExactYtEmail() {
  const testBody = `
    Test download:
    https://www.youtube.com/watch?v=dQw4w9WgXcQ
    
    Exact subject "yt" required!
  `;
  
  GmailApp.sendEmail(
    Session.getActiveUser().getEmail(),
    'yt',  // ← EXACT "yt"
    testBody,
    { htmlBody: testBody.replace(/\n/g, '<br>') }
  );
  
  console.log('✅ EXACT "yt" test email sent!');
  console.log('⏳ Run processYtEmails() to process it');
}

function showRecentYtEmails() {
  const threads = GmailApp.search('subject:"yt" -in:trash', 0, 10);
  console.log(`📧 EXACT "yt" emails (${threads.length}):`);
  
  threads.forEach((thread, i) => {
    const labels = thread.getLabels().map(l => l.getName());
    const msg = thread.getMessages()[0];
    const urls = extractYouTubeUrls(msg.getBody());
    const processed = labels.includes('yt-processed');
    
    console.log(`\n${i+1}. "${msg.getSubject()}" ${processed ? '[✅ PROCESSED]' : '[⏳ PENDING]'}`);
    console.log(`   From: ${msg.getFrom()}`);
    console.log(`   URLs: ${urls.join(', ')}`);
    console.log(`   Labels: ${labels.join(', ') || 'none'}`);
  });
}

// ================================
// 🛠️ UTILITIES
// ================================

function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function escapeHtml(text) {
  if (!text) return '';
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;', '\n': '<br>' };
  return text.toString().replace(/[&<>"'\n]/g, m => map[m]);
}