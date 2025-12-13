// --- Configuration Constants ---
const USER_PROPERTIES = PropertiesService.getUserProperties();
const API_KEY_NAME = 'GEMINI_API_KEY';
const CHAT_HISTORY_KEY = 'CHAT_HISTORY';
const GEMINI_MODEL = 'gemini-2.5-flash-preview-09-2025'; 

// --- Primary Entry Point ---

/**
 * Creates the initial or home page card for the Gmail Add-on.
 * @param {Object} e The event object passed by the Gmail Add-on framework.
 * @returns {CardService.Card} The constructed CardService card.
 */
function onHomepage(e) {
  return buildChatInterface();
}

// --- UI Construction (CardService) ---

/**
 * Builds the interactive chat interface card, displaying history and input field.
 * @returns {CardService.Card} The chat interface card.
 */
function buildChatInterface() {
  const cardBuilder = CardService.newCardBuilder()
      .setHeader(CardService.newCardHeader()
          .setTitle('🤖 Gemini Chat Assistant')
          .setImageUrl('https://fonts.gstatic.com/s/i/short-term/release/gemini/24px.svg'));

  // 1. API Key Setup Section (Always show if key is missing)
  const apiKey = USER_PROPERTIES.getProperty(API_KEY_NAME);
  if (!apiKey) {
    const setupSection = CardService.newCardSection()
        .setHeader('⚠️ API Key Required')
        .addWidget(CardService.newTextParagraph().setText('Please set your Gemini API key in the Script Properties to enable the chat.'));
    cardBuilder.addSection(setupSection);
    return cardBuilder.build();
  }

  // 2. Chat History Section
  const historySection = CardService.newCardSection()
      .setHeader('Conversation History');
  
  const history = getChatHistory();
  
  if (history.length === 0) {
    historySection.addWidget(CardService.newTextParagraph().setText('Start a new conversation with the Gemini model below.'));
  } else {
    // Display the latest 10 messages for a concise view
    history.slice(-10).forEach(message => {
      // Use simple icons for user and model distinction
      const icon = message.role === 'user' ? 'PERSON' : 'SETTINGS_ACCESSIBILITY';
      historySection.addWidget(
          CardService.newDecoratedText()
              .setIcon(CardService.newIcon().setIcon(icon))
              .setText(`<b>${message.role === 'user' ? 'You' : 'Gemini'}:</b> ${message.text}`)
              .setWrapText(true)
      );
    });
  }

  cardBuilder.addSection(historySection);
  
  // 3. User Input and Send Section
  const inputSection = CardService.newCardSection();

  // Text input field
  const messageInput = CardService.newTextInput()
      .setFieldName('userMessage')
      .setTitle('Your Message')
      .setHint('Ask a question or provide context...');

  // Send button action
  const sendAction = CardService.newAction()
      .setFunctionName('handleMessageSend');
      
  const sendButton = CardService.newTextButton()
      .setText('Send Message')
      .setOnClickAction(sendAction)
      .setTextButtonStyle(CardService.TextButtonStyle.FILLED);
      
  inputSection.addWidget(messageInput)
              .addWidget(sendButton);

  cardBuilder.addSection(inputSection);

  // 4. Reset Button Section
  const resetAction = CardService.newAction().setFunctionName('resetChatHistory');
  const resetButton = CardService.newTextButton()
      .setText('🗑️ Reset Chat History')
      .setOnClickAction(resetAction)
      .setNotification(CardService.newNotification()
          .setText('Chat history cleared.'));
  
  cardBuilder.addSection(CardService.newCardSection().addWidget(resetButton));

  return cardBuilder.build();
}

// --- Event Handlers ---

/**
 * Handles the submission of a new message from the user.
 * @param {Object} e The event object containing form input.
 * @returns {CardService.ActionResponse} Response to update the UI.
 */
function handleMessageSend(e) {
  const userMessage = e.formInput.userMessage;
  if (!userMessage) {
    return CardService.newActionResponseBuilder().build();
  }

  // 1. Save user message
  saveMessage('user', userMessage);
  
  // 2. Call Gemini API
  const geminiResponse = getGeminiResponse();
  
  // 3. Save model response
  saveMessage('model', geminiResponse);
  
  // 4. Rebuild and update the card
  const updatedCard = buildChatInterface();
  
  return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().updateCard(updatedCard))
      .build();
}

/**
 * Clears all chat history from user properties.
 * @returns {CardService.ActionResponse} Response to update the UI.
 */
function resetChatHistory() {
  USER_PROPERTIES.deleteProperty(CHAT_HISTORY_KEY);
  
  const updatedCard = buildChatInterface();
  
  return CardService.newActionResponseBuilder()
      .setNavigation(CardService.newNavigation().updateCard(updatedCard))
      .build();
}

// --- Chat History Management ---

/**
 * Retrieves the stored chat history as an array of objects.
 * @returns {Array<{role: string, text: string}>} The chat history array.
 */
function getChatHistory() {
  const historyJson = USER_PROPERTIES.getProperty(CHAT_HISTORY_KEY);
  return historyJson ? JSON.parse(historyJson) : [];
}

/**
 * Saves a new message (user or model) to the persistent history.
 * Limits history length to prevent exceeding property size limits.
 * @param {string} role 'user' or 'model'.
 * @param {string} text The message content.
 */
function saveMessage(role, text) {
  const history = getChatHistory();
  history.push({ role: role, text: text });
  
  // Keep only the last 20 turns (40 messages) to manage storage limits
  if (history.length > 40) {
    history.splice(0, history.length - 40);
  }
  
  USER_PROPERTIES.setProperty(CHAT_HISTORY_KEY, JSON.stringify(history));
}

// --- Gemini API Communication ---

/**
 * Calls the Gemini API using the stored chat history to maintain context.
 * @returns {string} The text response from the Gemini model.
 */
function getGeminiResponse() {
  const apiKey = USER_PROPERTIES.getProperty(API_KEY_NAME);
  const history = getChatHistory();
  
  // Safety check, although the UI should prevent this call if the key is missing
  if (!apiKey) {
    return 'Error: Gemini API Key is missing.';
  }

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  
  // Convert history to the 'contents' format required by the API
  const contents = history.map(msg => ({
    role: msg.role === 'user' ? 'user' : 'model',
    parts: [{ text: msg.text }]
  }));
  
  const payload = {
    contents: contents,
    // System instruction to define the model's persona
    config: {
        systemInstruction: "You are a helpful and context-aware AI assistant integrated as a Google Workspace Add-on within Gmail. Keep your responses concise and directly address the user's last input, using the conversation history for context."
    }
  };
  
  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true // Required to handle errors gracefully
  };

  try {
    const response = UrlFetchApp.fetch(apiUrl, options);
    const data = JSON.parse(response.getContentText());

    if (data.candidates && data.candidates.length > 0) {
      // Check for content text or block reason
      const candidate = data.candidates[0];
      if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
          return candidate.content.parts[0].text;
      } else if (candidate.finishReason === 'SAFETY') {
          return 'The content was blocked due to safety settings. Please try a different query.';
      }
    } else if (data.error) {
      Logger.log('API Error: ' + data.error.message);
      return 'An API error occurred: ' + data.error.message;
    } 
    
    // Fallback for unexpected response structure
    return 'Could not get a valid response from the model.';

  } catch (e) {
    Logger.log('Error calling API: ' + e.toString());
    return 'A general error occurred during the AI service call.';
  }
}
