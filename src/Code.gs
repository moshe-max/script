/**
 * Google Apps Script for a YouTube Downloader/Search Bot via Gmail.
 * ENHANCED VERSION: Comprehensive detailed logging to Google Sheets
 */

// ====================================================================
// 1. CONSTANTS & CONFIGURATION
// ====================================================================

function getConstants() {
  const YOUTUBE_API_KEY = PropertiesService.getScriptProperties().getProperty('YOUTUBE_API_KEY');

  return {
    RAILWAY_ENDPOINT: "https://yt-mail.onrender.com",
    YOUTUBE_API_BASE: "https://www.googleapis.com/youtube/v3",
    LOG_SPREADSHEET_ID: "1vxiRaNLMW5mtlrneiRBnzx0PKgvKJAmGqVnALKH6vFA",
    DRIVE_FOLDER_NAME: "YouTube Bot Downloads",
    MAX_VIDEO_SIZE_MB: 100,
    EMAIL_ATTACHMENT_SIZE_MB: 24,

    ROLE_LIMITS: {
      // Premium Tier
      'admin': { downloads: Infinity, searches: Infinity, maxResults: 15, label: 'Admin', quality: '1080p' },
      'enterprise': { downloads: Infinity, searches: Infinity, maxResults: 15, label: 'Enterprise User', quality: '1080p' },
      
      // Pro Tier
      'pro plus': { downloads: 25, searches: 25, maxResults: 15, label: 'Pro Plus User', quality: '720p' },
      'pro_plus': { downloads: 25, searches: 25, maxResults: 15, label: 'Pro Plus User', quality: '720p' },
      'pro user': { downloads: 12, searches: 12, maxResults: 12, label: 'Pro User', quality: '480p' },
      'pro_user': { downloads: 12, searches: 12, maxResults: 12, label: 'Pro User', quality: '480p' },
      'premium': { downloads: 15, searches: 15, maxResults: 12, label: 'Premium User', quality: '480p' },
      
      // Standard Tier
      'user': { downloads: 5, searches: 5, maxResults: 5, label: 'Standard User', quality: '360p' },
      'standard': { downloads: 5, searches: 5, maxResults: 5, label: 'Standard Member', quality: '360p' },
      
      // Free/Guest Tier
      'guest': { downloads: 1, searches: 5, maxResults: 5, label: 'Guest User', quality: '240p' },
      'free': { downloads: 2, searches: 5, maxResults: 5, label: 'Free User', quality: '240p' },
      
      // Restricted/Denied Tiers
      'denied': { downloads: 0, searches: 0, maxResults: 0, label: 'Access Denied', quality: 'DENIED' },
      'suspended': { downloads: 0, searches: 0, maxResults: 0, label: 'Account Suspended', quality: 'SUSPENDED' },
      'banned': { downloads: 0, searches: 0, maxResults: 0, label: 'Account Banned', quality: 'BANNED' },
      'closed': { downloads: 0, searches: 0, maxResults: 0, label: 'Account Closed', quality: 'CLOSED' }
    },
    DEFAULT_ROLE: 'guest',
    USAGE_WINDOW_MINUTES: 1440,
    USAGE_SHEET_NAME: "Usage & Limits",
    ROLES_SHEET_NAME: "User Roles",
    
    STYLE: `<style>@import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap');</style>`,
    YOUTUBE_API_KEY: YOUTUBE_API_KEY
  };
}

// ====================================================================
// 2. MAIN EXECUTION FUNCTION
// ====================================================================

function processYouTubeEmails() {
  const startTime = new Date();
  logDetailedToSheet({
    eventType: "BOT_START",
    timestamp: startTime,
    details: "Bot execution started"
  });

  Logger.log("=== Bot started ===");

  const threads = GmailApp.search('is:unread subject:bt');
  Logger.log(`Found ${threads.length} unread thread(s) with "bt" in subject`);

  logDetailedToSheet({
    eventType: "THREADS_FOUND",
    timestamp: new Date(),
    threadCount: threads.length,
    details: `Found ${threads.length} unread threads with subject "bt"`
  });

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
    
    logDetailedToSheet({
      eventType: "EMAIL_RECEIVED",
      timestamp: new Date(),
      sender: sender,
      subject: subject,
      bodyLength: bodyPlain.length,
      details: `Email received from ${sender}`
    });
    
    const youtubeRegex = /(https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)[A-Za-z0-9_-]{11}[^\s<>"'\]]*)/g;
    const links = [...new Set((combinedBody.match(youtubeRegex) || []))];

    Logger.log(`[DEBUG] Extracted Links Count: ${links.length}`);
    
    if (links.length > 0) {
      Logger.log(`[DEBUG] Links found: ${links.join(' | ')}`);
      logDetailedToSheet({
        eventType: "LINKS_DETECTED",
        timestamp: new Date(),
        sender: sender,
        linkCount: links.length,
        links: links.join(" | "),
        details: `${links.length} YouTube link(s) detected in email`
      });
      handleDirectLinks(message, thread, links, sender);
    } else {
      Logger.log(`[DEBUG] No links found. Using Plain Body as Search Query: "${bodyPlain}"`);
      logDetailedToSheet({
        eventType: "SEARCH_QUERY_DETECTED",
        timestamp: new Date(),
        sender: sender,
        query: bodyPlain.substring(0, 100),
        details: `No links detected. Treating email body as search query`
      });
      handleSearchQuery(message, thread, bodyPlain, sender);
    }

    thread.markRead();
    
    logDetailedToSheet({
      eventType: "EMAIL_MARKED_READ",
      timestamp: new Date(),
      sender: sender,
      details: `Thread marked as read`
    });
  }

  const endTime = new Date();
  const executionTimeMs = endTime.getTime() - startTime.getTime();
  
  logDetailedToSheet({
    eventType: "BOT_END",
    timestamp: endTime,
    executionTimeMs: executionTimeMs,
    details: `Bot execution completed in ${executionTimeMs}ms`
  });

  Logger.log("=== Bot finished ===\n");
}

// ====================================================================
// 3. ENHANCED DETAILED LOGGING FUNCTION
// ====================================================================

function logDetailedToSheet(logData) {
  const C = getConstants();

  try {
    const ss = SpreadsheetApp.openById(C.LOG_SPREADSHEET_ID);
    let sheet = ss.getSheetByName("Detailed Log");

    const header = [
      "Timestamp",
      "Event Type",
      "Sender Email",
      "User Role",
      "Request Type",
      "Query/URLs",
      "Video ID",
      "Video Title",
      "Channel Name",
      "Video Duration",
      "File Size (MB)",
      "Delivery Method",
      "Status",
      "Error/Details",
      "API Response Code",
      "Processing Time (ms)",
      "Thread Count",
      "Link Count",
      "Result Count",
      "Additional Info"
    ];

    if (!sheet) {
      sheet = ss.insertSheet("Detailed Log");
      sheet.appendRow(header);
      sheet.setFrozenRows(1);
      sheet.getRange("A1:T1").setFontWeight("bold").setBackground("#1a73e8").setFontColor("white");
      
      // Set column widths for better readability
      sheet.setColumnWidth(1, 150); // Timestamp
      sheet.setColumnWidth(2, 120); // Event Type
      sheet.setColumnWidth(3, 150); // Sender Email
      sheet.setColumnWidth(4, 100); // User Role
      sheet.setColumnWidth(5, 120); // Request Type
      sheet.setColumnWidth(6, 200); // Query/URLs
    }
    
    const row = [
      logData.timestamp || new Date(),
      logData.eventType || "-",
      logData.sender || "-",
      logData.userRole || "-",
      logData.requestType || "-",
      logData.query || logData.links || logData.queryOrUrls || "-",
      logData.videoId || "-",
      logData.videoTitle || "-",
      logData.channelName || "-",
      logData.duration || "-",
      logData.sizeMb !== undefined ? logData.sizeMb.toFixed(2) : "-",
      logData.deliveryMethod || "-",
      logData.status || "-",
      logData.error || logData.details || "-",
      logData.responseCode || "-",
      logData.processingTimeMs || "-",
      logData.threadCount || "-",
      logData.linkCount || "-",
      logData.resultCount || "-",
      logData.additionalInfo || "-"
    ];

    sheet.appendRow(row);
    console.log(`LOGGED [${logData.eventType}]: ${logData.details || logData.status}`);
  } catch (e) {
    console.error("DETAILED LOGGING FAILED:", e.toString());
  }
}

// ====================================================================
// 4. DRIVE MANAGEMENT FUNCTIONS
// ====================================================================

function getOrCreateDriveFolder() {
  const C = getConstants();
  const startTime = new Date().getTime();
  
  const folders = DriveApp.getFoldersByName(C.DRIVE_FOLDER_NAME);
  
  let folder;
  if (folders.hasNext()) {
    folder = folders.next();
    logDetailedToSheet({
      eventType: "DRIVE_FOLDER_FOUND",
      timestamp: new Date(),
      details: `Drive folder "${C.DRIVE_FOLDER_NAME}" located`,
      processingTimeMs: new Date().getTime() - startTime
    });
  } else {
    folder = DriveApp.createFolder(C.DRIVE_FOLDER_NAME);
    logDetailedToSheet({
      eventType: "DRIVE_FOLDER_CREATED",
      timestamp: new Date(),
      details: `New Drive folder "${C.DRIVE_FOLDER_NAME}" created`,
      processingTimeMs: new Date().getTime() - startTime
    });
    log(`Created new Drive folder: ${C.DRIVE_FOLDER_NAME}`);
  }
  return folder;
}

function uploadToDrive(blob, fileName, sender, videoId) {
  const startTime = new Date().getTime();
  
  try {
    const folder = getOrCreateDriveFolder();
    const file = folder.createFile(blob.setName(fileName));
    
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    const shareableLink = file.getUrl();
    const processingTime = new Date().getTime() - startTime;
    
    logDetailedToSheet({
      eventType: "DRIVE_UPLOAD_SUCCESS",
      timestamp: new Date(),
      sender: sender,
      videoId: videoId,
      videoTitle: fileName,
      status: "Upload Successful",
      details: `File uploaded to Google Drive: ${fileName}`,
      processingTimeMs: processingTime,
      additionalInfo: `File ID: ${file.getId()} | Link: ${shareableLink}`
    });
    
    log(`Uploaded to Drive: ${fileName}`);
    
    return {
      success: true,
      link: shareableLink,
      fileId: file.getId(),
      size: blob.getBytes().length
    };
  } catch (e) {
    const processingTime = new Date().getTime() - startTime;
    
    logDetailedToSheet({
      eventType: "DRIVE_UPLOAD_FAILED",
      timestamp: new Date(),
      sender: sender,
      videoId: videoId,
      videoTitle: fileName,
      status: "Upload Failed",
      error: e.toString(),
      processingTimeMs: processingTime
    });
    
    log(`Drive upload failed: ${e.toString()}`);
    return {
      success: false,
      error: e.toString()
    };
  }
}

// ====================================================================
// 5. CORE HANDLERS
// ====================================================================

function handleDirectLinks(message, thread, links, sender) {
  const startTime = new Date().getTime();
  const C = getConstants();
  
  if (!C.YOUTUBE_API_KEY) {
    sendApiKeyMissingReply(message, "Download Request");
    logDetailedToSheet({
      eventType: "API_KEY_MISSING",
      timestamp: new Date(),
      sender: sender,
      requestType: "Direct Links",
      linkCount: links.length,
      status: "REJECTED",
      error: "YouTube API key not configured"
    });
    return;
  }
  
  const userRole = getUserRole(sender);
  const roleLimits = C.ROLE_LIMITS[userRole];

  const usageCheck = checkAndIncrementUsage(sender, 'download', links.length, userRole, roleLimits);
  if (!usageCheck.allowed) {
    sendLimitExceededReply(message, usageCheck, userRole, roleLimits);
    logDetailedToSheet({
      eventType: "USAGE_LIMIT_EXCEEDED",
      timestamp: new Date(),
      sender: sender,
      userRole: userRole,
      requestType: "Direct Links",
      linkCount: links.length,
      status: "REJECTED",
      error: usageCheck.message,
      details: `User exceeded ${userRole} download limit`
    });
    return;
  }

  log(`Found ${links.length} direct YouTube link(s). Role: ${userRole}`);
  
  logDetailedToSheet({
    eventType: "DIRECT_LINKS_PROCESSING_START",
    timestamp: new Date(),
    sender: sender,
    userRole: userRole,
    requestType: "Direct Links",
    linkCount: links.length,
    links: links.join(" | "),
    status: "Processing Started"
  });

  const videoResults = [];
  let totalSizeMB = 0;
  let successCount = 0;
  let failureCount = 0;
  const attachments = [];
  let totalAttachmentSizeMB = 0;

  for (const url of links) {
    const videoId = url.includes("v=") ? url.split("v=")[1].substring(0, 11) : url.split("/").pop().substring(0, 11);
    const videoStartTime = new Date().getTime();
    
    log(`Attempting to download ${videoId}...`);
    
    logDetailedToSheet({
      eventType: "VIDEO_DOWNLOAD_START",
      timestamp: new Date(),
      sender: sender,
      userRole: userRole,
      videoId: videoId,
      details: `Attempting to download video: ${videoId}`
    });

    try {
      const qualityParam = userRole.replace(' ', '_');
      const downloadUrl = `${C.RAILWAY_ENDPOINT}/download?url=${encodeURIComponent(url)}&quality=${qualityParam}`;
      const response = UrlFetchApp.fetch(downloadUrl, { muteHttpExceptions: true });
      
      const responseCode = response.getResponseCode();
      
      if (responseCode !== 200) {
        throw new Error(`Download failed with status code ${responseCode}`);
      }

      const blob = response.getBlob();
      const sizeMB = Math.round(blob.getBytes().length / (1024 * 1024) * 10) / 10;
      
      logDetailedToSheet({
        eventType: "VIDEO_BLOB_RECEIVED",
        timestamp: new Date(),
        sender: sender,
        videoId: videoId,
        sizeMb: sizeMB,
        responseCode: responseCode,
        details: `Video blob received from Railway endpoint`
      });

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

      logDetailedToSheet({
        eventType: "VIDEO_METADATA_RETRIEVED",
        timestamp: new Date(),
        sender: sender,
        videoId: videoId,
        videoTitle: title,
        channelName: channel,
        duration: duration,
        sizeMb: sizeMB,
        details: `Video metadata retrieved from YouTube API`
      });

      if (sizeMB <= C.MAX_VIDEO_SIZE_MB) {
        if (sizeMB <= C.EMAIL_ATTACHMENT_SIZE_MB && (totalAttachmentSizeMB + sizeMB) <= C.EMAIL_ATTACHMENT_SIZE_MB) {
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
            deliveryMethod: 'email'
          });
          
          const videoProcessingTime = new Date().getTime() - videoStartTime;
          logDetailedToSheet({
            eventType: "VIDEO_DELIVERY_EMAIL",
            timestamp: new Date(),
            sender: sender,
            userRole: userRole,
            videoId: videoId,
            videoTitle: cleanFileName,
            channelName: channel,
            duration: duration,
            sizeMb: sizeMB,
            deliveryMethod: "Email Attachment",
            status: "SUCCESS",
            details: `Video attached to email (${sizeMB} MB)`,
            processingTimeMs: videoProcessingTime
          });
        } else {
          const driveResult = uploadToDrive(blob, cleanFileName, sender, videoId);
          
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
              deliveryMethod: 'drive'
            });
            
            const videoProcessingTime = new Date().getTime() - videoStartTime;
            logDetailedToSheet({
              eventType: "VIDEO_DELIVERY_DRIVE",
              timestamp: new Date(),
              sender: sender,
              userRole: userRole,
              videoId: videoId,
              videoTitle: cleanFileName,
              channelName: channel,
              duration: duration,
              sizeMb: sizeMB,
              deliveryMethod: "Google Drive",
              status: "SUCCESS",
              details: `Video uploaded to Google Drive (${sizeMB} MB)`,
              processingTimeMs: videoProcessingTime,
              additionalInfo: `Drive Link: ${driveResult.link}`
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
        
        failureCount++;
        const videoProcessingTime = new Date().getTime() - videoStartTime;
        logDetailedToSheet({
          eventType: "VIDEO_SIZE_LIMIT_EXCEEDED",
          timestamp: new Date(),
          sender: sender,
          videoId: videoId,
          sizeMb: sizeMB,
          status: "SKIPPED",
          error: `Size limit exceeded (${sizeMB} MB > ${C.MAX_VIDEO_SIZE_MB} MB)`,
          processingTimeMs: videoProcessingTime
        });
      }

    } catch (e) {
      videoResults.push({
        success: false,
        url: url,
        error: e.toString()
      });
      
      failureCount++;
      const videoProcessingTime = new Date().getTime() - videoStartTime;
      
      log(`Failed ${videoId}: ${e.toString()}`);
      
      logDetailedToSheet({
        eventType: "VIDEO_DOWNLOAD_FAILED",
        timestamp: new Date(),
        sender: sender,
        videoId: videoId,
        status: "FAILED",
        error: e.toString(),
        processingTimeMs: videoProcessingTime,
        details: `Failed to process video: ${e.toString()}`
      });
    }
  }

  const htmlBody = buildMixedDeliveryReplyHtml(videoResults, totalAttachmentSizeMB);
  message.reply("Your videos from YouTube", { htmlBody: C.STYLE + htmlBody, attachments: attachments });

  const totalProcessingTime = new Date().getTime() - startTime;
  const emailCount = videoResults.filter(v => v.deliveryMethod === 'email').length;
  const driveCount = videoResults.filter(v => v.deliveryMethod === 'drive').length;
  
  logDetailedToSheet({
    eventType: "DIRECT_LINKS_PROCESSING_COMPLETE",
    timestamp: new Date(),
    sender: sender,
    userRole: userRole,
    requestType: "Direct Links",
    linkCount: links.length,
    resultCount: successCount,
    status: "COMPLETED",
    details: `Processed ${successCount} videos successfully (${emailCount} email, ${driveCount} Drive), ${failureCount} failed`,
    processingTimeMs: totalProcessingTime,
    additionalInfo: `Total size: ${totalSizeMB.toFixed(1)} MB | Email size: ${totalAttachmentSizeMB.toFixed(1)} MB`
  });
}

function handleSearchQuery(message, thread, originalBody, sender) {
  const startTime = new Date().getTime();
  const C = getConstants();
  let query = extractNewQuery(originalBody);
  const userRole = getUserRole(sender);
  const roleLimits = C.ROLE_LIMITS[userRole];
  
  const maxResults = roleLimits.maxResults; 

  logDetailedToSheet({
    eventType: "SEARCH_QUERY_RECEIVED",
    timestamp: new Date(),
    sender: sender,
    userRole: userRole,
    query: query.substring(0, 150),
    details: `Search query received: "${query}"`
  });

  if (query.toLowerCase() === "test_api_key") {
    testApiKeyStatus(message, sender, C.YOUTUBE_API_KEY);
    return;
  }

  if (!C.YOUTUBE_API_KEY) {
    sendApiKeyMissingReply(message, "Search Request");
    logDetailedToSheet({
      eventType: "API_KEY_MISSING",
      timestamp: new Date(),
      sender: sender,
      requestType: "Search",
      status: "REJECTED",
      error: "YouTube API key not configured"
    });
    return;
  }

  if (["info", "help", "how", "instructions", "?"].includes(query.toLowerCase())) {
    log(`User requested help. Role: ${userRole}`);
    sendHelpCard(message, userRole, roleLimits);
    
    logDetailedToSheet({
      eventType: "HELP_REQUESTED",
      timestamp: new Date(),
      sender: sender,
      userRole: userRole,
      requestType: "Help",
      status: "COMPLETED",
      details: `Help card sent to user`
    });
    return;
  }
  
  const usageCheck = checkAndIncrementUsage(sender, 'search', 1, userRole, roleLimits);
  if (!usageCheck.allowed) {
    sendLimitExceededReply(message, usageCheck, userRole, roleLimits);
    logDetailedToSheet({
      eventType: "USAGE_LIMIT_EXCEEDED",
      timestamp: new Date(),
      sender: sender,
      userRole: userRole,
      requestType: "Search",
      query: query.substring(0, 100),
      status: "REJECTED",
      error: usageCheck.message
    });
    return;
  }
  
  log(`Smart search → extracted query: "${query}"`);

  const searchUrl = `${C.YOUTUBE_API_BASE}/search?part=snippet&maxResults=${maxResults}&q=${encodeURIComponent(query)}&type=video&relevanceLanguage=en&key=${C.YOUTUBE_API_KEY}`;

  logDetailedToSheet({
    eventType: "SEARCH_STARTED",
    timestamp: new Date(),
    sender: sender,
    userRole: userRole,
    query: query.substring(0, 150),
    details: `YouTube search initiated for query: "${query}"`
  });

  try {
    const searchResponse = UrlFetchApp.fetch(searchUrl);
    const searchData = JSON.parse(searchResponse.getContentText());
    let items = searchData.items || [];
    
    logDetailedToSheet({
      eventType: "SEARCH_RESULTS_RECEIVED",
      timestamp: new Date(),
      sender: sender,
      query: query.substring(0, 150),
      resultCount: items.length,
      details: `Search returned ${items.length} results`
    });
    
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
      
      logDetailedToSheet({
        eventType: "SEARCH_METADATA_ENRICHED",
        timestamp: new Date(),
        sender: sender,
        query: query.substring(0, 150),
        resultCount: items.length,
        details: `Search results enriched with statistics and duration data`
      });
    }

    log(`Search returned ${items.length} results`);

    const html = buildSearchResultsHtml(items, message.getTo(), query);
    message.reply(`Search results for: "${query}"`, { htmlBody: C.STYLE + html });

    const totalProcessingTime = new Date().getTime() - startTime;
    logDetailedToSheet({
      eventType: "SEARCH_COMPLETED",
      timestamp: new Date(),
      sender: sender,
      userRole: userRole,
      requestType: "Search",
      query: query.substring(0, 150),
      resultCount: items.length,
      status: "SUCCESS",
      details: `Search completed and results sent to user`,
      processingTimeMs: totalProcessingTime
    });
  } catch (e) {
    if (e.message.includes("returned code 400") && e.message.includes("API key not valid")) {
       log(`Search failed: API Key Error (400)`);
       sendApiKeyMissingReply(message, "Search Request", true);
       logDetailedToSheet({
          eventType: "SEARCH_FAILED",
          timestamp: new Date(),
          sender: sender,
          query: query.substring(0, 150),
          status: "FAILED",
          error: "API Key Invalid (HTTP 400)",
          responseCode: 400
       });
       return;
    }
    
    log(`Search failed: ${e.message}`);
    const totalProcessingTime = new Date().getTime() - startTime;
    logDetailedToSheet({
      eventType: "SEARCH_FAILED",
      timestamp: new Date(),
      sender: sender,
      query: query.substring(0, 150),
      status: "FAILED",
      error: e.toString(),
      processingTimeMs: totalProcessingTime
    });
    message.reply("Search failed — an unexpected error occurred. Check the logs for details.");
  }
}

function testApiKeyStatus(message, sender, apiKey) {
    const C = getConstants();
    const testStartTime = new Date().getTime();
    
    let status, details, color, icon, responseCode;
    
    if (!apiKey) {
        status = "Key Missing";
        details = "The 'YOUTUBE_API_KEY' property is not set in Script Properties. Please add your key.";
        color = "#ff6600";
        icon = "⚠️";
        responseCode = "N/A";
    } else {
        const testUrl = `${C.YOUTUBE_API_BASE}/search?part=id&maxResults=1&q=test&key=${apiKey}`;
        
        try {
            const response = UrlFetchApp.fetch(testUrl, { muteHttpExceptions: true });
            responseCode = response.getResponseCode();
            
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
            responseCode = "ERROR";
        }
    }

    const testProcessingTime = new Date().getTime() - testStartTime;
    logDetailedToSheet({
      eventType: "API_KEY_TEST",
      timestamp: new Date(),
      sender: sender,
      requestType: "API Test",
      status: status,
      responseCode: responseCode,
      details: `API Key Test: ${status} | ${details}`,
      processingTimeMs: testProcessingTime
    });

    const html = `
      <div style="font-family:'Roboto',Arial,sans-serif; max-width:600px; margin:20px auto; padding:25px; background:#f5f5f5; color:#333; border:1px solid #ddd; border-radius:12px; box-shadow: 0 4px 10px rgba(0,0,0,0.1);">
        <h2 style="color:${color}; font-size:24px; margin-bottom:15px; border-bottom:2px solid #eee; padding-bottom:10px; text-align:center;">${icon} API Key Test Result ${icon}</h2>
        <div style="background:white; padding:20px; border-radius:8px; border:1px solid #eee;">
            <p style="font-size:16px; margin-bottom:10px;"><strong>Status:</strong> <span style="color:${color}; font-weight:bold;">${status}</span></p>
            <p style="font-size:14px; line-height:1.5;"><strong>Details:</strong> ${details}</p>
            <p style="font-size:13px; color:#666; margin-top:10px;"><strong>Response Code:</strong> ${responseCode}</p>
            <p style="font-size:13px; color:#666;"><strong>Test Duration:</strong> ${testProcessingTime}ms</p>
        </div>
        <p style="font-size:12px; color:#777; margin-top:20px; text-align:center;">
          Run this test again by sending an email with the subject "bt" and body: <code style="background:#f0f0f0; padding:2px 5px; border-radius:3px;">test_api_key</code>
        </p>
      </div>
    `;

    message.reply("YouTube API Key Status Check", { htmlBody: C.STYLE + html });
}

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
// 6. USAGE AND ROLE TRACKING FUNCTIONS
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
// 7. UTILITY FUNCTIONS
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
// 8. HTML TEMPLATE GENERATION
// ====================================================================

function buildMixedDeliveryReplyHtml(videoResults, totalAttachmentSizeMB) {
  let videoCards = '';
  let hasAttachments = false;
  let hasDriveLinks = false;
  
  videoResults.forEach(result => {
    if (result.success) {
      if (result.deliveryMethod === 'email') {
        hasAttachments = true;
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

// ====================================================================
// 9. TESTING & DIAGNOSTIC FUNCTION
// ====================================================================

function testRoleConfiguration() {
  const C = getConstants();
  
  Logger.log("\n" + "=".repeat(60));
  Logger.log("ROLE CONFIGURATION TEST");
  Logger.log("=".repeat(60) + "\n");
  
  for (const [role, limits] of Object.entries(C.ROLE_LIMITS)) {
    const downloads = limits.downloads === Infinity ? 'Unlimited' : limits.downloads;
    const searches = limits.searches === Infinity ? 'Unlimited' : limits.searches;
    
    Logger.log(`Role: ${role.toUpperCase()}`);
    Logger.log(`  Label: ${limits.label}`);
    Logger.log(`  Downloads: ${downloads}`);
    Logger.log(`  Searches: ${searches}`);
    Logger.log(`  Max Results: ${limits.maxResults}`);
    Logger.log(`  Quality: ${limits.quality}`);
    Logger.log("");
  }
  
  Logger.log("=".repeat(60));
  Logger.log("SUMMARY");
  Logger.log("=".repeat(60));
  Logger.log(`Total Roles: ${Object.keys(C.ROLE_LIMITS).length}`);
  Logger.log(`Default Role: ${C.DEFAULT_ROLE}`);
  Logger.log(`Usage Window: ${C.USAGE_WINDOW_MINUTES} minutes (24 hours)`);
  Logger.log(`Max Video Size: ${C.MAX_VIDEO_SIZE_MB} MB`);
  Logger.log(`Email Attachment Size: ${C.EMAIL_ATTACHMENT_SIZE_MB} MB`);
  Logger.log("\n");
}

// Run this function from Apps Script console to test: testRoleConfiguration()
