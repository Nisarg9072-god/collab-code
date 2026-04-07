import { Link } from "react-router-dom";
import { Button } from "@/components/UI/button";
import { ArrowRight } from "lucide-react";
import { useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";

const HeroSection = () => {
  useEffect(() => {
    // Silent health check for logging purposes only
    const checkHealth = async () => {
      try {
        await api.health.db();
      } catch (err) {
        // Errors are already handled and logged as warnings in api.ts safeFetch
      }
    };
    checkHealth();
  }, []);

  const { user } = useAuth();

  return (
    <section className="pt-32 pb-20 px-6">
      <div className="mx-auto max-w-4xl text-center">
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tight text-foreground leading-tight">
          Real-time collaborative code editing for distributed teams.
        </h1>

        <p className="mt-6 text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          CollabCode lets multiple developers work on the same codebase simultaneously
          with live synchronization and minimal setup.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link to={user ? "/dashboard" : "/register"}>
            <Button size="lg" className="gap-2 text-base px-8">
              Get Started Free
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>

        <p className="mt-6 text-sm text-muted-foreground">
          Built for daily use
        </p>
      </div>
    </section>
  );
};

export default HeroSection;
