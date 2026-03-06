import React, { useState, useEffect } from 'react';
import { diagnosticsStore } from '@/features/diagnostics/diagnosticsStore';
import { Diagnostic, DiagnosticSeverity } from '@/features/diagnostics/diagnosticsTypes';
import { AlertTriangle, XCircle, Info } from 'lucide-react';

interface ProblemsPanelProps {
  onProblemSelect: (problem: Diagnostic) => void;
}

const SeverityIcon = ({ severity }: { severity: DiagnosticSeverity }) => {
  switch (severity) {
    case 'error':
      return <XCircle className="h-4 w-4 text-red-500" />;
    case 'warning':
      return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    case 'info':
      return <Info className="h-4 w-4 text-blue-500" />;
  }
};

const ProblemsPanel: React.FC<ProblemsPanelProps> = ({ onProblemSelect }) => {
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>(diagnosticsStore.getDiagnostics());

  useEffect(() => {
    const unsubscribe = diagnosticsStore.subscribe(setDiagnostics);
    return () => unsubscribe();
  }, []);

  if (diagnostics.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground italic">
        No problems have been detected in the workspace.
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <ul className="divide-y divide-border">
        {diagnostics.map((diagnostic) => (
          <li 
            key={diagnostic.id}
            className="p-2 hover:bg-muted/50 cursor-pointer flex items-start gap-2"
            onClick={() => onProblemSelect(diagnostic)}
          >
            <div className="flex-shrink-0 mt-0.5">
              <SeverityIcon severity={diagnostic.severity} />
            </div>
            <div className="flex-grow">
              <p className="text-sm text-foreground">{diagnostic.message}</p>
              <p className="text-xs text-muted-foreground">
                {diagnostic.fileName}:{diagnostic.line}:{diagnostic.column}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default ProblemsPanel;
