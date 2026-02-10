import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

const CTASection = () => {
  return (
    <section className="py-24 px-6 bg-card border-t border-border">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-semibold text-foreground mb-4">
          Start collaborating in seconds.
        </h2>
        <p className="text-muted-foreground mb-8">
          No accounts. No setup. Just open a workspace and share the link.
        </p>

        <Link to="/workspace">
          <Button size="lg" className="gap-2 text-base px-8">
            Open Workspace
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>

        <p className="mt-4 text-xs text-muted-foreground">
          No sign-up required
        </p>
      </div>
    </section>
  );
};

export default CTASection;
