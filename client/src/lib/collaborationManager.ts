import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

class CollaborationManager {
  private providers: Map<string, WebsocketProvider>;

  constructor() {
    this.providers = new Map<string, WebsocketProvider>();
  }

  getProvider(workspaceId: string, fileId: string, token: string): WebsocketProvider {
    const room = `${workspaceId}-${fileId}`;
    let provider = this.providers.get(room);

    if (!provider) {
      const ydoc = new Y.Doc();
      const wsUrl = import.meta.env.VITE_WS_URL || 'ws://127.0.0.1:1234';
      provider = new WebsocketProvider(wsUrl, room, ydoc, {
        auth: { token },
      });
      this.providers.set(room, provider);
    }

    return provider;
  }

  destroyProvider(workspaceId: string, fileId: string): void {
    const room = `${workspaceId}-${fileId}`;
    const provider = this.providers.get(room);

    if (provider) {
      provider.destroy();
      this.providers.delete(room);
      console.log(`[CollaborationManager] Destroyed provider for room: ${room}`);
    }
  }
}

export const collaborationManager = new CollaborationManager();
