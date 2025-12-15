/**
 * Gemini AI Chat – Gmail Add-on (Private, Persistent)
 * Uses Gemini 1.5 via generateContent (v1)
 */

/************ CONFIG ************/
const GEMINI_MODEL = 'gemini-1.5-flash-latest';

const TEMPERATURE_MODES = {
  normal: 0.7,
  precise: 0.3,
  creative: 0.9
};

const SYSTEM_PROMPTS = {
  default: 'You are a helpful, professional AI assistant. Answer clearly and concisely.'
};

/************ ENTRY ************/
function onGmailMessageOpen(e) {
  return buildUI_();
}

// Gmail fallback entry point
function onHomepage(e) {
  return buildUI_();
}

/************ UI ************/
function buildUI_() {
  const header = CardService.newCardHeader()
    .setTitle('Gemini AI Chat')
    .setSubtitle('Private • Persistent • Gemini 1.5');

  const input = CardService.newTextInput()
    .setFieldName('prompt')
    .setTitle('Message');

  const btn = CardService.newTextButton()
    .setText('Send')
    .setOnClickAction(CardService.newAction().setFunctionName('onSend_'))
    .setTextButtonStyle(CardService.TextButtonStyle.FILLED);

  const section = CardService.newCardSection()
    .addWidget(input)
    .addWidget(btn);

  return CardService.newCardBuilder()
    .setHeader(header)
    .addSection(section)
    .build();
}

/************ ACTION ************/
function onSend_(e) {
  const userText = e.formInput.prompt;
  if (!userText) return buildUI_();

  const history = loadHistory_();
  history.push({ role: 'user', text: userText });

  const reply = callGemini_(history);
  history.push({ role: 'model', text: reply });
  saveHistory_(history);

  return buildChatUI_(history);
}

/************ CHAT UI ************/
function buildChatUI_(history) {
  const header = CardService.newCardHeader()
    .setTitle('Gemini AI Chat')
    .setSubtitle('Private • Persistent • Gemini 1.5');

  const section = CardService.newCardSection();

  history.slice(-10).forEach(m => {
    section.addWidget(
      CardService.newTextParagraph()
        .setText(`<b>${m.role === 'user' ? 'You' : 'Gemini'}:</b> ${m.text}`)
    );
  });

  section.addWidget(
    CardService.newTextButton()
      .setText('New Message')
      .setOnClickAction(CardService.newAction().setFunctionName('onHomepage'))
  );

  return CardService.newCardBuilder()
    .setHeader(header)
    .addSection(section)
    .build();
}

/************ GEMINI ************/
function callGemini_(history) {
  const key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!key) return 'Error: GEMINI_API_KEY not set.';

  const url = `https://generativelanguage.googleapis.com/v1/${GEMINI_MODEL}:generateContent?key=${key}`;

  const contents = [];

  // Inject system prompt ONCE
  if (!history.some(m => m.text.startsWith(SYSTEM_PROMPTS.default))) {
    contents.push({ role: 'user', parts: [{ text: SYSTEM_PROMPTS.default }] });
  }

  history.forEach(m => contents.push({
    role: m.role === 'model' ? 'model' : 'user',
    parts: [{ text: m.text }]
  }));

  const payload = {
    contents,
    generationConfig: {
      temperature: TEMPERATURE_MODES.normal,
      maxOutputTokens: 1024
    }
  };

  try {
    const res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    const json = JSON.parse(res.getContentText());

    if (json.error) return 'Gemini error: ' + json.error.message;

    return json.candidates?.[0]?.content?.parts?.[0]?.text || 'No response.';

  } catch (err) {
    return 'Gemini request failed.';
  }
}

/************ STORAGE ************/
function loadHistory_() {
  const raw = PropertiesService.getUserProperties().getProperty('CHAT_HISTORY');
  return raw ? JSON.parse(raw) : [];
}

function saveHistory_(history) {
  PropertiesService.getUserProperties().setProperty('CHAT_HISTORY', JSON.stringify(history));
}
