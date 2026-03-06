import React from 'react';
import { SidebarSection } from './types';
import { cn } from '@/lib/utils';
import { ChevronRight, ChevronDown, Plus, FolderPlus, MoreVertical } from 'lucide-react';

interface ExplorerSidebarProps {
  activeSection: SidebarSection;
  width: number;
  onResize: (e: React.MouseEvent) => void;
  children: React.ReactNode;
}

const ExplorerSidebar: React.FC<ExplorerSidebarProps> = ({ 
  activeSection, 
  width, 
  onResize,
  children
}) => {
  const getSectionTitle = () => {
    switch (activeSection) {
      case 'explorer': return 'Explorer: Project';
      case 'search': return 'Search';
      case 'git': return 'Source Control';
      case 'activity': return 'Timeline';
      case 'participants': return 'Collaborators';
      default: return '';
    }
  };

  return (
    <div 
      className="flex flex-col border-r border-border bg-muted/10 shrink-0 relative overflow-hidden h-full group/sidebar"
      style={{ width }}
    >
      <div className="h-9 px-4 flex items-center justify-between border-b border-border/50 bg-muted/20 shrink-0 select-none">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">
          {getSectionTitle()}
        </span>
        <div className="flex items-center gap-1 opacity-0 group-hover/sidebar:opacity-100 transition-opacity">
          <button className="p-1 hover:bg-muted/50 rounded transition-colors text-muted-foreground">
            <MoreVertical size={14} />
          </button>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
        {children}
      </div>

      <div 
        className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/40 transition-colors z-50 active:bg-primary"
        onMouseDown={onResize}
      />
    </div>
  );
};

export default ExplorerSidebar;
