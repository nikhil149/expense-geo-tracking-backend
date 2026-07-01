const { GoogleGenAI, Type } = require('@google/genai');

const apiKey = process.env.GEMINI_API_KEY;
let ai;
if (apiKey) {
  ai = new GoogleGenAI({ apiKey });
}

/**
 * Generates a personalized savings goal based on user's financial profile.
 * @param {Object} financialData JSON object containing income, expenses, and current goals.
 * @returns {Promise<Object>} JSON containing the suggested goal details.
 */
async function generateGoalSuggestion(financialData) {
  if (!ai) {
    throw new Error('GEMINI_API_KEY environment variable is missing.');
  }

  const prompt = `
    You are a financial planner. 
    Here is the user's overall financial profile (in Indian Rupees):
    ${JSON.stringify(financialData, null, 2)}

    Based on their total income, total expenses, and currently active goals, suggest ONE highly specific, realistic new savings goal for them.
    Do not suggest a goal that is completely out of reach based on their savings rate (Income - Expenses).
    
    Choose a fitting Lucide icon name (e.g. 'shield', 'car', 'plane', 'home', 'laptop', 'graduation-cap', 'heart', 'piggy-bank').
    Choose a vibrant hex color code for the goal (e.g. '#10B981', '#3B82F6', '#F59E0B', '#8B5CF6').

    Strictly limit the response to the specified JSON schema.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: {
              type: Type.STRING,
              description: "A short, catchy title for the goal (e.g. 'Emergency Fund', 'New Laptop', 'Vacation'). Max 25 chars."
            },
            target_amount: {
              type: Type.NUMBER,
              description: "The target amount in Rupees (e.g. 50000). Must be a realistic number based on their savings."
            },
            description: {
              type: Type.STRING,
              description: "A 1-2 sentence explanation of WHY you are suggesting this goal and how achievable it is based on their current cash flow."
            },
            icon: {
              type: Type.STRING,
              description: "A valid lucide-react-native icon name."
            },
            color: {
              type: Type.STRING,
              description: "A valid hex color code."
            }
          },
          required: ["title", "target_amount", "description", "icon", "color"]
        }
      }
    });

    const resultText = response.text;
    if (!resultText) {
      return null;
    }
    
    return JSON.parse(resultText);
  } catch (error) {
    console.error('[AI_GOAL_SERVICE] Failed to generate goal:', error);
    return null;
  }
}

module.exports = {
  generateGoalSuggestion
};
