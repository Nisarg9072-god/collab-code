import { hostManager } from './runtime/hostManager.js';

class TerminalManager {
  constructor() {
    this.manager = hostManager;
    console.log(`TerminalManager initialized with host runtime.`);
  }

  createSession(workspaceId, workspacePath) {
    return this.manager.createSession(workspaceId, workspacePath);
  }

  getSession(workspaceId) {
    return this.manager.getSession(workspaceId);
  }

  killSession(workspaceId) {
    return this.manager.killSession(workspaceId);
  }
}

export const terminalManager = new TerminalManager();
