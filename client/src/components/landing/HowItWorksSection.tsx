import { FolderPlus, Share2, Users, Eye } from "lucide-react";

const steps = [
  {
    icon: FolderPlus,
    title: "Create or join a workspace",
    description: "Start a new workspace or enter an existing workspace ID to join your team.",
  },
  {
    icon: Share2,
    title: "Share the workspace link",
    description: "Copy the workspace link and send it to anyone who needs to collaborate.",
  },
  {
    icon: Users,
    title: "Edit code together in real time",
    description: "Everyone can type simultaneously. Changes appear instantly for all participants.",
  },
  {
    icon: Eye,
    title: "See changes and presence",
    description: "View collaborator cursors, selections, and activity as you work together.",
  },
];

const HowItWorksSection = () => {
  return (
    <section id="how-it-works" className="py-20 px-6 bg-card border-t border-border">
      <div className="mx-auto max-w-5xl">
        <h2 className="text-3xl font-semibold text-foreground mb-12 text-center">
          How It Works
        </h2>

        <div className="grid md:grid-cols-2 gap-8">
          {steps.map((step, index) => (
            <div
              key={index}
              className="flex gap-4 p-6 rounded-lg bg-background border border-border"
            >
              <div className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-md bg-primary/10 text-primary">
                <step.icon className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-mono text-muted-foreground">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h3 className="font-medium text-foreground">{step.title}</h3>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {step.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HowItWorksSection;
