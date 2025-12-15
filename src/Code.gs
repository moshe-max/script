/**
 * Gemini AI Chat – Premium Edition
 * Gmail Add-on version fully fixed for Gemini v1beta
 */

// ===================== CONSTANTS =====================
const GEMINI_MODEL = 'gemini-2.5-flash';
const MAX_HISTORY = 50;
const HISTORY_KEY = 'CHAT_HISTORY';
const SETTINGS_KEY = 'CHAT_SETTINGS';

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

    btn.setTextButtonStyle(currentMode === mode.id ? CardService.TextButtonStyle.FILLED : CardService.TextButtonStyle.TEXT);
    return btn;
  });

  section.addWidget(CardService.newButtonSet().addButton(buttons[0]).addButton(buttons[1]));
  section.addWidget(CardService.newButtonSet().addButton(buttons[2]).addButton(buttons[3]).addButton(buttons[4]));
  return section;
}

// ===================== CHAT HISTORY SECTION =====================
function buildChatSection_() {
  const section = CardService.newCardSection().setHeader('💬 Conversation');
  const history = loadHistory_();

  if (!history.length) {
    section.addWidget(CardService.newTextParagraph().setText('👋 Select a mode and start chatting!'));
    return section;
  }

  history.slice(-8).forEach(msg => {
    const label = msg.role === 'user' ? '👤 You' : '🤖 Gemini';
    const widget = CardService.newDecoratedText()
      .setTopLabel(label)
      .setText(truncateText_(msg.text, 250))
      .setWrapText(true);
    if (msg.role !== 'user') widget.setBottomLabel(formatTime_(msg.timestamp));
    section.addWidget(widget);
  });

  return section;
}

// ===================== INPUT SECTION =====================
function buildInputSection_(settings) {
  const section = CardService.newCardSection().setHeader('📝 Message');
  section.addWidget(CardService.newTextInput()
    .setFieldName('prompt')
    .setTitle('Type here')
    .setMultiline(true)
    .setHint(`Message in ${settings.mode || 'assistant'} mode...`)
  );

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
  const historyLen = settings.historyLength || '10';
  section.addWidget(CardService.newTextParagraph().setText('💾 Total messages: ' + (loadHistory_().length || 0)));
  return section;
}

// ===================== EVENT HANDLERS =====================
function setMode_(e) {
  const settings = loadSettings_();
  settings.mode = e.parameters.mode;
  saveSettings_(settings);
  return refresh_();
}

function handleSend_(e) {
  const text = (e.formInput?.prompt || '').trim();
  if (!text) return notify_('✏️ Please enter a message.', CardService.NotificationType.INFO);

  const settings = loadSettings_();
  const mode = settings.mode || 'assistant';
  let history = loadHistory_();

  history.push({ role: 'user', text: text, timestamp: new Date().toISOString(), mode: mode });
  const reply = callGemini_(history, mode);

  history.push({ role: 'model', text: reply, timestamp: new Date().toISOString(), mode: mode });
  if (history.length > MAX_HISTORY) history = history.slice(-MAX_HISTORY);

  saveHistory_(history);
  return refresh_();
}

function handleClear_() {
  PropertiesService.getUserProperties().deleteProperty(HISTORY_KEY);
  return notify_('🗑️ Conversation cleared!', CardService.NotificationType.INFO);
}

function copyLastMessage_() {
  const history = loadHistory_();
  if (!history.length) return notify_('ℹ️ No messages to copy.', CardService.NotificationType.INFO);

  const lastMsg = history[history.length - 1];
  copyToClipboard_(lastMsg.role === 'user' && history.length > 1 ? history[history.length - 2].text : lastMsg.text);
  return notify_('✅ Copied to clipboard (check console log)', CardService.NotificationType.INFO);
}

// ===================== GEMINI API CALL (FIXED v1beta) =====================
function callGemini_(history, mode) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) return '❌ GEMINI_API_KEY not set.';

  const systemPrompt = SYSTEM_PROMPTS[mode] || SYSTEM_PROMPTS.assistant;
  const contents = [{ text: systemPrompt }, ...history.map(m => ({ text: m.text }))];

  const payload = {
    input: { structuredInput: { parts: contents.map(c => ({ text: c.text })) } }
  };

  try {
    const response = UrlFetchApp.fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
      timeout: 60
    });

    const status = response.getResponseCode();
    const data = JSON.parse(response.getContentText());

    if (status !== 200) return `❌ API Error: ${data.error?.message || 'Unknown error'}`;
    const reply = data.candidates?.[0]?.content?.[0]?.text || '❌ Empty response';
    return reply;

  } catch (err) {
    return `❌ Error: ${err.toString()}`;
  }
}

// ===================== STORAGE =====================
function loadHistory_() {
  const data = PropertiesService.getUserProperties().getProperty(HISTORY_KEY);
  return data ? JSON.parse(data) : [];
}

function saveHistory_(history) {
  PropertiesService.getUserProperties().setProperty(HISTORY_KEY, JSON.stringify(history.slice(-MAX_HISTORY)));
}

function loadSettings_() {
  const data = PropertiesService.getUserProperties().getProperty(SETTINGS_KEY);
  return data ? JSON.parse(data) : {};
}

function saveSettings_(settings) {
  PropertiesService.getUserProperties().setProperty(SETTINGS_KEY, JSON.stringify(settings));
}

// ===================== UI HELPERS =====================
function refresh_() {
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().updateCard(buildMainUI_()))
    .build();
}

function notify_(msg, type = CardService.NotificationType.INFO) {
  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText(msg).setType(type))
    .setNavigation(CardService.newNavigation().updateCard(buildMainUI_()))
    .build();
}

function truncateText_(text, maxLen) { return text.length <= maxLen ? text : text.substring(0, maxLen) + '...'; }
function formatTime_(ts) { const d = new Date(ts); return d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0'); }
function copyToClipboard_(text) { console.log('Copy placeholder:', text); }
