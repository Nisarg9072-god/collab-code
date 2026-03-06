
import { useEffect, useState } from "react";
import { diagnosticsStore } from "@/features/diagnostics/diagnosticsStore";
import { Diagnostic } from "@/features/diagnostics/diagnosticsTypes";
import { AlertTriangle, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProblemsPanelProps {
  onProblemSelect: (problem: Diagnostic) => void;
}

const SeverityIcon = ({ severity }: { severity: Diagnostic['severity'] }) => {
  switch (severity) {
    case "error":
      return <XCircle className="text-red-500 w-4 h-4" />;
    case "warning":
      return <AlertTriangle className="text-yellow-500 w-4 h-4" />;
    case "info":
      return <Info className="text-blue-500 w-4 h-4" />;
  }
};

export const ProblemsPanel = ({ onProblemSelect }: ProblemsPanelProps) => {
  const [diagnostics, setDiagnostics] = useState(diagnosticsStore.getDiagnostics());

  useEffect(() => {
    const unsubscribe = diagnosticsStore.subscribe(setDiagnostics);
    return () => unsubscribe();
  }, []);

  if (diagnostics.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        No problems have been detected in the workspace.
      </div>
    );
  }

  return (
    <div className="p-2 space-y-2">
      {diagnostics.map((problem) => (
        <div
          key={problem.id}
          className="flex items-start gap-2 p-2 rounded-md hover:bg-muted cursor-pointer"
          onClick={() => onProblemSelect(problem)}
        >
          <SeverityIcon severity={problem.severity} />
          <div className="flex-1">
            <div className="text-sm font-medium">{problem.message}</div>
            <div className="text-xs text-muted-foreground">
              {problem.fileName}:{problem.line}:{problem.column}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default ProblemsPanel;
