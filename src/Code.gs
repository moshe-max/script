/**
 * Gemini AI Chatbot – Gmail Add-on
 * Model: gemini-2.5-flash
 * Private • Persistent • Gemini 2.5 Flash
 */

// ===================== CONSTANTS =====================

const GEMINI_MODEL = 'models/gemini-2.5-flash';
const MAX_HISTORY_MESSAGES = 40;

const HISTORY_KEY = 'CHAT_HISTORY_V5';
const META_KEY = 'CONVERSATION_META_V4';
const PREFS_KEY = 'USER_PREFS_V4';

const TEMPERATURE_MODES = {
  PRECISE: 0.2,
  BALANCED: 0.6,
  CREATIVE: 0.9
};

const SYSTEM_PROMPTS = {
  GENERAL: 'You are a professional AI assistant. Be accurate, structured and concise.',
  TECHNICAL: 'You are an expert engineer. Provide deep technical explanations with clean code examples.',
  CREATIVE: 'You are a creative assistant. Be imaginative and helpful.',
  RESEARCH: 'You are a research assistant. Be factual, cautious and cite uncertainty.'
};

// ===================== ENTRY =====================

function onGmailMessageOpen() {
  initPrefs_();
  return buildMainUI_();
}

function initPrefs_() {
  const p = PropertiesService.getUserProperties();
  if (!p.getProperty(PREFS_KEY)) {
    p.setProperty(PREFS_KEY, JSON.stringify({
      conversationMode: 'GENERAL',
      temperatureMode: 'BALANCED',
      timestamps: true,
      maxMessages: MAX_HISTORY_MESSAGES
    }));
  }
}

// ===================== UI =====================

function buildMainUI_() {
  const header = CardService.newCardHeader()
    .setTitle('Gemini AI Chat')
    .setSubtitle('Private • Persistent • Gemini 2.5 Flash');

  return CardService.newCardBuilder()
    .setHeader(header)
    .addSection(buildStats_())
    .addSection(buildHistory_())
    .addSection(buildInput_())
    .addSection(buildSettings_())
    .build();
}

function buildStats_() {
  const section = CardService.newCardSection().setHeader('Conversation');
  const history = loadHistory_();
  const meta = loadMeta_();

  const userCount = history.filter(h => h.role === 'user').length;
  section.addWidget(CardService.newTextParagraph()
    .setText(`Messages: ${history.length} (You: ${userCount})`));

  if (meta.last) {
    section.addWidget(CardService.newTextParagraph()
      .setText(`Last activity: ${new Date(meta.last).toLocaleString()}`));
  }
  return section;
}

function buildHistory_() {
  const prefs = loadPrefs_();
  const history = loadHistory_().slice(-12);

  const section = CardService.newCardSection()
    .setHeader('Chat')
    .setCollapsible(true);

  if (!history.length) {
    section.addWidget(CardService.newTextParagraph().setText('Start a new conversation.'));
    return section;
  }

  history.forEach(m => {
    const who = m.role === 'user' ? 'You' : 'Gemini';
    const time = prefs.timestamps && m.ts
      ? ` (${new Date(m.ts).toLocaleTimeString()})` : '';

    section.addWidget(CardService.newDecoratedText()
      .setTopLabel(who + time)
      .setText(format_(m.text))
      .setWrapText(true));
  });

  return section;
}

function buildInput_() {
  const section = CardService.newCardSection();

  section.addWidget(CardService.newTextInput()
    .setFieldName('prompt')
    .setTitle('Message')
    .setMultiline(true));

  const send = CardService.newTextButton()
    .setText('Send')
    .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
    .setOnClickAction(CardService.newAction().setFunctionName('send_'));

  const clear = CardService.newTextButton()
    .setText('New Chat')
    .setOnClickAction(CardService.newAction().setFunctionName('clear_'));

  section.addWidget(CardService.newButtonSet().addButton(send).addButton(clear));
  return section;
}

function buildSettings_() {
  const p = loadPrefs_();
  const section = CardService.newCardSection().setHeader('Settings').setCollapsible(true);

  section.addWidget(CardService.newSelectionInput()
    .setType(CardService.SelectionInputType.DROPDOWN)
    .setFieldName('conversationMode')
    .setTitle('Mode')
    .addItem('General', 'GENERAL', p.conversationMode === 'GENERAL')
    .addItem('Technical', 'TECHNICAL', p.conversationMode === 'TECHNICAL')
    .addItem('Creative', 'CREATIVE', p.conversationMode === 'CREATIVE')
    .addItem('Research', 'RESEARCH', p.conversationMode === 'RESEARCH')
    .setOnChangeAction(CardService.newAction().setFunctionName('savePrefs_')));

  section.addWidget(CardService.newSelectionInput()
    .setType(CardService.SelectionInputType.DROPDOWN)
    .setFieldName('temperatureMode')
    .setTitle('Style')
    .addItem('Precise', 'PRECISE', p.temperatureMode === 'PRECISE')
    .addItem('Balanced', 'BALANCED', p.temperatureMode === 'BALANCED')
    .addItem('Creative', 'CREATIVE', p.temperatureMode === 'CREATIVE')
    .setOnChangeAction(CardService.newAction().setFunctionName('savePrefs_')));

  return section;
}

// ===================== ACTIONS =====================

function send_(e) {
  const text = (e.formInput?.prompt || '').trim();
  if (!text) return notify_('Empty message');

  const prefs = loadPrefs_();
  let history = loadHistory_();

  history.push({ role: 'user', text, ts: Date.now() });
  history = trimHistory_(history, prefs.maxMessages);
  saveHistory_(history);

  const reply = callGemini_(history, prefs);

  history.push({ role: 'model', text: reply, ts: Date.now() });
  saveHistory_(trimHistory_(history, prefs.maxMessages));

  saveMeta_({ last: Date.now() });
  return refresh_();
}

function clear_() {
  const p = PropertiesService.getUserProperties();
  p.deleteProperty(HISTORY_KEY);
  p.deleteProperty(META_KEY);
  return notify_('Conversation cleared');
}

function savePrefs_(e) {
  const p = loadPrefs_();
  if (e.formInput?.conversationMode) p.conversationMode = e.formInput.conversationMode;
  if (e.formInput?.temperatureMode) p.temperatureMode = e.formInput.temperatureMode;
  PropertiesService.getUserProperties().setProperty(PREFS_KEY, JSON.stringify(p));
  return refresh_();
}

// ===================== GEMINI API =====================

function callGemini_(history, prefs) {
  const key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!key) return 'API key missing.';

  const url = `https://generativelanguage.googleapis.com/v1/models/${GEMINI_MODEL}:generateContent?key=${key}`;

  const contents = [];

  // system instruction injected once
  contents.push({
    role: 'user',
    parts: [{ text: SYSTEM_PROMPTS[prefs.conversationMode] }]
  });

  history.forEach(h => contents.push({
    role: h.role === 'model' ? 'model' : 'user',
    parts: [{ text: h.text }]
  }));

  const payload = {
    contents: contents,
    generationConfig: {
      temperature: TEMPERATURE_MODES[prefs.temperatureMode],
      maxOutputTokens: 4096,
      topP: 0.95
    }
  };

  try {
    const r = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    const j = JSON.parse(r.getContentText());
    return j.candidates?.[0]?.content?.parts?.[0]?.text || 'No response.';

  } catch (e) {
    return 'Gemini request failed.';
  }
}

// ===================== STORAGE =====================

function loadHistory_() {
  return JSON.parse(PropertiesService.getUserProperties().getProperty(HISTORY_KEY) || '[]');
}

function saveHistory_(h) {
  PropertiesService.getUserProperties().setProperty(HISTORY_KEY, JSON.stringify(h));
}

function trimHistory_(h, max) {
  return h.slice(-max);
}

function loadPrefs_() {
  return JSON.parse(PropertiesService.getUserProperties().getProperty(PREFS_KEY));
}

function loadMeta_() {
  return JSON.parse(PropertiesService.getUserProperties().getProperty(META_KEY) || '{}');
}

function saveMeta_(m) {
  PropertiesService.getUserProperties().setProperty(META_KEY, JSON.stringify(m));
}

// ===================== UI HELPERS =====================

function refresh_() {
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().updateCard(buildMainUI_()))
    .build();
}

function notify_(msg) {
  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText(msg))
    .setNavigation(CardService.newNavigation().updateCard(buildMainUI_()))
    .build();
}

function format_(t) {
  return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\*\*(.*?)\*\*/g,'<b>$1</b>')
    .replace(/\*(.*?)\*/g,'<i>$1</i>')
    .replace(/`(.*?)`/g,'<font face="monospace">$1</font>')
    .replace(/\n/g,'<br>');
}
