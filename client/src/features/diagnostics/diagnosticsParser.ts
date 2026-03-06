
import { Diagnostic } from "./diagnosticsTypes";
import { v4 as uuidv4 } from "uuid";

// A simple type for the file list
type FileInfo = { id: string; name: string };

const parseNodeError = (stderr: string, files: FileInfo[]): Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];
  const lines = stderr.split('\n');

  // Regex to capture file path, line, and column from Node.js stack traces
  const stackTraceRegex = /at .* \((?:file:\/\/)?(.*?):(\d+):(\d+)\)/;

  lines.forEach((line, index) => {
    const match = line.match(stackTraceRegex);
    if (match) {
      const [_, filePath, lineNum, colNum] = match;
      const file = files.find(f => filePath.endsWith(f.name));

      if (file) {
        // The actual error message is usually the line before the first stack trace entry
        const message = lines[index - 1] || 'Unknown error';
        diagnostics.push({
          id: uuidv4(),
          fileId: file.id,
          filePath: file.name,
          fileName: file.name,
          line: parseInt(lineNum, 10),
          column: parseInt(colNum, 10),
          severity: "error",
          message: message.trim(),
          source: "Node.js Runtime",
        });
      }
    }
  });

  return diagnostics;
};

const parsePythonError = (stderr: string, files: FileInfo[]): Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];
  const lines = stderr.split('\n');
  const fileRegex = /File "(.*?)", line (\d+)/;

  lines.forEach((line, index) => {
    const match = line.match(fileRegex);
    if (match) {
      const [_, filePath, lineNum] = match;
      const file = files.find(f => filePath.endsWith(f.name));

      if (file) {
        const message = lines[index + 1] || 'Unknown error';
        diagnostics.push({
          id: uuidv4(),
          fileId: file.id,
          filePath: file.name,
          fileName: file.name,
          line: parseInt(lineNum, 10),
          column: 1, // Python errors don't always provide a column
          severity: "error",
          message: message.trim(),
          source: "Python Runtime",
        });
      }
    }
  });

  return diagnostics;
};

const parseGoError = (stderr: string, files: FileInfo[]): Diagnostic[] => {
  const diagnostics: Diagnostic[] = [];
  const lines = stderr.split('\n');
  const errorRegex = /^(.*?):(\d+):(\d+): (.*)$/;

  lines.forEach(line => {
    const match = line.match(errorRegex);
    if (match) {
      const [_, filePath, lineNum, colNum, message] = match;
      const file = files.find(f => filePath.endsWith(f.name));

      if (file) {
        diagnostics.push({
          id: uuidv4(),
          fileId: file.id,
          filePath: file.name,
          fileName: file.name,
          line: parseInt(lineNum, 10),
          column: parseInt(colNum, 10),
          severity: "error",
          message: message.trim(),
          source: "Go Runtime",
        });
      }
    }
  });

  return diagnostics;
};

export const parseDiagnostics = (stderr: string, files: FileInfo[]): Diagnostic[] => {
  if (stderr.includes('Traceback (most recent call last):')) {
    return parsePythonError(stderr, files);
  }

  if (stderr.match(/^.*?_(\d+)_(\d+)\.go:(\d+):(\d+):/)) {
    return parseGoError(stderr, files);
  }

  if (stderr.includes('at Object.<anonymous>') || stderr.match(/at .* \(.*:\d+:\d+\)/)) {
    return parseNodeError(stderr, files);
  }

  return [];
};
