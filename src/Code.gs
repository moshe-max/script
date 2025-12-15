/**
 * Gemini AI Chat – Premium Edition with Multi-Chat & Usage Limits
 * Multiple conversations, quota management, and analytics
 */

// ===================== CONSTANTS =====================
const GEMINI_MODEL = 'gemini-2.5-flash';
const MAX_HISTORY = 50;
const CHATS_KEY = 'ALL_CHATS';
const CURRENT_CHAT_KEY = 'CURRENT_CHAT_ID';
const SETTINGS_KEY = 'CHAT_SETTINGS';
const USAGE_KEY = 'USAGE_STATS';

// Daily usage limits
const DAILY_LIMITS = {
  messages: 100,
  tokens: 100000
};

// System prompts for different modes
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
  const currentChatId = getCurrentChatId_();
  
  return CardService.newCardBuilder()
    .setHeader(buildHeader_())
    .addSection(buildUsageSection_())
    .addSection(buildChatListSection_(currentChatId))
    .addSection(buildModeSelector_(settings.mode || 'assistant'))
    .addSection(buildChatSection_(currentChatId))
    .addSection(buildInputSection_(settings))
    .addSection(buildSettingsSection_(settings))
    .build();
}

function buildHeader_() {
  return CardService.newCardHeader()
    .setTitle('💬 Gemini Multi-Chat')
    .setSubtitle('Multiple conversations • Usage tracking • Smart limits');
}

// ===================== USAGE SECTION =====================
function buildUsageSection_() {
  const section = CardService.newCardSection().setHeader('📊 Daily Usage');
  const usage = getUsageStats_();
  
  const messagesUsed = usage.messagesUsed || 0;
  const tokensUsed = usage.tokensUsed || 0;
  const messagePercent = Math.round((messagesUsed / DAILY_LIMITS.messages) * 100);
  const tokenPercent = Math.round((tokensUsed / DAILY_LIMITS.tokens) * 100);

  // Messages bar
  let messageBar = '█'.repeat(Math.min(20, Math.ceil(messagePercent / 5))) + 
                   '░'.repeat(20 - Math.ceil(messagePercent / 5));
  section.addWidget(
    CardService.newTextParagraph()
      .setText(`💬 Messages: ${messagesUsed}/${DAILY_LIMITS.messages} (${messagePercent}%)\n${messageBar}`)
  );

  // Tokens bar
  let tokenBar = '█'.repeat(Math.min(20, Math.ceil(tokenPercent / 5))) + 
                 '░'.repeat(20 - Math.ceil(tokenPercent / 5));
  section.addWidget(
    CardService.newTextParagraph()
      .setText(`🔤 Tokens: ${tokensUsed.toLocaleString()}/${DAILY_LIMITS.tokens.toLocaleString()} (${tokenPercent}%)\n${tokenBar}`)
  );

  // Status
  let status = '✅ Normal';
  if (messagePercent >= 90) status = '⚠️ Warning: Approaching message limit';
  if (tokenPercent >= 90) status = '⚠️ Warning: Approaching token limit';
  if (messagePercent >= 100 || tokenPercent >= 100) status = '❌ Daily limit reached! Reset tomorrow.';

  section.addWidget(CardService.newTextParagraph().setText(status));

  // Reset button
  const resetBtn = CardService.newTextButton()
    .setText('🔄 Manual Reset')
    .setTextButtonStyle(CardService.TextButtonStyle.TEXT)
    .setOnClickAction(CardService.newAction().setFunctionName('resetUsage_'));
  
  section.addWidget(CardService.newButtonSet().addButton(resetBtn));

  return section;
}

// ===================== CHAT LIST SECTION =====================
function buildChatListSection_(currentChatId) {
  const section = CardService.newCardSection().setHeader('💾 Your Chats');
  const allChats = getAllChats_();
  
  if (!allChats || Object.keys(allChats).length === 0) {
    section.addWidget(
      CardService.newTextParagraph()
        .setText('No chats yet. Create a new one!')
    );
  } else {
    // Show recent chats (max 5)
    const chatIds = Object.keys(allChats).sort((a, b) => 
      (allChats[b].lastActive || 0) - (allChats[a].lastActive || 0)
    ).slice(0, 5);

    const items = chatIds.map(chatId => {
      const chat = allChats[chatId];
      const msgCount = (chat.messages || []).length;
      const preview = `${chat.name} (${msgCount})`;
      return [preview, chatId];
    });

    section.addWidget(
      CardService.newSelectionInput()
        .setType(CardService.SelectionInputType.DROPDOWN)
        .setFieldName('selectedChat')
        .setTitle('Switch Chat')
        .addItem('Create new chat', 'NEW', false)
        .addItems(items)
        .setOnChangeAction(CardService.newAction().setFunctionName('handleChatSwitch_'))
    );
  }

  // New chat button
  const newChatBtn = CardService.newTextButton()
    .setText('➕ New Chat')
    .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
    .setOnClickAction(CardService.newAction().setFunctionName('createNewChat_'));
  
  section.addWidget(CardService.newButtonSet().addButton(newChatBtn));

  return section;
}

// ===================== MODE SELECTOR =====================
function buildModeSelector_(currentMode) {
  const section = CardService.newCardSection().setHeader('🎯 Mode');
  
  const modes = [
    { id: 'assistant', icon: '🤖', label: 'Assistant' },
    { id: 'creative', icon: '✨', label: 'Creative' },
    { id: 'technical', icon: '⚙️', label: 'Technical' },
    { id: 'tutor', icon: '📚', label: 'Tutor' },
    { id: 'concise', icon: '⚡', label: 'Concise' }
  ];

  const buttons = modes.map(mode => {
    const btn = CardService.newTextButton()
      .setText(`${mode.icon} ${mode.label}`)
      .setOnClickAction(
        CardService.newAction()
          .setFunctionName('setMode_')
          .addParameter('mode', mode.id)
      );
    
    if (currentMode === mode.id) {
      btn.setTextButtonStyle(CardService.TextButtonStyle.FILLED);
    } else {
      btn.setTextButtonStyle(CardService.TextButtonStyle.TEXT);
    }
    
    return btn;
  });

  section.addWidget(CardService.newButtonSet().addButton(buttons[0]).addButton(buttons[1]));
  section.addWidget(CardService.newButtonSet().addButton(buttons[2]).addButton(buttons[3]).addButton(buttons[4]));

  return section;
}

// ===================== CHAT SECTION =====================
function buildChatSection_(chatId) {
  const section = CardService.newCardSection().setHeader('💬 Messages');
  const chat = getChat_(chatId);
  const history = chat?.messages || [];

  if (!history.length) {
    section.addWidget(
      CardService.newTextParagraph()
        .setText('👋 No messages yet. Send your first message!')
    );
    return section;
  }

  // Show last 6 messages
  const recent = history.slice(-6);
  
  recent.forEach((msg, idx) => {
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
      .setTitle('Type your message')
      .setMultiline(true)
      .setHint(`Chatting in ${settings.mode || 'assistant'} mode...`)
  );

  section.addWidget(
    CardService.newSelectionInput()
      .setType(CardService.SelectionInputType.RADIO_BUTTON)
      .setFieldName('temperature')
      .setTitle('Temperature')
      .addItem('🎯 Precise (0.3)', '0.3', settings.temperature === '0.3')
      .addItem('⚖️ Balanced (0.7)', '0.7', !settings.temperature || settings.temperature === '0.7')
      .addItem('✨ Creative (1.0)', '1.0', settings.temperature === '1.0')
  );

  const sendBtn = CardService.newTextButton()
    .setText('📤 Send')
    .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
    .setOnClickAction(CardService.newAction().setFunctionName('handleSend_'));

  const deleteBtn = CardService.newTextButton()
    .setText('🗑️ Delete Chat')
    .setTextButtonStyle(CardService.TextButtonStyle.TEXT)
    .setOnClickAction(CardService.newAction().setFunctionName('deleteCurrentChat_'));

  section.addWidget(CardService.newButtonSet().addButton(sendBtn).addButton(deleteBtn));

  return section;
}

// ===================== SETTINGS SECTION =====================
function buildSettingsSection_(settings) {
  const section = CardService.newCardSection().setHeader('⚙️ Options');

  section.addWidget(
    CardService.newSelectionInput()
      .setType(CardService.SelectionInputType.RADIO_BUTTON)
      .setFieldName('maxTokens')
      .setTitle('Response Length')
      .addItem('📄 Short (256)', '256', settings.maxTokens === '256')
      .addItem('📃 Medium (512)', '512', !settings.maxTokens || settings.maxTokens === '512')
      .addItem('📕 Long (1024)', '1024', settings.maxTokens === '1024')
  );

  return section;
}

// ===================== EVENT HANDLERS =====================
function createNewChat_() {
  const chatId = generateId_();
  const allChats = getAllChats_();
  
  allChats[chatId] = {
    id: chatId,
    name: `Chat ${Object.keys(allChats).length + 1}`,
    messages: [],
    created: new Date().toISOString(),
    lastActive: new Date().toISOString(),
    mode: 'assistant'
  };

  saveAllChats_(allChats);
  setCurrentChatId_(chatId);
  
  return notify_('✅ New chat created!', CardService.NotificationType.INFO);
}

function deleteCurrentChat_() {
  const chatId = getCurrentChatId_();
  const allChats = getAllChats_();
  
  if (allChats[chatId]) {
    delete allChats[chatId];
    saveAllChats_(allChats);
    
    // Switch to another chat or create new one
    const remaining = Object.keys(allChats);
    if (remaining.length > 0) {
      setCurrentChatId_(remaining[0]);
    } else {
      createNewChat_();
    }
  }
  
  return notify_('🗑️ Chat deleted', CardService.NotificationType.INFO);
}

function handleChatSwitch_(e) {
  const chatId = e.formInput?.selectedChat;
  
  if (chatId === 'NEW') {
    return createNewChat_();
  }
  
  if (chatId) {
    setCurrentChatId_(chatId);
    const chat = getChat_(chatId);
    return notify_(`📂 Switched to: ${chat.name}`, CardService.NotificationType.INFO);
  }
  
  return refresh_();
}

function handleModeChange_(e) {
  const mode = e.formInput?.mode;
  if (!mode) return refresh_();
  
  const settings = loadSettings_();
  settings.mode = mode;
  saveSettings_(settings);
  
  const chatId = getCurrentChatId_();
  const chat = getChat_(chatId);
  chat.mode = mode;
  updateChat_(chatId, chat);
  
  return refresh_();
}
  const text = (e.formInput?.prompt || '').trim();
  const temperature = parseFloat(e.formInput?.temperature || 0.7);
  const maxTokens = parseInt(e.formInput?.maxTokens || 512);

  if (!text) {
    return notify_('✏️ Please enter a message.', CardService.NotificationType.INFO);
  }

  if (text.length > 5000) {
    return notify_('⚠️ Message too long (max 5000 chars)', CardService.NotificationType.WARNING);
  }

  // Check usage limits
  const usage = getUsageStats_();
  if (usage.messagesUsed >= DAILY_LIMITS.messages) {
    return notify_('❌ Daily message limit reached!', CardService.NotificationType.ERROR);
  }
  if (usage.tokensUsed >= DAILY_LIMITS.tokens) {
    return notify_('❌ Daily token limit reached!', CardService.NotificationType.ERROR);
  }

  try {
    const settings = loadSettings_();
    const chatId = getCurrentChatId_();
    const chat = getChat_(chatId);
    const chatMode = mode || chat.mode || settings.mode || 'assistant';
    
    let history = chat.messages || [];

    history.push({ 
      role: 'user', 
      text: text,
      timestamp: new Date().toISOString()
    });

    // Call Gemini
    const reply = callGemini_(history, chatMode, temperature, maxTokens);
    
    if (reply.startsWith('❌')) {
      return notify_(reply, CardService.NotificationType.ERROR);
    }

    history.push({ 
      role: 'model', 
      text: reply,
      timestamp: new Date().toISOString()
    });

    if (history.length > MAX_HISTORY) {
      history = history.slice(-MAX_HISTORY);
    }

    chat.messages = history;
    chat.lastActive = new Date().toISOString();
    updateChat_(chatId, chat);

    const tokenEstimate = Math.ceil(text.length / 4) + Math.ceil(reply.length / 4);
    updateUsage_(tokenEstimate);

    return refresh_();

  } catch (err) {
    console.error('Send error:', err);
    return notify_('Error: ' + err.toString(), CardService.NotificationType.ERROR);
  }
}

function resetUsage_() {
  PropertiesService.getUserProperties().deleteProperty(USAGE_KEY);
  return notify_('Usage stats reset!', CardService.NotificationType.INFO);
}

// ===================== GEMINI API =====================
function callGemini_(history, mode, temperature, maxTokens) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  
  if (!apiKey) {
    return '❌ API key not configured';
  }

  try {
    const systemPrompt = SYSTEM_PROMPTS[mode] || SYSTEM_PROMPTS.assistant;
    const contents = [{ role: 'user', parts: [{ text: systemPrompt }] }];

    history.forEach(msg => {
      contents.push({
        role: msg.role,
        parts: [{ text: msg.text }]
      });
    });

    const payload = {
      contents,
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens,
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

    let data = JSON.parse(text);

    if (status !== 200) {
      return `❌ API Error: ${data.error?.message || 'Unknown'}`;
    }

    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!reply) {
      return '❌ Empty response from Gemini';
    }

    return reply;

  } catch (err) {
    console.error('API Error:', err);
    return `❌ ${err.toString()}`;
  }
}

// ===================== CHAT STORAGE =====================
function getAllChats_() {
  try {
    const data = PropertiesService.getUserProperties().getProperty(CHATS_KEY);
    return data ? JSON.parse(data) : {};
  } catch (err) {
    return {};
  }
}

function saveAllChats_(chats) {
  try {
    PropertiesService.getUserProperties().setProperty(CHATS_KEY, JSON.stringify(chats));
  } catch (err) {
    console.error('Save error:', err);
  }
}

function getChat_(chatId) {
  const allChats = getAllChats_();
  return allChats[chatId] || { id: chatId, name: 'Chat', messages: [], mode: 'assistant' };
}

function updateChat_(chatId, chat) {
  const allChats = getAllChats_();
  allChats[chatId] = chat;
  saveAllChats_(allChats);
}

function getCurrentChatId_() {
  let chatId = PropertiesService.getUserProperties().getProperty(CURRENT_CHAT_KEY);
  
  if (!chatId) {
    const allChats = getAllChats_();
    const chatIds = Object.keys(allChats);
    
    if (chatIds.length === 0) {
      chatId = generateId_();
      const newChat = {
        id: chatId,
        name: 'Chat 1',
        messages: [],
        created: new Date().toISOString(),
        lastActive: new Date().toISOString(),
        mode: 'assistant'
      };
      allChats[chatId] = newChat;
      saveAllChats_(allChats);
    } else {
      chatId = chatIds[0];
    }
    
    setCurrentChatId_(chatId);
  }
  
  return chatId;
}

function setCurrentChatId_(chatId) {
  PropertiesService.getUserProperties().setProperty(CURRENT_CHAT_KEY, chatId);
}

// ===================== USAGE TRACKING =====================
function getUsageStats_() {
  try {
    const data = PropertiesService.getUserProperties().getProperty(USAGE_KEY);
    if (!data) return { messagesUsed: 0, tokensUsed: 0, resetDate: new Date().toISOString() };
    
    const stats = JSON.parse(data);
    const resetDate = new Date(stats.resetDate);
    const now = new Date();
    
    // Reset if new day
    if (resetDate.toDateString() !== now.toDateString()) {
      return { messagesUsed: 0, tokensUsed: 0, resetDate: now.toISOString() };
    }
    
    return stats;
  } catch (err) {
    return { messagesUsed: 0, tokensUsed: 0, resetDate: new Date().toISOString() };
  }
}

function updateUsage_(tokensUsed) {
  const usage = getUsageStats_();
  usage.messagesUsed = (usage.messagesUsed || 0) + 1;
  usage.tokensUsed = (usage.tokensUsed || 0) + tokensUsed;
  
  PropertiesService.getUserProperties().setProperty(USAGE_KEY, JSON.stringify(usage));
}

// ===================== SETTINGS =====================
function loadSettings_() {
  try {
    const data = PropertiesService.getUserProperties().getProperty(SETTINGS_KEY);
    return data ? JSON.parse(data) : {};
  } catch (err) {
    return {};
  }
}

function saveSettings_(settings) {
  try {
    PropertiesService.getUserProperties().setProperty(SETTINGS_KEY, JSON.stringify(settings));
  } catch (err) {
    console.error('Settings save error:', err);
  }
}

// ===================== HELPERS =====================
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
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

function generateId_() {
  return 'chat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}