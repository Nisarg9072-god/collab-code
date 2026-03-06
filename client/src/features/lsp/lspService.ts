import { MonacoLanguageClient, initServices } from 'monaco-languageclient';
import { CloseAction, ErrorAction, MessageTransports } from 'vscode-languageclient';
import { toSocket, WebSocketMessageReader, WebSocketMessageWriter } from 'vscode-ws-jsonrpc';
import * as monaco from 'monaco-editor';
import { diagnosticsStore } from '@/features/diagnostics/diagnosticsStore';

let isServicesInitialized = false;

interface LSPConfig {
  workspaceId: string;
  token: string;
  onOpenFile?: (fileName: string, line?: number, column?: number) => void;
  onDiagnostics?: (uri: string, diagnostics: any[]) => void;
}

export const initLSP = async ({ workspaceId, token, onOpenFile, onDiagnostics }: LSPConfig) => {
  if (!isServicesInitialized) {
    await initServices({
      enableThemeService: true,
      enableTextmateService: false,
      enableModelService: true,
      enableLanguagesService: true,
      enableExtensionsService: false,
    });
    isServicesInitialized = true;
  }

  const url = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/lsp?workspaceId=${workspaceId}&token=${token}`;
  const webSocket = new WebSocket(url);

  webSocket.onopen = () => {
    const socket = toSocket(webSocket);
    const reader = new WebSocketMessageReader(socket);
    const writer = new WebSocketMessageWriter(socket);
    
    const languageClient = createLanguageClient({
      reader,
      writer,
    }, onOpenFile);
    languageClient.start();

    languageClient.onReady().then(() => {
      languageClient.onNotification('textDocument/publishDiagnostics', (params: any) => {
        if (onDiagnostics) {
          onDiagnostics(params.uri, params.diagnostics);
        }
      });
    });

    reader.onClose(() => languageClient.stop());
  };
};

const createLanguageClient = (transports: MessageTransports, onOpenFile?: (fileName: string, line?: number, column?: number) => void): MonacoLanguageClient => {
  return new MonacoLanguageClient({
    name: 'JS/TS Language Client',
    clientOptions: {
      documentSelector: ['javascript', 'typescript', 'javascriptreact', 'typescriptreact'],
      errorHandler: {
        error: () => ({ action: ErrorAction.Continue }),
        closed: () => ({ action: CloseAction.DoNotRestart })
      },
      // Ensure the server understands our workspace root
      workspaceFolder: {
        uri: monaco.Uri.parse('file:///workspace/'),
        name: 'workspace',
        index: 0
      },
      initializationOptions: {
        preferences: {
          includeCompletionsForModuleExports: true,
          includeCompletionsWithInsertText: true,
        },
      },
      middleware: {
         provideDefinition: async (document, position, token, next) => {
           const result = await next(document, position, token);
           if (result && onOpenFile) {
             const locations = Array.isArray(result) ? result : [result];
             const firstLocation = (locations[0] as any).uri || (locations[0] as any).targetUri;
             if (!firstLocation) return result;
             
             const uri = firstLocation.toString();
             if (uri.startsWith('file:///workspace/')) {
               const fileName = uri.replace('file:///workspace/', '');
               const currentUri = document.uri.toString();
               
               if (uri !== currentUri) {
                 const range = (locations[0] as any).range || (locations[0] as any).targetSelectionRange;
                 if (range) {
                   onOpenFile(fileName, range.start.line + 1, range.start.character + 1);
                 }
               }
             }
           }
           return result;
         }
       }
    },
    connectionProvider: {
      get: () => Promise.resolve(transports)
    }
  });
};
