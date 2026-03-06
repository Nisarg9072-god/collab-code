import { useEffect, useRef, useState, useCallback } from 'react';

interface TerminalSessionOptions {
  workspaceId: string;
  token: string | null;
  endpoint: string;
}

export const useTerminalSession = ({ workspaceId, token, endpoint }: TerminalSessionOptions) => {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const onDataHandlers = useRef<Set<(data: string) => void>>(new Set());

  const connect = useCallback(() => {
    if (!token || !workspaceId) return;

    // Use standard WS or WSS based on endpoint
    const wsUrl = `${endpoint.replace('http', 'ws')}/terminal?workspaceId=${workspaceId}&token=${token}`;
    const socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      setIsConnected(true);
      setError(null);
      console.log('Terminal WebSocket Connected');
    };

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'data') {
          onDataHandlers.current.forEach(handler => handler(msg.data));
        } else if (msg.type === 'exit') {
          console.log('Terminal session exited with code:', msg.code);
        }
      } catch (err) {
        console.error('Terminal WS Parse Error:', err);
      }
    };

    socket.onclose = (event) => {
      setIsConnected(false);
      if (event.code !== 1000) {
        setError(`Terminal connection closed: ${event.reason || 'Unknown reason'}`);
      }
      console.log('Terminal WebSocket Closed');
    };

    socket.onerror = () => {
      setError('Terminal WebSocket Error');
    };

    socketRef.current = socket;
  }, [workspaceId, token, endpoint]);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
  }, []);

  const sendData = useCallback((data: string) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'data', data }));
    }
  }, []);

  const sendResize = useCallback((cols: number, rows: number) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'resize', cols, rows }));
    }
  }, []);

  const addDataListener = useCallback((handler: (data: string) => void) => {
    onDataHandlers.current.add(handler);
    return () => onDataHandlers.current.delete(handler);
  }, []);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return {
    isConnected,
    error,
    sendData,
    sendResize,
    addDataListener
  };
};
