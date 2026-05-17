/**
 * AI Chatbot conversation handler
 * Handles natural language conversations and integrates with command processing
 */

// Greeting patterns
const greetingPatterns = [
  'hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening',
  'greetings', 'howdy', 'hi there', 'hello there'
];

// Question patterns
const questionPatterns = {
  howAreYou: ['how are you', 'how\'s it going', 'how do you do', 'how are things'],
  whatCanYouDo: ['what can you do', 'what are your capabilities', 'what do you do', 'help me', 'what can you help with'],
  whoAreYou: ['who are you', 'what are you', 'tell me about yourself'],
  location: ['where am i', 'what is my location', 'current location', 'my location'],
  savedLocations: ['what locations', 'saved locations', 'my locations', 'what places'],
  time: ['what time', 'current time', 'what\'s the time'],
  date: ['what date', 'today\'s date', 'what day']
};

// Conversation responses
const conversationResponses = {
  greetings: [
    'Hello! How can I assist you today?',
    'Hi there! I\'m here to help. What would you like to do?',
    'Hey! Great to see you. How can I help?',
    'Hello! I\'m your assistant. What can I do for you?'
  ],
  howAreYou: [
    'I\'m doing great, thank you for asking! How can I help you today?',
    'I\'m doing well! Ready to assist you. What do you need?',
    'I\'m fantastic! How can I be of service?',
    'I\'m doing great! What would you like to do?'
  ],
  whatCanYouDo: [
    'I can help you with:\n\n📍 Setting and saving locations (home, office)\n🚗 Navigation assistance\n🚨 Emergency alerts\n💬 General conversation\n\nJust ask me anything or give me a command!',
    'I\'m your personal assistant! I can:\n\n• Save your home and office locations\n• Navigate you to saved locations\n• Send emergency alerts\n• Answer questions and chat\n\nWhat would you like to do?',
    'I can assist you with location management, navigation, emergency help, and general questions. Feel free to ask me anything!'
  ],
  whoAreYou: [
    'I\'m your AI assistant! I help you manage locations, navigate, and provide assistance. I can understand both voice and text commands.',
    'I\'m your personal assistant designed to help with location-based tasks, navigation, and general assistance. How can I help you today?',
    'I\'m an AI assistant that helps you with locations, navigation, and emergency services. I\'m here to make your life easier!'
  ],
  thanks: [
    'You\'re welcome! Is there anything else I can help with?',
    'Happy to help! Anything else you need?',
    'My pleasure! Feel free to ask if you need anything else.',
    'You\'re welcome! Let me know if you need more assistance.'
  ],
  goodbye: [
    'Goodbye! Have a great day!',
    'See you later! Take care!',
    'Bye! Feel free to come back anytime!',
    'Goodbye! Stay safe!'
  ]
};

/**
 * Check if input matches greeting patterns
 */
export const isGreeting = (input) => {
  const lowerInput = input.toLowerCase().trim();
  return greetingPatterns.some(pattern => {
    const regex = new RegExp(`^${pattern}\\b|\\b${pattern}\\b`, 'i');
    return regex.test(lowerInput);
  });
};

/**
 * Check if input matches question patterns
 */
export const detectQuestion = (input) => {
  const lowerInput = input.toLowerCase().trim();
  
  for (const [questionType, patterns] of Object.entries(questionPatterns)) {
    if (patterns.some(pattern => lowerInput.includes(pattern))) {
      return questionType;
    }
  }
  
  // Check for general questions (contains question words)
  const questionWords = ['what', 'where', 'when', 'who', 'why', 'how', 'which', 'can you', 'do you', 'are you', 'is it'];
  if (questionWords.some(word => lowerInput.includes(word)) && (lowerInput.includes('?') || lowerInput.length < 50)) {
    return 'general';
  }
  
  return null;
};

/**
 * Check if input is a thank you or goodbye
 */
export const isThankYou = (input) => {
  const lowerInput = input.toLowerCase().trim();
  const thankPatterns = ['thank you', 'thanks', 'thank', 'appreciate', 'grateful'];
  return thankPatterns.some(pattern => lowerInput.includes(pattern));
};

export const isGoodbye = (input) => {
  const lowerInput = input.toLowerCase().trim();
  const goodbyePatterns = ['bye', 'goodbye', 'see you', 'farewell', 'later', 'cya', 'see ya'];
  return goodbyePatterns.some(pattern => lowerInput.includes(pattern));
};

/**
 * Get contextual response based on conversation state
 */
export const getContextualResponse = (input, context = {}) => {
  const lowerInput = input.toLowerCase().trim();
  const { savedLocations = {}, currentLocation = null, currentTime = new Date() } = context;
  
  // Check for greetings
  if (isGreeting(lowerInput)) {
    const responses = conversationResponses.greetings;
    return responses[Math.floor(Math.random() * responses.length)];
  }
  
  // Check for thank you
  if (isThankYou(lowerInput)) {
    const responses = conversationResponses.thanks;
    return responses[Math.floor(Math.random() * responses.length)];
  }
  
  // Check for goodbye
  if (isGoodbye(lowerInput)) {
    const responses = conversationResponses.goodbye;
    return responses[Math.floor(Math.random() * responses.length)];
  }
  
  // Check for specific questions
  const questionType = detectQuestion(lowerInput);
  
  if (questionType === 'howAreYou') {
    const responses = conversationResponses.howAreYou;
    return responses[Math.floor(Math.random() * responses.length)];
  }
  
  if (questionType === 'whatCanYouDo') {
    const responses = conversationResponses.whatCanYouDo;
    return responses[Math.floor(Math.random() * responses.length)];
  }
  
  if (questionType === 'whoAreYou') {
    const responses = conversationResponses.whoAreYou;
    return responses[Math.floor(Math.random() * responses.length)];
  }
  
  if (questionType === 'location') {
    if (currentLocation) {
      return `You are currently at:\n\n📍 Latitude: ${currentLocation.latitude.toFixed(6)}\n📍 Longitude: ${currentLocation.longitude.toFixed(6)}\n\nWould you like to save this location?`;
    } else {
      return 'I\'m currently unable to determine your location. Please make sure location services are enabled.';
    }
  }
  
  if (questionType === 'savedLocations') {
    const locations = [];
    if (savedLocations.home) {
      locations.push('🏠 Home');
    }
    if (savedLocations.office) {
      locations.push('🏢 Office');
    }
    if (savedLocations.landmarks && savedLocations.landmarks.length > 0) {
      locations.push(`📍 ${savedLocations.landmarks.length} landmark(s)`);
    }
    
    if (locations.length > 0) {
      return `You have the following saved locations:\n\n${locations.join('\n')}\n\nWould you like to navigate to any of them?`;
    } else {
      return 'You don\'t have any saved locations yet. Would you like to save your current location as home or office?';
    }
  }
  
  if (questionType === 'time') {
    const time = currentTime.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    });
    return `The current time is ${time}.`;
  }
  
  if (questionType === 'date') {
    const date = currentTime.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    return `Today is ${date}.`;
  }
  
  if (questionType === 'general') {
    // Provide helpful response for general questions
    return 'I\'m here to help! I can assist you with:\n\n• Location management\n• Navigation\n• Emergency alerts\n• General questions\n\nTry asking me to "navigate to home" or "set location to office", or ask me what I can do!';
  }
  
  return null;
};

/**
 * Generate AI-like response for unknown inputs
 */
export const generateAIResponse = (input, context = {}) => {
  const lowerInput = input.toLowerCase().trim();
  
  // Check for contextual response first
  const contextualResponse = getContextualResponse(input, context);
  if (contextualResponse) {
    return contextualResponse;
  }
  
  // Handle common conversational patterns
  if (lowerInput.length < 3) {
    return 'Could you please provide more details? I\'m here to help!';
  }
  
  // Check for location-related keywords
  if (lowerInput.includes('location') || lowerInput.includes('place') || lowerInput.includes('where')) {
    return 'I can help you with locations! You can:\n\n• Save your current location as home or office\n• Navigate to saved locations\n• Ask me about your saved locations\n\nWhat would you like to do?';
  }
  
  // Check for navigation-related keywords
  if (lowerInput.includes('navigate') || lowerInput.includes('directions') || lowerInput.includes('route') || lowerInput.includes('go to')) {
    return 'I can help you navigate! Try saying:\n\n• "Navigate to home"\n• "Go to office"\n• "Take me home"\n\nMake sure you have saved your locations first!';
  }
  
  // Check for help requests
  if (lowerInput.includes('help') || lowerInput.includes('assist') || lowerInput.includes('support')) {
    return 'I\'m here to help! I can:\n\n📍 Save and manage locations\n🚗 Provide navigation\n🚨 Send emergency alerts\n💬 Answer questions\n\nWhat do you need help with?';
  }
  
  // Default friendly response
  const defaultResponses = [
    'I understand you\'re asking about something. I can help you with locations, navigation, and emergency services. Could you be more specific?',
    'That\'s interesting! I\'m designed to help with location-based tasks. Try asking me to save a location or navigate somewhere.',
    'I\'m here to assist you! I can help with:\n\n• Setting locations\n• Navigation\n• Emergency alerts\n\nWhat would you like to do?',
    'Let me help you! You can ask me to:\n\n• "Set location to home"\n• "Navigate to office"\n• "What can you do?"\n\nOr just chat with me!'
  ];
  
  return defaultResponses[Math.floor(Math.random() * defaultResponses.length)];
};

/**
 * Process user input with AI conversation handling
 * Returns { isCommand: boolean, response: string, commandResult: object|null }
 */
export const processUserInput = (input, commandProcessor, handlers, context) => {
  const lowerInput = input.toLowerCase().trim();
  
  // First, check if it's a command
  const commandResult = commandProcessor(input, handlers, context);
  
  // If it's a recognized command, return command result
  if (commandResult.type !== 'unknown') {
    return {
      isCommand: true,
      response: commandResult.message,
      commandResult: commandResult
    };
  }
  
  // Otherwise, generate AI response
  const aiResponse = generateAIResponse(input, context);
  
  return {
    isCommand: false,
    response: aiResponse,
    commandResult: null
  };
};

