import React from 'react';
import { 
  Files, 
  Search, 
  GitBranch, 
  Play, 
  Package, 
  Users,
  Activity,
  Settings,
  Sparkles
} from 'lucide-react';
import { SidebarSection } from './types';
import { cn } from '@/lib/utils';

interface ActivityBarProps {
  activeSection: SidebarSection;
  onSectionChange: (section: SidebarSection) => void;
  onToggleSidebar: () => void;
  sidebarVisible: boolean;
}

const ActivityBar: React.FC<ActivityBarProps> = ({ 
  activeSection, 
  onSectionChange, 
  onToggleSidebar,
  sidebarVisible
}) => {
  const items: { id: SidebarSection; icon: React.ReactNode; label: string }[] = [
    { id: 'explorer', icon: <Files size={22} strokeWidth={1.5} />, label: 'Explorer' },
    { id: 'search', icon: <Search size={22} strokeWidth={1.5} />, label: 'Search' },
    { id: 'git', icon: <GitBranch size={22} strokeWidth={1.5} />, label: 'Source Control' },
    { id: 'run', icon: <Play size={22} strokeWidth={1.5} />, label: 'Run and Debug' },
    { id: 'ai', icon: <Sparkles size={22} strokeWidth={1.5} />, label: 'AI Assistant' },
    { id: 'extensions', icon: <Package size={22} strokeWidth={1.5} />, label: 'Extensions' },
    { id: 'participants', icon: <Users size={22} strokeWidth={1.5} />, label: 'Collaboration' },
    { id: 'activity', icon: <Activity size={22} strokeWidth={1.5} />, label: 'Timeline' },
  ];

  return (
    <div className="w-12 flex flex-col bg-muted/20 border-r border-border shrink-0 select-none items-center py-2 gap-2">
      <div className="flex-1 flex flex-col items-center gap-1 w-full">
        {items.map((item) => (
          <button
            key={item.id}
            title={item.label}
            onClick={() => {
              if (activeSection === item.id && sidebarVisible) {
                onToggleSidebar();
              } else {
                onSectionChange(item.id);
                if (!sidebarVisible) onToggleSidebar();
              }
            }}
            className={cn(
              "w-full aspect-square flex items-center justify-center transition-all relative group",
              activeSection === item.id && sidebarVisible ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {activeSection === item.id && sidebarVisible && (
              <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-primary" />
            )}
            <div className={cn(
              "transition-transform",
              activeSection === item.id && sidebarVisible ? "scale-110" : "group-hover:scale-110"
            )}>
              {item.icon}
            </div>
          </button>
        ))}
      </div>
      
      <div className="pb-2 flex flex-col items-center w-full">
        <button 
          title="Settings"
          className="w-full aspect-square flex items-center justify-center text-muted-foreground hover:text-foreground transition-all group"
        >
          <Settings size={22} strokeWidth={1.5} className="group-hover:rotate-45 transition-transform duration-500" />
        </button>
      </div>
    </div>
  );
};

export default ActivityBar;
