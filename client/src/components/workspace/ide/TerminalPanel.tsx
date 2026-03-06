import React, { useRef, useEffect } from 'react';
import XTermTerminal, { XTermTerminalHandle } from './XTermTerminal';
import { useTerminalSession } from '@/hooks/useTerminalSession';

interface TerminalPanelProps {
  workspaceId: string;
  terminalRef?: React.RefObject<XTermTerminalHandle>;
}

const TerminalPanel: React.FC<TerminalPanelProps> = ({ workspaceId, terminalRef }) => {
  const token = localStorage.getItem('token');
  const apiEndpoint = import.meta.env.VITE_API_URL || 'http://localhost:3001';

  const { isConnected, error, sendData, sendResize, addDataListener } = useTerminalSession({
    workspaceId,
    token,
    endpoint: apiEndpoint
  });

  useEffect(() => {
    if (!isConnected) return;

    const removeListener = addDataListener((data) => {
      terminalRef.current?.write(data);
    });

    return () => removeListener();
  }, [isConnected, addDataListener]);

  const handleData = (data: string) => {
    sendData(data);
  };

  const handleResize = (cols: number, rows: number) => {
    sendResize(cols, rows);
  };

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-rose-400 p-4 font-mono text-xs">
        {error}
      </div>
    );
  }

  return (
    <div className="w-full h-full relative group">
      {!isConnected && (
        <div className="absolute inset-0 z-10 bg-black/40 flex items-center justify-center backdrop-blur-[1px]">
          <div className="flex items-center gap-2 text-muted-foreground text-xs animate-pulse">
            <div className="w-2 h-2 rounded-full bg-amber-500" />
            Connecting to terminal...
          </div>
        </div>
      )}
      <XTermTerminal
        ref={terminalRef}
        workspaceId={workspaceId}
        onData={handleData}
        onResize={handleResize}
      />
    </div>
  );
};

export default TerminalPanel;
