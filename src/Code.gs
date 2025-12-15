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

// הגדרות קבועות
const GEMINI_MODEL = 'models/gemini-1.5-pro';
const MAX_HISTORY_MESSAGES = 10; // שמור את 10 ההודעות האחרונות (5 סבבים)
const HISTORY_KEY = 'CHAT_HISTORY_V2'; // מפתח חדש לאחזור היסטוריה

// --- כניסה ו-UI ---

/**
 * נקודת כניסה – פותחת את הצ'אט בוט.
 * @return {GoogleAppsScript.Card_Service.Card} כרטיס ה-UI הראשי.
 */
function onGmailMessageOpen() {
  return buildChatUI_();
}

/**
 * בונה את ממשק המשתמש של הצ'אט (UI).
 * @param {string} [initialMessage=''] הודעה ראשונית להצגה בתיבת הטקסט (למשל, כדי לשמר את הקלט).
 * @return {GoogleAppsScript.Card_Service.Card} כרטיס הקלט של הצ'אט.
 */
function buildChatUI_(initialMessage = '') {
  const header = CardService.newCardHeader()
    .setTitle('🤖 Gemini AI Chat')
    .setSubtitle('שיחה פרטית ונשמרת');

  // הצג את היסטוריית הצ'אט העדכנית
  const historySection = buildHistorySection_();

  const input = CardService.newTextInput()
    .setFieldName('prompt')
    .setTitle('הודעה חדשה')
    .setHint('הקלד את השאלה שלך כאן...')
    .setMultiline(true)
    .setValue(initialMessage); // שימור הקלט

  const sendAction = CardService.newAction()
    .setFunctionName('sendToGemini_');

  const sendBtn = CardService.newTextButton()
    .setText('שלח ל-Gemini')
    .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
    .setOnClickAction(sendAction);

  const newChatAction = CardService.newAction()
    .setFunctionName('startNewChat_');
  
  const newChatBtn = CardService.newTextButton()
    .setText('מחק שיחה והתחל חדשה')
    .setOnClickAction(newChatAction);

  const inputSection = CardService.newCardSection()
    .addWidget(input)
    .addWidget(CardService.newButtonSet().addButton(sendBtn).addButton(newChatBtn));

  return CardService.newCardBuilder()
    .setHeader(header)
    .addSection(historySection) // סעיף היסטוריה
    .addSection(inputSection)
    .build();
}

/**
 * בונה את החלק של היסטוריית הצ'אט.
 * @return {GoogleAppsScript.Card_Service.CardSection} סעיף המציג את 3 ההודעות האחרונות.
 */
function buildHistorySection_() {
  const props = PropertiesService.getUserProperties();
  const history = JSON.parse(props.getProperty(HISTORY_KEY) || '[]');
  
  const section = CardService.newCardSection()
    .setHeader('היסטוריה אחרונה (5 סבבים)');
    
  if (history.length === 0) {
      section.addWidget(CardService.newTextParagraph().setText('השיחה שלך תופיע כאן...'));
      return section;
  }
  
  // הצג רק את 6 ההודעות האחרונות (3 סבבים)
  const displayHistory = history.slice(-6);

  displayHistory.forEach(h => {
    const role = h.role === 'user' ? '<b>אני:</b>' : '<b>Gemini:</b>';
    // שימוש ב-TextParagraph שמכבד HTML בסיסי לטובת עיצוב.
    section.addWidget(
      CardService.newTextParagraph()
        .setText(`${role} ${escape_(h.text)}`)
    );
  });
  
  return section;
}

// --- לוגיקת צ'אט ---

/**
 * מטפל בשליחת הצ'אט ושומר את ההיסטוריה.
 * @param {Object} e אובייקט האירוע מהצ'אט.
 * @return {GoogleAppsScript.Card_Service.ActionResponse} עדכון כרטיס הממשק.
 */
function sendToGemini_(e) {
  const prompt = e.formInput.prompt;
  
  if (!prompt || !prompt.trim()) {
    // השאר את המשתמש במסך הראשי עם הודעת שגיאה קלה
    return CardService.newActionResponseBuilder()
        .setNotification(CardService.newNotification().setText('אנא הכנס הודעה.'))
        .setNavigation(CardService.newNavigation().updateCard(buildChatUI_(prompt)))
        .build();
  }

  // טען היסטוריה, הוסף הודעת משתמש
  const props = PropertiesService.getUserProperties();
  const history = JSON.parse(props.getProperty(HISTORY_KEY) || '[]');
  history.push({ role: 'user', text: prompt });

  // קריאה ל-Gemini
  const reply = callGeminiWithHistory_(history);

  // הוסף תגובת מודל
  history.push({ role: 'model', text: reply });

  // שמור רק את ההיסטוריה המקוצצת
  const trimmed = history.slice(-MAX_HISTORY_MESSAGES);
  props.setProperty(HISTORY_KEY, JSON.stringify(trimmed));
  
  // הצג את הכרטיס המעודכן (UI ראשי)
  return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().updateCard(buildChatUI_()))
      .build();
}

/**
 * מאפס את היסטוריית הצ'אט ומציג מחדש את הממשק.
 * @return {GoogleAppsScript.Card_Service.ActionResponse} עדכון כרטיס הממשק.
 */
function startNewChat_() {
    PropertiesService.getUserProperties().deleteProperty(HISTORY_KEY);
    
    return CardService.newActionResponseBuilder()
        .setNotification(CardService.newNotification().setText('היסטוריית הצ׳אט נמחקה. שיחה חדשה החלה.'))
        .setNavigation(CardService.newNavigation().updateCard(buildChatUI_()))
        .build();
}

/**
 * קריאה ל-Gemini API עם היסטוריית הצ'אט.
 * @param {Array<Object>} history היסטוריית ההודעות.
 * @return {string} תגובת המודל.
 */
function callGeminiWithHistory_(history) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) {
    return 'שגיאה: חסר מפתח API של Gemini. אנא הגדר אותו במאפייני הסקריפט.';
  }

  const url = `https://generativelanguage.googleapis.com/v1/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  // ממיר את פורמט ההיסטוריה לפורמט הנדרש על ידי ה-API של Gemini
  const contents = history.map(h => ({
    role: h.role === 'model' ? 'model' : 'user',
    parts: [{ text: h.text }]
  }));
  
  // הוספת הנחיית מערכת (System Instruction) לשיפור איכות התגובה
  // הערה: נטפרי לא מרשה לי לדבר על נושאים מסוימים, לכן אני מכניס הגבלת נושאים כללית כאן.
  const contentsWithSystemInstruction = [
    {
      role: 'system',
      parts: [
        { text: 'אתה עוזר AI אדיב ומקצועי. ענה רק בנושאים טכניים, חינוכיים או עובדתיים. הימנע מכל תוכן שנוגע לדת, מין, פגיעה עצמית, סמים, או הימורים.'}
      ]
    },
    ...contents
  ];

  const payload = {
    contents: contentsWithSystemInstruction,
    generationConfig: {
      temperature: 0.5, // מעט נמוך יותר לשם יציבות
      maxOutputTokens: 2048 // הגדלנו את המקסימום
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
    // בדיקה טובה יותר לתגובות חסומות/שגויות
    if (json.candidates && json.candidates[0] && json.candidates[0].content) {
      return json.candidates[0].content.parts[0].text;
    }
    
    // טיפול בתוצאות שגויות (כגון חסימה בגלל בטיחות)
    if (json.promptFeedback && json.promptFeedback.blockReason) {
         return 'הבקשה נחסמה על ידי Gemini עקב הפרת מדיניות בטיחות. נסה שאלה אחרת.';
    }
    
    // שגיאה כללית
    return 'לא התקבלה תגובה מ-Gemini.';

  } catch (e) {
    // שגיאת ניתוח או משהו אחר
    return `שגיאה בעיבוד התגובה: ${e.toString()}`;
  }
}

// --- כלים ---

/**
 * ממיר טקסט בסיסי (HTML) ל-CardService.
 * @param {string} t הטקסט לבריחה (escape).
 * @return {string} הטקסט לאחר בריחה.
 */
function escape_(t) {
  // החלפת תווים מיוחדים ל-HTML Entities
  let escaped = t.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  
  // הוספת תמיכה בסיסית לשבירת שורה בתוך TextParagraph
  escaped = escaped.replace(/\n/g, '<br>');
  
  return escaped;
}