// ================================
// 🎥 AUTO YT EMAIL DOWNLOADER v5.5 - EXACT "yt" + FAILURES MARKED
// Only EXACT "yt" subject • Marks PROCESSED on ANY URL (success/fail)
// ================================

// 🔧 CONFIGURATION
const API_BASE_URL = 'https://yt-downloader-api-2rhl.onrender.com';
const MAX_DURATION_MINUTES = 20;
const MAX_ATTACHMENT_MB = 25;
const DEFAULT_RESOLUTION = '360p';

// ================================
// 🚀 MAIN FUNCTION - FIXED MARKING
// ================================

/**
 * 🎯 MAIN: EXACT "yt" → Process ALL URLs → Mark PROCESSED (even failures)
 */
function processYtEmails() {
  console.log('🔍 Scanning Gmail for EXACT "yt" subject emails...');
  
  try {
    // 🔥 EXACT "yt" SUBJECT ONLY
    const searchQuery = 'subject:"yt" -in:trash -label:yt-processed';
    const threads = GmailApp.search(searchQuery, 0, 20);
    console.log(`📧 Found ${threads.length} EXACT "yt" unprocessed threads`);
    
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
        // Skip if already processed
        const threadLabels = thread.getLabels().map(label => label.getName());
        if (threadLabels.includes('yt-processed')) {
          console.log(`\n📧 Thread ${threadIndex + 1}: ${thread.getFirstMessageSubject()} [ALREADY PROCESSED]`);
          return;
        }
        
        console.log(`\n📧 Thread ${threadIndex + 1}: "${thread.getFirstMessageSubject()}" ✅ EXACT "yt" MATCH`);
        
        const messages = thread.getMessages();
        let threadHasUrls = false;  // Track if ANY URLs found
        let threadProcessedCount = 0;  // Count URLs processed
        
        messages.forEach((message, msgIndex) => {
          // Extract YouTube URLs
          const urls = extractYouTubeUrls(message.getBody());
          console.log(`  📧 Message ${msgIndex + 1} from ${message.getFrom()}: ${urls.length} URLs`);
          
          if (urls.length === 0) {
            console.log(`  ⚠️ No URLs in message ${msgIndex + 1}`);
            return;
          }
          
          // 🔥 URLs FOUND = MARK THREAD PROCESSED (even if they fail)
          threadHasUrls = true;
          
          // Process each URL
          urls.forEach((url, urlIndex) => {
            threadProcessedCount++;
            try {
              console.log(`    ⬇️ [${urlIndex + 1}/${urls.length}] ${url}`);
              const result = downloadAndReply(message, url);
              results.push({ ...result, threadId: thread.getId(), messageId: message.getId() });
              
              if (result.success) success++;
              else if (result.skipped) skipped++;
              else failed++;
              
              processed++;  // Count every URL attempt
              
              // Rate limit
              Utilities.sleep(5000);
              
            } catch (urlError) {
              console.error(`    ❌ URL CRASH: ${url}`, urlError);
              results.push({ 
                success: false, 
                error: urlError.toString(), 
                url, 
                sender: extractEmail(message.getFrom()),
                threadId: thread.getId(),
                messageId: message.getId()
              });
              failed++;
              processed++;
            }
          });
        });
        
        // 🔥 CRITICAL FIX: Mark PROCESSED if ANY URLs found (success OR fail)
        if (threadHasUrls) {
          thread.addLabel(processedLabel);
          console.log(`  ✅ THREAD MARKED PROCESSED (${threadProcessedCount} URLs processed)`);
        } else {
          console.log(`  ℹ️ NO URLs found - thread NOT marked`);
        }
        
      } catch (threadError) {
        console.error(`❌ Thread ${threadIndex + 1} CRASHED:`, threadError);
        // Even on thread crash, try to mark if we found URLs
        try {
          if (threadHasUrls) {
            thread.addLabel(processedLabel);
            console.log(`  ✅ THREAD EMERGENCY MARKED (crash recovery)`);
          }
        } catch (markError) {
          console.error(`  ❌ Could not mark thread:`, markError);
        }
      }
    });
    
    // Summary
    console.log(`\n📊 FINAL SUMMARY (EXACT "yt" subject):`);
    console.log(`✅ Success: ${success}`);
    console.log(`⏭️ Skipped: ${skipped}`); 
    console.log(`❌ Failed: ${failed}`);
    console.log(`📧 Total URLs: ${processed}`);
    
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
// 📥 EMAIL PROCESSING (IMPROVED ERROR HANDLING)
// ================================

/**
 * Extract YouTube URLs from email body
 */
function extractYouTubeUrls(emailBody) {
  try {
    // Convert HTML to plain text
    const plainText = emailBody
      .replace(/<[^>]*>/g, ' ')  // Remove HTML
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
  } catch (error) {
    console.error('❌ URL extraction failed:', error);
    return [];
  }
}

/**
 * Download video → Reply to sender
 */
function downloadAndReply(message, videoUrl) {
  const senderEmail = extractEmail(message.getFrom());
  console.log(`⬇️ Processing: ${videoUrl}`);
  
  try {
    // 1. Get video info
    let info;
    try {
      info = getVideoInfo(videoUrl);
      console.log(`  ✅ Video OK: ${info.title.substring(0, 50)}... (${info.duration})`);
    } catch (infoError) {
      const errorMsg = infoError.message;
      console.log(`  ❌ Video FAILED: ${errorMsg}`);
      
      replyToSender(message, null, { 
        error: 'Video unavailable (private/deleted/unlisted)', 
        videoUrl 
      });
      return { 
        success: false, 
        error: `Video unavailable: ${errorMsg}`, 
        sender: senderEmail, 
        url: videoUrl 
      };
    }
    
    // 2. Check duration
    if (info.length > MAX_DURATION_MINUTES * 60) {
      const reason = `Too long (${formatDuration(info.length)} > ${MAX_DURATION_MINUTES}min)`;
      console.log(`  ⏭️ SKIPPED: ${reason}`);
      replyToSender(message, info, { skipped: true, reason });
      return { success: false, skipped: true, reason, info, sender: senderEmail, url: videoUrl };
    }
    
    // 3. Download
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
      console.log(`  ❌ Download FAILED (${downloadResponse.getResponseCode()}): ${errorMsg}`);
      throw new Error(`Download failed: ${errorMsg}`);
    }
    
    const blob = downloadResponse.getBlob();
    const fileSizeMB = blob.getBytes().length / 1024 / 1024;
    const fileName = `${info.title.substring(0, 50)} [${DEFAULT_RESOLUTION}].mp4`;
    blob.setName(fileName);
    
    console.log(`  📁 Downloaded: ${fileSizeMB.toFixed(1)}MB`);
    
    // 4. Smart delivery
    if (fileSizeMB <= MAX_ATTACHMENT_MB) {
      console.log(`  📎 ATTACHMENT (${fileSizeMB.toFixed(1)}MB)`);
      replyToSender(message, info, { method: 'attachment', sizeMB: fileSizeMB.toFixed(1) }, blob);
      return { success: true, info, sender: senderEmail, url: videoUrl, method: 'attachment', sizeMB: fileSizeMB.toFixed(1) };
    } else {
      console.log(`  💾 DRIVE (${fileSizeMB.toFixed(1)}MB)`);
      const file = DriveApp.createFile(blob);
      setPrivateSharing(file, senderEmail);
      replyToSender(message, info, { 
        method: 'drive', 
        driveUrl: file.getUrl(),
        sizeMB: fileSizeMB.toFixed(1)
      }, null, file);
      return { success: true, info, sender: senderEmail, url: videoUrl, method: 'drive', sizeMB: fileSizeMB.toFixed(1) };
    }
    
  } catch (error) {
    console.error(`  ❌ TOTAL FAIL: ${error.message}`);
    replyToSender(message, null, { error: error.message, videoUrl });
    return { success: false, error: error.message, sender: senderEmail, url: videoUrl };
  }
}

// ================================
// 📧 REPLY FUNCTION
// ================================

function replyToSender(message, info, result, attachment = null, driveFile = null) {
  const senderEmail = extractEmail(message.getFrom());
  const subject = `Re: ${message.getSubject()}`;
  
  let htmlBody, plainText;
  
  if (result.skipped) {
    // ⏭️ Skipped
    htmlBody = `
      <h2 style="color: #ff9800;">⏭️ Video Skipped</h2>
      <p><strong>${escapeHtml(info.title)}</strong></p>
      <p style="color: #ff9800;"><em>${escapeHtml(result.reason)}</em></p>
      <hr><p><em>Exact subject "<strong>yt</strong>" required</em></p>
    `;
    plainText = `Skipped: ${info.title} - ${result.reason}`;
    
  } else if (result.error) {
    // ❌ Error
    htmlBody = `
      <h2 style="color: #f44336;">❌ Failed</h2>
      <p><strong>URL:</strong> ${escapeHtml(result.videoUrl)}</p>
      <p><strong>Error:</strong> ${escapeHtml(result.error)}</p>
      <p>💡 Use <strong>exact subject "yt"</strong></p>
      <hr><p><em>YT Email Downloader</em></p>
    `;
    plainText = `Failed: ${result.videoUrl} - ${result.error}`;
    
  } else if (result.method === 'attachment') {
    // 📎 Success
    htmlBody = `
      <div style="font-family: Arial; max-width: 600px;">
        <h1 style="color: #4CAF50;">✅ VIDEO ATTACHED!</h1>
        <div style="background: #e8f5e8; padding: 20px; border-radius: 10px;">
          <h2>📎 ${escapeHtml(info.title)}</h2>
          <p>📎 ${attachment.getName()} (${result.sizeMB}MB)</p>
        </div>
        <img src="${info.thumbnail}" style="max-width: 400px; border-radius: 10px;">
        <p>👤 ${escapeHtml(info.author)} • ⏱️ ${info.duration}</p>
        <hr><p><em>Subject: "<strong>yt</strong>"</em></p>
      </div>
    `;
    plainText = `Video attached: ${info.title}`;
    
    MailApp.sendEmail({
      to: senderEmail,
      subject: subject,
      body: plainText,
      htmlBody: htmlBody,
      attachments: [attachment]
    });
    return;
  } else {
    // 💾 Drive
    htmlBody = `
      <div style="font-family: Arial; max-width: 600px;">
        <h1 style="color: #2196F3;">💾 DRIVE LINK</h1>
        <div style="background: #e3f2fd; padding: 20px; border-radius: 10px;">
          <h2>🔒 ${escapeHtml(info.title)}</h2>
          <p>📁 ${driveFile.getName()} (${result.sizeMB}MB)</p>
        </div>
        <a href="${result.driveUrl}" style="background: #2196F3; color: white; padding: 15px 30px; 
           text-decoration: none; border-radius: 25px; display: inline-block;">
          📁 Open Drive
        </a>
        <img src="${info.thumbnail}" style="max-width: 400px; border-radius: 10px;">
        <hr><p><em>Subject: "<strong>yt</strong>"</em></p>
      </div>
    `;
    plainText = `Drive link: ${result.driveUrl}`;
  }
  
  MailApp.sendEmail({
    to: senderEmail,
    subject: subject,
    body: plainText,
    htmlBody: htmlBody
  });
}

// ================================
// 🔍 API + UTILITIES (UNCHANGED)
// ================================

function getVideoInfo(videoUrl) {
  const response = UrlFetchApp.fetch(
    `${API_BASE_URL}/info?url=${encodeURIComponent(videoUrl)}`,
    { 
      muteHttpExceptions: true,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    }
  );
  
  if (response.getResponseCode() !== 200) {
    throw new Error(`HTTP ${response.getResponseCode()}`);
  }
  
  const data = JSON.parse(response.getContentText());
  if (!data.success) {
    throw new Error(data.error || 'API error');
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
  } catch (error) {
    console.error('Sharing failed:', error);
  }
}

function extractEmail(fromString) {
  const match = fromString.match(/<(.+?)>/);
  return match ? match[1] : fromString.split(' ').pop().replace(/[^\w@.-]+/g, '');
}

function formatDuration(seconds) {
  if (!seconds) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function escapeHtml(text) {
  if (!text) return '';
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;', '\n': '<br>' };
  return text.toString().replace(/[&<>"'\n]/g, m => map[m]);
}

// ================================
// 📧 SUMMARY + AUTOMATION
// ================================

function sendSummaryEmail(success, skipped, failed, results) {
  let html = `
    <h2>📊 YT Email Summary (EXACT "yt")</h2>
    <p><strong>${success}✅ ${skipped}⏭️ ${failed}❌</strong> URLs processed</p>
  `;
  
  if (success > 0) html += `<h3>✅ Success:</h3><ul>${results.filter(r=>r.success).map(r=>`<li>${escapeHtml(r.info?.title||'Unknown')} (${r.method})</li>`).join('')}</ul>`;
  if (skipped > 0) html += `<h3 style="color:#ff9800">⏭️ Skipped:</h3><ul>${results.filter(r=>r.skipped).map(r=>`<li>${escapeHtml(r.info?.title||'Unknown')}: ${r.reason}</li>`).join('')}</ul>`;
  if (failed > 0) html += `<h3 style="color:#f44336">❌ Failed:</h3><ul>${results.filter(r=>!r.success&&!r.skipped).map(r=>`<li>${escapeHtml(r.url||'Unknown')}: ${r.error}</li>`).join('')}</ul>`;
  
  html += `<p><em>${new Date().toLocaleString()}</em> • Exact "yt" subject only</p>`;
  
  MailApp.sendEmail({
    to: Session.getActiveUser().getEmail(),
    subject: `📧 YT: ${success}/${success+skipped+failed}`,
    htmlBody: html
  });
}

function quickSetup() {
  console.log('🔧 EXACT "yt" Setup...');
  
  try {
    GmailApp.createLabel('yt-processed');
    console.log('✅ Label created');
  } catch (e) { console.log('ℹ️ Label exists'); }
  
  setupHourlyTrigger();
  testWithExactYtEmail();
  
  console.log('🎉 Setup done! USE EXACT SUBJECT: "yt"');
}

function setupHourlyTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'processYtEmails') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('processYtEmails').timeBased().everyHours(1).create();
  console.log('✅ Hourly trigger: Exact "yt" only');
}

function testWithExactYtEmail() {
  GmailApp.sendEmail(
    Session.getActiveUser().getEmail(),
    'yt',  // EXACT "yt"
    'Test: https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    { htmlBody: 'Test: <a href="https://www.youtube.com/watch?v=dQw4w9WgXcQ">Rickroll</a>' }
  );
  console.log('✅ EXACT "yt" test sent → Run processYtEmails()');
}

function showRecentYtEmails() {
  const threads = GmailApp.search('subject:"yt" -in:trash', 0, 10);
  console.log(`📧 EXACT "yt" emails (${threads.length}):`);
  threads.forEach((t,i) => {
    const labels = t.getLabels().map(l=>l.getName());
    const msg = t.getMessages()[0];
    const urls = extractYouTubeUrls(msg.getBody());
    console.log(`\n${i+1}. "${msg.getSubject()}" ${labels.includes('yt-processed') ? '[✅ PROCESSED]' : '[⏳ PENDING]'}`);
    console.log(`   From: ${msg.getFrom()}`);
    console.log(`   URLs: ${urls.join(', ') || 'None'}`);
    console.log(`   Labels: ${labels.join(', ') || 'none'}`);
  });
}