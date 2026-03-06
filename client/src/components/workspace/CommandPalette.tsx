import { Command } from 'cmdk';
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useCommandStore } from "@/features/commands/commandStore";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const CommandPalette = ({ open, onOpenChange }: CommandPaletteProps) => {
  const { commands } = useCommandStore();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0">
        <Command>
          <Command.Input placeholder="Type a command or search..." />
          <Command.List>
            <Command.Empty>No results found.</Command.Empty>
            {commands.map((command) => (
              <Command.Item key={command.id} onSelect={command.action}>
                {command.name}
              </Command.Item>
            ))}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
};
