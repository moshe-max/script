// 🎥 YOUTUBE DOWNLOADER - WORKING VERSION
const API_BASE_URL = 'https://yt-downloader-api-2rhl.onrender.com';
const MY_EMAIL = 'grossmoshe999@gmail.com'; // ← CHANGE THIS!

// 🧪 TEST FUNCTIONS - RUN IN ORDER
function test1_healthCheck() {
  const response = UrlFetchApp.fetch(`${API_BASE_URL}/health`);
  const data = JSON.parse(response.getContentText());
  console.log('✅ API Status:', data.status);
  return data;
}

function test2_videoInfo() {
  const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
  const response = UrlFetchApp.fetch(`${API_BASE_URL}/info?url=${encodeURIComponent(url)}`);
  const data = JSON.parse(response.getContentText());
  console.log('✅ Video:', data.title, '- Views:', data.views);
  return data;
}

function test3_fullPipeline() {
  try {
    // 1. Get info
    const info = test2_videoInfo();
    
    // 2. Test download (just check it works)
    const payload = { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', resolution: '360p' };
    const downloadResponse = UrlFetchApp.fetch(`${API_BASE_URL}/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      payload: JSON.stringify(payload)
    });
    
    console.log('✅ Download status:', downloadResponse.getResponseCode());
    console.log('🎉 FULL PIPELINE WORKS!');
    
    // 3. Send test email
    MailApp.sendEmail(MY_EMAIL, '🎥 API Test SUCCESS', 
      `Your API works!\n\nVideo: ${info.title}\nViews: ${info.views}`);
    
  } catch (error) {
    console.error('❌ Pipeline failed:', error);
  }
}

// 🔑 AUTHORIZE FIRST
function authorizeAll() {
  MailApp.sendEmail(MY_EMAIL, '🔑 Authorization', 'Grant permissions');
  DriveApp.getRootFolder();
  console.log('✅ Permissions granted! Run test3_fullPipeline() next');
}

// 🛠️ MAIN DOWNLOAD FUNCTION
function downloadVideoWithEmail(youtubeUrl, resolution = '720p') {
  try {
    console.log('🎬 Starting download:', youtubeUrl);
    
    // 1. Get video info
    const infoResponse = UrlFetchApp.fetch(`${API_BASE_URL}/info?url=${encodeURIComponent(youtubeUrl)}`);
    const info = JSON.parse(infoResponse.getContentText());
    
    // 2. Download video
    const payload = { url: youtubeUrl, resolution: resolution };
    const downloadResponse = UrlFetchApp.fetch(`${API_BASE_URL}/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      payload: JSON.stringify(payload)
    });
    
    if (downloadResponse.getResponseCode() !== 200) {
      throw new Error(`Download failed: ${downloadResponse.getContentText()}`);
    }
    
    // 3. Save to Drive
    const blob = downloadResponse.getBlob().setName(`${info.title} [${resolution}].mp4`);
    const file = DriveApp.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    // 4. Email result
    const downloadLink = `https://drive.google.com/uc?export=download&id=${file.getId()}`;
    const subject = `🎥 Download Ready: ${info.title}`;
    const body = `
🎬 VIDEO DOWNLOADED!

📺 Title: ${info.title}
👤 Author: ${info.author}
⏱️ Duration: ${info.duration_formatted}
👀 Views: ${info.views.toLocaleString()}

⬇️ DOWNLOAD: ${downloadLink}

Saved to your Google Drive!
    `;
    
    MailApp.sendEmail(MY_EMAIL, subject, body);
    
    console.log('✅ SUCCESS! Email sent.');
    return { success: true, fileId: file.getId(), downloadLink };
    
  } catch (error) {
    console.error('❌ FAILED:', error);
    MailApp.sendEmail(MY_EMAIL, '⚠️ Download Failed', 
      `Failed to download ${youtubeUrl}\n\nError: ${error.toString()}`);
    throw error;
  }
}