
import os from 'os';
import * as pty from 'node-pty';
import { EventEmitter } from 'events';

const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';

class HostTerminalSession extends EventEmitter {
  constructor(workspaceId, cwd) {
    super();
    this.workspaceId = workspaceId;
    this.cwd = cwd;
    this.ptyProcess = null;
  }

  start() {
    this.ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-color',
      cols: 80,
      rows: 24,
      cwd: this.cwd,
      env: process.env
    });

    this.ptyProcess.onData((data) => {
      this.emit('data', data);
    });

    this.ptyProcess.onExit(({ exitCode, signal }) => {
      this.emit('exit', exitCode, signal);
    });
  }

  write(data) {
    if (this.ptyProcess) {
      this.ptyProcess.write(data);
    }
  }

  resize(cols, rows) {
    if (this.ptyProcess) {
      this.ptyProcess.resize(cols, rows);
    }
  }

  kill() {
    if (this.ptyProcess) {
      this.ptyProcess.kill();
      this.ptyProcess = null;
    }
  }
}

class HostRuntimeManager {
  constructor() {
    this.sessions = new Map();
  }

  createSession(workspaceId, cwd) {
    const session = new HostTerminalSession(workspaceId, cwd);
    this.sessions.set(workspaceId, session);
    
    session.on('exit', () => {
      this.sessions.delete(workspaceId);
    });

    return session;
  }

  getSession(workspaceId) {
    return this.sessions.get(workspaceId);
  }

  killSession(workspaceId) {
    const session = this.sessions.get(workspaceId);
    if (session) {
      session.kill();
      this.sessions.delete(workspaceId);
    }
  }
}

export const hostManager = new HostRuntimeManager();
