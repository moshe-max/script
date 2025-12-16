/**
 * Google Apps Script for a YouTube Downloader/Search Bot via Gmail.
 *
 * This script processes unread emails with the subject "bt".
 * 1. If the email body contains YouTube links, it downloads the videos,
 *    uploads them to Google Drive, and replies with shareable links.
 * 2. If no links are found, it performs a YouTube search and replies with interactive results.
 *
 * FEATURES:
 * - Implements role-based usage limits (admin, pro user, user, guest).
 * - Reads user roles from the "User Roles" sheet.
 * - Saves videos to Google Drive instead of email attachments
 */

// ====================================================================
// 1. CONSTANTS & CONFIGURATION
// ====================================================================

/**
 * Retrieves configuration values and role-based limits.
 */
function getConstants() {
  const YOUTUBE_API_KEY = PropertiesService.getScriptProperties().getProperty('YOUTUBE_API_KEY');

  return {
    RAILWAY_ENDPOINT: "https://yt-mail.onrender.com",
    YOUTUBE_API_BASE: "https://www.googleapis.com/youtube/v3",
    LOG_SPREADSHEET_ID: "1vxiRaNLMW5mtlrneiRBnzx0PKgvKJAmGqVnALKH6vFA",
    DRIVE_FOLDER_NAME: "YouTube Bot Downloads", // Folder name in Google Drive
    MAX_VIDEO_SIZE_MB: 100, // Max size for Drive uploads
    EMAIL_ATTACHMENT_SIZE_MB: 24, // If video is under this, send as email attachment instead

    // USAGE LIMITS (Role-based)
    ROLE_LIMITS: {
      'admin': { downloads: Infinity, searches: Infinity, maxResults: 15, label: 'Admin', quality: '720p' }, 
      'pro plus': { downloads: 25, searches: 25, maxResults: 15, label: 'Pro Plus User', quality: '720p' },
      'pro user': { downloads: 12, searches: 12, maxResults: 12, label: 'Pro User', quality: '480p' },
      'user': { downloads: 5, searches: 5, maxResults: 5, label: 'Standard User', quality: '360p' },
      'guest': { downloads: 1, searches: 5, maxResults: 5, label: 'Guest', quality: '240p' }
    },
    DEFAULT_ROLE: 'guest',
    USAGE_WINDOW_MINUTES: 1440, // 24 hours
    USAGE_SHEET_NAME: "Usage & Limits",
    ROLES_SHEET_NAME: "User Roles",
    
    STYLE: `<style>@import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap');</style>`,
    YOUTUBE_API_KEY: YOUTUBE_API_KEY
  };
}

// ====================================================================
// 2. MAIN EXECUTION FUNCTION (Trigger this function)
// ====================================================================

function processYouTubeEmails() {
  Logger.log("=== Bot started ===");

  const threads = GmailApp.search('is:unread subject:bt');
  Logger.log(`Found ${threads.length} unread thread(s) with "bt" in subject`);

  for (const thread of threads) {
    const messages = thread.getMessages();
    const message = messages[messages.length - 1]; 

    if (!message.isUnread()) continue;

    const sender = message.getFrom();
    const subject = message.getSubject();
    
    const bodyPlain = message.getPlainBody().trim();
    const bodyHtml = message.getBody(); 
    const combinedBody = bodyPlain + "\n\n" + bodyHtml;

    Logger.log(`Processing → From: ${sender} | Subject: ${subject}`);
    
    const youtubeRegex = /(https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)[A-Za-z0-9_-]{11}[^\s<>"'\]]*)/g;
    
    const links = [...new Set((combinedBody.match(youtubeRegex) || []))];

    Logger.log(`[DEBUG] Extracted Links Count: ${links.length}`);
    if (links.length > 0) {
      Logger.log(`[DEBUG] Links found: ${links.join(' | ')}`);
      handleDirectLinks(message, thread, links, sender);
    } else {
      Logger.log(`[DEBUG] No links found. Using Plain Body as Search Query: "${bodyPlain}"`);
      handleSearchQuery(message, thread, bodyPlain, sender);
    }

    thread.markRead();
  }

  Logger.log("=== Bot finished ===\n");
}

// ====================================================================
// 3. DRIVE MANAGEMENT FUNCTIONS
// ====================================================================

/**
 * Gets or creates the YouTube Bot Downloads folder in Google Drive
 */
function getOrCreateDriveFolder() {
  const C = getConstants();
  const folders = DriveApp.getFoldersByName(C.DRIVE_FOLDER_NAME);
  
  if (folders.hasNext()) {
    return folders.next();
  } else {
    const newFolder = DriveApp.createFolder(C.DRIVE_FOLDER_NAME);
    log(`Created new Drive folder: ${C.DRIVE_FOLDER_NAME}`);
    return newFolder;
  }
}

/**
 * Uploads a blob to Google Drive and returns the shareable link
 */
function uploadToDrive(blob, fileName) {
  try {
    const folder = getOrCreateDriveFolder();
    const file = folder.createFile(blob.setName(fileName));
    
    // Set sharing to anyone with the link can view
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    const shareableLink = file.getUrl();
    log(`Uploaded to Drive: ${fileName}`);
    
    return {
      success: true,
      link: shareableLink,
      fileId: file.getId(),
      size: blob.getBytes().length
    };
  } catch (e) {
    log(`Drive upload failed: ${e.toString()}`);
    return {
      success: false,
      error: e.toString()
    };
  }
}

// ====================================================================
// 4. CORE HANDLERS
// ====================================================================

/**
 * Handles emails containing direct YouTube links by downloading and uploading to Drive.
 */
function handleDirectLinks(message, thread, links, sender) {
  const C = getConstants();
  
  if (!C.YOUTUBE_API_KEY) {
    sendApiKeyMissingReply(message, "Download Request");
    return;
  }
  
  const userRole = getUserRole(sender);
  const roleLimits = C.ROLE_LIMITS[userRole];

  // --- USAGE CHECK & LIMIT ---
  const usageCheck = checkAndIncrementUsage(sender, 'download', links.length, userRole, roleLimits);
  if (!usageCheck.allowed) {
    sendLimitExceededReply(message, usageCheck, userRole, roleLimits);
    logToSheet({
      sender: sender,
      requestType: "Direct Links",
      queryOrUrls: links.join(", "),
      actionDetail: `Rejected: ${usageCheck.message} (Role: ${userRole})`,
      status: "LIMIT EXCEEDED"
    });
    return;
  }

  log(`Found ${links.length} direct YouTube link(s). Role: ${userRole}`);
  
  logToSheet({
    sender: sender,
    requestType: "Direct Links",
    queryOrUrls: links.join(", "),
    actionDetail: `${links.length} links requested (Role: ${userRole})`,
    status: "Request Started"
  });

  const videoResults = [];
  let totalSizeMB = 0;
  let successCount = 0;
  const attachments = []; // For email attachments if small enough
  let totalAttachmentSizeMB = 0;

  for (const url of links) {
    const videoId = url.includes("v=") ? url.split("v=")[1].substring(0, 11) : url.split("/").pop().substring(0, 11);
    log(`Attempting to download ${videoId}...`);

    try {
      // 1. Download Video Blob with quality based on user role
      const qualityParam = userRole.replace(' ', '_'); // Convert 'pro user' to 'pro_user'
      const downloadUrl = `${C.RAILWAY_ENDPOINT}/download?url=${encodeURIComponent(url)}&quality=${qualityParam}`;
      const response = UrlFetchApp.fetch(downloadUrl, { muteHttpExceptions: true });

      if (response.getResponseCode() !== 200) {
        throw new Error(`Download failed with status code ${response.getResponseCode()}`);
      }

      const blob = response.getBlob();
      const sizeMB = Math.round(blob.getBytes().length / (1024 * 1024) * 10) / 10;

      // 2. Get Video Metadata from YouTube API
      const infoUrl = `${C.YOUTUBE_API_BASE}/videos?part=snippet,statistics,contentDetails&id=${videoId}&key=${C.YOUTUBE_API_KEY}`;
      const infoRes = UrlFetchApp.fetch(infoUrl);
      const infoData = JSON.parse(infoRes.getContentText()).items[0];

      if (!infoData) throw new Error("Video metadata not found.");

      const title = (infoData.snippet.title || "Unknown Video").replace(/[\\/:*?"<>|]/g, "_").substring(0, 100);
      const channel = infoData.snippet.channelTitle || "Unknown Channel";
      const views = Number(infoData.statistics.viewCount || 0).toLocaleString();
      const uploadDate = Utilities.formatDate(new Date(infoData.snippet.publishedAt), "GMT", "MMM d, yyyy");
      const thumb = infoData.snippet.thumbnails.high.url;
      
      const isoDuration = infoData.contentDetails?.duration;
      const duration = formatDuration(isoDuration);

      const cleanFileName = `${title} - ${channel}.mp4`;

      // 3. Decide: Email attachment or Drive upload based on size
      if (sizeMB <= C.MAX_VIDEO_SIZE_MB) {
        // Check if small enough for email attachment
        if (sizeMB <= C.EMAIL_ATTACHMENT_SIZE_MB && (totalAttachmentSizeMB + sizeMB) <= C.EMAIL_ATTACHMENT_SIZE_MB) {
          // Small enough - send as email attachment
          attachments.push(blob.setName(cleanFileName));
          totalAttachmentSizeMB += sizeMB;
          totalSizeMB += sizeMB;
          successCount++;

          videoResults.push({
            success: true,
            title,
            channel,
            views,
            uploadDate,
            thumb,
            cleanFileName,
            sizeMB,
            duration,
            quality: roleLimits.quality,
            deliveryMethod: 'email' // Mark as email attachment
          });
          
          logToSheet({
            sender: sender,
            requestType: "Direct Links",
            videoId: videoId,
            title: cleanFileName,
            actionDetail: "Attached to email (small file)",
            sizeMb: sizeMB,
            status: "Download Success"
          });
        } else {
          // Too large for email - upload to Drive
          const driveResult = uploadToDrive(blob, cleanFileName);
          
          if (driveResult.success) {
            totalSizeMB += sizeMB;
            successCount++;

            videoResults.push({
              success: true,
              title,
              channel,
              views,
              uploadDate,
              thumb,
              cleanFileName,
              sizeMB,
              duration,
              driveLink: driveResult.link,
              quality: roleLimits.quality,
              deliveryMethod: 'drive' // Mark as Drive link
            });
            
            logToSheet({
              sender: sender,
              requestType: "Direct Links",
              videoId: videoId,
              title: cleanFileName,
              actionDetail: "Uploaded to Drive",
              sizeMb: sizeMB,
              status: "Download Success"
            });
          } else {
            throw new Error(`Drive upload failed: ${driveResult.error}`);
          }
        }
      } else {
        videoResults.push({
          success: false,
          error: `Video too large (${sizeMB} MB exceeds ${C.MAX_VIDEO_SIZE_MB} MB limit)`
        });
        
        logToSheet({
          sender: sender,
          requestType: "Direct Links",
          videoId: videoId,
          title: title,
          actionDetail: `Skipped: Size limit exceeded`,
          sizeMb: sizeMB,
          status: "Download Skipped"
        });
      }

    } catch (e) {
      videoResults.push({
        success: false,
        url: url,
        error: e.toString()
      });
      
      log(`Failed ${videoId}: ${e.toString()}`);
      
      logToSheet({
        sender: sender,
        requestType: "Direct Links",
        videoId: videoId,
        actionDetail: `URL: ${url} | Error: ${e.toString()}`,
        status: "Download Failed"
      });
    }
  }

  // 4. Send Reply with mixed delivery (attachments + Drive links)
  const htmlBody = buildMixedDeliveryReplyHtml(videoResults, totalAttachmentSizeMB);
  message.reply("Your videos from YouTube", { htmlBody: C.STYLE + htmlBody, attachments: attachments });

  // Summary log
  const emailCount = videoResults.filter(v => v.deliveryMethod === 'email').length;
  const driveCount = videoResults.filter(v => v.deliveryMethod === 'drive').length;
  
  logToSheet({
    sender: sender,
    requestType: "Direct Links",
    actionDetail: `Delivered ${successCount} videos: ${emailCount} via email (${totalAttachmentSizeMB.toFixed(1)} MB), ${driveCount} via Drive`,
    sizeMb: totalSizeMB,
    status: "Batch Summary"
  });
}

/**
 * Handles search queries in the email body by calling the YouTube Search API.
 */
function handleSearchQuery(message, thread, originalBody, sender) {
  const C = getConstants();
  let query = extractNewQuery(originalBody);
  const userRole = getUserRole(sender);
  const roleLimits = C.ROLE_LIMITS[userRole];
  
  const maxResults = roleLimits.maxResults; 

  if (query.toLowerCase() === "test_api_key") {
    testApiKeyStatus(message, sender, C.YOUTUBE_API_KEY);
    return;
  }

  if (!C.YOUTUBE_API_KEY) {
    sendApiKeyMissingReply(message, "Search Request");
    return;
  }

  if (["info", "help", "how", "instructions", "?"].includes(query.toLowerCase())) {
    log(`User requested help. Role: ${userRole}`);
    sendHelpCard(message, userRole, roleLimits);
    
    logToSheet({
      sender: sender,
      requestType: "Smart Search",
      queryOrUrls: query,
      actionDetail: `Instructions sent (Role: ${userRole})`,
      status: "Help Requested"
    });
    return;
  }
  
  const usageCheck = checkAndIncrementUsage(sender, 'search', 1, userRole, roleLimits);
  if (!usageCheck.allowed) {
    sendLimitExceededReply(message, usageCheck, userRole, roleLimits);
    logToSheet({
      sender: sender,
      requestType: "Smart Search",
      queryOrUrls: query,
      actionDetail: `Rejected: ${usageCheck.message} (Role: ${userRole})`,
      status: "LIMIT EXCEEDED"
    });
    return;
  }
  
  logToSheet({
    sender: sender,
    requestType: "Smart Search",
    queryOrUrls: query,
    actionDetail: `Search for: "${query}" (Role: ${userRole}, Max Results: ${maxResults})`,
    status: "Request Started"
  });

  log(`Smart search → extracted query: "${query}"`);

  const searchUrl = `${C.YOUTUBE_API_BASE}/search?part=snippet&maxResults=${maxResults}&q=${encodeURIComponent(query)}&type=video&key=${C.YOUTUBE_API_KEY}`;

  try {
    const searchResponse = UrlFetchApp.fetch(searchUrl);
    const searchData = JSON.parse(searchResponse.getContentText());
    let items = searchData.items || [];
    
    const videoIds = items.map(item => item.id.videoId).join(',');
    
    if (videoIds.length > 0) {
      const videoInfoUrl = `${C.YOUTUBE_API_BASE}/videos?part=statistics,contentDetails&id=${videoIds}&key=${C.YOUTUBE_API_KEY}`;
      const infoResponse = UrlFetchApp.fetch(videoInfoUrl);
      const infoData = JSON.parse(infoResponse.getContentText());
      
      const statsMap = {};
      infoData.items.forEach(infoItem => {
        statsMap[infoItem.id] = {
          statistics: infoItem.statistics,
          contentDetails: infoItem.contentDetails
        };
      });
      
      items = items.map(item => {
        const videoId = item.id.videoId;
        const videoInfo = statsMap[videoId] || {};
        item.statistics = videoInfo.statistics || {}; 
        item.contentDetails = videoInfo.contentDetails || {};
        return item;
      });
    }

    log(`Search returned ${items.length} results`);

    const html = buildSearchResultsHtml(items, message.getTo(), query);
    message.reply(`Search results for: "${query}"`, { htmlBody: C.STYLE + html });

    logToSheet({
      sender: sender,
      requestType: "Smart Search",
      queryOrUrls: query,
      actionDetail: `${items.length} results returned`,
      status: "Search Success"
    });
  } catch (e) {
    if (e.message.includes("returned code 400") && e.message.includes("API key not valid")) {
       log(`Search failed: API Key Error (400)`);
       sendApiKeyMissingReply(message, "Search Request", true);
       logToSheet({
          sender: sender,
          requestType: "Smart Search",
          queryOrUrls: query,
          actionDetail: `Error: API Key Invalid (400)`,
          status: "Search Failed"
       });
       return;
    }
    
    log(`Search failed: ${e.message}`);
    logToSheet({
      sender: sender,
      requestType: "Smart Search",
      queryOrUrls: query,
      actionDetail: `Error: ${e.message}`,
      status: "Search Failed"
    });
    message.reply("Search failed — an unexpected error occurred. Check the logs for details.");
  }
}

/**
 * Tests the status of the YouTube API key.
 */
function testApiKeyStatus(message, sender, apiKey) {
    const C = getConstants();
    
    let status, details, color, icon;
    
    if (!apiKey) {
        status = "Key Missing";
        details = "The 'YOUTUBE_API_KEY' property is not set in Script Properties. Please add your key.";
        color = "#ff6600";
        icon = "⚠️";
    } else {
        const testUrl = `${C.YOUTUBE_API_BASE}/search?part=id&maxResults=1&q=test&key=${apiKey}`;
        
        try {
            const response = UrlFetchApp.fetch(testUrl, { muteHttpExceptions: true });
            const responseCode = response.getResponseCode();
            
            if (responseCode === 200) {
                status = "Key Valid & Working";
                details = "The API key successfully connected and performed a test search. Your bot should be fully operational!";
                color = "#4CAF50";
                icon = "✅";
            } else if (responseCode === 400) {
                status = "Key Invalid/Unauthenticated (400)";
                details = "The YouTube API rejected the key. Check if the key is correct and if the 'YouTube Data API v3' is enabled in your Google Cloud Console.";
                color = "#F44336";
                icon = "❌";
            } else if (responseCode === 403) {
                 status = "Forbidden (403)";
                 details = "The key might be valid but restricted (e.g., IP address restrictions, quota exceeded, or billing issue). Check your API Console restrictions and quota.";
                 color = "#F44336";
                 icon = "🚫";
            } else {
                status = `API Test Failed (${responseCode})`;
                details = `Received unexpected HTTP status code: ${responseCode}. Raw response: ${response.getContentText().substring(0, 100)}...`;
                color = "#FF9800";
                icon = "⚠️";
            }
        } catch (e) {
            status = "Connection Error";
            details = `Failed to connect to the Google API endpoint: ${e.toString()}`;
            color = "#757575";
            icon = "🔌";
        }
    }

    const html = `
      <div style="font-family:'Roboto',Arial,sans-serif; max-width:600px; margin:20px auto; padding:25px; background:#f5f5f5; color:#333; border:1px solid #ddd; border-radius:12px; box-shadow: 0 4px 10px rgba(0,0,0,0.1);">
        <h2 style="color:${color}; font-size:24px; margin-bottom:15px; border-bottom:2px solid #eee; padding-bottom:10px; text-align:center;">${icon} API Key Test Result ${icon}</h2>
        <div style="background:white; padding:20px; border-radius:8px; border:1px solid #eee;">
            <p style="font-size:16px; margin-bottom:10px;"><strong>Status:</strong> <span style="color:${color}; font-weight:bold;">${status}</span></p>
            <p style="font-size:14px; line-height:1.5;"><strong>Details:</strong> ${details}</p>
        </div>
        <p style="font-size:12px; color:#777; margin-top:20px; text-align:center;">
          Run this test again by sending an email with the subject "bt" and body: <code style="background:#f0f0f0; padding:2px 5px; border-radius:3px;">test_api_key</code>
        </p>
      </div>
    `;

    message.reply("YouTube API Key Status Check", { htmlBody: C.STYLE + html });
    
    logToSheet({
      sender: sender,
      requestType: "API Key Test",
      queryOrUrls: "test_api_key",
      actionDetail: `Key Status: ${status} | Details: ${details}`,
      status: status
    });
}

/**
 * Sends a specific reply when the API Key is detected as missing or invalid.
 */
function sendApiKeyMissingReply(message, requestType, isInvalid = false) {
    const C = getConstants();
    const status = isInvalid ? "Invalid API Key" : "API Key Missing";
    const details = isInvalid 
        ? "The key in Script Properties is being rejected by the YouTube API (HTTP 400 error). Please verify the key's accuracy and ensure the 'YouTube Data API v3' service is enabled in your Google Cloud Console."
        : "The 'YOUTUBE_API_KEY' property is not found in Script Properties. This key is required for all searches and for fetching video metadata during downloads.";
    
    const html = `
      <div style="font-family:'Roboto',Arial,sans-serif; max-width:600px; margin:20px auto; padding:25px; background:#fff0f0; color:#c00; border:2px solid #c00; border-radius:12px; box-shadow: 0 4px 10px rgba(0,0,0,0.1);">
        <h2 style="color:#c00; font-size:24px; margin-bottom:15px; text-align:center;">⚠️ ${status}</h2>
        <p style="font-size:16px; color:#333; line-height:1.6; margin-bottom:20px;">
          Your recent **${requestType}** failed.
        </p>
        <div style="background:white; padding:15px; border-radius:8px; border:1px solid #fdd;">
            <strong style="color:#c00; display:block; margin-bottom:5px;">Required Action:</strong>
            <p style="font-size:14px; color:#555;">${details}</p>
            <p style="font-size:14px; color:#555; margin-top:10px;">
              To diagnose further, send an email with the subject "bt" and the body: <code style="background:#f0f0f0; padding:2px 5px; border-radius:3px;">test_api_key</code>
            </p>
        </div>
      </div>
    `;

    message.reply("Action Blocked: API Key Error", { htmlBody: C.STYLE + html });
    log(`Blocked request due to ${status}`);
}

// ====================================================================
// 5. USAGE AND ROLE TRACKING FUNCTIONS
// ====================================================================

function getUserRolesSheet() {
  const C = getConstants();
  const ss = SpreadsheetApp.openById(C.LOG_SPREADSHEET_ID);
  let sheet = ss.getSheetByName(C.ROLES_SHEET_NAME);
  
  const header = ["Email", "Role", "Assigned Date", "Notes"];
  
  if (!sheet) {
    sheet = ss.insertSheet(C.ROLES_SHEET_NAME);
    sheet.appendRow(header);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, header.length).setFontWeight("bold").setBackground("#33A852").setFontColor("white");
    
    sheet.appendRow(["admin@example.com", "admin", new Date(), "Full access"]);
    sheet.appendRow(["proplus@company.com", "pro plus", new Date(), "Pro Plus subscription"]);
    sheet.appendRow(["pro@company.com", "pro user", new Date(), "Premium subscription"]);
    sheet.getRange(2, 1, 3, 1).setNumberFormat("@");
    
    log(`Created new sheet: ${C.ROLES_SHEET_NAME}. Please populate it with user emails and roles.`);
  }
  return sheet;
}

function getUserRole(sender) {
  const C = getConstants();
  const sheet = getUserRolesSheet();
  const data = sheet.getDataRange().getValues();
  const defaultRole = C.DEFAULT_ROLE;
  
  for (let i = 1; i < data.length; i++) {
    const email = (data[i][0] || "").trim().toLowerCase();
    const role = (data[i][1] || "").trim().toLowerCase();
    
    if (email === sender.trim().toLowerCase()) {
      if (C.ROLE_LIMITS.hasOwnProperty(role)) {
        return role;
      } else {
        log(`Warning: Role "${role}" for ${sender} is invalid. Defaulting to "${defaultRole}".`);
        return defaultRole;
      }
    }
  }
  
  return defaultRole;
}

function getUsageSheet() {
  const C = getConstants();
  const ss = SpreadsheetApp.openById(C.LOG_SPREADSHEET_ID);
  let sheet = ss.getSheetByName(C.USAGE_SHEET_NAME);
  
  const header = ["Email", "Last Update", "Downloads Count", "Searches Count", "Last Download Request", "Last Search Request"];
  
  if (!sheet) {
    sheet = ss.insertSheet(C.USAGE_SHEET_NAME);
    sheet.appendRow(header);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, header.length).setFontWeight("bold").setBackground("#4CAF50").setFontColor("white");
    sheet.getRange(2, 1, sheet.getMaxRows(), header.length).setNumberFormat("@");
  }
  return sheet;
}

function getUsageData(sender) {
  const sheet = getUsageSheet();
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if ((data[i][0] || "").trim().toLowerCase() === sender.trim().toLowerCase()) {
      return {
        row: i + 1,
        data: data[i]
      };
    }
  }
  return null;
}

function checkAndIncrementUsage(sender, type, count, userRole, roleLimits) {
  const C = getConstants();
  const sheet = getUsageSheet();
  const now = new Date();
  
  let usageRecord = getUsageData(sender);
  let row = -1;
  let downloads = 0;
  let searches = 0;
  let lastUpdate = now;
  
  const MAX_LIMIT = (type === 'download' ? roleLimits.downloads : roleLimits.searches);
  const COUNT_INDEX = (type === 'download' ? 2 : 3);
  const LAST_REQUEST_INDEX = (type === 'download' ? 4 : 5);
  
  if (userRole === 'admin') {
      if (usageRecord) {
          row = usageRecord.row;
          sheet.getRange(row, 2).setValue(now);
      } else {
           row = sheet.getLastRow() + 1;
           const newRowData = [
                sender, 
                now, 
                0,
                0,
                type === 'download' ? now : null, 
                type === 'search' ? now : null,  
            ];
           sheet.appendRow(newRowData);
      }
      return {
          allowed: true,
          message: "Admin: Usage is unlimited.",
          currentDownloads: 0,
          currentSearches: 0,
      };
  }

  if (usageRecord) {
    row = usageRecord.row;
    
    downloads = Number(usageRecord.data[2] || 0);
    searches = Number(usageRecord.data[3] || 0);
    
    lastUpdate = usageRecord.data[1] instanceof Date ? usageRecord.data[1] : new Date(0); 

    const timeSinceLastUpdateMs = now.getTime() - lastUpdate.getTime();
    const windowMs = C.USAGE_WINDOW_MINUTES * 60 * 1000;

    if (timeSinceLastUpdateMs > windowMs) {
      downloads = 0;
      searches = 0;
      lastUpdate = now;
    } else {
      const currentCount = (type === 'download' ? downloads : searches);
      if (currentCount + count > MAX_LIMIT) {
        const timeRemainingMs = windowMs - timeSinceLastUpdateMs;
        const minutes = Math.ceil(timeRemainingMs / 60000);
        const retryWait = `${minutes} minute${minutes !== 1 ? 's' : ''}`;
        
        return {
          allowed: false,
          message: `You have reached your ${roleLimits.label} limit of ${MAX_LIMIT} ${type} requests in the last 24 hours (1 day).`,
          retryWait: retryWait,
          currentDownloads: downloads,
          currentSearches: searches,
        };
      }
    }
  } else {
    row = sheet.getLastRow() + 1;
  }
  
  const newCount = (type === 'download' ? downloads : searches) + count;
  
  const newRowData = [
    sender, 
    lastUpdate, 
    type === 'download' ? newCount : downloads, 
    type === 'search' ? newCount : searches,
    type === 'download' ? now : (usageRecord ? usageRecord.data[4] : null),
    type === 'search' ? now : (usageRecord ? usageRecord.data[5] : null),
  ];

  if (usageRecord) {
    sheet.getRange(row, 1, 1, newRowData.length).setValues([newRowData]);
  } else {
    sheet.appendRow(newRowData);
  }
  
  sheet.getRange(row, 2).setValue(now);
  
  return {
    allowed: true,
    message: "Usage incremented.",
    currentDownloads: type === 'download' ? newCount : downloads,
    currentSearches: type === 'search' ? newCount : searches,
  };
}

// ====================================================================
// 6. GENERIC UTILITY FUNCTIONS
// ====================================================================

function log(msg) {
  console.log(new Date().toISOString() + " | " + msg);
}

function sendLimitExceededReply(message, usageCheck, userRole, roleLimits) {
  const C = getConstants();
  
  const displayDownloads = roleLimits.downloads === Infinity ? 'Unlimited' : roleLimits.downloads;
  const displaySearches = roleLimits.searches === Infinity ? 'Unlimited' : roleLimits.searches;
  const currentDownloads = roleLimits.downloads === Infinity ? 'N/A' : usageCheck.currentDownloads;
  const currentSearches = roleLimits.searches === Infinity ? 'N/A' : usageCheck.currentSearches;

  const html = `
    <div style="font-family:'Roboto',Arial,sans-serif; max-width:600px; margin:20px auto; padding:25px; background:#fef3f3; color:#a00; border:1px solid #f00; border-radius:12px; text-align:center; box-shadow: 0 4px 10px rgba(0,0,0,0.1);">
      <h2 style="color:#d00; font-size:24px; margin-bottom:10px;">🚫 Usage Limit Reached</h2>
      <p style="font-size:16px; color:#555; line-height:1.6;">
        ${usageCheck.message}
      </p>
      <div style="background:#fff; padding:15px; border-radius:8px; margin:20px 0;">
          <strong style="display:block; font-size:18px; color:#111; margin-bottom:10px;">Your Current Role: ${roleLimits.label} (${userRole})</strong>
          <ul style="list-style:none; padding:0; margin:0; text-align:left;">
            <li style="margin-bottom:5px; color:#333;">Downloads Limit: <strong style="float:right;">${currentDownloads} / ${displayDownloads}</strong></li>
            <li style="color:#333;">Searches Limit: <strong style="float:right;">${currentSearches} / ${displaySearches}</strong></li>
            <li style="color:#333;">Search Results Max: <strong style="float:right;">${roleLimits.maxResults}</strong></li>
            <li style="color:#333;">Video Quality: <strong style="float:right;">${roleLimits.quality}</strong></li>
          </ul>
      </div>
      <p style="font-size:14px; margin-top:20px; color:#777;">
        You can try again in approximately <strong style="color:#333;">${usageCheck.retryWait}</strong>.
      </p>
    </div>
  `;
  message.reply("Action Rejected: Usage Limit Reached", { htmlBody: C.STYLE + html });
}

function logToSheet(logData) {
  const C = getConstants();

  try {
    const ss = SpreadsheetApp.openById(C.LOG_SPREADSHEET_ID);
    let sheet = ss.getSheetByName("Log");

    const header = ["Timestamp", "User Email", "Request Type", "Query/URLs", "Video ID", "Title", "Action Detail", "Size (MB)", "Status"];

    if (!sheet) {
      sheet = ss.insertSheet("Log");
      sheet.appendRow(header);
      sheet.setFrozenRows(1);
      sheet.getRange("A1:I1").setFontWeight("bold").setBackground("#4285f4").setFontColor("white"); 
    }
    
    const row = [
      new Date(),
      logData.sender || "-",
      logData.requestType || "-",
      logData.queryOrUrls || "-",
      logData.videoId || "-",
      logData.title || "-",
      logData.actionDetail || "-",
      logData.sizeMb !== undefined && logData.sizeMb !== null ? logData.sizeMb.toFixed(2) : "-",
      logData.status || "Unknown"
    ];

    sheet.appendRow(row);
    console.log(`LOGGED to permanent sheet: ${logData.status} - ${logData.actionDetail || logData.requestType}`);
  } catch (e) {
    console.error("LOGGING FAILED:", e.toString());
  }
}

function extractNewQuery(originalBody) {
  let query = originalBody.trim();
  const lines = query.split('\n');
  let newLines = [];

  for (let line of lines) {
    line = line.trim();
    if (line.startsWith('>') ||
      line.startsWith('On ') && line.includes('wrote:') ||
      line.startsWith('From:') ||
      line.match(/^\d{4}\/\d{1,2}\/\d{1,2}.*<.*>/)) {
      break;
    }
    if (line !== '') newLines.push(line);
  }

  query = newLines.join(' ').trim();

  if (query === '') query = originalBody.trim();

  return query;
}

function truncateTitle(title, limit = 60) {
  const cleanTitle = title.replace(/[^\x20-\x7E]/g, '').trim(); 
  
  if (cleanTitle.length > limit) {
    return cleanTitle.substring(0, limit) + '...';
  }
  return cleanTitle;
}

function formatDuration(isoDuration) {
  if (!isoDuration) return 'N/A';
  
  const matches = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!matches) return 'N/A';
  
  const hours = parseInt(matches[1] || 0);
  const minutes = parseInt(matches[2] || 0);
  const seconds = parseInt(matches[3] || 0);

  let formatted = [];
  
  if (hours > 0) {
    formatted.push(hours.toString());
    formatted.push(Utilities.formatString('%02d', minutes));
  } else {
    formatted.push(minutes.toString());
  }
  
  formatted.push(Utilities.formatString('%02d', seconds));
  
  return formatted.join(':');
}

// ====================================================================
// 7. HTML TEMPLATE GENERATION (Mixed Delivery: Email + Drive)
// ====================================================================

function buildMixedDeliveryReplyHtml(videoResults, totalAttachmentSizeMB) {
  let videoCards = '';
  let hasAttachments = false;
  let hasDriveLinks = false;
  
  videoResults.forEach(result => {
    if (result.success) {
      if (result.deliveryMethod === 'email') {
        hasAttachments = true;
        // Email attachment card
        videoCards += `
    <div style="background:white; border-radius:12px; overflow:hidden; margin:20px 0; box-shadow:0 4px 12px rgba(0,0,0,0.1); border-left:4px solid #0f9d58;">
      <div style="position:relative; background-color:#000;">
        <img src="${result.thumb}" width="100%" style="max-width:100%; display:block; height:auto; border-bottom:3px solid #0f9d58;">
        <div style="position:absolute; bottom:8px; right:8px; background:rgba(0,0,0,0.8); color:white; padding:2px 6px; border-radius:4px; font-size:12px;">${result.quality || '360p'} MP4</div>
      </div>

      <div style="padding:16px;">
        <div style="font-weight:700; font-size:18px; color:#111; margin-bottom:8px; line-height:1.3;">${result.title}</div>
        <div style="color:#606060; font-size:14px; margin:4px 0;">
          <strong style="color:#000;">${result.channel}</strong> • Duration: ${result.duration} • ${result.views} views • ${result.uploadDate}
        </div>
        
        <div style="margin-top:12px; padding-top:12px; border-top:1px solid #eee;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <strong style="color:#0f9d58; font-size:15px;">📎 Email Attachment</strong>
            <span style="color:#555; font-size:13px;">${result.sizeMB} MB</span>
          </div>
          <p style="margin:8px 0 0; color:#333; font-size:14px;">File: <strong>${result.cleanFileName}</strong></p>
          <p style="margin:6px 0 0; color:#666; font-size:12px; font-style:italic;">✓ Attached to this email - click download icon in Gmail</p>
        </div>
      </div>
    </div>
  `;
      } else if (result.deliveryMethod === 'drive') {
        hasDriveLinks = true;
        // Drive link card
        videoCards += `
    <div style="background:white; border-radius:12px; overflow:hidden; margin:20px 0; box-shadow:0 4px 12px rgba(0,0,0,0.1); border-left:4px solid #4285f4;">
      <div style="position:relative; background-color:#000;">
        <img src="${result.thumb}" width="100%" style="max-width:100%; display:block; height:auto; border-bottom:3px solid #4285f4;">
        <div style="position:absolute; bottom:8px; right:8px; background:rgba(0,0,0,0.8); color:white; padding:2px 6px; border-radius:4px; font-size:12px;">${result.quality || '360p'} MP4</div>
      </div>

      <div style="padding:16px;">
        <div style="font-weight:700; font-size:18px; color:#111; margin-bottom:8px; line-height:1.3;">${result.title}</div>
        <div style="color:#606060; font-size:14px; margin:4px 0;">
          <strong style="color:#000;">${result.channel}</strong> • Duration: ${result.duration} • ${result.views} views • ${result.uploadDate}
        </div>
        
        <div style="margin-top:12px; padding-top:12px; border-top:1px solid #eee;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <strong style="color:#4285f4; font-size:15px;">☁️ Google Drive</strong>
            <span style="color:#555; font-size:13px;">${result.sizeMB} MB</span>
          </div>
          <p style="margin:8px 0 0; color:#333; font-size:14px;">File: <strong>${result.cleanFileName}</strong></p>
          
          <a href="${result.driveLink}" 
             style="display:inline-block; margin-top:12px; background:#4285f4; color:white; padding:10px 20px; border-radius:6px; text-decoration:none; font-weight:bold; font-size:14px;">
            📥 Download from Google Drive
          </a>
        </div>
      </div>
    </div>
  `;
      }
    } else {
      videoCards += `<div style="background:#fff3f3; color:#c00; padding:15px; border-radius:8px; border:1px solid #c00; margin:10px 0;">Failed: ${result.error}</div>`;
    }
  });

  // Build summary message
  let summaryMsg = '';
  if (hasAttachments && hasDriveLinks) {
    summaryMsg = `Some videos are attached directly to this email (${totalAttachmentSizeMB.toFixed(1)} MB), while larger ones are available via Google Drive links below.`;
  } else if (hasAttachments) {
    summaryMsg = `All your videos are attached directly to this email (${totalAttachmentSizeMB.toFixed(1)} MB total). Click the download icon in Gmail to save them.`;
  } else if (hasDriveLinks) {
    summaryMsg = `Your videos have been uploaded to Google Drive. Click the download buttons below to access them.`;
  }

  return `
    <div style="font-family:'Roboto',Arial,sans-serif; max-width:750px; margin:0 auto; background:#f5f5f5; color:#000; padding:20px; border-radius:16px;">
      <div style="background:#FF0000; padding:15px 20px; text-align:left; border-radius:12px 12px 0 0;">
        <h1 style="margin:0; color:white; font-size:24px; font-weight:700; letter-spacing:1px;">
          YouTube Bot <span style="font-weight:400; font-size:16px; margin-left:10px;">| Videos Ready</span>
        </h1>
      </div>
      
      <div style="padding:20px 20px 30px; background:white; border-radius:0 0 12px 12px; box-shadow:0 8px 15px rgba(0,0,0,0.05);">
        <h2 style="color:#111; font-size:22px; margin-bottom:15px; border-bottom:2px solid #eee; padding-bottom:10px;">Your Videos</h2>
        <p style="font-size:16px; color:#333; margin-bottom:20px;">
          ${summaryMsg}
        </p>
        
        <div>${videoCards}</div>

        <hr style="border:0; border-top:1px dashed #ddd; margin:30px 0;">
        <p style="color:#777; font-size:12px; text-align:center;">
          Generated by the YouTube Bot Service. Small videos (≤24MB) are attached directly, larger ones are in "${getConstants().DRIVE_FOLDER_NAME}" folder.
        </p>
      </div>
    </div>
  `;
}

function buildDriveDownloadReplyHtml(videoResults) {
  let videoCards = '';
  
  videoResults.forEach(result => {
    if (result.success) {
      videoCards += `
    <div style="background:white; border-radius:12px; overflow:hidden; margin:20px 0; box-shadow:0 4px 12px rgba(0,0,0,0.1);">
      <div style="position:relative; background-color:#000;">
        <img src="${result.thumb}" width="100%" style="max-width:100%; display:block; height:auto; border-bottom:3px solid #FF0000;">
        <div style="position:absolute; bottom:8px; right:8px; background:rgba(0,0,0,0.8); color:white; padding:2px 6px; border-radius:4px; font-size:12px;">${result.quality || '360p'} MP4</div>
      </div>

      <div style="padding:16px;">
        <div style="font-weight:700; font-size:18px; color:#111; margin-bottom:8px; line-height:1.3;">${result.title}</div>
        <div style="color:#606060; font-size:14px; margin:4px 0;">
          <strong style="color:#000;">${result.channel}</strong> • Duration: ${result.duration} • ${result.views} views • ${result.uploadDate}
        </div>
        
        <div style="margin-top:12px; padding-top:12px; border-top:1px solid #eee;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <strong style="color:#0f9d58; font-size:15px;">✅ Uploaded to Drive</strong>
            <span style="color:#555; font-size:13px;">${result.sizeMB} MB</span>
          </div>
          <p style="margin:8px 0 0; color:#333; font-size:14px;">File: <strong>${result.cleanFileName}</strong></p>
          
          <a href="${result.driveLink}" 
             style="display:inline-block; margin-top:12px; background:#4285f4; color:white; padding:10px 20px; border-radius:6px; text-decoration:none; font-weight:bold; font-size:14px;">
            📥 Download from Google Drive
          </a>
        </div>
      </div>
    </div>
  `;
    } else {
      videoCards += `<div style="background:#fff3f3; color:#c00; padding:15px; border-radius:8px; border:1px solid #c00; margin:10px 0;">Failed: ${result.error}</div>`;
    }
  });

  return `
    <div style="font-family:'Roboto',Arial,sans-serif; max-width:750px; margin:0 auto; background:#f5f5f5; color:#000; padding:20px; border-radius:16px;">
      <div style="background:#FF0000; padding:15px 20px; text-align:left; border-radius:12px 12px 0 0;">
        <h1 style="margin:0; color:white; font-size:24px; font-weight:700; letter-spacing:1px;">
          YouTube Bot <span style="font-weight:400; font-size:16px; margin-left:10px;">| Drive Links Ready</span>
        </h1>
      </div>
      
      <div style="padding:20px 20px 30px; background:white; border-radius:0 0 12px 12px; box-shadow:0 8px 15px rgba(0,0,0,0.05);">
        <h2 style="color:#111; font-size:22px; margin-bottom:15px; border-bottom:2px solid #eee; padding-bottom:10px;">Your Videos on Google Drive</h2>
        <p style="font-size:16px; color:#333; margin-bottom:20px;">
          Your videos have been uploaded to Google Drive. Click the download buttons below to access them.
        </p>
        
        <div>${videoCards}</div>

        <hr style="border:0; border-top:1px dashed #ddd; margin:30px 0;">
        <p style="color:#777; font-size:12px; text-align:center;">
          Generated by the YouTube Bot Service. Files are stored in the "${getConstants().DRIVE_FOLDER_NAME}" folder in your Google Drive.
        </p>
      </div>
    </div>
  `;
}

function buildSearchResultsHtml(items, replyToEmail, query) {
  let cards = "";

  items.forEach(item => {
    if (!item.id || !item.id.videoId) return;

    const videoId = item.id.videoId;
    const rawTitle = item.snippet.title.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const title = truncateTitle(rawTitle);
    const thumb = item.snippet.thumbnails.high.url;
    const channel = item.snippet.channelTitle.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const link = `https://youtu.be/${videoId}`;
    
    const viewCount = item.statistics?.viewCount ? Number(item.statistics.viewCount).toLocaleString() : 'N/A';
    
    let publishedDate = 'N/A';
    if (item.snippet.publishedAt) {
      publishedDate = Utilities.formatDate(new Date(item.snippet.publishedAt), "GMT", "MMM d, yyyy");
    }
    
    const duration = item.contentDetails?.duration ? formatDuration(item.contentDetails.duration) : 'N/A';

    const rawDescription = item.snippet.description.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const descriptionSnippet = rawDescription.length > 100 
      ? rawDescription.substring(0, 100) + '...'
      : rawDescription;

    cards += `
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:15px; padding:15px; background:#fafafa; border-radius:10px; border:1px solid #eee;">
        <tr>
          <td valign="top" style="padding:0; width:160px; height:90px; padding-right:15px;">
            <a href="${link}" style="text-decoration:none;">
              <div style="width:160px; height:90px; overflow:hidden; border-radius:6px; position:relative;">
                <img src="${thumb}" width="160" height="90" style="display:block; width:100%; height:100%; object-fit:cover;">
                <div style="position:absolute; bottom:4px; right:4px; background:rgba(0,0,0,0.8); color:white; padding:2px 6px; border-radius:3px; font-size:11px; line-height:1.2;">${duration}</div>
              </div>
            </a>
          </td>

          <td valign="top" style="padding:0;">
            <strong style="font-size:16px; color:#111; display:block; margin-bottom:4px; line-height:1.3;">${title}</strong>
            
            <small style="color:#606060; display:block; margin-bottom:4px;">
              ${channel}
            </small>
            <small style="color:#888; display:block; margin-bottom:8px; font-size:12px;">
              Duration: <strong>${duration}</strong> • Views: <strong>${viewCount}</strong> • Published: <strong>${publishedDate}</strong>
            </small>

            <p style="color:#555; font-size:13px; margin:0 0 12px 0; line-height:1.4;">
              ${descriptionSnippet}
            </p>

            <table role="presentation" border="0" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:0; padding-right:12px;">
                  <a href="mailto:${replyToEmail}?subject=bt&body=${encodeURIComponent(link)}"
                     style="background:#ff0000; color:white; padding:9px 18px; border-radius:50px; text-decoration:none; font-weight:bold; font-size:14px; display:inline-block; box-shadow:0 2px 4px rgba(0,0,0,0.2);">
                    <span style="font-size:16px; margin-right:5px; vertical-align:middle;">&#x2193;</span> Download
                  </a>
                </td>
                <td style="padding:0;">
                  <a href="${link}" style="color:#0d6efd; text-decoration:none; font-size:14px; font-weight:500;">
                    View on YouTube
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>`;
  });

  return `<div style="font-family:'Roboto',Arial,sans-serif; max-width:750px; margin:20px auto; padding:0; background:white; border-radius:16px; box-shadow:0 4px 20px rgba(0,0,0,0.1);">
            <div style="background:#FF0000; padding:15px 20px; margin:-20px -20px 20px -20px; border-radius:16px 16px 0 0;">
              <h2 style="color:white; text-align:center; font-weight:700; margin:0;">Search Results</h2>
            </div>
            <div style="padding: 0 20px 20px 20px;">
              <h3 style="color:#333; font-weight:500; margin-bottom:15px;">Top results for: <span style="font-weight:700;">"${query}"</span></h3>
              <p style="font-size:14px; color:#555; margin-bottom:20px;">Click the <strong style="color:#ff0000;">Download</strong> button to request the video to be uploaded to Drive.</p>
              <div style="padding:10px 0;">${cards}</div>
            </div>
          </div>`;
}

function sendHelpCard(message, userRole, roleLimits) {
  const C = getConstants();

  const displayDownloads = roleLimits.downloads === Infinity ? 'Unlimited' : roleLimits.downloads;
  const displaySearches = roleLimits.searches === Infinity ? 'Unlimited' : roleLimits.searches;

  const html = `
    <div style="font-family:'Roboto',Arial,sans-serif; max-width:640px; margin:30px auto; padding:30px; background:linear-gradient(145deg, #FF0000 0%, #B20000 100%); color:white; border-radius:20px; text-align:center; box-shadow:0 15px 40px rgba(0,0,0,0.4);">
      <h1 style="margin:0; font-size:36px; font-weight:700; letter-spacing:1px;">YouTube Bot</h1>
      <p style="font-size:20px; margin:25px 0;">Your Smart Video Assistant (Google Drive Edition)</p>
      
      <div style="background:rgba(255,255,255,0.9); padding:25px; border-radius:15px; margin:30px 0; font-size:17px; line-height:1.8; color:#333; text-align:left;">
        <strong style="color:#FF0000; font-size:18px; display:block; margin-bottom:15px; text-align:center;">How to use me (Just reply to this email):</strong>
        <ul style="list-style:none; padding:0; margin:0;">
          <li style="margin-bottom:10px; padding-left:25px; position:relative;">
            <span style="position:absolute; left:0; color:#FF0000; font-size:20px;">&bull;</span> 
            Paste **YouTube links** &rarr; I upload videos to Google Drive and send you the links.
            <small style="color:#666; display:block; margin-top:3px;">Your Download Limit: <strong>${displayDownloads}</strong> per day.</small>
          </li>
          <li style="margin-bottom:10px; padding-left:25px; position:relative;">
            <span style="position:absolute; left:0; color:#FF0000; font-size:20px;">&bull;</span> 
            Type a **search query** (e.g., "new cat videos") &rarr; I send the top <strong>${roleLimits.maxResults}</strong> results.
            <small style="color:#666; display:block; margin-top:3px;">Your Search Limit: <strong>${displaySearches}</strong> per day.</small>
          </li>
          <li style="margin-bottom:10px; padding-left:25px; position:relative;">
            <span style="position:absolute; left:0; color:#FF0000; font-size:20px;">&bull;</span> 
            Type <code style="background:#ddd; color:#333; padding:3px 8px; border-radius:4px; font-weight:bold;">info</code> or <code style="background:#ddd; color:#333; padding:3px 8px; border-radius:4px; font-weight:bold;">help</code> &rarr; see this guide.
          </li>
        </ul>
        <strong style="display:block; margin-top:20px; padding-top:10px; border-top:1px solid #ccc; text-align:center;">
          <span style="color:#FF0000;">Your Current Role: ${roleLimits.label} (${userRole})</span> | Videos are saved to your Google Drive in ${roleLimits.quality} MP4 format.
        </strong>
      </div>
      <p style="font-size:14px; opacity:0.8; margin-top:20px;">Service Status: Online and Ready | Email subject: "bt"</p>
    </div>`;

  message.reply("How to use your YouTube Bot", { htmlBody: C.STYLE + html });
}
