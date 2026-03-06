import { dockerManager } from './runtime/dockerManager.js';
import { hostManager } from './runtime/hostManager.js';

const RUNTIME_TYPE = process.env.RUNTIME_TYPE || 'host'; // 'docker' or 'host'

class TerminalManager {
  constructor() {
    if (RUNTIME_TYPE === 'docker') {
      this.manager = dockerManager;
      // Build the image when the app starts
      this.manager.buildImage().catch(err => {
        console.error('Failed to build Docker image:', err);
        // We could fall back to host manager here if we want
      });
    } else {
      this.manager = hostManager;
    }
    console.log(`TerminalManager initialized with ${RUNTIME_TYPE} runtime.`);
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
