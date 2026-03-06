import { Card, CardContent, CardHeader, CardTitle } from "@/components/UI/card";
import { Button } from "@/components/ui/button";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";
import { useNavigate } from "react-router-dom";

type Plan = {
  name: "FREE" | "PRO" | "PREMIUM" | "ULTRA";
  price: string;
  usage: string;
  members: string;
};

const plans: Plan[] = [
  { name: "FREE", price: "₹0 per day", usage: "2 hours per day", members: "6" },
  { name: "PRO", price: "₹1500 per month", usage: "6 hours per day", members: "6" },
  { name: "PREMIUM", price: "₹2200 per month", usage: "8 hours per day", members: "8" },
  { name: "ULTRA", price: "₹3000 per month", usage: "Unlimited", members: "10" },
];

export default function PricingPage() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="pt-28 pb-16 px-6">
        <div className="mx-auto max-w-5xl">
          <h1 className="text-3xl md:text-4xl font-semibold text-foreground text-center mb-10">Choose Your Plan</h1>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {plans.map((p) => (
              <Card key={p.name} className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-xl">{p.name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="text-2xl font-semibold text-foreground">{p.price}</div>
                  <div className="text-sm text-muted-foreground">Usage: {p.usage}</div>
                  <div className="text-sm text-muted-foreground">Members: {p.members}</div>
                  <Button
                    className="mt-2 w-full"
                    onClick={() => {
                      localStorage.setItem("cc.plan", p.name);
                      navigate("/dashboard");
                    }}
                  >
                    Upgrade
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
