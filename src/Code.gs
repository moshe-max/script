/**
 * Gemini AI Chat – Premium Edition
 * Enhanced UI, Better UX, Advanced Options
 */

// ===================== CONSTANTS =====================
const GEMINI_MODEL = 'gemini-2.5-flash';
const MAX_HISTORY = 50;
const HISTORY_KEY = 'CHAT_HISTORY';
const SETTINGS_KEY = 'CHAT_SETTINGS';

// Default system prompts for different modes
const SYSTEM_PROMPTS = {
  assistant: 'You are a helpful, friendly AI assistant. Provide clear, concise, and accurate responses.',
  creative: 'You are a creative writing assistant. Be imaginative, engaging, and helpful. Write in an expressive style.',
  technical: 'You are a technical expert. Provide detailed, accurate technical explanations with code examples when relevant.',
  tutor: 'You are a patient tutor. Explain concepts clearly, use analogies, and help the user understand step-by-step.',
  concise: 'Be extremely concise and direct. Answer in 1-2 sentences when possible.'
};

// ===================== ENTRY POINT =====================
function onGmailMessageOpen() {
  return buildMainUI_();
}

// ===================== MAIN UI =====================
function buildMainUI_() {
  const settings = loadSettings_();
  
  return CardService.newCardBuilder()
    .setHeader(buildHeader_())
    .addSection(buildModeSelector_(settings.mode || 'assistant'))
    .addSection(buildChatSection_())
    .addSection(buildInputSection_(settings))
    .addSection(buildSettingsSection_(settings))
    .build();
}

function buildHeader_() {
  return CardService.newCardHeader()
    .setTitle('💬 Gemini AI Chat')
    .setSubtitle('Powered by Gemini 2.5 Flash | Smart • Fast • Flexible');
}

// ===================== MODE SELECTOR =====================
function buildModeSelector_(currentMode) {
  const section = CardService.newCardSection().setHeader('Mode');
  
  const modes = [
    { id: 'assistant', icon: '🤖', label: 'Assistant' },
    { id: 'creative', icon: '✨', label: 'Creative' },
    { id: 'technical', icon: '⚙️', label: 'Technical' },
    { id: 'tutor', icon: '📚', label: 'Tutor' },
    { id: 'concise', icon: '⚡', label: 'Concise' }
  ];

  const buttons = modes.map(mode => {
    const action = CardService.newAction()
      .setFunctionName('setMode_')
      .setParameters({ mode: mode.id });
    
    const btn = CardService.newTextButton()
      .setText(`${mode.icon} ${mode.label}`)
      .setOnClickAction(action);
    
    if (currentMode === mode.id) {
      btn.setTextButtonStyle(CardService.TextButtonStyle.FILLED);
    } else {
      btn.setTextButtonStyle(CardService.TextButtonStyle.TEXT);
    }
    
    return btn;
  });

  // Group buttons into rows
  section.addWidget(CardService.newButtonSet().addButton(buttons[0]).addButton(buttons[1]));
  section.addWidget(CardService.newButtonSet().addButton(buttons[2]).addButton(buttons[3]).addButton(buttons[4]));

  return section;
}

// ===================== CHAT HISTORY SECTION =====================
function buildChatSection_() {
  const section = CardService.newCardSection().setHeader('💬 Conversation');
  const history = loadHistory_();

  if (!history || history.length === 0) {
    section.addWidget(
      CardService.newTextParagraph()
        .setText('👋 Select a mode and start chatting! Each mode has a different personality.')
    );
    return section;
  }

  // Show last 8 messages
  const recentHistory = history.slice(-8);
  
  recentHistory.forEach((msg) => {
    const isUser = msg.role === 'user';
    const label = isUser ? '👤 You' : '🤖 Gemini';
    const truncated = truncateText_(msg.text, 250);
    
    const widget = CardService.newDecoratedText()
      .setTopLabel(label)
      .setText(truncated)
      .setWrapText(true);
    
    if (!isUser) {
      widget.setBottomLabel(formatTime_(msg.timestamp));
    }
    
    section.addWidget(widget);
  });

  return section;
}

// ===================== INPUT SECTION =====================
function buildInputSection_(settings) {
  const section = CardService.newCardSection().setHeader('📝 Message');

  section.addWidget(
    CardService.newTextInput()
      .setFieldName('prompt')
      .setTitle('Type here')
      .setMultiline(true)
      .setHint(`Message in ${settings.mode || 'assistant'} mode...`)
  );

  const currentTemp = settings.temperature || '0.7';
  
  section.addWidget(
    CardService.newDecoratedText()
      .setText('Creativity Level: ' + currentTemp)
      .setBottomLabel('Adjust model creativity (0=precise, 1=creative)')
  );

  section.addWidget(
    CardService.newSelectionInput()
      .setType(CardService.SelectionInputType.RADIO_BUTTON)
      .setFieldName('temperature')
      .setTitle('Temperature')
      .addItem('🎯 Precise (0.3)', '0.3', currentTemp === '0.3')
      .addItem('⚖️ Balanced (0.7)', '0.7', currentTemp === '0.7')
      .addItem('✨ Creative (1.0)', '1.0', currentTemp === '1.0')
  );

  // Action buttons
  const sendBtn = CardService.newTextButton()
    .setText('📤 Send Message')
    .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
    .setOnClickAction(CardService.newAction().setFunctionName('handleSend_'));

  const copyBtn = CardService.newTextButton()
    .setText('📋 Copy Last')
    .setTextButtonStyle(CardService.TextButtonStyle.TEXT)
    .setOnClickAction(CardService.newAction().setFunctionName('copyLastMessage_'));

  const clearBtn = CardService.newTextButton()
    .setText('🗑️ Clear')
    .setTextButtonStyle(CardService.TextButtonStyle.TEXT)
    .setOnClickAction(CardService.newAction().setFunctionName('handleClear_'));

  section.addWidget(CardService.newButtonSet().addButton(sendBtn).addButton(copyBtn).addButton(clearBtn));

  return section;
}

// ===================== SETTINGS SECTION =====================
function buildSettingsSection_(settings) {
  const section = CardService.newCardSection().setHeader('⚙️ Options');
  const currentMaxTokens = settings.maxTokens || '512';
  const currentHistoryLength = settings.historyLength || '10';

  section.addWidget(
    CardService.newSelectionInput()
      .setType(CardService.SelectionInputType.RADIO_BUTTON)
      .setFieldName('maxTokens')
      .setTitle('Response Length')
      .addItem('📄 Short (256 tokens)', '256', currentMaxTokens === '256')
      .addItem('📃 Medium (512 tokens)', '512', currentMaxTokens === '512')
      .addItem('📕 Long (1024 tokens)', '1024', currentMaxTokens === '1024')
  );

  section.addWidget(
    CardService.newSelectionInput()
      .setType(CardService.SelectionInputType.RADIO_BUTTON)
      .setFieldName('historyLength')
      .setTitle('Context Window')
      .addItem('🎯 Last 5 messages', '5', currentHistoryLength === '5')
      .addItem('⚖️ Last 10 messages', '10', currentHistoryLength === '10')
      .addItem('🧠 Full history', '999', currentHistoryLength === '999')
  );

  section.addWidget(
    CardService.newTextParagraph()
      .setText('💾 Total messages: ' + (loadHistory_().length || 0))
  );

  return section;
}

// ===================== EVENT HANDLERS =====================
function setMode_(e) {
  const mode = e.parameters.mode; 
  const settings = loadSettings_();
  settings.mode = mode;
  saveSettings_(settings);
  return refresh_();
}

function handleSend_(e) {
  const text = (e.formInput?.prompt || '').trim();
  const temperature = parseFloat(e.formInput?.temperature || 0.7);
  const maxTokens = parseInt(e.formInput?.maxTokens || 512);
  const historyLimit = parseInt(e.formInput?.historyLength || 10); 

  if (!text) {
    return notify_('✏️ Please enter a message.', CardService.NotificationType.INFO);
  }

  if (text.length > 5000) {
    return notify_('⚠️ Message too long. Keep it under 5000 characters.', CardService.NotificationType.WARNING);
  }

  try {
    const settings = loadSettings_();
    const mode = settings.mode || 'assistant';
    
    let history = loadHistory_();
    if (history.length > historyLimit) {
      history = history.slice(-historyLimit);
    }

    history.push({ 
      role: 'user', 
      text: text,
      timestamp: new Date().toISOString(),
      mode: mode
    });

    const reply = callGemini_(history, mode, temperature, maxTokens);
    
    history.push({ 
      role: 'model', 
      text: reply,
      timestamp: new Date().toISOString(),
      mode: mode
    });

    if (history.length > MAX_HISTORY) {
      history = history.slice(-MAX_HISTORY);
    }

    saveHistory_(history);
    
    settings.temperature = temperature.toString();
    settings.maxTokens = maxTokens.toString();
    settings.historyLength = historyLimit.toString();
    saveSettings_(settings);

    return refresh_();

  } catch (err) {
    console.error('Send error:', err);
    return notify_('❌ ' + err.toString(), CardService.NotificationType.ERROR);
  }
}

function handleClear_() {
  try {
    PropertiesService.getUserProperties().deleteProperty(HISTORY_KEY);
    return notify_('🗑️ Conversation cleared! Starting fresh.', CardService.NotificationType.INFO);
  } catch (err) {
    console.error('Clear error:', err);
    return notify_('❌ Error clearing history.', CardService.NotificationType.ERROR);
  }
}

function copyLastMessage_() {
  const history = loadHistory_();
  if (!history.length) {
    return notify_('ℹ️ No messages to copy.', CardService.NotificationType.INFO);
  }

  let textToCopy = null;
  const lastMessage = history[history.length - 1];

  if (lastMessage.role === 'user') {
    if (history.length > 1) {
      textToCopy = history[history.length - 2].text;
    }
  } else {
    textToCopy = lastMessage.text;
  }
  
  if (textToCopy) {
      copyToClipboard_(textToCopy);
      return CardService.newActionResponseBuilder()
         .setNotification(CardService.newNotification().setText('✅ Copied to clipboard (Check console log)!').setType(CardService.NotificationType.INFO))
         .build();
  }
  
  return notify_('ℹ️ No model response available to copy.', CardService.NotificationType.INFO);
}

// ===================== GEMINI API CALL =====================
function callGemini_(history, mode, temperature, maxTokens) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  
  if (!apiKey) {
    return '❌ ERROR: GEMINI_API_KEY not found in Script Properties.';
  }

  try {
    const systemPrompt = SYSTEM_PROMPTS[mode] || SYSTEM_PROMPTS.assistant;

    // Build the contents array (system prompt + conversation)
    const contents = [];
    contents.push({ text: systemPrompt, type: 'text' });

    history.forEach(msg => {
      contents.push({ text: msg.text, type: 'text' });
    });

    // Payload structured for latest Gemini API
    const payload = {
      temperature: temperature,
      maxOutputTokens: maxTokens,
      topP: 0.95,
      topK: 64,
      candidateCount: 1,
      input: {
        structuredInput: {
          parts: contents.map(c => ({ text: c.text }))
        }
      }
    };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
    const options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
      timeout: 60
    };

    const response = UrlFetchApp.fetch(url, options);
    const status = response.getResponseCode();
    const text = response.getContentText();

    let data;
    try { data = JSON.parse(text); } 
    catch { return '❌ Failed to parse response from API server.'; }

    if (status !== 200) {
      const errorMsg = data.error?.message || 'Unknown API Error';
      return `❌ API Error: ${errorMsg}`;
    }

    // Extract the model reply
    let reply = data.candidates?.[0]?.content?.[0]?.text || null;
    if (!reply && data.candidates?.[0]?.finishReason) {
      return `⚠️ Response blocked by model: ${data.candidates[0].finishReason}`;
    }

    if (!reply) return '❌ Empty or invalid response from Gemini.';
    return reply;

  } catch (err) {
    return `❌ Error: ${err.toString()}`;
  }
}


// ===================== STORAGE =====================
function loadHistory_() {
  try {
    const data = PropertiesService.getUserProperties().getProperty(HISTORY_KEY);
    return data ? JSON.parse(data) : [];
  } catch (err) { return []; }
}

function saveHistory_(history) {
  try {
    let historyToSave = [...history];
    if (JSON.stringify(historyToSave).length > 100000) {
      historyToSave = historyToSave.slice(-20);
    }
    PropertiesService.getUserProperties().setProperty(HISTORY_KEY, JSON.stringify(historyToSave));
  } catch {}
}

function loadSettings_() {
  try {
    const data = PropertiesService.getUserProperties().getProperty(SETTINGS_KEY);
    return data ? JSON.parse(data) : {};
  } catch { return {}; }
}

function saveSettings_(settings) {
  try { PropertiesService.getUserProperties().setProperty(SETTINGS_KEY, JSON.stringify(settings)); } catch {}
}

// ===================== UI HELPERS =====================
function refresh_() {
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().updateCard(buildMainUI_()))
    .build();
}

function notify_(message, type = CardService.NotificationType.INFO) {
  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText(message).setType(type))
    .setNavigation(CardService.newNavigation().updateCard(buildMainUI_()))
    .build();
}

function truncateText_(text, maxLength) {
  return text.length <= maxLength ? text : text.substring(0, maxLength) + '...';
}

function formatTime_(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const hours = date.getHours().toString().padStart(2, '0');
  const mins = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${mins}`;
}

function copyToClipboard_(text) {
  console.log('Attempting to copy text to clipboard (placeholder - check console log for value):', text);
}
