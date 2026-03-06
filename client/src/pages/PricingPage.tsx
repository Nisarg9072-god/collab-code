import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/UI/card";
import { Button } from "@/components/UI/button";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";

type Plan = {
  name: "FREE" | "PRO" | "PREMIUM" | "ULTRA";
  price: string;
  usage: string;
  members: string;
  features: string[];
  recommended?: boolean;
};

const plans: Plan[] = [
  {
    name: "FREE",
    price: "₹0",
    usage: "2 hours/day",
    members: "6",
    features: ["Real-time collaboration", "Custom workspaces", "Basic IDE features"]
  },
  {
    name: "PRO",
    price: "₹1500",
    usage: "6 hours/day",
    members: "6",
    recommended: true,
    features: ["Everything in Free", "Extended usage limits", "Priority support", "Advanced Git integration"]
  },
  {
    name: "PREMIUM",
    price: "₹2200",
    usage: "8 hours/day",
    members: "8",
    features: ["Everything in Pro", "High-performance nodes", "Team analytics", "Custom themes"]
  },
  {
    name: "ULTRA",
    price: "₹3000",
    usage: "Unlimited",
    members: "10",
    features: ["Everything in Premium", "Unlimited usage", "Enterprise security", "API access"]
  },
];

export default function PricingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleUpgrade = (planName: string) => {
    if (!user) {
      sessionStorage.setItem("cc.redirectAfterLogin", `/checkout/${planName.toLowerCase()}`);
      navigate("/login");
      return;
    }

    if (planName === "FREE") {
      localStorage.setItem("cc.plan", "FREE");
      navigate("/dashboard");
      return;
    }

    navigate(`/checkout/${planName.toLowerCase()}`);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />

      <main className="flex-1 pt-32 pb-24 px-6 relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-teal-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="mx-auto max-w-6xl relative z-10">
          <div className="text-center mb-16 px-4">
            <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-6 tracking-tight">
              Simple, Transparent Pricing
            </h1>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Choose the plan that best fits your development needs. No hidden fees, just pure productivity.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {plans.map((p) => (
              <Card
                key={p.name}
                className={`flex flex-col relative transition-all duration-300 hover:shadow-2xl hover:shadow-teal-500/10 hover:-translate-y-1 border-border/50 bg-card/50 backdrop-blur-sm ${p.recommended ? 'border-teal-500/50 scale-105 z-20 shadow-xl shadow-teal-500/5' : ''
                  }`}
              >
                {p.recommended && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-teal-500 text-white text-[10px] uppercase font-bold tracking-wider px-3 py-1 rounded-full">
                    Most Popular
                  </div>
                )}

                <CardHeader className="text-center pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground tracking-widest uppercase">
                    {p.name}
                  </CardTitle>
                  <div className="mt-4 flex items-baseline justify-center gap-1">
                    <span className="text-4xl font-bold tracking-tight text-foreground">{p.price}</span>
                    <span className="text-muted-foreground text-sm">/mo</span>
                  </div>
                </CardHeader>

                <CardContent className="flex-1 flex flex-col pt-4">
                  <div className="space-y-4 mb-8">
                    <div className="p-3 bg-muted/50 rounded-lg text-center">
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide block mb-1">Daily Usage</span>
                      <span className="text-sm font-semibold text-foreground">{p.usage}</span>
                    </div>

                    <ul className="space-y-3 text-sm">
                      {p.features.map((f, i) => (
                        <li key={i} className="flex items-start gap-3 text-muted-foreground">
                          <Check className="h-4 w-4 text-teal-500 shrink-0 mt-0.5" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <Button
                    className={`w-full mt-auto ${p.recommended
                      ? 'bg-teal-500 hover:bg-teal-600 text-white shadow-lg shadow-teal-500/20'
                      : 'bg-primary/10 hover:bg-primary/20 text-primary border-transparent'
                      }`}
                    onClick={() => handleUpgrade(p.name)}
                  >
                    {p.name === "FREE" ? "Get Started" : "Upgrade Now"}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
