import React, { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import 'xterm/css/xterm.css';

interface XTermTerminalProps {
  onData?: (data: string) => void;
  onResize?: (cols: number, rows: number) => void;
  workspaceId: string;
}

export interface XTermTerminalHandle {
  write: (data: string) => void;
  clear: () => void;
  focus: () => void;
  resize: () => void;
}

const XTermTerminal = forwardRef<XTermTerminalHandle, XTermTerminalProps>(({ onData, onResize, workspaceId }, ref) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  useImperativeHandle(ref, () => ({
    write: (data: string) => {
      xtermRef.current?.write(data);
    },
    clear: () => {
      xtermRef.current?.clear();
    },
    focus: () => {
      xtermRef.current?.focus();
    },
    resize: () => {
      fitAddonRef.current?.fit();
    }
  }));

  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 12,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#1e1e1e00', // transparent to inherit from panel
        foreground: '#cccccc',
        cursor: '#aeafad',
        selectionBackground: '#ffffff40',
        black: '#000000',
        red: '#cd3131',
        green: '#0dbc79',
        yellow: '#e5e510',
        blue: '#2472c8',
        magenta: '#bc3fbc',
        cyan: '#11a8cd',
        white: '#e5e5e5',
        brightBlack: '#666666',
        brightRed: '#f14c4c',
        brightGreen: '#23d18b',
        brightYellow: '#f5f543',
        brightBlue: '#3b8eea',
        brightMagenta: '#d670d6',
        brightCyan: '#29b8db',
        brightWhite: '#e5e5e5',
      },
      allowProposedApi: true,
      windowsMode: navigator.userAgent.includes('Windows'),
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);

    term.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    term.onData((data) => {
      onData?.(data);
    });

    term.onResize(({ cols, rows }) => {
      onResize?.(cols, rows);
    });

    // Handle initial greeting
    term.writeln('\x1b[1;32mCollabCode Terminal Ready\x1b[0m');
    term.writeln(`Workspace ID: ${workspaceId}`);
    term.writeln('');

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
    });
    resizeObserver.observe(terminalRef.current);

    return () => {
      resizeObserver.disconnect();
      term.dispose();
    };
  }, [workspaceId]);

  return (
    <div className="w-full h-full bg-black/20 overflow-hidden p-2">
      <div ref={terminalRef} className="w-full h-full" />
    </div>
  );
});

XTermTerminal.displayName = 'XTermTerminal';

export default XTermTerminal;
