/**
 * Maps file extensions to Monaco-supported language IDs
 */
export const getLanguageByExtension = (fileName: string): string => {
  const ext = fileName.split('.').pop()?.toLowerCase();
  
  const map: Record<string, string> = {
    'js': 'javascript',
    'jsx': 'javascript',
    'ts': 'typescript',
    'tsx': 'typescript',
    'json': 'json',
    'py': 'python',
    'go': 'go',
    'html': 'html',
    'css': 'css',
    'md': 'markdown',
    'txt': 'plaintext',
    'sql': 'sql',
    'rs': 'rust',
    'cpp': 'cpp',
    'c': 'c',
    'java': 'java',
    'yaml': 'yaml',
    'yml': 'yaml',
    'xml': 'xml',
  };

  return map[ext || ''] || 'plaintext';
};

/**
 * Interface for recursive file tree structure
 */
export interface FileNode {
  id: string;
  name: string;
  type: 'file' | 'folder';
  parentId: string | null;
  children?: FileNode[];
  content?: string;
  language?: string;
  isExpanded?: boolean;
}

/**
 * Converts a flat list of files (with path-like names) into a recursive tree
 * Supports names like "src/index.ts"
 */
export const buildFileTree = (files: { id: string; name: string }[]): FileNode[] => {
  const root: FileNode[] = [];
  const map: Record<string, FileNode> = {};

  files.forEach(file => {
    const parts = file.name.split('/');
    let currentPath = '';
    let parent: FileNode[] = root;

    parts.forEach((part, index) => {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isLast = index === parts.length - 1;
      
      if (!map[currentPath]) {
        const newNode: FileNode = {
          id: isLast ? file.id : `folder-${currentPath}`,
          name: part,
          type: isLast ? 'file' : 'folder',
          parentId: index > 0 ? `folder-${parts.slice(0, index).join('/')}` : null,
          children: isLast ? undefined : []
        };
        map[currentPath] = newNode;
        parent.push(newNode);
      }
      
      if (!isLast) {
        parent = map[currentPath].children!;
      }
    });
  });

  return root;
};
