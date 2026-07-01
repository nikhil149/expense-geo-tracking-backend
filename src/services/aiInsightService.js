const { GoogleGenAI, Type } = require('@google/genai');

const apiKey = process.env.GEMINI_API_KEY;
let ai;
if (apiKey) {
  ai = new GoogleGenAI({ apiKey });
}

/**
 * Generates a conversational financial insight based on aggregated monthly spending.
 * @param {Object} spendingData JSON object containing category totals.
 * @returns {Promise<Object>} JSON containing { summary, tip }
 */
async function generateSpendingInsight(spendingData) {
  if (!ai) {
    throw new Error('GEMINI_API_KEY environment variable is missing.');
  }

  const prompt = `
    You are a friendly, encouraging financial advisor. 
    Here is the user's spending grouped by category for this month:
    ${JSON.stringify(spendingData, null, 2)}

    Write a highly personalized, encouraging summary of their spending habits. 
    Point out their biggest expense and offer a quick actionable tip. 
    IMPORTANT: The user's currency is Indian Rupees. You MUST use the '₹' symbol instead of '$' when mentioning any monetary amounts.
    Keep it conversational, empathetic, and strictly limit the response to the specified JSON schema.
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
            summary: {
              type: Type.STRING,
              description: "A 1-2 sentence friendly summary of their spending this month."
            },
            tip: {
              type: Type.STRING,
              description: "A 1-sentence actionable and encouraging financial tip based on their highest spending category."
            }
          },
          required: ["summary", "tip"]
        }
      }
    });

    const resultText = response.text;
    if (!resultText) {
      return null;
    }
    
    return JSON.parse(resultText);
  } catch (error) {
    console.error('[AI_INSIGHT_SERVICE] Failed to generate insight:', error);
    return null;
  }
}

module.exports = {
  generateSpendingInsight
};
