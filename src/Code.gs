// ================================
// 🎥 AUTO YT EMAIL DOWNLOADER v5.2 - GMAILAPP FIXED
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
    // 1. Find unprocessed "yt" emails
    const searchQuery = 'subject:yt -in:trash -label:yt-processed';
    const threads = GmailApp.search(searchQuery, 0, 20);
    console.log(`📧 Found ${threads.length} unprocessed "yt" threads`);
    
    let processed = 0, success = 0, skipped = 0, failed = 0;
    const results = [];
    
    // Get or create processed label
    let processedLabel = GmailApp.getUserLabelByName('yt-processed');
    if (!processedLabel) {
      processedLabel = GmailApp.createLabel('yt-processed');
      console.log('✅ Created "yt-processed" label');
    }
    
    threads.forEach((thread, threadIndex) => {
      try {
        console.log(`\n📧 Thread ${threadIndex + 1}: ${thread.getFirstMessageSubject()}`);
        
        const messages = thread.getMessages();
        messages.forEach((message, msgIndex) => {
          // Check if message has processed label
          const messageLabels = message.getLabels ? message.getLabels() : [];
          const isProcessed = messageLabels.some(label => label.getName() === 'yt-processed');
          
          if (isProcessed) {
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
              const result = downloadAndReply(message, url, processedLabel);
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
                sender: extractEmail(message.getFrom()),
                threadId: thread.getId(),
                messageId: message.getId()
              });
              failed++;
            }
          });
          
          // Mark message as processed
          message.addLabel(processedLabel);
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
    
    if (success > 0 || failed > 0 || skipped > 0) {
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
  // Clean HTML to get plain text
  const plainText = emailBody.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
  
  const patterns = [
    /https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/gi,
    /https?:\/\/(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/gi,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/gi
  ];
  
  const urls = new Set();
  
  patterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(plainText)) !== null) {
      const videoId = match[1];
      urls.add(`https://www.youtube.com/watch?v=${videoId}`);
    }
  });
  
  return Array.from(urls);
}

/**
 * Download video → Reply to sender
 */
function downloadAndReply(message, videoUrl, processedLabel) {
  const senderEmail = extractEmail(message.getFrom());
  console.log(`⬇️ Processing for ${senderEmail}: ${videoUrl}`);
  
  try {
    // 1. Get video info
    let info;
    try {
      info = getVideoInfo(videoUrl);
      console.log(`  ✅ Video: ${info.title} (${info.duration})`);
    } catch (infoError) {
      const errorMsg = infoError.message;
      if (errorMsg.includes('Video not found') || 
          errorMsg.includes('private') ||
          errorMsg.includes('unavailable')) {
        replyToSender(message, null, { 
          error: 'Video unavailable (private/deleted/unlisted)', 
          videoUrl 
        }, processedLabel);
        return { success: false, error: errorMsg, sender: senderEmail, url: videoUrl };
      }
      throw infoError;
    }
    
    // 2. Check duration limit
    if (info.length > MAX_DURATION_MINUTES * 60) {
      const reason = `Too long (${formatDuration(info.length)} > ${MAX_DURATION_MINUTES}min)`;
      replyToSender(message, info, { skipped: true, reason }, processedLabel);
      return { success: false, skipped: true, reason, info, sender: senderEmail, url: videoUrl };
    }
    
    // 3. Download video
    console.log(`  ⬇️ Downloading ${DEFAULT_RESOLUTION}...`);
    const downloadResponse = UrlFetchApp.fetch(`${API_BASE_URL}/download`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; YT-Email-Downloader)'
      },
      payload: JSON.stringify({ url: videoUrl, resolution: DEFAULT_RESOLUTION }),
      muteHttpExceptions: true
    });
    
    if (downloadResponse.getResponseCode() !== 200) {
      const errorMsg = downloadResponse.getContentText();
      throw new Error(`Download API failed (${downloadResponse.getResponseCode()}): ${errorMsg}`);
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
      replyToSender(message, info, replyData, processedLabel, blob);
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
      replyToSender(message, info, replyData, processedLabel, null, file);
    }
    
    console.log(`  ✅ SUCCESS: ${info.title}`);
    return { success: true, info, sender: senderEmail, url: videoUrl, ...replyData };
    
  } catch (error) {
    console.error(`  ❌ FAILED: ${error.message}`);
    replyToSender(message, null, { error: error.message, videoUrl }, processedLabel);
    return { success: false, error: error.message, sender: senderEmail, url: videoUrl };
  }
}

/**
 * Reply to sender with download/result
 */
function replyToSender(message, info, result, processedLabel, attachment = null, driveFile = null) {
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
      <hr><p><em>YT Email Downloader • <a href="https://youtube.com/watch?v=dQw4w9WgXcQ">Test</a></em></p>
    `;
    
  } else if (result.error) {
    // ❌ Error
    htmlBody = `
      <h2 style="color: #f44336;">❌ Download Failed</h2>
      <p><strong>URL:</strong> ${escapeHtml(result.videoUrl || 'Unknown')}</p>
      <p><strong>Error:</strong> ${escapeHtml(result.error)}</p>
      <p>💡 Try a <a href="https://www.youtube.com/watch?v=dQw4w9WgXcQ">public video</a> to test.</p>
      <hr><p><em>YT Email Downloader</em></p>
    `;
    
  } else if (result.method === 'attachment') {
    // 📎 Attachment
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
    
    // Reply WITH attachment
    GmailApp.sendEmail(
      extractEmail(message.getFrom()),
      subject,
      `Video downloaded: ${info.title}`,
      {
        htmlBody: htmlBody,
        attachments: [attachment]
      }
    );
    return;
    
  } else {
    // 💾 Drive
    htmlBody = `
      <div style="font-family: Arial; max-width: 600px;">
        <h1 style="color: #2196F3;">💾 Video Ready!</h1>
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
        <div style="background: #fff3e0; padding: 15px; border-radius: 8px;">
          <p><strong>🔒 Access:</strong> You + me only</p>
        </div>
        <p>👤 ${escapeHtml(info.author)} • ⏱️ ${info.duration} • 📁 ${DEFAULT_RESOLUTION}</p>
        <hr><p><em>YT Email Downloader 🚀</em></p>
      </div>
    `;
  }
  
  // Reply WITHOUT attachment
  if (!result.method || result.method !== 'attachment') {
    GmailApp.sendEmail(
      extractEmail(message.getFrom()),
      subject,
      result.skipped ? `Video skipped: ${info?.title || 'Too long'}` : 
                      result.error ? `Download failed` : 
                      `Video ready in Drive: ${info.title}`,
      { htmlBody: htmlBody }
    );
  }
}

// ================================
// 🔍 API HELPERS
// ================================

function getVideoInfo(videoUrl) {
  const response = UrlFetchApp.fetch(
    `${API_BASE_URL}/info?url=${encodeURIComponent(videoUrl)}`,
    { 
      muteHttpExceptions: true,
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      'followRedirects': true
    }
  );
  
  if (response.getResponseCode() !== 200) {
    throw new Error(`HTTP ${response.getResponseCode()}: ${response.getContentText().substring(0, 200)}`);
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
    if (recipientEmail && recipientEmail.trim() && 
        recipientEmail !== Session.getActiveUser().getEmail()) {
      file.addViewer(recipientEmail);
      console.log(`  🔒 Shared with: ${recipientEmail}`);
    }
  } catch (error) {
    console.error('  ⚠️ Sharing failed:', error);
  }
}

function extractEmail(fromString) {
  const match = fromString.match(/<(.+?)>/);
  return match ? match[1] : fromString.split(' ').pop().replace(/[^\w@.-]+/g, '');
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
    html += `<li>${escapeHtml(r.info?.title || 'Unknown')} → ${r.sender} (${r.method})</li>`;
  });
  html += '</ul>';
  
  if (skipped > 0) {
    html += `<h3 style="color: #ff9800;">⏭️ Skipped:</h3><ul>`;
    results.filter(r => r.skipped).forEach(r => {
      html += `<li>${escapeHtml(r.info?.title || 'Unknown')}: ${r.reason}</li>`;
    });
    html += '</ul>';
  }
  
  if (failed > 0) {
    html += `<h3 style="color: #f44336;">❌ Failed:</h3><ul>`;
    results.filter(r => !r.success && !r.skipped).forEach(r => {
      html += `<li>${escapeHtml(r.url || 'Unknown')}<br><small>${r.error}</small></li>`;
    });
    html += '</ul>';
  }
  
  html += `<p><em>Processed: ${new Date().toLocaleString()}</em></p>`;
  
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
    
  console.log('✅ Hourly trigger: Every hour');
}

function quickSetup() {
  console.log('🔧 YT Email Downloader Setup...');
  
  // Setup label
  try {
    let label = GmailApp.getUserLabelByName('yt-processed');
    if (!label) {
      label = GmailApp.createLabel('yt-processed');
      console.log('✅ Created "yt-processed" label');
    }
  } catch (e) {
    console.log('ℹ️ Label setup OK');
  }
  
  // Setup trigger
  setupHourlyTrigger();
  
  // Send test email
  testWithSampleEmail();
  
  console.log('🎉 Setup complete!');
  console.log('📧 Test email sent - run processYtEmails() to test now!');
}

// ================================
// 🧪 TESTS
// ================================

function testWithSampleEmail() {
  const testUrls = [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ'  // Rickroll - PUBLIC
  ];
  
  const testBody = `
    Please download these videos:
    ${testUrls.map(url => `• ${url}`).join('\n')}
    
    Thanks!
  `;
  
  GmailApp.sendEmail(
    Session.getActiveUser().getEmail(),
    'yt test - rickroll',
    testBody,
    { 
      htmlBody: testBody.replace(/\n/g, '<br>'),
      name: 'YT Email Downloader Test'
    }
  );
  
  console.log('✅ Test email sent with PUBLIC Rickroll video');
  console.log('⏳ Run processYtEmails() to process immediately');
  console.log('📧 Check Gmail for: "yt test - rickroll"');
}

function showRecentYtEmails() {
  const threads = GmailApp.search('subject:yt -in:trash', 0, 10);
  console.log(`📧 Recent "yt" emails: ${threads.length}`);
  
  threads.forEach((thread, i) => {
    const msg = thread.getMessages()[0];
    const urls = extractYouTubeUrls(msg.getBody());
    const labels = msg.getLabels ? msg.getLabels().map(l => l.getName()) : [];
    const processed = labels.includes('yt-processed');
    
    console.log(`\n${i+1}. ${msg.getSubject()} ${processed ? '[✅ PROCESSED]' : '[⏳ PENDING]'}`);
    console.log(`   From: ${msg.getFrom()}`);
    console.log(`   URLs: ${urls.length > 0 ? urls.join(', ') : 'None found'}`);
    console.log(`   Date: ${msg.getDate().toLocaleString()}`);
    console.log(`   Labels: ${labels.join(', ') || 'None'}`);
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
  const map = { 
    '&': '&amp;', 
    '<': '&lt;', 
    '>': '&gt;', 
    '"': '&quot;', 
    "'": '&#039;',
    '\n': '<br>'
  };
  return text.replace(/[&<>"'\n]/g, m => map[m]);
}