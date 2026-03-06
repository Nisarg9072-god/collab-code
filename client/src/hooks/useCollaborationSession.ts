
import { useMemo } from 'react';
import { WebsocketProvider } from 'y-websocket';
import { collaborationManager } from '@/lib/collaborationManager';

interface UseCollaborationSessionOptions {
  workspaceId: string;
  fileId: string;
  token: string | null;
}

export const useCollaborationSession = ({ workspaceId, fileId, token }: UseCollaborationSessionOptions) => {
  const provider = useMemo(() => {
    if (!workspaceId || !fileId || !token) {
      return null;
    }
    return collaborationManager.getProvider(workspaceId, fileId, token);
  }, [workspaceId, fileId, token]);

  return { provider };
};
