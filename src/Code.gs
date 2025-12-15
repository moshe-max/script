/**
 * Advanced Gemini AI Chatbot – Gmail Add-on
 * Fixed: Removed unsupported systemInstruction for gemini-1.5-pro-latest
 */

const GEMINI_MODEL = 'gemini-1.5-pro-latest';
const MAX_HISTORY_MESSAGES = 40;
const HISTORY_KEY = 'CHAT_HISTORY_V3';
const CONVERSATION_METADATA_KEY = 'CONVERSATION_METADATA_V2';
const USER_PREFERENCES_KEY = 'USER_PREFERENCES_V2';

const TEMPERATURE_MODES = {
  PRECISE: 0.2,
  BALANCED: 0.6,
  CREATIVE: 0.9
};

const SYSTEM_PROMPTS = {
  GENERAL: 'You are a helpful, professional AI assistant. Provide accurate, well-structured, concise but thorough responses.',
  TECHNICAL: 'You are an expert technical assistant. Provide detailed explanations with properly formatted code examples when relevant.',
  CREATIVE: 'You are a creative writing assistant. Be imaginative, engaging, and help with brainstorming or storytelling.',
  RESEARCH: 'You are a research assistant. Provide factual, well-reasoned answers. Acknowledge uncertainty and avoid speculation.'
};

// ===================== UI & ENTRY =====================

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
      timestamps: true
    };
    props.setProperty(USER_PREFERENCES_KEY, JSON.stringify(defaults));
  }
}

function buildMainChatUI_() {
  const header = CardService.newCardHeader()
    .setTitle('Advanced Gemini AI Chat')
    .setSubtitle('Powered by Gemini • Persistent context');

  const cardBuilder = CardService.newCardBuilder().setHeader(header);
  cardBuilder.addSection(buildConversationMetadataSection_());
  cardBuilder.addSection(buildChatHistorySection_());
  cardBuilder.addSection(buildInputSection_());
  cardBuilder.addSection(buildSettingsSection_());

  return cardBuilder.build();
}

// ===================== SECTIONS =====================

function buildConversationMetadataSection_() {
  const props = PropertiesService.getUserProperties();
  const metadata = JSON.parse(props.getProperty(CONVERSATION_METADATA_KEY) || '{}');
  const history = JSON.parse(props.getProperty(HISTORY_KEY) || '[]');

  const section = CardService.newCardSection().setHeader('Conversation Stats');

  const userCount = history.filter(m => m.role === 'user').length;

  section.addWidget(CardService.newTextParagraph()
    .setText(`Messages: ${userCount} user • ${history.length - userCount} assistant`));

  if (metadata.lastInteraction) {
    const time = new Date(metadata.lastInteraction).toLocaleString();
    section.addWidget(CardService.newTextParagraph().setText(`Last: ${time}`));
  }

  return section;
}

function buildChatHistorySection_() {
  const prefs = JSON.parse(PropertiesService.getUserProperties().getProperty(USER_PREFERENCES_KEY));
  const history = JSON.parse(PropertiesService.getUserProperties().getProperty(HISTORY_KEY) || '[]');

  const section = CardService.newCardSection()
    .setHeader('Conversation History')
    .setCollapsible(true);

  if (history.length === 0) {
    section.addWidget(CardService.newTextParagraph().setText('No messages yet. Start chatting!'));
    return section;
  }

  const displayMessages = history.slice(-12);

  displayMessages.forEach(msg => {
    const isUser = msg.role === 'user';
    const role = isUser ? 'You' : 'Gemini';
    const time = prefs.timestamps && msg.timestamp 
      ? ` (${new Date(msg.timestamp).toLocaleTimeString()})` 
      : '';
    
    const text = formatMessageText_(msg.text);

    section.addWidget(CardService.newDecoratedText()
      .setTopLabel(`${role}${time}`)
      .setText(text)
      .setWrapText(true));
  });

  return section;
}

function buildInputSection_() {
  const section = CardService.newCardSection();

  const input = CardService.newTextInput()
    .setFieldName('prompt')
    .setTitle('Your Message')
    .setHint('Type your message...')
    .setMultiline(true);

  section.addWidget(input);

  const sendBtn = CardService.newTextButton()
    .setText('Send')
    .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
    .setOnClickAction(CardService.newAction().setFunctionName('sendToGemini_'));

  const clearBtn = CardService.newTextButton()
    .setText('New Chat')
    .setOnClickAction(CardService.newAction().setFunctionName('startNewChat_'));

  section.addWidget(CardService.newButtonSet().addButton(sendBtn).addButton(clearBtn));

  return section;
}

function buildSettingsSection_() {
  const prefs = JSON.parse(PropertiesService.getUserProperties().getProperty(USER_PREFERENCES_KEY));

  const section = CardService.newCardSection()
    .setHeader('Settings')
    .setCollapsible(true);

  const modeWidget = CardService.newSelectionInput()
    .setType(CardService.SelectionInputType.DROPDOWN)
    .setFieldName('conversationMode')
    .setTitle('Mode')
    .addItem('General', 'GENERAL', prefs.conversationMode === 'GENERAL')
    .addItem('Technical', 'TECHNICAL', prefs.conversationMode === 'TECHNICAL')
    .addItem('Creative', 'CREATIVE', prefs.conversationMode === 'CREATIVE')
    .addItem('Research', 'RESEARCH', prefs.conversationMode === 'RESEARCH')
    .setOnChangeAction(CardService.newAction().setFunctionName('updatePreferences_'));

  const tempWidget = CardService.newSelectionInput()
    .setType(CardService.SelectionInputType.DROPDOWN)
    .setFieldName('temperatureMode')
    .setTitle('Style')
    .addItem('Precise', 'PRECISE', prefs.temperatureMode === 'PRECISE')
    .addItem('Balanced', 'BALANCED', prefs.temperatureMode === 'BALANCED')
    .addItem('Creative', 'CREATIVE', prefs.temperatureMode === 'CREATIVE')
    .setOnChangeAction(CardService.newAction().setFunctionName('updatePreferences_'));

  section.addWidget(modeWidget);
  section.addWidget(tempWidget);

  return section;
}

// ===================== LOGIC =====================

function sendToGemini_(e) {
  const prompt = (e.formInput?.prompt || '').trim();
  if (!prompt) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText('Please enter a message.'))
      .setNavigation(CardService.newNavigation().updateCard(buildMainChatUI_()))
      .build();
  }

  const props = PropertiesService.getUserProperties();
  let history = JSON.parse(props.getProperty(HISTORY_KEY) || '[]');
  const prefs = JSON.parse(props.getProperty(USER_PREFERENCES_KEY));

  // Add user message
  history.push({ role: 'user', text: prompt, timestamp: new Date().toISOString() });

  // Add temporary thinking message
  history.push({ role: 'model', text: '*Thinking...*', timestamp: new Date().toISOString() });

  props.setProperty(HISTORY_KEY, JSON.stringify(history.slice(-prefs.maxMessages)));

  // Call Gemini with system prompt injected
  const reply = callGeminiWithHistory_(history.slice(0, -1), prefs); // exclude thinking

  // Replace thinking with real reply
  history.pop();
  history.push({ role: 'model', text: reply || 'No response.', timestamp: new Date().toISOString() });

  // Update metadata
  const metadata = JSON.parse(props.getProperty(CONVERSATION_METADATA_KEY) || '{}');
  metadata.lastInteraction = new Date().toISOString();
  props.setProperty(CONVERSATION_METADATA_KEY, JSON.stringify(metadata));

  props.setProperty(HISTORY_KEY, JSON.stringify(history.slice(-prefs.maxMessages)));

  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().updateCard(buildMainChatUI_()))
    .build();
}

function startNewChat_() {
  const props = PropertiesService.getUserProperties();
  props.deleteProperty(HISTORY_KEY);
  props.deleteProperty(CONVERSATION_METADATA_KEY);

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

// ===================== GEMINI API =====================

function callGeminiWithHistory_(history, prefs) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) return 'Error: API key not set in Script Properties.';

  const url = `https://generativelanguage.googleapis.com/v1/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  // Inject system prompt as fake conversation start (only if history is short or empty)
  let contents = history.map(m => ({
    role: m.role === 'model' ? 'model' : 'user',
    parts: [{ text: m.text }]
  }));

  const systemPrompt = SYSTEM_PROMPTS[prefs.conversationMode] || SYSTEM_PROMPTS.GENERAL;

  // Add system instruction only if it's not already there (avoid duplication)
  if (history.length === 0 || !history[0].text.includes(systemPrompt)) {
    contents.unshift(
      { role: 'user', parts: [{ text: systemPrompt }] },
      { role: 'model', parts: [{ text: 'Understood. I will follow these instructions.' }] }
    );
  }

  const temperature = TEMPERATURE_MODES[prefs.temperatureMode] || 0.6;

  const payload = {
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
      return json.candidates[0].content.parts[0].text.trim();
    }

    if (json.promptFeedback?.blockReason) {
      return `Content blocked: ${json.promptFeedback.blockReason}. Please rephrase.`;
    }

    if (json.error) {
      return `Error: ${json.error.message}`;
    }

    return 'No response from Gemini.';

  } catch (err) {
    return 'Request failed. Check connection or API key.';
  }
}

// ===================== UTILS =====================

function formatMessageText_(text) {
  let escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  escaped = escaped
    .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
    .replace(/\*(.*?)\*/g, '<i>$1</i>')
    .replace(/`(.*?)`/g, '<font face="monospace">$1</font>')
    .replace(/\n/g, '<br>');

  return escaped;
}