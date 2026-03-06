import React, { useState, useEffect } from 'react';
import ActivityBar from './ActivityBar';
import ExplorerSidebar from './ExplorerSidebar';
import EditorTabs from './EditorTabs';
import BottomPanel from './BottomPanel';
import StatusBar from './StatusBar';
import { IDEState, SidebarSection, BottomTab, EditorTab } from './types';
import { cn } from '@/lib/utils';

interface WorkspaceIDELayoutProps {
  children: React.ReactNode;
  sidebarContent: (section: SidebarSection) => React.ReactNode;
  panelContent: (tab: BottomTab) => React.ReactNode;
  tabs: EditorTab[];
  activeTabId: string | null;
  onTabSelect: (id: string) => void;
  onTabClose: (id: string) => void;
  connectionStatus: 'connected' | 'reconnecting' | 'offline';
  saveStatus: 'saved' | 'saving' | 'error';
  language: string;
  participantCount: number;
  problemCount: number;
  workspaceName?: string;
  role?: string;
  onClearTerminal?: () => void;
  ideState: IDEState;
  setIdeState: React.Dispatch<React.SetStateAction<IDEState>>;
}

const WorkspaceIDELayout: React.FC<WorkspaceIDELayoutProps> = ({
  children,
  sidebarContent,
  panelContent,
  tabs,
  activeTabId,
  onTabSelect,
  onTabClose,
  connectionStatus,
  saveStatus,
  language,
  participantCount,
  problemCount,
  workspaceName,
  role,
  onClearTerminal,
  ideState,
  setIdeState
}) => {
  const handleSidebarResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = ideState.sidebar.width;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.clientX - startX;
      setIdeState(prev => ({
        ...prev,
        sidebar: { ...prev.sidebar, width: Math.max(160, Math.min(600, startWidth + dx)) }
      }));
    };

    const onMouseUp = () => {
      document.body.style.cursor = 'default';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    document.body.style.cursor = 'col-resize';
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handlePanelResize = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!ideState.panel.visible) return;
    const startY = e.clientY;
    const startHeight = ideState.panel.height;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const dy = startY - moveEvent.clientY;
      setIdeState(prev => ({
        ...prev,
        panel: { ...prev.panel, height: Math.max(40, Math.min(800, startHeight + dy)) }
      }));
    };

    const onMouseUp = () => {
      document.body.style.cursor = 'default';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    document.body.style.cursor = 'row-resize';
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const togglePanel = () => {
    setIdeState(prev => ({
      ...prev,
      panel: { ...prev.panel, visible: !prev.panel.visible }
    }));
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background text-foreground font-sans selection:bg-primary/30">
      <div className="flex flex-1 overflow-hidden">
        {/* Activity Bar */}
        <ActivityBar 
          activeSection={ideState.sidebar.activeSection}
          onSectionChange={(section) => setIdeState(prev => ({ 
            ...prev, 
            sidebar: { ...prev.sidebar, activeSection: section, visible: true } 
          }))}
          sidebarVisible={ideState.sidebar.visible}
          onToggleSidebar={() => setIdeState(prev => ({ 
            ...prev, 
            sidebar: { ...prev.sidebar, visible: !prev.sidebar.visible } 
          }))}
        />

        {/* Sidebar */}
        {ideState.sidebar.visible && (
          <ExplorerSidebar
            activeSection={ideState.sidebar.activeSection}
            width={ideState.sidebar.width}
            onResize={handleSidebarResize}
          >
            {sidebarContent(ideState.sidebar.activeSection)}
          </ExplorerSidebar>
        )}

        {/* Main Editor Area */}
        <div className="flex-1 flex flex-col min-w-0 bg-muted/5 overflow-hidden">
          <EditorTabs 
            tabs={tabs}
            activeTabId={activeTabId}
            onTabSelect={onTabSelect}
            onTabClose={onTabClose}
          />
          
          <div className="flex-1 relative overflow-hidden flex flex-col">
            <div className="flex-1 relative overflow-hidden">
              {children}
            </div>

            {/* Bottom Panel */}
            {ideState.panel.visible && (
              <BottomPanel
                activeTab={ideState.panel.activeTab}
                onTabChange={(tab) => setIdeState(prev => ({ 
                  ...prev, 
                  panel: { ...prev.panel, activeTab: tab } 
                }))}
                onTogglePanel={togglePanel}
                height={ideState.panel.height}
                onResize={handlePanelResize}
                onClearTerminal={onClearTerminal}
              >
                {panelContent(ideState.panel.activeTab)}
              </BottomPanel>
            )}
          </div>
        </div>
      </div>

      {/* Status Bar */}
      <div onClick={togglePanel} className="cursor-pointer">
        <StatusBar 
          connectionStatus={connectionStatus}
          saveStatus={saveStatus}
          language={language}
          participantCount={participantCount}
          problemCount={problemCount}
          workspaceName={workspaceName}
          role={role}
        />
      </div>
    </div>
  );
};

export default WorkspaceIDELayout;
