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
 * @returns {Promise<string>} AI-generated answer
 */
async function generateAIAnswer(question, playerAnswers) {
  if (!openai) {
    throw new Error('OpenAI API key not configured');
  }

  // Create a prompt that encourages the AI to blend in
  const systemPrompt = `You are playing a game where you need to blend in with player answers. 
Your goal is to match the tone, style, humor level, and content type of the other players. 
If they use curse words, use curse words. If they're making dark jokes, make dark jokes. 
Be creative and funny, but match their energy.`;

  const userPrompt = `Question: ${question}

Here are the answers other players submitted:
${playerAnswers.map((answer, index) => `${index + 1}. ${answer}`).join('\n')}

Generate ONE answer that matches the tone and style of these answers. Your answer should be funny, blend in seamlessly, and make it hard for players to guess it's AI-generated.`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.9,
      max_tokens: 150
    });

    const aiAnswer = completion.choices[0].message.content.trim();
    return aiAnswer;
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
