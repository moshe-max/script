// ================================
// 🎥 AUTO YT EMAIL DOWNLOADER v5.4 - EXACT "yt" SUBJECT
// Only triggers on emails with EXACT subject: "yt"
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
 * 🎯 MAIN: Scan EXACT "yt" subject emails → Download → Reply
 */
function processYtEmails() {
  console.log('🔍 Scanning Gmail for EXACT "yt" subject emails...');
  
  try {
    // 🔥 EXACT "yt" SUBJECT ONLY
    const searchQuery = 'subject:"yt" -in:trash -label:yt-processed';
    const threads = GmailApp.search(searchQuery, 0, 20);
    console.log(`📧 Found ${threads.length} EXACT "yt" threads`);
    
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
        // Check if thread already processed
        const threadLabels = thread.getLabels().map(label => label.getName());
        if (threadLabels.includes('yt-processed')) {
          console.log(`\n📧 Thread ${threadIndex + 1}: ${thread.getFirstMessageSubject()} [ALREADY PROCESSED]`);
          return;
        }
        
        console.log(`\n📧 Thread ${threadIndex + 1}: "${thread.getFirstMessageSubject()}" ✅ EXACT MATCH`);
        
        const messages = thread.getMessages();
        let threadHasUrls = false;
        
        messages.forEach((message, msgIndex) => {
          // Extract YouTube URLs
          const urls = extractYouTubeUrls(message.getBody());
          console.log(`  📧 Message ${msgIndex + 1} from ${message.getFrom()}: ${urls.length} URLs`);
          
          if (urls.length === 0) {
            console.log(`  ⚠️ No URLs found in message ${msgIndex + 1}`);
            return;
          }
          
          threadHasUrls = true;
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
                sender: extractEmail(message.getFrom()),
                threadId: thread.getId(),
                messageId: message.getId()
              });
              failed++;
            }
          });
        });
        
        // Label ENTIRE THREAD after processing
        if (threadHasUrls) {
          thread.addLabel(processedLabel);
          console.log(`  ✅ THREAD LABELED: yt-processed`);
        } else {
          console.log(`  ℹ️ No URLs found - thread NOT labeled`);
        }
        
      } catch (threadError) {
        console.error(`❌ Thread ${threadIndex + 1} failed:`, threadError);
      }
    });
    
    // Summary
    console.log(`\n📊 FINAL SUMMARY (EXACT "yt" subject):`);
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
// 📥 EMAIL PROCESSING (UNCHANGED)
// ================================

/**
 * Extract YouTube URLs from email body
 */
function extractYouTubeUrls(emailBody) {
  // Convert HTML to plain text for better URL extraction
  const plainText = emailBody
    .replace(/<[^>]*>/g, ' ')  // Remove HTML tags
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');     // Normalize whitespace
  
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
function downloadAndReply(message, videoUrl) {
  const senderEmail = extractEmail(message.getFrom());
  console.log(`⬇️ Processing for ${senderEmail}: ${videoUrl}`);
  
  try {
    // 1. Get video info
    let info;
    try {
      info = getVideoInfo(videoUrl);
      console.log(`  ✅ Video: ${info.title.substring(0, 50)}... (${info.duration})`);
    } catch (infoError) {
      const errorMsg = infoError.message;
      console.log(`  ❌ Video unavailable: ${errorMsg}`);
      
      if (errorMsg.includes('Video not found') || 
          errorMsg.includes('private') ||
          errorMsg.includes('unavailable')) {
        replyToSender(message, null, { 
          error: 'Video unavailable (private/deleted/unlisted)', 
          videoUrl 
        });
        return { success: false, error: errorMsg, sender: senderEmail, url: videoUrl };
      }
      throw infoError;
    }
    
    // 2. Check duration limit
    if (info.length > MAX_DURATION_MINUTES * 60) {
      const reason = `Too long (${formatDuration(info.length)} > ${MAX_DURATION_MINUTES}min)`;
      console.log(`  ⏭️ Skipped: ${reason}`);
      replyToSender(message, info, { skipped: true, reason });
      return { success: false, skipped: true, reason, info, sender: senderEmail, url: videoUrl };
    }
    
    // 3. Download video
    console.log(`  ⬇️ Downloading ${DEFAULT_RESOLUTION}...`);
    const downloadResponse = UrlFetchApp.fetch(`${API_BASE_URL}/download`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      payload: JSON.stringify({ 
        url: videoUrl, 
        resolution: DEFAULT_RESOLUTION 
      }),
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
    
    console.log(`  ✅ SUCCESS: ${info.title.substring(0, 30)}...`);
    return { success: true, info, sender: senderEmail, url: videoUrl, ...replyData };
    
  } catch (error) {
    console.error(`  ❌ FAILED: ${error.message}`);
    replyToSender(message, null, { error: error.message, videoUrl });
    return { success: false, error: error.message, sender: senderEmail, url: videoUrl };
  }
}

// ================================
// 📧 REPLY FUNCTION (UNCHANGED)
// ================================

function replyToSender(message, info, result, attachment = null, driveFile = null) {
  const senderEmail = extractEmail(message.getFrom());
  const subject = `Re: ${message.getSubject()}`;
  
  let htmlBody, plainText;
  
  if (result.skipped) {
    htmlBody = `
      <h2 style="color: #ff9800;">⏭️ Video Skipped</h2>
      <p><strong>${escapeHtml(info.title)}</strong></p>
      <p style="color: #ff9800;"><em>${escapeHtml(result.reason)}</em></p>
      <p>👤 ${escapeHtml(info.author)} • ⏱️ ${info.duration}</p>
      <p><a href="${info.url}" target="_blank">▶️ Watch on YouTube</a></p>
      <hr><p><em>YT Email Downloader • Subject: <strong>"yt"</strong> only</em></p>
    `;
    plainText = `Video skipped: ${info.title}\nReason: ${result.reason}`;
    
  } else if (result.error) {
    htmlBody = `
      <h2 style="color: #f44336;">❌ Download Failed</h2>
      <p><strong>URL:</strong> ${escapeHtml(result.videoUrl)}</p>
      <p><strong>Error:</strong> ${escapeHtml(result.error)}</p>
      <p>💡 Use <strong>exact subject "yt"</strong> for future requests</p>
      <hr><p><em>YT Email Downloader</em></p>
    `;
    plainText = `Download failed for ${result.videoUrl}\nError: ${result.error}`;
    
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
        <hr><p><em>YT Email Downloader 🚀 • Subject: <strong>"yt"</strong></em></p>
      </div>
    `;
    plainText = `Video attached: ${info.title}\n${attachment.getName()} (${result.sizeMB}MB)`;
    
    MailApp.sendEmail({
      to: senderEmail,
      subject: subject,
      body: plainText,
      htmlBody: htmlBody,
      attachments: [attachment]
    });
    return;
    
  } else {
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
        <p>👤 ${escapeHtml(info.author)} • ⏱️ ${info.duration} • 📁 ${DEFAULT_RESOLUTION}</p>
        <hr><p><em>YT Email Downloader 🚀 • Subject: <strong>"yt"</strong></em></p>
      </div>
    `;
    plainText = `Video ready in Drive: ${info.title}\n${result.driveUrl}`;
  }
  
  MailApp.sendEmail({
    to: senderEmail,
    subject: subject,
    body: plainText || `Video processed: ${info?.title || 'Error/Skipped'}`,
    htmlBody: htmlBody
  });
}

// ================================
// 🔍 API HELPERS (UNCHANGED)
// ================================

function getVideoInfo(videoUrl) {
  const response = UrlFetchApp.fetch(
    `${API_BASE_URL}/info?url=${encodeURIComponent(videoUrl)}`,
    { 
      muteHttpExceptions: true,
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    }
  );
  
  if (response.getResponseCode() !== 200) {
    throw new Error(`HTTP ${response.getResponseCode()}`);
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
// 📧 NOTIFICATIONS + AUTOMATION
// ================================

function sendSummaryEmail(success, skipped, failed, results) {
  let html = `
    <h2>📊 YT Email Processing Summary</h2>
    <p><strong>EXACT "yt" subject only</strong></p>
    <p><strong>${success}✅ ${skipped}⏭️ ${failed}❌</strong></p>
  `;
  
  if (success > 0) {
    html += `<h3>✅ Successful:</h3><ul>`;
    results.filter(r => r.success).forEach(r => {
      html += `<li>${escapeHtml(r.info?.title || 'Unknown')} → ${r.sender} (${r.method})</li>`;
    });
    html += '</ul>';
  }
  
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
  
  html += `<p><em>${new Date().toLocaleString()}</em></p>`;
  
  MailApp.sendEmail({
    to: Session.getActiveUser().getEmail(),
    subject: `📧 YT Emails (exact "yt"): ${success}/${success+skipped+failed}`,
    htmlBody: html
  });
}

function sendAdminAlert(subject, error) {
  MailApp.sendEmail({
    to: Session.getActiveUser().getEmail(),
    subject: `🚨 ${subject}`,
    body: `Error: ${error}\nTime: ${new Date()}`
  });
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
    
  console.log('✅ Hourly trigger: Exact "yt" subject every hour');
}

function quickSetup() {
  console.log('🔧 EXACT "yt" Setup...');
  
  // Create label
  try {
    GmailApp.createLabel('yt-processed');
    console.log('✅ Label created');
  } catch (e) {
    console.log('ℹ️ Label exists');
  }
  
  // Setup trigger
  setupHourlyTrigger();
  
  // Test email with EXACT "yt"
  testWithExactYtEmail();
  
  console.log('🎉 Setup complete!');
  console.log('📧 USE EXACT SUBJECT: "yt" (no other text!)');
}

// ================================
// 🧪 TESTS - EXACT "yt"
// ================================

function testWithExactYtEmail() {
  const testBody = `
    Download this video:
    https://www.youtube.com/watch?v=dQw4w9WgXcQ
    
    Exact subject "yt" required!
  `;
  
  GmailApp.sendEmail(
    Session.getActiveUser().getEmail(),
    'yt',  // ← EXACT "yt" subject!
    testBody,
    { htmlBody: testBody.replace(/\n/g, '<br>') }
  );
  
  console.log('✅ EXACT "yt" test email sent!');
  console.log('⏳ Run processYtEmails() to process it!');
  console.log('📧 Check Gmail for subject: "yt"');
}

function testWithWrongSubject() {
  // This will NOT trigger!
  GmailApp.sendEmail(
    Session.getActiveUser().getEmail(),
    'yt test wrong',  // ← Contains "yt" but NOT exact
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    { htmlBody: 'Test with wrong subject - should NOT process!' }
  );
  
  console.log('✅ Wrong subject test sent: "yt test wrong"');
  console.log('ℹ️ This will NOT be processed (exact "yt" required)');
}

function showRecentYtEmails() {
  // Show EXACT "yt"
  const exactThreads = GmailApp.search('subject:"yt" -in:trash', 0, 10);
  console.log(`📧 EXACT "yt" emails (${exactThreads.length}):`);
  
  exactThreads.forEach((thread, i) => {
    const labels = thread.getLabels().map(l => l.getName());
    const processed = labels.includes('yt-processed');
    const msg = thread.getMessages()[0];
    const urls = extractYouTubeUrls(msg.getBody());
    
    console.log(`\n${i+1}. "${msg.getSubject()}" ${processed ? '[✅ PROCESSED]' : '[⏳ PENDING]'}`);
    console.log(`   From: ${msg.getFrom()}`);
    console.log(`   URLs: ${urls.join(', ')}`);
    console.log(`   Labels: ${labels.join(', ') || 'none'}`);
  });
  
  // Show partial matches (for comparison)
  const partialThreads = GmailApp.search('subject:yt -subject:"yt" -in:trash', 0, 5);
  console.log(`\n📧 Partial "yt" matches (${partialThreads.length}) - NOT PROCESSED:`);
  
  partialThreads.forEach((thread, i) => {
    const msg = thread.getMessages()[0];
    console.log(`\n${i+1}. "${msg.getSubject()}" ← IGNORED (not exact)`);
    console.log(`   From: ${msg.getFrom()}`);
  });
}

// ================================
// 🛠️ UTILITIES (UNCHANGED)
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
  return text.toString().replace(/[&<>"'\n]/g, m => map[m]);
}