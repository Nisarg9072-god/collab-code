import { 
  RefreshCw, 
  MousePointer2, 
  FolderOpen, 
  Code2, 
  WifiOff, 
  Focus 
} from "lucide-react";

const features = [
  {
    icon: RefreshCw,
    title: "Real-time code synchronization",
    description: "Every keystroke syncs instantly across all connected users.",
  },
  {
    icon: MousePointer2,
    title: "Multi-user cursor presence",
    description: "See where each collaborator is working with labeled cursors.",
  },
  {
    icon: FolderOpen,
    title: "Workspace-based collaboration",
    description: "Organize sessions by workspace with shareable IDs and links.",
  },
  {
    icon: Code2,
    title: "Language-aware editor",
    description: "Syntax highlighting for popular programming languages.",
  },
  {
    icon: WifiOff,
    title: "Connection recovery handling",
    description: "Graceful reconnection and read-only fallback when offline.",
  },
  {
    icon: Focus,
    title: "Minimal, distraction-free interface",
    description: "Focused on coding, not cluttered with unnecessary features.",
  },
];

const FeaturesSection = () => {
  return (
    <section className="py-20 px-6 border-t border-border">
      <div className="mx-auto max-w-5xl">
        <h2 className="text-3xl font-semibold text-foreground mb-4 text-center">
          Core Capabilities
        </h2>
        <p className="text-muted-foreground text-center mb-12 max-w-2xl mx-auto">
          Built with the features that matter for real collaborative work.
        </p>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <div
              key={index}
              className="p-5 rounded-lg border border-border bg-card hover:border-primary/30 transition-colors"
            >
              <feature.icon className="w-5 h-5 text-primary mb-3" />
              <h3 className="font-medium text-foreground mb-1">{feature.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;
