import React from 'react';
import { 
  Cloud, 
  Wifi, 
  WifiOff, 
  Save, 
  Code2, 
  Users,
  AlertCircle,
  CheckCircle2
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatusBarProps {
  connectionStatus: 'connected' | 'reconnecting' | 'offline';
  saveStatus: 'saved' | 'saving' | 'error';
  language: string;
  participantCount: number;
  problemCount: number;
  workspaceName?: string;
  role?: string;
}

const StatusBar: React.FC<StatusBarProps> = ({ 
  connectionStatus, 
  saveStatus, 
  language, 
  participantCount,
  problemCount,
  workspaceName,
  role
}) => {
  return (
    <div className="h-6 flex items-center justify-between px-3 bg-primary text-primary-foreground border-t border-border/10 select-none text-[10px] shrink-0 font-medium">
      <div className="flex items-center h-full gap-0">
        <div className="flex items-center gap-1.5 hover:bg-white/10 px-2.5 h-full transition-colors cursor-pointer group">
          {connectionStatus === 'connected' ? (
            <Wifi size={12} className="text-emerald-300" />
          ) : connectionStatus === 'reconnecting' ? (
            <Wifi size={12} className="animate-pulse text-amber-300" />
          ) : (
            <WifiOff size={12} className="text-rose-400" />
          )}
          <span className="capitalize">{connectionStatus}</span>
        </div>
        
        <div className="flex items-center gap-1.5 hover:bg-white/10 px-2.5 h-full transition-colors cursor-pointer">
          <Save size={12} className={cn(
            saveStatus === 'saving' && "animate-pulse text-amber-300",
            saveStatus === 'error' && "text-rose-400",
            saveStatus === 'saved' && "text-emerald-300"
          )} />
          <span className="capitalize">{saveStatus}</span>
        </div>

        {workspaceName && (
          <div className="flex items-center gap-1.5 hover:bg-white/10 px-2.5 h-full transition-colors cursor-pointer border-l border-white/10">
            <span className="opacity-80">Workspace:</span>
            <span className="font-bold">{workspaceName}</span>
          </div>
        )}
        
        {problemCount > 0 && (
          <div className="flex items-center gap-1.5 hover:bg-white/10 px-2.5 h-full transition-colors cursor-pointer text-rose-100 font-bold border-l border-white/10">
            <AlertCircle size={12} />
            <span>{problemCount}</span>
          </div>
        )}
      </div>
      
      <div className="flex items-center h-full gap-0">
        {role && (
          <div className="flex items-center gap-1.5 hover:bg-white/10 px-2.5 h-full transition-colors cursor-pointer border-r border-white/10">
            <span className="opacity-80">Role:</span>
            <span className="uppercase tracking-tighter">{role}</span>
          </div>
        )}

        <div className="flex items-center gap-1.5 hover:bg-white/10 px-2.5 h-full transition-colors cursor-pointer border-r border-white/10">
          <Users size={12} />
          <span>{participantCount} {participantCount === 1 ? 'User' : 'Users'}</span>
        </div>
        
        <div className="flex items-center gap-1.5 hover:bg-white/10 px-2.5 h-full transition-colors cursor-pointer border-r border-white/10">
          <Code2 size={12} />
          <span>{language}</span>
        </div>
        
        <div className="flex items-center gap-1.5 hover:bg-white/10 px-2.5 h-full transition-colors cursor-pointer">
          <CheckCircle2 size={12} className="text-emerald-300 opacity-80" />
          <span className="font-mono">UTF-8</span>
        </div>
      </div>
    </div>
  );
};

export default StatusBar;
