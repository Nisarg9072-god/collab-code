import React from 'react';
import { BottomTab } from './types';
import { cn } from '@/lib/utils';
import { X, ChevronDown, Trash2, Search, Play } from 'lucide-react';

interface BottomPanelProps {
  activeTab: BottomTab;
  onTabChange: (tab: BottomTab) => void;
  onTogglePanel: () => void;
  height: number;
  onResize: (e: React.MouseEvent) => void;
  children: React.ReactNode;
  onClearTerminal?: () => void;
}

const BottomPanel: React.FC<BottomPanelProps> = ({ 
  activeTab, 
  onTabChange, 
  onTogglePanel, 
  height, 
  onResize,
  children,
  onClearTerminal
}) => {
  const tabs: { id: BottomTab; label: string }[] = [
    { id: 'terminal', label: 'Terminal' },
    { id: 'output', label: 'Output' },
    { id: 'problems', label: 'Problems' },
    { id: 'debug', label: 'Debug' },
  ];

  return (
    <div 
      className="flex flex-col border-t border-border bg-muted/10 shrink-0 relative overflow-hidden transition-[height] duration-200"
      style={{ height }}
    >
      <div 
        className="absolute top-0 left-0 w-full h-1 cursor-row-resize hover:bg-primary/40 transition-colors z-50 active:bg-primary"
        onMouseDown={onResize}
      />
      
      <div className="h-9 px-4 flex items-center justify-between border-b border-border/50 bg-muted/20 shrink-0 select-none">
        <div className="flex items-center h-full gap-5">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                "h-full text-[10px] font-bold uppercase tracking-wider transition-colors border-b-2",
                activeTab === tab.id ? "text-primary border-primary" : "text-muted-foreground border-transparent hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        
        <div className="flex items-center gap-2">
          {activeTab === 'terminal' && (
            <button 
              title="Clear Terminal"
              className="p-1.5 hover:bg-muted/50 rounded transition-colors text-muted-foreground"
              onClick={onClearTerminal}
            >
              <Trash2 size={14} />
            </button>
          )}
          <button 
            title="Close Panel"
            className="p-1.5 hover:bg-muted/50 rounded transition-colors text-muted-foreground"
            onClick={onTogglePanel}
          >
            <X size={14} />
          </button>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto bg-black/10 custom-scrollbar">
        {children}
      </div>
    </div>
  );
};

export default BottomPanel;
