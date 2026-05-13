"use client";

import { useState, useEffect } from "react";

export function DebugConsole() {
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;

    const addLog = (type: string, args: any[]) => {
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) :String(arg)
      ).join(' ');
      setLogs(prev => [`[${type}] ${message}`, ...prev].slice(0, 50));
    };

    console.log = (...args) => {
      originalLog(...args);
      addLog('LOG', args);
    };

    console.error = (...args) => {
      originalError(...args);
      addLog('ERR', args);
    };

    console.warn = (...args) => {
      originalWarn(...args);
      addLog('WRN', args);
    };

    return () => {
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
    };
  }, []);

  return (
    <div className="fixed bottom-0 left-0 right-0 h-64 bg-black/90 text-green-400 font-mono text-xs p-4 overflow-auto border-t-2 border-green-500 z-50">
      <div className="flex justify-between mb-2 border-b border-green-800 pb-1">
        <strong>SYSTEM LOGS (Real-time)</strong>
        <button onClick={() => setLogs([])} className="hover:text-white">[CLEAR]</button>
      </div>
      {logs.map((log, i) => (
        <div key={i} className="whitespace-pre-wrap mb-1 font-mono">{log}</div>
      ))}
    </div>
  );
}
