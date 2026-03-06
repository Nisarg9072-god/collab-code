import { DiffData } from "@/features/git/gitTypes";

interface DiffViewerProps {
  diff: DiffData;
}

export const DiffViewer = ({ diff }: DiffViewerProps) => {
  const lines = diff.diff.split('\n');

  return (
    <div className="p-4 font-mono text-xs">
      {lines.map((line, index) => {
        let color = "text-white";
        if (line.startsWith('+')) color = "text-green-400";
        if (line.startsWith('-')) color = "text-red-400";

        return (
          <div key={index} className={color}>
            {line}
          </div>
        );
      })}
    </div>
  );
};
