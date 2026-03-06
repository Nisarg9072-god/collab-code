
import { Diagnostic } from './diagnosticsTypes';

type DiagnosticsListener = (diagnostics: Diagnostic[]) => void;

class DiagnosticsStore {
  private diagnostics: Diagnostic[] = [];
  private listeners: DiagnosticsListener[] = [];

  getDiagnostics(): Diagnostic[] {
    return this.diagnostics;
  }

  setDiagnostics(newDiagnostics: Diagnostic[]): void {
    this.diagnostics = newDiagnostics;
    this.notifyListeners();
  }

  addDiagnostics(newDiagnostics: Diagnostic[]): void {
    this.diagnostics = [...this.diagnostics, ...newDiagnostics];
    this.notifyListeners();
  }

  clearDiagnostics(): void {
    this.diagnostics = [];
    this.notifyListeners();
  }

  subscribe(listener: DiagnosticsListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener(this.diagnostics);
    }
  }
}

export const diagnosticsStore = new DiagnosticsStore();
