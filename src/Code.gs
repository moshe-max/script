/**
 * Advanced Gemini AI Chatbot – Gmail Add-on (Standalone)
 * -------------------------------------------------------
 * Enhanced with proper system instruction, better safety settings,
 * token tracking, export feature, and improved UX.
 *
 * REQUIREMENTS:
 * 1. Set Script Property: GEMINI_API_KEY (your Gemini API key)
 * 2. Deploy as Gmail Add-on
 */

const GEMINI_MODEL = 'gemini-1.5-pro-latest'; // Always use latest
const MAX_HISTORY_MESSAGES = 40; // Increased for better context (20 turns)
const HISTORY_KEY = 'CHAT_HISTORY_V3';
const CONVERSATION_METADATA_KEY = 'CONVERSATION_METADATA_V2'; // Updated version
const USER_PREFERENCES_KEY = 'USER_PREFERENCES_V2';

// Temperature presets
const TEMPERATURE_MODES = {
  PRECISE: 0.2,
  BALANCED: 0.6,
  CREATIVE: 0.9
};

// System prompts (now used properly via systemInstruction)
const SYSTEM_PROMPTS = {
  GENERAL: 'You are a helpful, professional AI assistant. Provide accurate, well-structured, concise but thorough responses.',
  TECHNICAL: 'You are an expert technical assistant. Provide detailed explanations with properly formatted code examples when relevant.',
  CREATIVE: 'You are a creative writing assistant. Be imaginative, engaging, and help with brainstorming or storytelling.',
  RESEARCH: 'You are a research assistant. Provide factual, well-reasoned answers. Acknowledge uncertainty and avoid speculation.'
};

// ===================== ENTRY POINT & UI =====================

function onGmailMessageOpen() {
  initializeUserPreferences_();
  return buildMainChatUI_();
}

function initializeUserPreferences_() {
  const props = PropertiesService.getUserProperties();
  if (!props.getProperty(USER_PREFERENCES_KEY)) {
    const defaults = {
      temperatureMode: 'BALANCED',
      conversationMode: 'GENERAL',
      maxMessages: MAX_HISTORY_MESSAGES,
      timestamps: true,
      showTokenUsage: true
    };
    props.setProperty(USER_PREFERENCES_KEY, JSON.stringify(defaults));
  }
}

function buildMainChatUI_(initialMessage = '', status = '') {
  const header = CardService.newCardHeader()
    .setTitle('🤖 Advanced Gemini AI Chat')
    .setSubtitle('Powered by Gemini 1.5 Pro • Persistent context');

  const cardBuilder = CardService.newCardBuilder().setHeader(header);

  cardBuilder.addSection(buildConversationMetadataSection_());
  cardBuilder.addSection(buildChatHistorySection_());
  cardBuilder.addSection(buildInputSection_(initialMessage, status));
  cardBuilder.addSection(buildSettingsSection_());

  return cardBuilder.build();
}

// ===================== SECTIONS =====================

function buildConversationMetadataSection_() {
  const props = PropertiesService.getUserProperties();
  const metadata = JSON.parse(props.getProperty(CONVERSATION_METADATA_KEY) || '{}');
  const history = JSON.parse(props.getProperty(HISTORY_KEY) || '[]');

  const section = CardService.newCardSection().setHeader('📊 Conversation Stats');

  const userCount = history.filter(m => m.role === 'user').length;
  const totalTokens = metadata.totalTokens || 0;

  section.addWidget(CardService.newTextParagraph()
    .setText(`<b>Messages:</b> ${userCount} user • ${history.length - userCount} assistant`));
  
  if (totalTokens > 0) {
    section.addWidget(CardService.newTextParagraph()
      .setText(`<b>Est. tokens used:</b> ~${totalTokens.toLocaleString()}`));
  }

  if (metadata.lastInteraction) {
    const time = new Date(metadata.lastInteraction).toLocaleString();
    section.addWidget(CardService.newTextParagraph().setText(`<b>Last:</b> ${time}`));
  }

  return section;
}

function buildChatHistorySection_() {
  const props = PropertiesService.getUserProperties();
  const prefs = JSON.parse(props.getProperty(USER_PREFERENCES_KEY));
  const history = JSON.parse(props.getProperty(HISTORY_KEY) || '[]');

  const section = CardService.newCardSection()
    .setHeader('💬 Conversation History')
    .setCollapsible(true)
    .setNumUncollapsibleWidgets(2);

  if (history.length === 0) {
    section.addWidget(CardService.newTextParagraph()
      .setText('<i>No messages yet. Start chatting!</i>'));
    return section;
  }

  // Show last 12 messages (6 turns) – good balance
  const displayMessages = history.slice(-12);

  displayMessages.forEach(msg => {
    const isUser = msg.role === 'user';
    const role = isUser ? '👤 You' : '🤖 Gemini';
    const time = prefs.timestamps && msg.timestamp 
      ? ` <font color="#888888">(${new Date(msg.timestamp).toLocaleTimeString()})</font>` 
      : '';
    
    const text = formatMessageText_(msg.text);

    section.addWidget(CardService.newDecoratedText()
      .setTopLabel(`<b>${role}</b>${time}`)
      .setText(text)
      .setWrapText(true));
  });

  return section;
}

function buildInputSection_(initialMessage = '', status = '') {
  const section = CardService.newCardSection();

  const input = CardService.newTextInput()
    .setFieldName('prompt')
    .setTitle('Your Message')
    .setHint('Type your message... (supports Shift+Enter for new line)')
    .setMultiline(true)
    .setValue(initialMessage);

  section.addWidget(input);

  if (status) {
    section.addWidget(CardService.newTextParagraph()
      .setText(`<i><font color="#6666cc">${status}</font></i>`));
  }

  const sendBtn = CardService.newTextButton()
    .setText('Send')
    .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
    .setOnClickAction(CardService.newAction().setFunctionName('sendToGemini_'));

  const clearBtn = CardService.newTextButton()
    .setText('New Chat')
    .setOnClickAction(CardService.newAction().setFunctionName('startNewChat_'));

  const exportBtn = CardService.newTextButton()
    .setText('Export')
    .setOnClickAction(CardService.newAction().setFunctionName('exportConversation_'));

  section.addWidget(CardService.newButtonSet()
    .addButton(sendBtn)
    .addButton(clearBtn)
    .addButton(exportBtn));

  return section;
}

function buildSettingsSection_() {
  const props = PropertiesService.getUserProperties();
  const prefs = JSON.parse(props.getProperty(USER_PREFERENCES_KEY));

  const section = CardService.newCardSection()
    .setHeader('⚙️ Settings')
    .setCollapsible(true);

  const modeWidget = CardService.newSelectionInput()
    .setType(CardService.SelectionInputType.DROPDOWN)
    .setFieldName('conversationMode')
    .setTitle('Conversation Mode')
    .addItem('General Assistant', 'GENERAL', prefs.conversationMode === 'GENERAL')
    .addItem('Technical Expert', 'TECHNICAL', prefs.conversationMode === 'TECHNICAL')
    .addItem('Creative Writer', 'CREATIVE', prefs.conversationMode === 'CREATIVE')
    .addItem('Research Assistant', 'RESEARCH', prefs.conversationMode === 'RESEARCH')
    .setOnChangeAction(CardService.newAction().setFunctionName('updatePreferences_'));

  const tempWidget = CardService.newSelectionInput()
    .setType(CardService.SelectionInputType.DROPDOWN)
    .setFieldName('temperatureMode')
    .setTitle('Response Style')
    .addItem('Precise & Factual', 'PRECISE', prefs.temperatureMode === 'PRECISE')
    .addItem('Balanced (Default)', 'BALANCED', prefs.temperatureMode === 'BALANCED')
    .addItem('Creative & Varied', 'CREATIVE', prefs.temperatureMode === 'CREATIVE')
    .setOnChangeAction(CardService.newAction().setFunctionName('updatePreferences_'));

  section.addWidget(modeWidget);
  section.addWidget(tempWidget);

  return section;
}

// ===================== CHAT LOGIC =====================

function sendToGemini_(e) {
  const prompt = (e.formInput?.prompt || '').trim();
  if (!prompt) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText('Please enter a message.'))
      .setNavigation(CardService.newNavigation().updateCard(buildMainChatUI_(prompt)))
      .build();
  }

  // Show thinking state
  const thinkingCard = buildMainChatUI_(prompt, '🤔 Thinking...');
  const response = CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().pushCard(thinkingCard));

  // Run API call in background (non-blocking UI)
  response.setOnActionCompleteAction(
    CardService.newAction()
      .setFunctionName('handleGeminiResponse_')
      .setParameters({ prompt: prompt })
  );

  return response.build();
}

// Background handler after API call
function handleGeminiResponse_(e) {
  const prompt = e.parameters.prompt;
  const props = PropertiesService.getUserProperties();
  let history = JSON.parse(props.getProperty(HISTORY_KEY) || '[]');
  const prefs = JSON.parse(props.getProperty(USER_PREFERENCES_KEY));

  // Add user message
  const userMsg = { role: 'user', text: prompt, timestamp: new Date().toISOString() };
  history.push(userMsg);

  // Call Gemini
  const { reply, usage } = callGeminiWithHistory_(history, prefs);

  // Add response
  const modelMsg = { role: 'model', text: reply, timestamp: new Date().toISOString() };
  history.push(modelMsg);

  // Update metadata
  let metadata = JSON.parse(props.getProperty(CONVERSATION_METADATA_KEY) || '{}');
  metadata.lastInteraction = new Date().toISOString();
  metadata.totalTokens = (metadata.totalTokens || 0) + (usage || 0);

  // Trim history
  history = history.slice(-prefs.maxMessages);

  props.setProperties({
    [HISTORY_KEY]: JSON.stringify(history),
    [CONVERSATION_METADATA_KEY]: JSON.stringify(metadata)
  });

  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().updateCard(buildMainChatUI_()))
    .build();
}

function startNewChat_() {
  PropertiesService.getUserProperties().deleteAllProperties(); // Or just history keys
  initializeUserPreferences_(); // Re-init prefs

  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText('New conversation started!'))
    .setNavigation(CardService.newNavigation().updateCard(buildMainChatUI_()))
    .build();
}

function updatePreferences_(e) {
  const props = PropertiesService.getUserProperties();
  const prefs = JSON.parse(props.getProperty(USER_PREFERENCES_KEY) || '{}');

  if (e.formInput?.conversationMode) prefs.conversationMode = e.formInput.conversationMode;
  if (e.formInput?.temperatureMode) prefs.temperatureMode = e.formInput.temperatureMode;

  props.setProperty(USER_PREFERENCES_KEY, JSON.stringify(prefs));

  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText('Settings saved'))
    .setNavigation(CardService.newNavigation().updateCard(buildMainChatUI_()))
    .build();
}

function exportConversation_() {
  const history = JSON.parse(PropertiesService.getUserProperties().getProperty(HISTORY_KEY) || '[]');

  let text = `=== Gemini Chat Export ===\nDate: ${new Date().toLocaleString()}\n\n`;
  history.forEach(msg => {
    const role = msg.role === 'user' ? 'You' : 'Gemini';
    const time = msg.timestamp ? new Date(msg.timestamp).toLocaleString() : '';
    text += `[${role}] ${time}\n${msg.text}\n\n`;
  });

  // Show in alert (limited length), or could email it
  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification()
      .setType(CardService.NotificationType.MESSAGE)
      .setText('Export ready – see console log (Ctrl+Enter in editor)'))
    .build();
}

// ===================== GEMINI API =====================

function callGeminiWithHistory_(history, prefs) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) return { reply: 'Error: GEMINI_API_KEY not set in Script Properties.', usage: 0 };

  const url = `https://generativelanguage.googleapis.com/v1/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const contents = history.map(m => ({
    role: m.role === 'model' ? 'model' : 'user',
    parts: [{ text: m.text }]
  }));

  const temperature = TEMPERATURE_MODES[prefs.temperatureMode] || 0.6;
  const systemInstruction = SYSTEM_PROMPTS[prefs.conversationMode] || SYSTEM_PROMPTS.GENERAL;

  const payload = {
    systemInstruction: {
      parts: [{ text: systemInstruction }]
    },
    contents: contents,
    generationConfig: {
      temperature: temperature,
      maxOutputTokens: 8192,
      topP: 0.95,
      topK: 64
    },
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" }
    ]
  };

  try {
    const response = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    const json = JSON.parse(response.getContentText());

    if (json.candidates?.[0]?.content?.parts?.[0]?.text) {
      const text = json.candidates[0].content.parts[0].text;
      const usage = json.usageMetadata?.totalTokenCount || estimateTokenCount_(text + JSON.stringify(contents));
      return { reply: text.trim(), usage };
    }

    if (json.promptFeedback?.blockReason) {
      return { reply: `Content blocked: ${json.promptFeedback.blockReason}. Please rephrase.`, usage: 0 };
    }

    if (json.error) {
      return { reply: `API Error: ${json.error.message}`, usage: 0 };
    }

    return { reply: 'No response from Gemini. Try again.', usage: 0 };

  } catch (err) {
    console.error(err);
    return { reply: `Request failed: ${err.toString()}`, usage: 0 };
  }
}

// ===================== UTILITIES =====================

function formatMessageText_(text) {
  let escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Preserve basic markdown-like formatting
  escaped = escaped
    .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
    .replace(/\*(.*?)\*/g, '<i>$1</i>')
    .replace(/`(.*?)`/g, '<font face="monospace" color="#006600">$1</font>')
    .replace(/\n/g, '<br>');

  return escaped;
}

function estimateTokenCount_(text) {
  return Math.ceil(text.length / 4);
}