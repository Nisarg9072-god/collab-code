import { Link } from "react-router-dom";
import { Button } from "@/components/UI/button";
import { ArrowRight } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const CTASection = () => {
  const { user } = useAuth();
  return (
    <section className="py-24 px-6 bg-card border-t border-border">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-semibold text-foreground mb-4">
          Start collaborating in seconds.
        </h2>
        <p className="text-muted-foreground mb-8">
          Secure, real-time collaboration for your next project.
        </p>

        <Link to={user ? "/workspace" : "/login"}>
          <Button size="lg" className="gap-2 text-base px-8">
            Open Workspace
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </div>
    </section>
  );
};

export default CTASection;
