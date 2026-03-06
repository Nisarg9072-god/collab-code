export class MockProvider {
  async generateResponse(prompt, context) {
    // Artificial delay
    await new Promise(resolve => setTimeout(resolve, 800));
    
    if (prompt.toLowerCase().includes('explain')) {
      return `[Mock Mode] This code performs a ${context.language || 'generic'} task in ${context.fileName || 'a file'}. Explain action triggered on selection: ${context.selection ? context.selection.slice(0, 30) + '...' : 'none'}.`;
    }
    
    return `[Mock Mode] AI response for "${context.fileName || 'this file'}". Please set AI_PROVIDER=gemini and AI_API_KEY in your backend .env for real responses.`;
  }
}
