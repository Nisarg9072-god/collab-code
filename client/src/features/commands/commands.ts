import { useThemeStore } from "@/features/theme/themeStore";

export interface Command {
  id: string;
  name: string;
  group: string;
  action: () => void;
}

export const commands: Command[] = [
  {
    id: "file.create",
    name: "File: Create New File",
    group: "File",
    action: () => {},
  },
  {
    id: "file.save",
    name: "File: Save Current File",
    group: "File",
    action: () => {},
  },
  {
    id: "view.toggleTerminal",
    name: "View: Toggle Terminal",
    group: "View",
    action: () => {},
  },
  {
    id: "view.toggleFileExplorer",
    name: "View: Toggle File Explorer",
    group: "View",
    action: () => {},
  },
  {
    id: "view.toggleSearch",
    name: "View: Toggle Search",
    group: "View",
    action: () => {},
  },
  {
    id: "view.toggleSourceControl",
    name: "View: Toggle Source Control",
    group: "View",
    action: () => {},
  },
  {
    id: "git.commit",
    name: "Git: Commit",
    group: "Git",
    action: () => {},
  },
  {
    id: "theme.switchToDarkMode",
    name: "Theme: Switch to Dark Mode",
    group: "Theme",
    action: () => useThemeStore.getState().setTheme("dark"),
  },
  {
    id: "theme.switchToLightMode",
    name: "Theme: Switch to Light Mode",
    group: "Theme",
    action: () => useThemeStore.getState().setTheme("light"),
  },
];
