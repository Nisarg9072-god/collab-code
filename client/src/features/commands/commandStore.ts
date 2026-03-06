import { create } from 'zustand';
import { Command } from './commands';

interface CommandState {
  commands: Command[];
  registerCommand: (command: Command) => void;
}

export const useCommandStore = create<CommandState>((set) => ({
  commands: [],
  registerCommand: (command) => set((state) => ({ commands: [...state.commands, command] })),
}));
