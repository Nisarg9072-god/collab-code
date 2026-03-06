
export interface SearchMatch {
  line: number;
  column: number;
  preview: string;
  matchText: string;
}

export interface SearchResult {
  fileId: string;
  filePath: string;
  fileName: string;
  matches: SearchMatch[];
}
