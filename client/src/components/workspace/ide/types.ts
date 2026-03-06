import * as monaco from 'monaco-editor';

export type MonacoEditorInstance = monaco.editor.IStandaloneCodeEditor;

export type SidebarSection = 'explorer' | 'search' | 'git' | 'run' | 'extensions' | 'participants' | 'activity' | 'ai';
export type BottomTab = 'terminal' | 'output' | 'problems' | 'debug';
