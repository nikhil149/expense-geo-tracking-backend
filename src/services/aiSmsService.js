const { GoogleGenAI, Type } = require('@google/genai');

const apiKey = process.env.GEMINI_API_KEY;
// Initialize without throwing immediately so the app can start even if key is missing,
// but it will fail when parseSmsWithAI is called.
let ai;
if (apiKey) {
  ai = new GoogleGenAI({ apiKey });
}

/**
 * Parses raw bank SMS into structured transaction data using Gemini.
 * @param {string} rawText The raw SMS text
 * @returns {Promise<Object>} The parsed transaction
 */
async function parseSmsWithAI(rawText) {
  if (!ai) {
    throw new Error('GEMINI_API_KEY environment variable is missing.');
  }

  const prompt = `
    You are an expert financial assistant. Parse this SMS notification from a bank or wallet.
    - Extract the transaction amount.
    - Determine if it's an 'expense' (debited/sent) or 'income' (credited/received). Note: Investments (like mutual funds, brokerages, NACH SIPs) MUST be strictly classified as 'expense' type, since they are money leaving the checking account.
    - Extract the clean merchant name (e.g., "AMAZON PAY", "Starbucks", "Youtube"). Remove prefixes like "Merchant" or "ACH".
    - Classify the transaction into ONE of the following exact categories: 'Food & Dining', 'Transport', 'Housing & Rent', 'Utilities', 'Entertainment', 'Health & Gym', 'Shopping', 'Salary & Income', 'Investments', or 'Other'.
    - CRITICAL RULE: Any SMS mentioning "NACH Debit" or "NACH Credit" MUST be classified as the category 'Investments' and type 'expense'.
    - Determine the payment method ('credit_card', 'debit_card', 'upi', 'net_banking', 'wallet', 'unknown').
    - If you cannot confidently determine the transaction details or it is not a transaction (e.g., OTP, reminder, upcoming due date), return an empty object or null fields.

    SMS: "${rawText}"
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
            isValid: {
              type: Type.BOOLEAN,
              description: "True if this is a valid executed transaction. False if it's an OTP, reminder, or non-transaction."
            },
            amount: { type: Type.NUMBER },
            type: { type: Type.STRING, enum: ['expense', 'income'] },
            merchantName: { type: Type.STRING },
            aiCategory: { type: Type.STRING, enum: ['Food & Dining', 'Transport', 'Housing & Rent', 'Utilities', 'Entertainment', 'Health & Gym', 'Shopping', 'Salary & Income', 'Investments', 'Other'] },
            paymentMethod: { type: Type.STRING, enum: ['credit_card', 'debit_card', 'upi', 'net_banking', 'wallet', 'unknown'] },
            cardName: { type: Type.STRING, description: "E.g., ICICI Bank Credit Card 8004. Null if not applicable." }
          },
          required: ["isValid"]
        }
      }
    });

    const resultText = response.text;
    if (!resultText) {
      return null;
    }

    const result = JSON.parse(resultText);
    return result;
  } catch (error) {
    console.error('[AI_SMS_SERVICE] Failed to parse SMS with Gemini:', error);
    throw error;
  }
}

module.exports = {
  parseSmsWithAI
};
