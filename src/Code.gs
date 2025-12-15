/**
 * Gemini AI Chat – Safe Version
 * Works with gemini-2.5-flash
 * Handles invalid responses, trims history, and logs safely
 */

// ===================== CONSTANTS =====================
const GEMINI_MODEL = 'models/gemini-2.5-flash';
const MAX_HISTORY = 20;
const HISTORY_KEY = 'CHAT_HISTORY';
const PREFS_KEY = 'USER_PREFS';
const SYSTEM_PROMPT = 'You are a professional AI assistant. Be accurate, concise, and helpful.';

// ===================== ENTRY POINT =====================
function onGmailMessageOpen() {
  return buildMainUI_();
}

// ===================== UI BUILDERS =====================
function buildMainUI_() {
  const header = CardService.newCardHeader()
    .setTitle('Gemini AI Chat')
    .setSubtitle('Private • Persistent • Gemini 2.5 Flash');

  return CardService.newCardBuilder()
    .setHeader(header)
    .addSection(buildHistorySection_())
    .addSection(buildInputSection_())
    .build();
}

function buildHistorySection_() {
  const section = CardService.newCardSection().setHeader('Conversation');
  const history = loadHistory_();

  if (!history.length) {
    section.addWidget(CardService.newTextParagraph().setText('Start a new conversation.'));
    return section;
  }

  history.forEach(msg => {
    const who = msg.role === 'user' ? 'You' : 'Gemini';
    section.addWidget(CardService.newDecoratedText()
      .setTopLabel(who)
      .setText(msg.text)
      .setWrapText(true));
  });

  return section;
}

function buildInputSection_() {
  const section = CardService.newCardSection();

  section.addWidget(CardService.newTextInput()
    .setFieldName('prompt')
    .setTitle('Message')
    .setMultiline(true));

  const sendButton = CardService.newTextButton()
    .setText('Send')
    .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
    .setOnClickAction(CardService.newAction().setFunctionName('send_'));

  const clearButton = CardService.newTextButton()
    .setText('New Chat')
    .setOnClickAction(CardService.newAction().setFunctionName('clear_'));

  section.addWidget(CardService.newButtonSet().addButton(sendButton).addButton(clearButton));

  return section;
}

// ===================== ACTIONS =====================
function send_(e) {
  const text = (e.formInput?.prompt || '').trim();
  if (!text) return notify_('Empty message.');

  let history = loadHistory_();
  history.push({ role: 'user', text });

  // Trim history
  history = history.slice(-MAX_HISTORY);

  // Call Gemini AI
  const reply = callGemini_(history);
  history.push({ role: 'model', text: reply });

  saveHistory_(history);
  return refresh_();
}

function clear_() {
  PropertiesService.getUserProperties().deleteProperty(HISTORY_KEY);
  return notify_('Conversation cleared.');
}

// ===================== GEMINI CALL =====================
function callGemini_(history) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) return 'API key missing.';

  const contents = [{ role: 'user', parts: [{ text: SYSTEM_PROMPT }] }];
  history.forEach(h => contents.push({ role: h.role === 'model' ? 'model' : 'user', parts: [{ text: h.text }] }));

  const payload = {
    contents,
    generationConfig: {
      temperature: 0.6,
      maxOutputTokens: 512,
      topP: 0.95,
      topK: 64
    }
  };

  try {
    const response = UrlFetchApp.fetch(
      `https://generativelanguage.googleapis.com/v1/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'post',
        contentType: 'application/json',
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      }
    );

    const text = response.getContentText();
    let data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      console.error('JSON parse error:', text);
      return 'Gemini request failed: invalid JSON.';
    }

    return data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response.';

  } catch (e) {
    console.error('Gemini request error:', e);
    return 'Gemini request failed.';
  }
}

// ===================== STORAGE =====================
function loadHistory_() {
  return JSON.parse(PropertiesService.getUserProperties().getProperty(HISTORY_KEY) || '[]');
}

function saveHistory_(history) {
  PropertiesService.getUserProperties().setProperty(HISTORY_KEY, JSON.stringify(history));
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
function testGeminiDebug() {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  const url = 'https://generativelanguage.googleapis.com/v1/models/models/gemini-2.5-flash:generateContent?key=' + apiKey;

  const payload = {
    contents: [
      { role: 'user', parts: [{ text: 'Hello, Gemini! Please respond briefly.' }] }
    ],
    generationConfig: { temperature: 0.5, maxOutputTokens: 100 }
  };

  try {
    const response = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    const text = response.getContentText();
    console.log('Raw Response:', text);  // Log raw text before parsing

    if (text) {
      try {
        const data = JSON.parse(text);
        const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
        console.log('Gemini reply:', reply);
      } catch (err) {
        console.error('JSON parse failed:', err);
      }
    } else {
      console.warn('Empty response received');
    }

  } catch (e) {
    console.error('Request failed:', e);
  }
}
