import { spawn } from 'child_process';
import path from 'path';
import { createWebSocketConnection } from 'vscode-ws-jsonrpc/server';
import { StreamMessageReader, StreamMessageWriter } from 'vscode-jsonrpc/node.js';

class LSPProcessManager {
  constructor() {
    this.processes = new Map(); // workspaceId -> process
  }

  async startServer(workspaceId, repoDir, socket) {
    if (this.processes.has(workspaceId)) {
      console.log(`LSP: Reusing existing process for workspace ${workspaceId}`);
      this.bridge(workspaceId, socket);
      return;
    }

    console.log(`LSP: Starting typescript-language-server for workspace ${workspaceId}`);

    // Using npx to ensure we find the installed server
    const serverProcess = spawn('npx', ['typescript-language-server', '--stdio'], {
      cwd: repoDir,
      shell: true,
      env: { ...process.env, NODE_ENV: 'development' }
    });

    serverProcess.on('error', (err) => {
      console.error(`LSP Process Error (${workspaceId}):`, err);
    });

    serverProcess.on('exit', (code) => {
      console.log(`LSP Process Exit (${workspaceId}) with code ${code}`);
      this.processes.delete(workspaceId);
    });

    this.processes.set(workspaceId, serverProcess);
    this.bridge(workspaceId, socket);
  }

  bridge(workspaceId, socket) {
    const serverProcess = this.processes.get(workspaceId);
    if (!serverProcess) return;

    const reader = new StreamMessageReader(serverProcess.stdout);
    const writer = new StreamMessageWriter(serverProcess.stdin);

    const connection = createWebSocketConnection(socket, reader, writer, () => {
      console.log(`LSP: Connection closed for workspace ${workspaceId}`);
      // We don't necessarily kill the process here to allow reconnects
    });

    socket.on('close', () => {
      connection.dispose();
    });
  }

  killServer(workspaceId) {
    const process = this.processes.get(workspaceId);
    if (process) {
      process.kill();
      this.processes.delete(workspaceId);
    }
  }
}

export const lspManager = new LSPProcessManager();
