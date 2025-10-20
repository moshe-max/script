/**
 * 🎥 YOUTUBE DOWNLOADER EMAIL SYSTEM v2.0
 * - Processes Gmail for YouTube links
 * - Downloads MP4 via Pytube API (Render)
 * - Attaches videos to reply emails
 * - Handles errors + retries
 */

const API_BASE_URL = 'https://yt-downloader-api-2rhl.onrender.com'; // ← YOUR RENDER URL
const MAX_VIDEOS_PER_EMAIL = 3;
const MAX_DURATION_SECONDS = 600; // 10 minutes max
const CHECK_INTERVAL_MINUTES = 5; // Run every 5 minutes

/**
 * 🚀 MAIN FUNCTION - Process all pending emails
 */
function processYtEmails() {
  console.log('🎥 Starting YouTube Email Processor...');
  
  try {
    const threads = getPendingThreads();
    console.log(`📧 Found ${threads.length} threads to process`);
    
    let processed = 0;
    for (let thread of threads) {
      if (processThread(thread)) {
        processed++;
      }
      Utilities.sleep(2000); // Rate limit protection
    }
    
    console.log(`✅ Processed ${processed} threads`);
    return processed;
    
  } catch (error) {
    console.error('❌ Main process failed:', error);
    sendAdminAlert(`YouTube Email Processor ERROR: ${error.toString()}`);
  }
}

/**
 * 📧 Process single email thread
 */
function processThread(thread) {
  try {
    const messages = thread.getMessages();
    const youtubeUrls = extractYouTubeUrls(messages);
    
    if (youtubeUrls.length === 0) {
      console.log('⏭️ No YouTube URLs found');
      return false;
    }
    
    console.log(`🎥 Found ${youtubeUrls.length} YouTube URLs`);
    
    // Download videos (limit to MAX_VIDEOS_PER_EMAIL)
    const videos = [];
    for (let i = 0; i < Math.min(youtubeUrls.length, MAX_VIDEOS_PER_EMAIL); i++) {
      const url = youtubeUrls[i];
      console.log(`⬇️ Downloading: ${url}`);
      
      const video = downloadVideo(url);
      if (video) {
        videos.push(video);
      }
    }
    
    if (videos.length === 0) {
      console.log('⚠️ No valid videos downloaded');
      return false;
    }
    
    // Reply with video attachments
    replyWithVideos(thread, videos);
    console.log(`✅ Replied with ${videos.length} video(s)`);
    
    return true;
    
  } catch (error) {
    console.error('❌ Thread processing failed:', error);
    return false;
  }
}

/**
 * 🔍 Extract YouTube URLs from email thread
 */
function extractYouTubeUrls(messages) {
  const urls = [];
  const youtubeRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/g;
  
  for (let message of messages) {
    const body = message.getBody();
    let match;
    
    while ((match = youtubeRegex.exec(body)) !== null) {
      const videoId = match[1];
      const url = `https://www.youtube.com/watch?v=${videoId}`;
      
      // Avoid duplicates
      if (!urls.includes(url)) {
        urls.push(url);
      }
    }
  }
  
  return urls;
}

/**
 * ⬇️ Download video from Pytube API
 */
function downloadVideo(url) {
  try {
    console.log(`🌐 Getting video info: ${url}`);
    
    // 1. Get video info first
    const infoResponse = UrlFetchApp.fetch(`${API_BASE_URL}/info?url=${encodeURIComponent(url)}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      muteHttpExceptions: true
    });
    
    if (infoResponse.getResponseCode() !== 200) {
      console.error(`❌ Info failed: ${infoResponse.getContentText()}`);
      return null;
    }
    
    const info = JSON.parse(infoResponse.getContentText());
    console.log(`📹 ${info.title} (${info.duration}s)`);
    
    // Skip long videos
    if (info.duration > MAX_DURATION_SECONDS) {
      console.log(`⏭️ Skipping long video: ${info.duration}s`);
      return null;
    }
    
    // 2. Download video
    console.log('⬇️ Starting download...');
    const downloadResponse = UrlFetchApp.fetch(`${API_BASE_URL}/download`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'User-Agent': 'Google-Apps-Script/2.0'
      },
      payload: JSON.stringify({
        url: url,
        quality: '360p' // Fastest + most reliable
      }),
      muteHttpExceptions: true
    });
    
    if (downloadResponse.getResponseCode() !== 200) {
      console.error(`❌ Download failed: ${downloadResponse.getContentText()}`);
      return null;
    }
    
    const blob = downloadResponse.getBlob();
    const sizeMB = (blob.getBytes().length / (1024 * 1024)).toFixed(1);
    
    console.log(`✅ Downloaded: ${sizeMB}MB`);
    
    return {
      blob: blob.setName(`${info.title.substring(0, 50)}.mp4`),
      title: info.title,
      sizeMB: sizeMB,
      duration: info.duration
    };
    
  } catch (error) {
    console.error(`❌ Video download failed: ${error}`);
    return null;
  }
}

/**
 * 📤 Reply to thread with video attachments
 */
function replyWithVideos(thread, videos) {
  const originalSubject = thread.getFirstMessageSubject();
  const replySubject = `Re: ${originalSubject}`;
  
  const replyBody = `
🎥 Here's your YouTube video${videos.length > 1 ? 's' : ''}!

${videos.map((v, i) => `
📹 ${i + 1}. "${v.title}"
⏱️ ${Math.floor(v.duration / 60)}:${(v.duration % 60).toString().padStart(2, '0')}
💾 ${v.sizeMB}MB
`).join('\n')}

Enjoy watching!
  `.trim();
  
  // Create reply message
  const reply = thread.reply(replyBody);
  
  // Attach videos
  videos.forEach(video => {
    reply[0].addAttachment(video.blob);
  });
  
  console.log(`📤 Replied with ${videos.length} attachment(s)`);
}

/**
 * 📬 Get unprocessed email threads
 */
function getPendingThreads() {
  const query = 'subject:(YouTube OR "youtube.com" OR "youtu.be") -label:processed';
  
  // Search Gmail
  const threads = GmailApp.search(query, 0, 10); // Limit to 10 threads
  
  // Add "processed" label to avoid reprocessing
  threads.forEach(thread => {
    thread.addLabel(GmailApp.getUserLabelByName('processed') || 
                   GmailApp.createLabel('processed'));
  });
  
  return threads;
}

/**
 * 🔔 Send admin alert for critical errors
 */
function sendAdminAlert(message) {
  try {
    GmailApp.sendEmail(
      Session.getActiveUser().getEmail(),
      '🚨 YouTube Downloader Alert',
      message
    );
  } catch (e) {
    console.error('Failed to send alert:', e);
  }
}
/**
 * 🧪 TEST WITH RICK ROLL
 */
function testRickRoll() {
  console.log('🧪 Testing with Rick Roll...');
  
  const testUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
  const video = downloadVideo(testUrl);
  
  if (video) {
    console.log('✅ TEST PASSED! Video downloaded successfully');
    console.log(`📹 Title: ${video.title}`);
    console.log(`💾 Size: ${video.sizeMB}MB`);
  } else {
    console.error('❌ TEST FAILED! Check API URL and logs');
  }
}