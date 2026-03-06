import { GoogleGenerativeAI } from "@google/generative-ai";

export class GeminiProvider {
  constructor(apiKey) {
    if (!apiKey) {
      throw new Error("Missing AI_API_KEY for Gemini provider");
    }
    this.genAI = new GoogleGenerativeAI(apiKey);
    // Using gemini-1.5-flash for speed and cost-efficiency
    this.model = this.genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  }

  async generateResponse(prompt, context) {
    try {
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      return response.text();
    } catch (err) {
      console.error("Gemini Provider Error:", err.message);
      throw new Error(`AI Provider failed: ${err.message}`);
    }
  }
}
