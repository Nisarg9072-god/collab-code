import React from 'react';
import { X, Dot } from 'lucide-react';
import { EditorTab } from './types';
import { cn } from '@/lib/utils';

interface EditorTabsProps {
  tabs: EditorTab[];
  activeTabId: string | null;
  onTabSelect: (id: string) => void;
  onTabClose: (id: string) => void;
}

const EditorTabs: React.FC<EditorTabsProps> = ({ 
  tabs, 
  activeTabId, 
  onTabSelect, 
  onTabClose 
}) => {
  if (tabs.length === 0) return null;

  return (
    <div className="h-9 flex items-center bg-muted/20 border-b border-border overflow-x-auto overflow-y-hidden no-scrollbar select-none shrink-0">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={cn(
            "group flex items-center h-full px-3 min-w-[120px] max-w-[200px] cursor-pointer border-r border-border transition-colors",
            activeTabId === tab.id ? "bg-muted/30 border-t-2 border-t-primary" : "hover:bg-muted/10"
          )}
          onClick={() => onTabSelect(tab.id)}
        >
          <span className={cn(
            "flex-1 text-xs truncate transition-colors",
            activeTabId === tab.id ? "text-primary font-medium" : "text-muted-foreground group-hover:text-foreground"
          )}>
            {tab.name}
          </span>
          
          <div className="flex items-center gap-1">
            {tab.isDirty && (
              <div className="w-2 h-2 rounded-full bg-primary/60 shrink-0 group-hover:hidden" />
            )}
            <button
              className={cn(
                "p-1 hover:bg-muted/50 rounded-sm transition-opacity group-hover:opacity-100",
                activeTabId === tab.id ? "opacity-100" : "opacity-0"
              )}
              onClick={(e) => {
                e.stopPropagation();
                onTabClose(tab.id);
              }}
            >
              <X size={12} className="text-muted-foreground" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default EditorTabs;
