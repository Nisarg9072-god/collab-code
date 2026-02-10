import { Shield, Zap, RefreshCcw, Minimize2 } from "lucide-react";

const points = [
  {
    icon: Shield,
    text: "Designed for continuous, daily usage",
  },
  {
    icon: RefreshCcw,
    text: "Handles disconnections gracefully with automatic recovery",
  },
  {
    icon: Minimize2,
    text: "Focused on coding—no chat, no distractions",
  },
  {
    icon: Zap,
    text: "No unnecessary features that slow you down",
  },
];

const ReliabilitySection = () => {
  return (
    <section className="py-20 px-6 border-t border-border">
      <div className="mx-auto max-w-4xl text-center">
        <h2 className="text-3xl font-semibold text-foreground mb-4">
          Built for Reliability
        </h2>
        <p className="text-muted-foreground mb-12 max-w-xl mx-auto">
          CollabCode is designed to work when you need it, every time.
        </p>

        <div className="grid sm:grid-cols-2 gap-4 text-left">
          {points.map((point, index) => (
            <div
              key={index}
              className="flex items-center gap-3 p-4 rounded-lg border border-border bg-card"
            >
              <point.icon className="w-4 h-4 text-primary flex-shrink-0" />
              <span className="text-sm text-foreground">{point.text}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ReliabilitySection;
