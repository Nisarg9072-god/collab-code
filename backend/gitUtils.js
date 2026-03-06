import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPOS_DIR = path.join(__dirname, 'repos');
// Function to execute a shell command and return the output
const execShellCommand = (cmd, options) => {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, { shell: true, ...options });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Command failed with code ${code}: ${stderr}`));
      } else {
        resolve(stdout);
      }
    });
  });
};

// Main function to run a git command in a persistent directory
export const runGitCommand = async (workspaceId, files, command) => {
  const repoDir = path.join(REPOS_DIR, workspaceId);
  await fs.mkdir(repoDir, { recursive: true });

  // Write files to the repo directory
  for (const file of files) {
    const filePath = path.join(repoDir, file.name);
    const dirName = path.dirname(filePath);
    await fs.mkdir(dirName, { recursive: true });
    await fs.writeFile(filePath, file.content);
  }

  // Initialize git repository if it doesn't exist
  if (!await fs.stat(path.join(repoDir, '.git')).catch(() => false)) {
    await execShellCommand('git init', { cwd: repoDir });
  }

  // Run the specified git command
  const result = await execShellCommand(command, { cwd: repoDir });
  return result;
};
