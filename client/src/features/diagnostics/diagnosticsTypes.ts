
export interface Diagnostic {
  id: string;
  fileId: string;
  filePath: string;
  fileName: string;
  line: number;
  column: number;
  severity: 'error' | 'warning' | 'info';
  message: string;
  source: string;
  codeSnippet?: string;
}
