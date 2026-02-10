import { 
  Globe, 
  Users, 
  FileSearch, 
  MessageSquare, 
  GraduationCap 
} from "lucide-react";

const useCases = [
  {
    icon: Globe,
    title: "Remote development teams",
    description: "Work together across time zones without screen sharing latency.",
  },
  {
    icon: Users,
    title: "Pair programming",
    description: "Code side by side in a shared editor, each with your own cursor.",
  },
  {
    icon: FileSearch,
    title: "Code reviews",
    description: "Walk through changes together and make edits in real time.",
  },
  {
    icon: MessageSquare,
    title: "Technical interviews",
    description: "Conduct live coding assessments with instant visibility.",
  },
  {
    icon: GraduationCap,
    title: "Teaching & mentoring",
    description: "Guide students through code with live demonstrations.",
  },
];

const UseCasesSection = () => {
  return (
    <section id="use-cases" className="py-20 px-6 bg-card border-t border-border">
      <div className="mx-auto max-w-5xl">
        <h2 className="text-3xl font-semibold text-foreground mb-4 text-center">
          Who is CollabCode for?
        </h2>
        <p className="text-muted-foreground text-center mb-12 max-w-2xl mx-auto">
          Designed for anyone who needs to write or review code together.
        </p>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {useCases.map((useCase, index) => (
            <div
              key={index}
              className="flex gap-4 p-5 rounded-lg border border-border bg-background"
            >
              <useCase.icon className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-medium text-foreground mb-1">{useCase.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {useCase.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default UseCasesSection;
