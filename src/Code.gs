/**
 * FINAL – Gemini AI Chatbot (Gmail Add-on)
 * Stable • Private • Persistent
 * Uses Gemini 1.5 Flash via v1beta (CORRECT)
 * Clean ASCII • NetFree safe
 */

// ===================== CONFIG =====================

const GEMINI_MODEL = 'models/gemini-2.5-flash';
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

const MAX_HISTORY = 40;

const HISTORY_KEY = 'CHAT_HISTORY_FINAL';
const PREFS_KEY   = 'CHAT_PREFS_FINAL';
const META_KEY    = 'CHAT_META_FINAL';

const TEMPERATURE = {
  PRECISE: 0.2,
  BALANCED: 0.6,
  CREATIVE: 0.9
};

const SYSTEM_PROMPTS = {
  GENERAL:   'You are a professional AI assistant. Be accurate and concise.',
  TECHNICAL: 'You are an expert engineer. Explain clearly with examples.',
  CREATIVE:  'You are a creative assistant. Be imaginative and helpful.',
  RESEARCH:  'You are a careful research assistant. Avoid speculation.'
};

// ===================== ENTRY POINTS =====================

function onGmailMessageOpen(e) {
  initPrefs_();
  return buildUI_();
}

function onHomepage(e) {
  initPrefs_();
  return buildUI_();
}

// ===================== UI =====================

function buildUI_() {
  const header = CardService.newCardHeader()
    .setTitle('Gemini AI Chat')
    .setSubtitle('Private • Persistent • Gemini 1.5 Flash');

  return CardService.newCardBuilder()
    .setHeader(header)
    .addSection(buildStats_())
    .addSection(buildChat_())
    .addSection(buildInput_())
    .addSection(buildSettings_())
    .build();
}

function buildStats_() {
  const h = loadHistory_();
  const m = loadMeta_();
  const userCount = h.filter(x => x.role === 'user').length;

  const s = CardService.newCardSection().setHeader('Conversation');
  s.addWidget(CardService.newTextParagraph()
    .setText(`Messages: ${h.length} (You: ${userCount})`));

  if (m.last) {
    s.addWidget(CardService.newTextParagraph()
      .setText(`Last activity: ${new Date(m.last).toLocaleString()}`));
  }
  return s;
}

function buildChat_() {
  const prefs = loadPrefs_();
  const h = loadHistory_().slice(-12);

  const s = CardService.newCardSection()
    .setHeader('Chat')
    .setCollapsible(true);

  if (!h.length) {
    s.addWidget(CardService.newTextParagraph().setText('Start chatting.'));
    return s;
  }

  h.forEach(m => {
    const who = m.role === 'user' ? 'You' : 'Gemini';
    const t = prefs.timestamps ? ` (${new Date(m.ts).toLocaleTimeString()})` : '';

    s.addWidget(CardService.newDecoratedText()
      .setTopLabel(who + t)
      .setText(format_(m.text))
      .setWrapText(true));
  });

  return s;
}

function buildInput_() {
  const s = CardService.newCardSection();

  s.addWidget(CardService.newTextInput()
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

  s.addWidget(CardService.newButtonSet().addButton(send).addButton(clear));
  return s;
}

function buildSettings_() {
  const p = loadPrefs_();
  const s = CardService.newCardSection().setHeader('Settings').setCollapsible(true);

  s.addWidget(CardService.newSelectionInput()
    .setType(CardService.SelectionInputType.DROPDOWN)
    .setFieldName('conversationMode')
    .setTitle('Mode')
    .addItem('General', 'GENERAL', p.mode === 'GENERAL')
    .addItem('Technical', 'TECHNICAL', p.mode === 'TECHNICAL')
    .addItem('Creative', 'CREATIVE', p.mode === 'CREATIVE')
    .addItem('Research', 'RESEARCH', p.mode === 'RESEARCH')
    .setOnChangeAction(CardService.newAction().setFunctionName('savePrefs_')));

  s.addWidget(CardService.newSelectionInput()
    .setType(CardService.SelectionInputType.DROPDOWN)
    .setFieldName('temperatureMode')
    .setTitle('Style')
    .addItem('Precise', 'PRECISE', p.temp === 'PRECISE')
    .addItem('Balanced', 'BALANCED', p.temp === 'BALANCED')
    .addItem('Creative', 'CREATIVE', p.temp === 'CREATIVE')
    .setOnChangeAction(CardService.newAction().setFunctionName('savePrefs_')));

  return s;
}

// ===================== ACTIONS =====================

function send_(e) {
  const text = (e.formInput?.prompt || '').trim();
  if (!text) return notify_('Empty message');

  let h = loadHistory_();
  h.push({ role: 'user', text, ts: Date.now() });
  h = h.slice(-MAX_HISTORY);
  saveHistory_(h);

  const reply = callGemini_(h);

  h.push({ role: 'model', text: reply, ts: Date.now() });
  saveHistory_(h.slice(-MAX_HISTORY));
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
  if (e.formInput?.conversationMode) p.mode = e.formInput.conversationMode;
  if (e.formInput?.temperatureMode) p.temp = e.formInput.temperatureMode;
  PropertiesService.getUserProperties().setProperty(PREFS_KEY, JSON.stringify(p));
  return refresh_();
}

// ===================== GEMINI =====================

function callGemini_(history) {
  const key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!key) return 'API key not set.';

  const prefs = loadPrefs_();

  const contents = [{
    role: 'user',
    parts: [{ text: SYSTEM_PROMPTS[prefs.mode] }]
  }];

  history.forEach(m => contents.push({
    role: m.role === 'model' ? 'model' : 'user',
    parts: [{ text: m.text }]
  }));

  const payload = {
    contents,
    generationConfig: {
      temperature: TEMPERATURE[prefs.temp],
      maxOutputTokens: 2048
    }
  };

  const url = `${API_BASE}/${GEMINI_MODEL}:generateContent?key=${key}`;

  try {
    const r = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    const j = JSON.parse(r.getContentText());
    return j.candidates?.[0]?.content?.parts?.[0]?.text || 'No response.';

  } catch (err) {
    return 'Gemini request failed.';
  }
}

// ===================== STORAGE =====================

function initPrefs_() {
  const p = PropertiesService.getUserProperties();
  if (!p.getProperty(PREFS_KEY)) {
    p.setProperty(PREFS_KEY, JSON.stringify({
      mode: 'GENERAL',
      temp: 'BALANCED',
      timestamps: true
    }));
  }
}

function loadPrefs_() {
  return JSON.parse(PropertiesService.getUserProperties().getProperty(PREFS_KEY));
}

function loadHistory_() {
  return JSON.parse(PropertiesService.getUserProperties().getProperty(HISTORY_KEY) || '[]');
}

function saveHistory_(h) {
  PropertiesService.getUserProperties().setProperty(HISTORY_KEY, JSON.stringify(h));
}

function loadMeta_() {
  return JSON.parse(PropertiesService.getUserProperties().getProperty(META_KEY) || '{}');
}

function saveMeta_(m) {
  PropertiesService.getUserProperties().setProperty(META_KEY, JSON.stringify(m));
}

// ===================== HELPERS =====================

function refresh_() {
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().updateCard(buildUI_()))
    .build();
}

function notify_(msg) {
  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText(msg))
    .setNavigation(CardService.newNavigation().updateCard(buildUI_()))
    .build();
}

function format_(t) {
  return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\*\*(.*?)\*\*/g,'<b>$1</b>')
    .replace(/\*(.*?)\*/g,'<i>$1</i>')
    .replace(/`(.*?)`/g,'<font face="monospace">$1</font>')
    .replace(/\n/g,'<br>');
}
/*/to remove*/
/**
 * Test Gemini AI API connection
 * Logs the raw response in Apps Script Execution Logs
 */
function testGeminiLogging() {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) {
    Logger.log('GEMINI_API_KEY not set in Script Properties!');
    return;
  }

  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + apiKey;

  const payload = {
    contents: [
      { role: 'user', parts: [{ text: 'Hello, Gemini! Please respond briefly.' }] }
    ],
    generationConfig: {
      temperature: 0.6,
      maxOutputTokens: 200
    }
  };

  try {
    const response = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    Logger.log('HTTP Response Code: ' + response.getResponseCode());
    Logger.log('Raw Response: ' + response.getContentText());
    
  } catch (err) {
    Logger.log('Request failed: ' + err);
  }
}
function listAvailableModels() {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  const url = 'https://generativelanguage.googleapis.com/v1beta/models?key=' + apiKey;

  try {
    const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    Logger.log(response.getContentText());
  } catch (err) {
    Logger.log('Failed: ' + err);
  }
}
