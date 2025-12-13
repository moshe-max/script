/**
 * Google Apps Script for a YouTube Downloader/Search Bot via Gmail.
 */

function getConstants() {
  const YOUTUBE_API_KEY = PropertiesService.getScriptProperties().getProperty('YOUTUBE_API_KEY');

  return {
    RAILWAY_ENDPOINT: "https://yt-mail.onrender.com",
    YOUTUBE_API_BASE: "https://www.googleapis.com/youtube/v3",
    LOG_SPREADSHEET_ID: "1vxiRaNLMW5mtlrneiRBnzx0PKgvKJAmGqVnALKH6vFA",
    MAX_ATTACHMENT_SIZE_MB: 24,
    ROLE_LIMITS: {
      'admin': { downloads: Infinity, searches: Infinity, maxResults: 15, label: 'Admin' },
      'pro plus': { downloads: 25, searches: 25, maxResults: 15, label: 'Pro Plus User' },
      'pro user': { downloads: 12, searches: 12, maxResults: 12, label: 'Pro User' },
      'user': { downloads: 5, searches: 5, maxResults: 5, label: 'Standard User' },
      'guest': { downloads: 1, searches: 5, maxResults: 5, label: 'Guest' }
    },
    DEFAULT_ROLE: 'guest',
    USAGE_WINDOW_MINUTES: 1440,
    USAGE_SHEET_NAME: "Usage & Limits",
    ROLES_SHEET_NAME: "User Roles",
    STYLE: "<style>@import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap');</style>",
    YOUTUBE_API_KEY: YOUTUBE_API_KEY
  };
}

function processYouTubeEmails() {
  Logger.log("=== Bot started ===");

  const threads = GmailApp.search('is:unread subject:yt');
  Logger.log("Found " + threads.length + " unread thread(s) with yt in subject");

  for (const thread of threads) {
    const messages = thread.getMessages();
    const message = messages[messages.length - 1];

    if (!message.isUnread()) continue;

    const sender = message.getFrom();
    const subject = message.getSubject();
    const bodyPlain = message.getPlainBody().trim();
    const bodyHtml = message.getBody();
    const combinedBody = bodyPlain + "\n\n" + bodyHtml;

    Logger.log("Processing -> From: " + sender + " | Subject: " + subject);

    const youtubeRegex = /(https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)[A-Za-z0-9_-]{11}[^\s<>"'\]]*)/g;
    const links = [...new Set((combinedBody.match(youtubeRegex) || []))];

    Logger.log("[DEBUG] Extracted Links Count: " + links.length);
    if (links.length > 0) {
      Logger.log("[DEBUG] Links found: " + links.join(' | '));
      handleDirectLinks(message, thread, links, sender);
    } else {
      Logger.log("[DEBUG] No links found. Using Plain Body as Search Query: " + bodyPlain);
      handleSearchQuery(message, thread, bodyPlain, sender);
    }

    thread.markRead();
  }

  Logger.log("=== Bot finished ===\n");
}

function handleDirectLinks(message, thread, links, sender) {
  const C = getConstants();
  if (!C.YOUTUBE_API_KEY) {
    sendApiKeyMissingReply(message, "Download Request");
    return;
  }

  const userRole = getUserRole(sender);
  const roleLimits = C.ROLE_LIMITS[userRole];

  const usageCheck = checkAndIncrementUsage(sender, 'download', links.length, userRole, roleLimits);
  if (!usageCheck.allowed) {
    sendLimitExceededReply(message, usageCheck, userRole, roleLimits);
    logToSheet({
      sender: sender,
      requestType: "Direct Links",
      queryOrUrls: links.join(", "),
      actionDetail: "Rejected: " + usageCheck.message + " (Role: " + userRole + ")",
      status: "LIMIT EXCEEDED"
    });
    return;
  }

  log("Found " + links.length + " direct YouTube link(s). Role: " + userRole);

  logToSheet({
    sender: sender,
    requestType: "Direct Links",
    queryOrUrls: links.join(", "),
    actionDetail: links.length + " links requested (Role: " + userRole + ")",
    status: "Request Started"
  });

  const attachments = [];
  let totalSizeMB = 0;
  let attachedCount = 0;
  const videoCards = [];

  for (const url of links) {
    const videoId = url.includes("v=") ? url.split("v=")[1].substring(0, 11) : url.split("/").pop().substring(0, 11);
    log("Attempting to download " + videoId + "...");

    try {
      const downloadUrl = C.RAILWAY_ENDPOINT + "/download?url=" + encodeURIComponent(url);
      const response = UrlFetchApp.fetch(downloadUrl, { muteHttpExceptions: true });

      if (response.getResponseCode() !== 200) {
        throw new Error("Download failed with status code " + response.getResponseCode());
      }

      const blob = response.getBlob();
      const sizeMB = Math.round(blob.getBytes().length / (1024 * 1024) * 10) / 10;

      const infoUrl = C.YOUTUBE_API_BASE + "/videos?part=snippet,statistics,contentDetails&id=" + videoId + "&key=" + C.YOUTUBE_API_KEY;
      const infoRes = UrlFetchApp.fetch(infoUrl);
      const infoData = JSON.parse(infoRes.getContentText()).items[0];

      if (!infoData) throw new Error("Video metadata not found.");

      const title = (infoData.snippet.title || "Unknown Video").replace(/[\\/:*?"<>|]/g, "_").substring(0, 100);
      const channel = infoData.snippet.channelTitle || "Unknown Channel";
      const views = Number(infoData.statistics.viewCount || 0).toLocaleString();
      const uploadDate = Utilities.formatDate(new Date(infoData.snippet.publishedAt), "GMT", "MMM d, yyyy");
      const thumb = infoData.snippet.thumbnails.high.url;

      const isoDuration = infoData.contentDetails ? infoData.contentDetails.duration : null;
      const duration = formatDuration(isoDuration);

      const cleanFileName = title + " - " + channel + ".mp4";

      if (totalSizeMB + sizeMB <= C.MAX_ATTACHMENT_SIZE_MB) {
        attachments.push(blob.setName(cleanFileName));
        totalSizeMB += sizeMB;
        attachedCount++;

        videoCards.push(buildVideoCardHtml({ title: title, channel: channel, views: views, uploadDate: uploadDate, thumb: thumb, cleanFileName: cleanFileName, sizeMB: sizeMB, duration: duration }));

        logToSheet({
          sender: sender,
          requestType: "Direct Links",
          videoId: videoId,
          title: cleanFileName,
          actionDetail: "Attached to email",
          sizeMb: sizeMB,
          status: "Download Success"
        });
      } else {
        videoCards.push("<p style='color:#FF0000; font-size:14px; margin-top:10px;'>More videos were skipped due to the Gmail " + C.MAX_ATTACHMENT_SIZE_MB + " MB size limit.</p>");

        logToSheet({
          sender: sender,
          requestType: "Direct Links",
          videoId: videoId,
          title: title,
          actionDetail: "Skipped: Size limit exceeded",
          sizeMb: sizeMB,
          status: "Download Skipped"
        });
        break;
      }

    } catch (e) {
      videoCards.push("<div style='background:#fff3f3; color:#c00; padding:15px; border-radius:8px; border:1px solid #c00; margin:10px 0;'>Failed to download " + url + ": " + e.toString() + "</div>");
      log("Failed " + videoId + ": " + e.toString());

      logToSheet({
        sender: sender,
        requestType: "Direct Links",
        videoId: videoId,
        actionDetail: "URL: " + url + " | Error: " + e.toString(),
        status: "Download Failed"
      });
    }
  }

  const htmlBody = buildDownloadReplyHtml(videoCards);
  message.reply("Your videos from YouTube", { htmlBody: C.STYLE + htmlBody, attachments: attachments });

  logToSheet({
    sender: sender,
    requestType: "Direct Links",
    actionDetail: "Attached " + attachedCount + " videos (" + (totalSizeMB).toFixed(1) + " MB) of " + links.length + " total",
    sizeMb: totalSizeMB,
    status: "Batch Summary"
  });
}

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
    log("User requested help. Role: " + userRole);
    sendHelpCard(message, userRole, roleLimits);

    logToSheet({
      sender: sender,
      requestType: "Smart Search",
      queryOrUrls: query,
      actionDetail: "Instructions sent (Role: " + userRole + ")",
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
      actionDetail: "Rejected: " + usageCheck.message + " (Role: " + userRole + ")",
      status: "LIMIT EXCEEDED"
    });
    return;
  }

  logToSheet({
    sender: sender,
    requestType: "Smart Search",
    queryOrUrls: query,
    actionDetail: "Search for: " + query + " (Role: " + userRole + ", Max Results: " + maxResults + ")",
    status: "Request Started"
  });

  log("Smart search -> extracted query: " + query);

  const searchUrl = C.YOUTUBE_API_BASE + "/search?part=snippet&maxResults=" + maxResults + "&q=" + encodeURIComponent(query) + "&type=video&key=" + C.YOUTUBE_API_KEY;

  try {
    const searchResponse = UrlFetchApp.fetch(searchUrl);
    const searchData = JSON.parse(searchResponse.getContentText());
    let items = searchData.items || [];

    const videoIds = items.map(function(item) { return item.id.videoId; }).join(',');

    if (videoIds.length > 0) {
      const videoInfoUrl = C.YOUTUBE_API_BASE + "/videos?part=statistics,contentDetails&id=" + videoIds + "&key=" + C.YOUTUBE_API_KEY;
      const infoResponse = UrlFetchApp.fetch(videoInfoUrl);
      const infoData = JSON.parse(infoResponse.getContentText());

      const statsMap = {};
      infoData.items.forEach(function(infoItem) {
        statsMap[infoItem.id] = {
          statistics: infoItem.statistics,
          contentDetails: infoItem.contentDetails
        };
      });

      items = items.map(function(item) {
        const videoId = item.id.videoId;
        const videoInfo = statsMap[videoId] || {};
        item.statistics = videoInfo.statistics || {};
        item.contentDetails = videoInfo.contentDetails || {};
        return item;
      });
    }

    log("Search returned " + items.length + " results");

    const html = buildSearchResultsHtml(items, message.getTo(), query);
    message.reply("Search results for: " + query, { htmlBody: C.STYLE + html });

    logToSheet({
      sender: sender,
      requestType: "Smart Search",
      queryOrUrls: query,
      actionDetail: items.length + " results returned",
      status: "Search Success"
    });
  } catch (e) {
    if (e.message.includes("returned code 400") && e.message.includes("API key not valid")) {
      log("Search failed: API Key Error (400)");
      sendApiKeyMissingReply(message, "Search Request", true);
      logToSheet({
        sender: sender,
        requestType: "Smart Search",
        queryOrUrls: query,
        actionDetail: "Error: API Key Invalid (400)",
        status: "Search Failed"
      });
      return;
    }

    log("Search failed: " + e.message);
    logToSheet({
      sender: sender,
      requestType: "Smart Search",
      queryOrUrls: query,
      actionDetail: "Error: " + e.message,
      status: "Search Failed"
    });
    message.reply("Search failed - an unexpected error occurred. Check the logs for details.");
  }
}

function testApiKeyStatus(message, sender, apiKey) {
  const C = getConstants();

  let status, details, color, icon;

  if (!apiKey) {
    status = "Key Missing";
    details = "The 'YOUTUBE_API_KEY' property is not set in Script Properties. Please add your key.";
    color = "#ff6600";
    icon = "⚠️";
  } else {
    const testUrl = C.YOUTUBE_API_BASE + "/search?part=id&maxResults=1&q=test&key=" + apiKey;

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
        icon = "🛑";
      } else {
        status = "API Test Failed (" + responseCode + ")";
        details = "Received unexpected HTTP status code: " + responseCode + ". Raw response: " + response.getContentText().substring(0, 100) + "...";
        color = "#FF9800";
        icon = "❓";
      }
    } catch (e) {
      status = "Connection Error";
      details = "Failed to connect to the Google API endpoint: " + e.toString();
      color = "#757575";
      icon = "🔌";
    }
  }

  const html = "<div style='font-family:Roboto,Arial,sans-serif; max-width:600px; margin:20px auto; padding:25px; background:#f5f5f5; color:#333; border:1px solid #ddd; border-radius:12px; box-shadow: 0 4px 10px rgba(0,0,0,0.1);'><h2 style='color:" + color + "; font-size:24px; margin-bottom:15px; border-bottom:2px solid #eee; padding-bottom:10px; text-align:center;'>" + icon + " API Key Test Result " + icon + "</h2><div style='background:white; padding:20px; border-radius:8px; border:1px solid #eee;'><p style='font-size:16px; margin-bottom:10px;'><strong>Status:</strong> <span style='color:" + color + "; font-weight:bold;'>" + status + "</span></p><p style='font-size:14px; line-height:1.5;'><strong>Details:</strong> " + details + "</p></div><p style='font-size:12px; color:#777; margin-top:20px; text-align:center;'>Run this test again by sending an email with the subject yt and body: <code style='background:#f0f0f0; padding:2px 5px; border-radius:3px;'>test_api_key</code></p></div>";

  message.reply("YouTube API Key Status Check", { htmlBody: C.STYLE + html });

  logToSheet({
    sender: sender,
    requestType: "API Key Test",
    queryOrUrls: "test_api_key",
    actionDetail: "Key Status: " + status + " | Details: " + details,
    status: status
  });
}

function sendApiKeyMissingReply(message, requestType, isInvalid) {
  const C = getConstants();
  const status = isInvalid ? "Invalid API Key" : "API Key Missing";
  const details = isInvalid
    ? "The key in Script Properties is being rejected by the YouTube API (HTTP 400 error). Please verify the key's accuracy and ensure the 'YouTube Data API v3' service is enabled in your Google Cloud Console."
    : "The 'YOUTUBE_API_KEY' property is not found in Script Properties. This key is required for all searches and for fetching video metadata during downloads.";

  const html = "<div style='font-family:Roboto,Arial,sans-serif; max-width:600px; margin:20px auto; padding:25px; background:#fff0f0; color:#c00; border:2px solid #c00; border-radius:12px; box-shadow: 0 4px 10px rgba(0,0,0,0.1);'><h2 style='color:#c00; font-size:24px; margin-bottom:15px; text-align:center;'>❌ " + status + "</h2><p style='font-size:16px; color:#333; line-height:1.6; margin-bottom:20px;'>Your recent " + requestType + " failed.</p><div style='background:white; padding:15px; border-radius:8px; border:1px solid #fdd;'><strong style='color:#c00; display:block; margin-bottom:5px;'>Required Action:</strong><p style='font-size:14px; color:#555;'>" + details + "</p><p style='font-size:14px; color:#555; margin-top:10px;'>To diagnose further, send an email with the subject yt and the body: <code style='background:#f0f0f0; padding:2px 5px; border-radius:3px;'>test_api_key</code></p></div></div>";

  message.reply("Action Blocked: API Key Error", { htmlBody: C.STYLE + html });
  log("Blocked request due to " + status);
}

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

    log("Created new sheet: " + C.ROLES_SHEET_NAME + ". Please populate it with user emails and roles.");
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
        log("Warning: Role " + role + " for " + sender + " is invalid. Defaulting to " + defaultRole + ".");
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
      const newRowData = [sender, now, 0, 0, type === 'download' ? now : null, type === 'search' ? now : null];
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
        const retryWait = minutes + " minute" + (minutes !== 1 ? "s" : "");

        return {
          allowed: false,
          message: "You have reached your " + roleLimits.label + " limit of " + MAX_LIMIT + " " + type + " requests in the last 24 hours (1 day).",
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

function log(msg) {
  console.log(new Date().toISOString() + " | " + msg);
}

function sendLimitExceededReply(message, usageCheck, userRole, roleLimits) {
  const C = getConstants();

  const displayDownloads = roleLimits.downloads === Infinity ? 'Unlimited' : roleLimits.downloads;
  const displaySearches = roleLimits.searches === Infinity ? 'Unlimited' : roleLimits.searches;
  const currentDownloads = roleLimits.downloads === Infinity ? 'N/A' : usageCheck.currentDownloads;
  const currentSearches = roleLimits.searches === Infinity ? 'N/A' : usageCheck.currentSearches;

  const html = "<div style='font-family:Roboto,Arial,sans-serif; max-width:600px; margin:20px auto; padding:25px; background:#fef3f3; color:#a00; border:1px solid #f00; border-radius:12px; text-align:center; box-shadow: 0 4px 10px rgba(0,0,0,0.1);'><h2 style='color:#d00; font-size:24px; margin-bottom:10px;'>🛑 Usage Limit Reached</h2><p style='font-size:16px; color:#555; line-height:1.6;'>" + usageCheck.message + "</p><div style='background:#fff; padding:15px; border-radius:8px; margin:20px 0;'><strong style='display:block; font-size:18px; color:#111; margin-bottom:10px;'>Your Current Role: " + roleLimits.label + " (" + userRole + ")</strong><ul style='list-style:none; padding:0; margin:0; text-align:left;'><li style='margin-bottom:5px; color:#333;'>Downloads Limit: <strong style='float:right;'>" + currentDownloads + " / " + displayDownloads + "</strong></li><li style='color:#333;'>Searches Limit: <strong style='float:right;'>" + currentSearches + " / " + displaySearches + "</strong></li><li style='color:#333;'>Search Results Max: <strong style='float:right;'>" + roleLimits.maxResults + "</strong></li></ul></div><p style='font-size:14px; margin-top:20px; color:#777;'>You can try again in approximately <strong style='color:#333;'>" + usageCheck.retryWait + "</strong>.</p></div>";

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
    console.log("LOGGED to permanent sheet: " + logData.status + " - " + (logData.actionDetail || logData.requestType));
  } catch (e) {
    console.error("LOGGING
