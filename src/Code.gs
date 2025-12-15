/**
 * Advanced Gemini AI Chatbot – Gmail Add-on (Standalone)
 * -------------------------------------------------------
 * Enhanced AI chat interface with conversation management,
 * advanced features, and multi-turn context awareness.
 *
 * REQUIREMENTS:
 * 1. Set Script Property: GEMINI_API_KEY
 * 2. Deploy as Gmail Add-on
 */

// ===================== CONSTANTS & CONFIG =====================

const GEMINI_MODEL = 'models/gemini-1.5-pro';
const MAX_HISTORY_MESSAGES = 20; // Store 20 messages (10 conversation turns)
const HISTORY_KEY = 'CHAT_HISTORY_V3';
const CONVERSATION_METADATA_KEY = 'CONVERSATION_METADATA_V1';
const USER_PREFERENCES_KEY = 'USER_PREFERENCES_V1';

// Temperature presets for different conversation modes
const TEMPERATURE_MODES = {
  PRECISE: 0.2,      // Factual, deterministic responses
  BALANCED: 0.5,     // Default, balanced creativity
  CREATIVE: 0.8      // More varied, creative responses
};

// System prompts for different conversation contexts
const SYSTEM_PROMPTS = {
  GENERAL: 'You are a helpful, professional AI assistant. Provide accurate, well-structured responses. Be concise but thorough.',
  TECHNICAL: 'You are an expert technical assistant. Provide detailed technical explanations with code examples when appropriate. Use proper formatting.',
  CREATIVE: 'You are a creative writing assistant. Generate imaginative, engaging content. Help with brainstorming and creative problem-solving.',
  RESEARCH: 'You are a research assistant. Provide well-sourced, factual information. Cite your reasoning and acknowledge uncertainty where appropriate.'
};

// ===================== ENTRY POINT & UI BUILDER =====================

/**
 * Main entry point – opens the chatbot when Gmail message is opened.
 * @return {GoogleAppsScript.Card_Service.Card} The main UI card.
 */
function onGmailMessageOpen() {
  initializeUserPreferences_();
  return buildMainChatUI_();
}

/**
 * Initializes user preferences if they don't exist.
 */
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

/**
 * Builds the main chat UI card with all controls.
 * @param {string} [initialMessage=''] Initial message to preserve in input field.
 * @return {GoogleAppsScript.Card_Service.Card} The complete chat interface card.
 */
function buildMainChatUI_(initialMessage = '') {
  const header = CardService.newCardHeader()
    .setTitle('🤖 Advanced Gemini AI Chat')
    .setSubtitle('Intelligent conversation with persistent history');

  const sections = [
    buildConversationMetadataSection_(),
    buildChatHistorySection_(),
    buildInputSection_(initialMessage),
    buildSettingsSection_()
  ];

  let cardBuilder = CardService.newCardBuilder().setHeader(header);
  sections.forEach(section => cardBuilder.addSection(section));

  return cardBuilder.build();
}

/**
 * Builds a section showing conversation statistics and metadata.
 * @return {GoogleAppsScript.Card_Service.CardSection}
 */
function buildConversationMetadataSection_() {
  const props = PropertiesService.getUserProperties();
  const metadata = JSON.parse(props.getProperty(CONVERSATION_METADATA_KEY) || '{}');
  const history = JSON.parse(props.getProperty(HISTORY_KEY) || '[]');

  const section = CardService.newCardSection()
    .setHeader('📊 Conversation Stats');

  const userMessages = history.filter(h => h.role === 'user').length;
  const assistantMessages = history.filter(h => h.role === 'model').length;
  const totalTokens = metadata.totalTokens || 0;

  const statsText = `Messages: ${userMessages} | Responses: ${assistantMessages} | Turns: ${userMessages}`;
  section.addWidget(CardService.newTextParagraph().setText(statsText));

  if (metadata.lastInteraction) {
    const lastTime = new Date(metadata.lastInteraction).toLocaleString();
    section.addWidget(CardService.newTextParagraph().setText(`Last interaction: ${lastTime}`));
  }

  return section;
}

/**
 * Builds the chat history display section.
 * @return {GoogleAppsScript.Card_Service.CardSection}
 */
function buildChatHistorySection_() {
  const props = PropertiesService.getUserProperties();
  const prefs = JSON.parse(props.getProperty(USER_PREFERENCES_KEY) || '{}');
  const history = JSON.parse(props.getProperty(HISTORY_KEY) || '[]');

  const section = CardService.newCardSection()
    .setHeader('💬 Recent Conversation');

  if (history.length === 0) {
    section.addWidget(CardService.newTextParagraph().setText('No messages yet. Start a new conversation...'));
    return section;
  }

  // Display last 8 messages (4 turns)
  const displayHistory = history.slice(-8);
  displayHistory.forEach((msg, idx) => {
    const role = msg.role === 'user' ? '👤 You:' : '🤖 Gemini:';
    const timestamp = prefs.timestamps && msg.timestamp ? ` (${new Date(msg.timestamp).toLocaleTimeString()})` : '';
    const text = msg.text.length > 150 ? msg.text.substring(0, 147) + '...' : msg.text;

    section.addWidget(
      CardService.newTextParagraph()
        .setText(`<b>${role}</b>${timestamp}<br>${htmlEscape_(text)}`)
    );
  });

  return section;
}

/**
 * Builds the input section with message field.
 * @param {string} initialMessage Message to pre-fill.
 * @return {GoogleAppsScript.Card_Service.CardSection}
 */
function buildInputSection_(initialMessage = '') {
  const prefs = JSON.parse(PropertiesService.getUserProperties().getProperty(USER_PREFERENCES_KEY) || '{}');

  const section = CardService.newCardSection();

  // Message input field
  const input = CardService.newTextInput()
    .setFieldName('prompt')
    .setTitle('Your Message')
    .setHint('Ask anything... (supports multi-line)')
    .setMultiline(true)
    .setValue(initialMessage);
  section.addWidget(input);

  // Primary send button
  const sendBtn = CardService.newTextButton()
    .setText('Send Message')
    .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
    .setOnClickAction(CardService.newAction().setFunctionName('sendToGemini_'));

  // Clear history button
  const clearBtn = CardService.newTextButton()
    .setText('Clear History')
    .setOnClickAction(CardService.newAction().setFunctionName('startNewChat_'));

  section.addWidget(CardService.newButtonSet().addButton(sendBtn).addButton(clearBtn));

  return section;
}

/**
 * Builds the settings section for conversation modes.
 * @return {GoogleAppsScript.Card_Service.CardSection}
 */
function buildSettingsSection_() {
  const props = PropertiesService.getUserProperties();
  const prefs = JSON.parse(props.getProperty(USER_PREFERENCES_KEY) || '{}');

  const section = CardService.newCardSection()
    .setHeader('⚙️ Settings');

  // Conversation mode selector
  const modeWidget = CardService.newSelectionInput()
    .setType(CardService.SelectionInputType.DROPDOWN)
    .setFieldName('conversationMode')
    .setTitle('Conversation Mode')
    .addItem('General Assistant', 'GENERAL', prefs.conversationMode === 'GENERAL')
    .addItem('Technical Expert', 'TECHNICAL', prefs.conversationMode === 'TECHNICAL')
    .addItem('Creative Writer', 'CREATIVE', prefs.conversationMode === 'CREATIVE')
    .addItem('Research Assistant', 'RESEARCH', prefs.conversationMode === 'RESEARCH')
    .setOnChangeAction(CardService.newAction().setFunctionName('updatePreferences_'));

  // Temperature mode selector
  const tempWidget = CardService.newSelectionInput()
    .setType(CardService.SelectionInputType.DROPDOWN)
    .setFieldName('temperatureMode')
    .setTitle('Response Style')
    .addItem('Precise & Factual', 'PRECISE', prefs.temperatureMode === 'PRECISE')
    .addItem('Balanced', 'BALANCED', prefs.temperatureMode === 'BALANCED')
    .addItem('Creative & Varied', 'CREATIVE', prefs.temperatureMode === 'CREATIVE')
    .setOnChangeAction(CardService.newAction().setFunctionName('updatePreferences_'));

  section.addWidget(modeWidget);
  section.addWidget(tempWidget);

  return section;
}

// ===================== CHAT LOGIC =====================

/**
 * Handles message sending and history management.
 * @param {Object} e Event object from chat form.
 * @return {GoogleAppsScript.Card_Service.ActionResponse}
 */
function sendToGemini_(e) {
  const prompt = e.formInput.prompt;

  if (!prompt || !prompt.trim()) {
    return CardService.newActionResponseBuilder()
      .setNotification(CardService.newNotification().setText('Please enter a message.'))
      .setNavigation(CardService.newNavigation().updateCard(buildMainChatUI_(prompt)))
      .build();
  }

  const props = PropertiesService.getUserProperties();
  const history = JSON.parse(props.getProperty(HISTORY_KEY) || '[]');
  const prefs = JSON.parse(props.getProperty(USER_PREFERENCES_KEY) || '{}');

  // Add user message with timestamp
  const userMessage = {
    role: 'user',
    text: prompt.trim(),
    timestamp: new Date().toISOString()
  };
  history.push(userMessage);

  // Call Gemini with context
  const reply = callGeminiWithHistory_(history, prefs);

  // Add model response with timestamp
  const modelMessage = {
    role: 'model',
    text: reply,
    timestamp: new Date().toISOString()
  };
  history.push(modelMessage);

  // Update metadata
  const metadata = JSON.parse(props.getProperty(CONVERSATION_METADATA_KEY) || '{}');
  metadata.lastInteraction = new Date().toISOString();
  metadata.totalMessages = history.length;
  props.setProperty(CONVERSATION_METADATA_KEY, JSON.stringify(metadata));

  // Trim and save history
  const trimmed = history.slice(-prefs.maxMessages);
  props.setProperty(HISTORY_KEY, JSON.stringify(trimmed));

  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().updateCard(buildMainChatUI_()))
    .build();
}

/**
 * Starts a new conversation by clearing history.
 * @return {GoogleAppsScript.Card_Service.ActionResponse}
 */
function startNewChat_() {
  const props = PropertiesService.getUserProperties();
  props.deleteProperty(HISTORY_KEY);
  props.deleteProperty(CONVERSATION_METADATA_KEY);

  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText('Conversation cleared. Starting fresh!'))
    .setNavigation(CardService.newNavigation().updateCard(buildMainChatUI_()))
    .build();
}

/**
 * Updates user preferences from settings controls.
 * @param {Object} e Event object with preference changes.
 * @return {GoogleAppsScript.Card_Service.ActionResponse}
 */
function updatePreferences_(e) {
  const props = PropertiesService.getUserProperties();
  const prefs = JSON.parse(props.getProperty(USER_PREFERENCES_KEY) || '{}');

  if (e.formInput.conversationMode) {
    prefs.conversationMode = e.formInput.conversationMode;
  }
  if (e.formInput.temperatureMode) {
    prefs.temperatureMode = e.formInput.temperatureMode;
  }

  props.setProperty(USER_PREFERENCES_KEY, JSON.stringify(prefs));

  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText('Settings updated!'))
    .setNavigation(CardService.newNavigation().updateCard(buildMainChatUI_()))
    .build();
}

/**
 * Calls Gemini API with full conversation context.
 * @param {Array<Object>} history Chat message history.
 * @param {Object} prefs User preferences.
 * @return {string} Model's response text.
 */
function callGeminiWithHistory_(history, prefs) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) {
    return 'Error: Missing Gemini API key. Please set it in Script Properties.';
  }

  const url = `https://generativelanguage.googleapis.com/v1/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  // Convert history to API format
  const contents = history.map(h => ({
    role: h.role === 'model' ? 'model' : 'user',
    parts: [{ text: h.text }]
  }));

  // Select appropriate system prompt and temperature
  const systemPrompt = SYSTEM_PROMPTS[prefs.conversationMode] || SYSTEM_PROMPTS.GENERAL;
  const temperature = TEMPERATURE_MODES[prefs.temperatureMode] || TEMPERATURE_MODES.BALANCED;

  const contentsWithSystem = [
    {
      role: 'user',
      parts: [{ text: `System: ${systemPrompt}\n\nRespond naturally to the user's messages while following this instruction.` }]
    },
    { role: 'model', parts: [{ text: 'Understood. I will follow the provided system instruction.' }] },
    ...contents
  ];

  const payload = {
    contents: contentsWithSystem,
    generationConfig: {
      temperature: temperature,
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 2048,
      stopSequences: ['User:', 'Assistant:']
    },
    safetySettings: [
      {
        category: 'HARM_CATEGORY_HATE_SPEECH',
        threshold: 'BLOCK_MEDIUM_AND_ABOVE'
      },
      {
        category: 'HARM_CATEGORY_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxthreshold: 'BLOCK_MEDIUM_AND_ABOVE'
      },
      {
        category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
        threshold: 'BLOCK_MEDIUM_AND_ABOVE'
      }
    ]
  };

  const res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const json = JSON.parse(res.getContentText());

  try {
    // Check for successful response
    if (json.candidates && json.candidates[0]?.content?.parts?.[0]?.text) {
      return json.candidates[0].content.parts[0].text;
    }

    // Handle blocked content
    if (json.promptFeedback?.blockReason) {
      return `Request was blocked due to: ${json.promptFeedback.blockReason}. Try a different question.`;
    }

    // Handle no response
    if (json.error) {
      return `API Error: ${json.error.message}`;
    }

    return 'No response received from Gemini. Please try again.';

  } catch (e) {
    return `Error processing response: ${e.toString()}`;
  }
}

// ===================== UTILITY FUNCTIONS =====================

/**
 * Safely escapes HTML special characters and formats text.
 * @param {string} text Text to escape.
 * @return {string} HTML-safe text.
 */
function htmlEscape_(text) {
  let escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  // Add line break support
  escaped = escaped.replace(/\n/g, '<br>');

  return escaped;
}

/**
 * Calculates approximate token count for cost estimation.
 * @param {string} text Text to count tokens for.
 * @return {number} Approximate token count.
 */
function estimateTokenCount_(text) {
  // Rough estimation: ~4 characters per token
  return Math.ceil(text.length / 4);
}

/**
 * Exports conversation history as formatted text.
 * @return {string} Formatted conversation export.
 */
function exportConversation_() {
  const props = PropertiesService.getUserProperties();
  const history = JSON.parse(props.getProperty(HISTORY_KEY) || '[]');
  const metadata = JSON.parse(props.getProperty(CONVERSATION_METADATA_KEY) || '{}');

  let exported = `=== Conversation Export ===\n`;
  exported += `Date: ${new Date().toLocaleString()}\n`;
  exported += `Total Messages: ${history.length}\n\n`;

  history.forEach((msg, idx) => {
    const role = msg.role === 'user' ? 'USER' : 'GEMINI';
    const time = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : '';
    exported += `[${role}] ${time}\n${msg.text}\n\n`;
  });

  return exported;
}