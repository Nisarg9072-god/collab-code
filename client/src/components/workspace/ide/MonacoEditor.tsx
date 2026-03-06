import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import { getLanguageByExtension } from '@/lib/fileUtils';
import { WebsocketProvider } from 'y-websocket';
import { MonacoBinding } from 'y-monaco';

export type MonacoEditorInstance = monaco.editor.IStandaloneCodeEditor;
export type MonacoRef = {
  editor: MonacoEditorInstance | null;
  monaco: typeof monaco | null;
};

interface MonacoEditorProps {
  fileId: string;
  fileName: string;
  content: string;
  onChange: (value: string) => void;
  onSave?: () => void;
  readOnly?: boolean;
  theme?: 'vs-dark' | 'light';
  provider: WebsocketProvider | null;
  userName: string;
}

const MonacoEditor = forwardRef<MonacoRef, MonacoEditorProps>((
  {
    fileId,
    fileName,
    content,
    onChange,
    onSave,
    readOnly = false,
    theme = 'vs-dark',
    provider,
    userName,
  },
  ref
) => {
  const editorRef = useRef<MonacoEditorInstance | null>(null);
  const monacoRef = useRef<typeof monaco | null>(null);
  const bindingRef = useRef<MonacoBinding | null>(null);

  useImperativeHandle(ref, () => ({
    editor: editorRef.current,
    monaco: monacoRef.current,
  }), []);

  useEffect(() => {
    if (provider) {
      provider.awareness.setLocalStateField('user', {
        name: userName,
        color: '#' + Math.floor(Math.random()*16777215).toString(16),
      });
    }
  }, [provider, userName]);

  useEffect(() => {
    if (!editorRef.current || !provider) return;

    const ydoc = provider.doc;
    const ytext = ydoc.getText('monaco');
    const model = editorRef.current.getModel();

    if (model) {
      bindingRef.current = new MonacoBinding(ytext, model, new Set([editorRef.current]), provider.awareness);
    }

    return () => {
      bindingRef.current?.destroy();
    };
  }, [editorRef.current, provider]);

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    editor.updateOptions({
      minimap: { enabled: true },
      fontSize: 13,
      lineNumbers: 'on',
      roundedSelection: false,
      scrollBeyondLastLine: false,
      readOnly: readOnly,
      automaticLayout: true,
      tabSize: 2,
      wordWrap: 'on',
      bracketPairColorization: { enabled: true },
      suggestOnTriggerCharacters: true,
      acceptSuggestionOnEnter: 'on',
      padding: { top: 10 },
    });

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      if (onSave) onSave();
    });

    // Disable built-in TS/JS diagnostics to avoid overlap with LSP
    monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: true
    });
    monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: true
    });
  };

  useEffect(() => {
    if (!monacoRef.current || !editorRef.current) return;

    const monaco = monacoRef.current;
    const editor = editorRef.current;
    const language = getLanguageByExtension(fileName);
    
    // For LSP, we use a consistent file:// URI scheme with a workspace prefix
    const modelUri = monaco.Uri.parse(`file:///workspace/${fileName}`);
    let model = monaco.editor.getModel(modelUri);

    if (!model) {
      model = monaco.editor.createModel(content, language, modelUri);
    } else {
      if (model.getValue() !== content && !editor.hasTextFocus()) {
        model.setValue(content);
      }
    }

    editor.setModel(model);

  }, [fileId, fileName, content]);

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.updateOptions({ readOnly });
    }
  }, [readOnly]);

  return (
    <div className="w-full h-full relative overflow-hidden">
      <Editor
        height="100%"
        width="100%"
        theme={theme}
        onMount={handleEditorDidMount}
        onChange={undefined}
        loading={
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Initializing Editor...
          </div>
        }
      />
    </div>
  );
};

export default MonacoEditor;
