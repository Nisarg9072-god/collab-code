
import Docker from 'dockerode';
import { EventEmitter } from 'events';
import stream from 'stream';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const docker = new Docker();
const IDLE_TIMEOUT = 10 * 60 * 1000; // 10 minutes

class DockerTerminalSession extends EventEmitter {
  constructor(container, workspaceId) {
    super();
    this.container = container;
    this.workspaceId = workspaceId;
    this.stream = null;
    this.lastActive = Date.now();
  }

  async start() {
    const exec = await this.container.exec({
      Cmd: ['/bin/bash'],
      AttachStdout: true,
      AttachStderr: true,
      AttachStdin: true,
      Tty: true,
    });

    const execStream = await exec.start({ hijack: true, stdin: true });
    this.stream = execStream;

    execStream.on('data', (chunk) => {
      this.emit('data', chunk.toString('utf8'));
      this.lastActive = Date.now();
    });

    execStream.on('end', () => {
      this.emit('exit');
    });
  }

  write(data) {
    if (this.stream) {
      this.stream.write(data);
      this.lastActive = Date.now();
    }
  }

  resize(cols, rows) {
    // Docker exec does not directly support resizing.
  }

  kill() {
    if (this.stream) {
      this.stream.end();
    }
  }
}

class DockerRuntimeManager {
  constructor() {
    this.sessions = new Map();
    this.containerImage = 'collab-code-workspace';
    this.checkDockerConnection();
    this.startIdleCleanup();
  }

  async checkDockerConnection() {
    try {
      await docker.version();
      console.log('✅ Docker daemon is running.');
    } catch (error) {
      console.error('❌ Docker daemon is not running. Please start Docker Desktop.');
      // Fallback to host runtime if Docker is not available
      // This logic is handled in terminalManager.js
    }
  }

  async buildImageIfMissing() {
    const images = await docker.listImages({ filters: { reference: [this.containerImage] } });
    if (images.length === 0) {
      console.log(`Image ${this.containerImage} not found. Building...`);
      await this.buildImage();
    }
  }

  async buildImage() {
    console.log('Building Docker image...');
    const stream = await docker.buildImage(
      { context: __dirname, src: ['Dockerfile'] },
      { t: this.containerImage }
    );

    await new Promise((resolve, reject) => {
      docker.modem.followProgress(stream, (err, res) => (err ? reject(err) : resolve(res)));
    });
    console.log('Docker image built.');
  }

  async createSession(workspaceId, workspacePath) {
    await this.buildImageIfMissing();
    let container = await this.getContainerForWorkspace(workspaceId);

    if (!container) {
      console.log(`Creating new container for workspace ${workspaceId}`)
      container = await docker.createContainer({
        Image: this.containerImage,
        Tty: true,
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        OpenStdin: true,
        StdinOnce: false,
        Cmd: ['/bin/bash'],
        HostConfig: {
          Binds: [`${workspacePath}:/home/user/workspace`],
        },
        Labels: {
          'collab-code-workspace-id': workspaceId,
        },
      });
      await container.start();
    }

    const session = new DockerTerminalSession(container, workspaceId);
    this.sessions.set(workspaceId, session);

    session.on('exit', () => {
      this.sessions.delete(workspaceId);
    });

    return session;
  }

  async getContainerForWorkspace(workspaceId) {
    const containers = await docker.listContainers({ all: true });
    const existing = containers.find(
      (c) => c.Labels['collab-code-workspace-id'] === workspaceId
    );

    if (existing) {
      const container = docker.getContainer(existing.Id);
      const containerInfo = await container.inspect();
      if(containerInfo.State.Running) {
        return container;
      }
      await container.remove();
    }

    return null;
  }

  getSession(workspaceId) {
    return this.sessions.get(workspaceId);
  }

  async killSession(workspaceId) {
    const session = this.sessions.get(workspaceId);
    if (session) {
      session.kill();
    }

    const container = await this.getContainerForWorkspace(workspaceId);
    if (container) {
      console.log(`Stopping and removing container for workspace ${workspaceId}`);
      await container.stop();
      await container.remove();
    }
  }

  startIdleCleanup() {
    setInterval(async () => {
      const containers = await docker.listContainers({ all: true });
      for (const containerInfo of containers) {
        if (containerInfo.Labels['collab-code-workspace-id']) {
          const workspaceId = containerInfo.Labels['collab-code-workspace-id'];
          const session = this.sessions.get(workspaceId);
          if (!session || (Date.now() - session.lastActive > IDLE_TIMEOUT)) {
            console.log(`Container for workspace ${workspaceId} is idle. Stopping...`);
            const container = docker.getContainer(containerInfo.Id);
            await container.stop();
            await container.remove();
            if(session) this.sessions.delete(workspaceId);
          }
        }
      }
    }, 60 * 1000); // Run every minute
  }
}

export const dockerManager = new DockerRuntimeManager();
