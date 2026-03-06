import { create } from 'zustand';
import { GitStatusEntry, DiffData } from './gitTypes';

interface GitState {
  commitMessage: string;
  status: GitStatusEntry[];
  selectedFile: GitStatusEntry | null;
  diff: DiffData | null;
  loading: boolean;
  setCommitMessage: (message: string) => void;
  setStatus: (status: GitStatusEntry[]) => void;
  setSelectedFile: (file: GitStatusEntry | null) => void;
  setDiff: (diff: DiffData | null) => void;
  setLoading: (loading: boolean) => void;
}

export const useGitStore = create<GitState>((set) => ({
  commitMessage: '',
  status: [],
  selectedFile: null,
  diff: null,
  loading: false,
  setCommitMessage: (commitMessage) => set({ commitMessage }),
  setStatus: (status) => set({ status }),
  setSelectedFile: (selectedFile) => set({ selectedFile }),
  setDiff: (diff) => set({ diff }),
  setLoading: (loading) => set({ loading }),
}));
