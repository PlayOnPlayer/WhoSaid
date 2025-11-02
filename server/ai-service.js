const OpenAI = require('openai');

// Initialize OpenAI client
let openai = null;

function initializeAI() {
  if (process.env.OPENAI_API_KEY) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }
}

/**
 * Generate an AI answer that blends with player answers
 * @param {string} question - The question to answer
 * @param {string[]} playerAnswers - Array of player-submitted answers
 * @param {string[]} playerNames - Array of player names to detect and remove from answer
 * @returns {Promise<string>} AI-generated answer
 */
async function generateAIAnswer(question, playerAnswers, playerNames = []) {
  if (!openai) {
    throw new Error('OpenAI API key not configured');
  }

  // Calculate average answer length
  const answerLengths = playerAnswers.map(a => a.length);
  const avgLength = answerLengths.length > 0 
    ? Math.round(answerLengths.reduce((sum, len) => sum + len, 0) / answerLengths.length)
    : 50; // Default if no answers
  const minLength = Math.max(10, Math.floor(avgLength * 0.7));
  const maxLength = Math.floor(avgLength * 1.3);

  // Create a prompt that encourages the AI to blend in
  const systemPrompt = `You are playing a game where you need to blend in with player answers. 
Your goal is to match the tone, style, humor level, content type, AND LENGTH of the other players. 
If they use curse words, use curse words. If they're making dark jokes, make dark jokes. 
Be creative and funny, but match their energy and answer length.

CRITICAL RULES:
- NEVER reference or restate the question in your answer
- NEVER mention player names in your answer
- NEVER use punctuation (no periods, commas, quotes, apostrophes, etc.)
- NEVER use quotation marks around song titles or phrases
- Use casual, informal grammar like real players do
- Match the style and length of the other answers exactly
- Keep answers concise and direct`;

  const userPrompt = `Question: ${question}

Here are the answers other players submitted:
${playerAnswers.map((answer, index) => `${index + 1}. ${answer}`).join('\n')}

Generate ONE answer that matches the tone, style, AND LENGTH (approximately ${avgLength} characters, between ${minLength}-${maxLength} characters) of these answers. Your answer should be funny, blend in seamlessly, and make it hard for players to guess it's AI-generated.

CRITICAL RULES:
- Your answer must be STANDALONE - do NOT reference the question or mention any player names
- NO punctuation (no periods, commas, quotes, exclamation marks, etc.)
- NO quotation marks (not even around song titles or phrases)
- Use casual grammar (not perfect formal grammar)
- Keep it short and informal like the examples above
- Real players never use perfect grammar or punctuation in these games

IMPORTANT: Return ONLY your answer text, with NO numbering, NO prefixes, NO formatting, NO punctuation. Just plain casual text like the examples.`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.9,
      max_tokens: Math.max(50, maxLength + 20) // Allow some buffer
    });

    let aiAnswer = completion.choices[0].message.content.trim();
    
    // Remove any leading numbers/formatting (e.g., "3.", "1)", "-", etc.)
    aiAnswer = aiAnswer.replace(/^[\d]+[.)\s\-]*\s*/i, '');
    aiAnswer = aiAnswer.replace(/^[-•]\s*/, '');
    aiAnswer = aiAnswer.trim();
    
    // If still empty or looks wrong, take first line
    if (!aiAnswer || aiAnswer.length < 3) {
      const lines = completion.choices[0].message.content.split('\n').map(l => l.trim()).filter(l => l);
      if (lines.length > 0) {
        aiAnswer = lines[0].replace(/^[\d]+[.)\s\-]*\s*/i, '').trim();
      }
    }
    
    // Check if answer contains player names (remove them and anything before/including them)
    for (const playerName of playerNames) {
      const escapedName = playerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const nameRegex = new RegExp(`\\b${escapedName}\\b`, 'i');
      
      if (nameRegex.test(aiAnswer)) {
        console.log(`[AI-SERVICE] Detected player name "${playerName}" in answer, cleaning...`);
        
        // Find where the name appears
        const nameMatch = aiAnswer.match(nameRegex);
        if (nameMatch) {
          const nameIndex = nameMatch.index;
          
          // Get everything after the name
          let afterName = aiAnswer.substring(nameIndex + nameMatch[0].length).trim();
          
          // Remove common question structure phrases that might follow the name
          // Patterns like: "can't stop [verb]ing [something]", "would be", "is", etc.
          afterName = afterName.replace(/^(can'?t\s+stop\s+[^+]*|can\s+not\s+stop\s+[^+]*|would\s+be\s+|is\s+|are\s+|was\s+|were\s+)/i, '');
          
          // If there's a "+", take everything after the last "+"
          if (afterName.includes('+')) {
            const parts = afterName.split(/\+/).map(p => p.trim()).filter(p => p.length > 0);
            if (parts.length > 0) {
              // Take the last part after all "+" signs
              aiAnswer = parts[parts.length - 1];
            }
          }
          // If there's "and" connecting phrases, take the part after the last "and"
          else if (/\sand\s/i.test(afterName)) {
            const parts = afterName.split(/\s+and\s+/i).map(p => p.trim()).filter(p => p.length > 0);
            if (parts.length > 1) {
              aiAnswer = parts[parts.length - 1];
            } else {
              aiAnswer = afterName;
            }
          }
          // Otherwise, just use what's after the name
          else {
            aiAnswer = afterName;
          }
          
          // Clean up any remaining question structure artifacts
          aiAnswer = aiAnswer.replace(/^(their\s+\w+\s+)?(name\s*\+?\s*)?/i, '');
          aiAnswer = aiAnswer.trim();
        }
      }
    }
    
    // Check if answer references question structure patterns (dynamic detection)
    const questionStructurePatterns = [
      /if\s+\w+\s+(?:were|had)/i,           // "if X were/had..."
      /\w+\s+(?:can'?t|can\s+not)\s+stop/i,   // "X can't stop..."
      /\w+\s+would\s+be/i,                    // "X would be..."
      /\w+\s+is\s+/i,                         // "X is..."
      /\w+\s+are\s+/i,                        // "X are..."
      /would\s+be/i,                          // "would be..."
      /their\s+\w+/i,                         // "their [something]..."
      /can'?t\s+stop\s+\w+/i,                 // "can't stop [something]..."
      /can\s+not\s+stop\s+\w+/i,              // "can not stop [something]..."
      /stop\s+\w+ing/i,                       // "stop [verb]ing..."
      /doodling|writing|drawing|doing/i,      // common verbs from questions
    ];
    
    const hasQuestionStructure = questionStructurePatterns.some(pattern => pattern.test(aiAnswer));
    
    // If answer seems to reference question structure, extract the core answer
    if (hasQuestionStructure) {
      console.log('[AI-SERVICE] Detected question structure in answer, extracting core answer...');
      
      // Strategy 1: Look for "+" separator - take everything after the last "+"
      if (aiAnswer.includes('+')) {
        const parts = aiAnswer.split(/\+/).map(p => p.trim()).filter(p => p.length > 0);
        if (parts.length > 1) {
          aiAnswer = parts[parts.length - 1];
          console.log(`[AI-SERVICE] Extracted answer after "+": "${aiAnswer}"`);
        }
      }
      // Strategy 2: Look for "and" separator - take everything after the last "and"
      else if (/\sand\s/i.test(aiAnswer)) {
        const parts = aiAnswer.split(/\s+and\s+/i).map(p => p.trim()).filter(p => p.length > 0);
        if (parts.length > 1) {
          aiAnswer = parts[parts.length - 1];
          console.log(`[AI-SERVICE] Extracted answer after "and": "${aiAnswer}"`);
        }
      }
      // Strategy 3: Try to extract after question structure phrases
      else {
        const extractionPatterns = [
          /(?:can'?t\s+stop\s+[^+]+\+?\s*|can\s+not\s+stop\s+[^+]+\+?\s*|would\s+be\s+|is\s+|are\s+|were\s+|was\s+)\s*(.+)/i,
          /(?:their\s+\w+\s+)?(?:name\s*\+?\s*)?(?:would\s+be\s*)?(.+)/i,
        ];
        
        for (const pattern of extractionPatterns) {
          const match = aiAnswer.match(pattern);
          if (match && match[1] && match[1].trim().length > 3) {
            aiAnswer = match[1].trim();
            break;
          }
        }
      }
      
      // Clean up any remaining artifacts
      aiAnswer = aiAnswer.replace(/^[+\u002B]\s*/, '').trim();
      aiAnswer = aiAnswer.replace(/^(?:their\s+\w+\s*)?(?:name\s*\+?\s*)?/i, '');
      aiAnswer = aiAnswer.replace(/[.,;:!?]+$/, '');
    }
    
    // Final cleanup: remove any remaining question-like structures at the start
    aiAnswer = aiAnswer.replace(/^(?:if\s+\w+\s+(?:were|had)\s+|\w+\s+(?:would be|can'?t|can not)\s+[^+]*\+?\s*)/i, '');
    aiAnswer = aiAnswer.trim();
    
    // If answer still looks too long and problematic, extract last meaningful phrase
    if (hasQuestionStructure && aiAnswer.length > avgLength * 1.5) {
      console.log('[AI-SERVICE] Answer still seems problematic, extracting last phrase...');
      const phrases = aiAnswer.split(/[+\u002B]|\sand\s/i).map(p => p.trim()).filter(p => p.length > 0);
      if (phrases.length > 1) {
        aiAnswer = phrases[phrases.length - 1];
      } else {
        // Just take a reasonable number of words
        const words = aiAnswer.split(/\s+/);
        if (words.length > 10) {
          aiAnswer = words.slice(-Math.min(8, Math.ceil(avgLength / 6))).join(' ');
        }
      }
    }
    
    // CRITICAL: Remove ALL punctuation and quotes
    // Remove quotation marks (single and double)
    aiAnswer = aiAnswer.replace(/["'"]/g, '');
    // Remove periods, commas, semicolons, colons, exclamation marks, question marks
    aiAnswer = aiAnswer.replace(/[.,;:!?]/g, '');
    // Remove apostrophes (but keep the words, so "don't" becomes "dont")
    aiAnswer = aiAnswer.replace(/'/g, '');
    // Clean up any double spaces left behind
    aiAnswer = aiAnswer.replace(/\s+/g, ' ').trim();
    
    // If answer is still too long compared to player answers, truncate it
    if (aiAnswer.length > maxLength) {
      console.log(`[AI-SERVICE] Answer too long (${aiAnswer.length} chars, max ${maxLength}), truncating...`);
      const words = aiAnswer.split(/\s+/);
      // Calculate target word count based on maxLength
      const targetWords = Math.floor(maxLength / 6); // Rough estimate: ~6 chars per word
      if (words.length > targetWords) {
        aiAnswer = words.slice(0, targetWords).join(' ');
      }
    }
    
    return aiAnswer || '[AI Answer]';
  } catch (error) {
    console.error('Error generating AI answer:', error);
    // Fallback if API fails
    return `[AI Answer - Error generating]`;
  }
}

// Initialize on import if API key exists
if (process.env.OPENAI_API_KEY) {
  initializeAI();
}

module.exports = {
  initializeAI,
  generateAIAnswer
};
