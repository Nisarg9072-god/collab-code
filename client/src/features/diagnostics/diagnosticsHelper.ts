
import * as monaco from 'monaco-editor';
import { Diagnostic } from './diagnosticsTypes';

export const toMonacoMarker = (diagnostic: Diagnostic): monaco.editor.IMarkerData => {
  let severity: monaco.MarkerSeverity;

  switch (diagnostic.severity) {
    case 'error':
      severity = monaco.MarkerSeverity.Error;
      break;
    case 'warning':
      severity = monaco.MarkerSeverity.Warning;
      break;
    case 'info':
      severity = monaco.MarkerSeverity.Info;
      break;
    default:
      severity = monaco.MarkerSeverity.Info;
  }

  return {
    message: diagnostic.message,
    severity,
    startLineNumber: diagnostic.line,
    startColumn: diagnostic.column,
    endLineNumber: diagnostic.line,
    endColumn: diagnostic.column + 1, // Default to a single character length for now
    source: diagnostic.source,
  };
};
