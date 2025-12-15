/**
 * Gemini AI Chat – Enhanced Version
 * Works with gemini-2.0-flash or gemini-2.5-flash
 * Improved UI, error handling, and user experience
 */

// ===================== CONSTANTS =====================
const GEMINI_MODEL = 'gemini-2.5-flash';
const MAX_HISTORY = 50;
const HISTORY_KEY = 'CHAT_HISTORY';
const SYSTEM_PROMPT = 'You are a helpful, friendly AI assistant. Provide clear, concise, and accurate responses. Format your responses for readability using paragraphs and line breaks where appropriate.';

// ===================== ENTRY POINT =====================
function onGmailMessageOpen() {
  return buildMainUI_();
}

// ===================== UI BUILDERS =====================
function buildMainUI_() {
  const header = CardService.newCardHeader()
    .setTitle('💬 Gemini AI Chat')
    .setSubtitle('Powered by Gemini 2.5 Flash');

  const card = CardService.newCardBuilder()
    .setHeader(header)
    .addSection(buildHistorySection_())
    .addSection(buildInputSection_());

  return card.build();
}

function buildHistorySection_() {
  const section = CardService.newCardSection();
  const history = loadHistory_();

  if (!history || history.length === 0) {
    section.addWidget(
      CardService.newTextParagraph()
        .setText('👋 Start a new conversation below!')
    );
    return section;
  }

  // Show last 10 messages for performance
  const recentHistory = history.slice(-10);
  
  recentHistory.forEach((msg, idx) => {
    const isUser = msg.role === 'user';
    const label = isUser ? '👤 You' : '🤖 Gemini';
    
    const widget = CardService.newDecoratedText()
      .setTopLabel(label)
      .setText(truncateText_(msg.text, 300))
      .setWrapText(true);
    
    // Light styling
    if (isUser) {
      widget.setEndIcon(CardService.newIconImage().setIconUrl(
        'https://www.gstatic.com/images/branding/product/1x/chat_24dp.png'
      ));
    } else {
      widget.setEndIcon(CardService.newIconImage().setIconUrl(
        'https://www.gstatic.com/images/branding/product/1x/gemini_sparkle_24dp.png'
      ));
    }
    
    section.addWidget(widget);
    
    // Add divider between messages
    if (idx < recentHistory.length - 1) {
      section.addWidget(CardService.newDivider());
    }
  });

  return section;
}

function buildInputSection_() {
  const section = CardService.newCardSection()
    .setHeader('Send a Message');

  section.addWidget(
    CardService.newTextInput()
      .setFieldName('prompt')
      .setTitle('Your Message')
      .setMultiline(true)
      .setHint('Ask Gemini anything...')
  );

  const sendButton = CardService.newTextButton()
    .setText('📤 Send')
    .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
    .setOnClickAction(CardService.newAction().setFunctionName('handleSend_'));

  const clearButton = CardService.newTextButton()
    .setText('🔄 New Chat')
    .setTextButtonStyle(CardService.TextButtonStyle.TEXT)
    .setOnClickAction(CardService.newAction().setFunctionName('handleClear_'));

  section.addWidget(
    CardService.newButtonSet()
      .addButton(sendButton)
      .addButton(clearButton)
  );

  return section;
}

// ===================== EVENT HANDLERS =====================
function handleSend_(e) {
  const text = (e.formInput?.prompt || '').trim();
  
  if (!text) {
    return notify_('Please enter a message.', CardService.TextButtonStyle.TEXT);
  }

  if (text.length > 5000) {
    return notify_('Message too long. Keep it under 5000 characters.', CardService.TextButtonStyle.TEXT);
  }

  try {
    let history = loadHistory_();
    
    // Add user message
    history.push({ 
      role: 'user', 
      text: text,
      timestamp: new Date().toISOString()
    });

    // Trim history to prevent quota issues
    if (history.length > MAX_HISTORY) {
      history = history.slice(-MAX_HISTORY);
    }

    // Call Gemini
    const reply = callGemini_(history);
    
    // Add assistant response
    history.push({ 
      role: 'model', 
      text: reply,
      timestamp: new Date().toISOString()
    });

    saveHistory_(history);
    return refresh_();

  } catch (err) {
    console.error('Send error:', err);
    return notify_('Error sending message: ' + err.toString(), CardService.TextButtonStyle.TEXT);
  }
}

function handleClear_() {
  try {
    PropertiesService.getUserProperties().deleteProperty(HISTORY_KEY);
    return notify_('Conversation cleared. Starting fresh! 🎉', CardService.TextButtonStyle.TEXT);
  } catch (err) {
    console.error('Clear error:', err);
    return notify_('Error clearing history.', CardService.TextButtonStyle.TEXT);
  }
}

// ===================== GEMINI API CALL =====================
function callGemini_(history) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  
  if (!apiKey) {
    return '❌ Error: GEMINI_API_KEY not configured. Please add your API key to Script Properties.';
  }

  try {
    // Build contents array - only include actual conversation, not system prompt
    const contents = history.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.text }]
    }));

    const payload = {
      contents: contents,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1024,
        topP: 0.95,
        topK: 64
      }
    };

    const options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
      timeout: 60
    };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
    const response = UrlFetchApp.fetch(url, options);
    const status = response.getResponseCode();
    const text = response.getContentText();

    // Log for debugging
    console.log('Status:', status);
    console.log('Response:', text.substring(0, 500));

    // Parse response
    let data;
    try {
      data = JSON.parse(text);
    } catch (parseErr) {
      console.error('JSON parse error:', text);
      return '❌ Failed to parse response. Check logs and API key.';
    }

    // Handle API errors
    if (status !== 200) {
      const errorMsg = data.error?.message || 'Unknown API error';
      console.error(`Gemini API error (${status}):`, errorMsg);
      return `❌ API Error (${status}): ${errorMsg}`;
    }

    // Extract response text - handle both response formats
    let reply = null;
    
    if (data.candidates && data.candidates.length > 0) {
      const candidate = data.candidates[0];
      if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
        reply = candidate.content.parts[0].text;
      }
    }
    
    if (!reply) {
      console.error('No text in response. Full response:', JSON.stringify(data));
      return '❌ Gemini returned an empty response. Try again.';
    }

    return reply;

  } catch (err) {
    console.error('Gemini request exception:', err.toString());
    return `❌ Error: ${err.toString()}`;
  }
}

// ===================== STORAGE OPERATIONS =====================
function loadHistory_() {
  try {
    const data = PropertiesService.getUserProperties().getProperty(HISTORY_KEY);
    return data ? JSON.parse(data) : [];
  } catch (err) {
    console.error('Load history error:', err);
    return [];
  }
}

function saveHistory_(history) {
  try {
    const json = JSON.stringify(history);
    
    // Check size before saving (Apps Script has limits)
    if (json.length > 100000) {
      // Keep only recent history if too large
      history = history.slice(-20);
    }
    
    PropertiesService.getUserProperties().setProperty(HISTORY_KEY, JSON.stringify(history));
  } catch (err) {
    console.error('Save history error:', err);
  }
}

// ===================== UI HELPERS =====================
function refresh_() {
  return CardService.newActionResponseBuilder()
    .setNavigation(
      CardService.newNavigation()
        .updateCard(buildMainUI_())
    )
    .build();
}

function notify_(message, style = CardService.TextButtonStyle.FILLED) {
  return CardService.newActionResponseBuilder()
    .setNotification(
      CardService.newNotification()
        .setText(message)
        .setType(CardService.NotificationType.INFO)
    )
    .setNavigation(
      CardService.newNavigation()
        .updateCard(buildMainUI_())
    )
    .build();
}

function truncateText_(text, maxLength) {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}