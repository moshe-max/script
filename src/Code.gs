/**
 * Gemini AI Chatbot – Gmail Add-on (Standalone)
 * ---------------------------------------------
 * Pure AI chat interface deployed as a Gmail Add-on.
 * Persistent single-user chat.
 * 
 * REQUIREMENTS:
 * 1. Set Script Property: GEMINI_API_KEY
 * 2. Deploy as Gmail Add-on
 */

const GEMINI_MODEL = 'models/gemini-1.5-pro';

/**
 * Entry point – opens chatbot
 */
function onGmailMessageOpen() {
  return buildChatUI_();
}

/**
 * Build chat UI
 */
function buildChatUI_() {
  const header = CardService.newCardHeader()
    .setTitle('Gemini AI Chatbot')
    .setSubtitle('Private persistent chat');

  const input = CardService.newTextInput()
    .setFieldName('prompt')
    .setTitle('Message')
    .setHint('Chat is remembered (local to you)')
    .setMultiline(true);

  const action = CardService.newAction()
    .setFunctionName('sendToGemini_');

  const sendBtn = CardService.newTextButton()
    .setText('Send')
    .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
    .setOnClickAction(action);

  const section = CardService.newCardSection()
    .addWidget(input)
    .addWidget(sendBtn);

  return CardService.newCardBuilder()
    .setHeader(header)
    .addSection(section)
    .build();
}

/**
 * Handle chat submit with persistent history
 */
function sendToGemini_(e) {
  const prompt = e.formInput.prompt;
  if (!prompt || !prompt.trim()) {
    return errorCard_('Please enter a message.');
  }

  // Load single-user chat history
  const props = PropertiesService.getUserProperties();
  const history = JSON.parse(props.getProperty('CHAT_HISTORY') || '[]');

  history.push({ role: 'user', text: prompt });

  const reply = callGeminiWithHistory_(history);

  history.push({ role: 'model', text: reply });

  // Keep last 10 messages (5 turns)
  const trimmed = history.slice(-10);
  props.setProperty('CHAT_HISTORY', JSON.stringify(trimmed));

  return responseCard_(prompt, reply);
}

/**
 * Gemini API call with chat history
 */
function callGeminiWithHistory_(history) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) throw new Error('Missing Gemini API key');

  const url = `https://generativelanguage.googleapis.com/v1/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const contents = history.map(h => ({
    role: h.role === 'model' ? 'model' : 'user',
    parts: [{ text: h.text }]
  }));

  const payload = {
    contents,
    generationConfig: {
      temperature: 0.6,
      maxOutputTokens: 1024
    }
  };

  const res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const json = JSON.parse(res.getContentText());

  try {
    return json.candidates[0].content.parts[0].text;
  } catch (e) {
    return 'No response from Gemini.';
  }
}

/**
 * Response UI
 */
function responseCard_(question, answer) {
  const header = CardService.newCardHeader()
    .setTitle('Gemini Response');

  const q = CardService.newTextParagraph()
    .setText(`<b>You:</b><br>${escape_(question)}`);

  const a = CardService.newTextParagraph()
    .setText(`<b>Gemini:</b><br>${escape_(answer)}`);

  const backAction = CardService.newAction()
    .setFunctionName('onGmailMessageOpen');

  const backBtn = CardService.newTextButton()
    .setText('New Message')
    .setOnClickAction(backAction);

  const section = CardService.newCardSection()
    .addWidget(q)
    .addWidget(a)
    .addWidget(backBtn);

  return CardService.newCardBuilder()
    .setHeader(header)
    .addSection(section)
    .build();
}

/**
 * Error card
 */
function errorCard_(msg) {
  return CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle('Error'))
    .addSection(CardService.newCardSection().addWidget(
      CardService.newTextParagraph().setText(msg)
    ))
    .build();
}

/**
 * Simple HTML escape for text
 */
function escape_(t) {
  return t.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}
