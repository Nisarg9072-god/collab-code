import { GeminiProvider } from './providers/geminiProvider.js';
import { MockProvider } from './providers/mockProvider.js';

class AIManager {
  constructor() {
    this.providerName = process.env.AI_PROVIDER || 'mock';
    this.apiKey = process.env.AI_API_KEY;
    this.instance = null;
    this.init();
  }

  init() {
    try {
      if (this.providerName === 'gemini' && this.apiKey) {
        this.instance = new GeminiProvider(this.apiKey);
        console.log("AI: Initialized Gemini provider");
      } else {
        this.instance = new MockProvider();
        console.log(`AI: Initialized ${this.providerName} provider (falling back to mock)`);
      }
    } catch (err) {
      console.error("AI: Initialization failed:", err.message);
      this.instance = new MockProvider();
    }
  }

  async generateResponse(prompt, context = {}) {
    if (!this.instance) {
      this.init();
    }
    
    try {
      return await this.instance.generateResponse(prompt, context);
    } catch (err) {
      console.error("AI Manager Error:", err.message);
      return `Error generating response: ${err.message}`;
    }
  }

  getProviderInfo() {
    return {
      name: this.providerName,
      status: this.apiKey ? 'active' : 'no_key',
      isMock: this.instance instanceof MockProvider
    };
  }
}

export const aiManager = new AIManager();
