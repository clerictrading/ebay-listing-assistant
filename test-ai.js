require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");

async function verifyKey() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

  try {
    const result = await model.generateContent("Hello! Are you online?");
    console.log("✅ SUCCESS! AI says:", result.response.text());
  } catch (err) {
    console.error("❌ ERROR FOUND:");
    console.error("Status Code:", err.status);
    console.error("Message:", err.message);
    console.log("\n--- TROUBLESHOOTING ---");
    console.log("If 403: Go to AI Studio > 'Get API Key' and ensure you created a 'Free' key.");
    console.log("If 404: The model name 'gemini-flash-latest' might be mistyped.");
  }
}

verifyKey();