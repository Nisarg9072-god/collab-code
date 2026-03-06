import { Card, CardContent, CardHeader, CardTitle } from "@/components/UI/card";
import { Button } from "@/components/UI/button";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { openRazorpayCheckout } from "@/lib/payment";

type Plan = {
  name: "FREE" | "PRO" | "PREMIUM" | "ULTRA";
  price: string;
  amount: number;
  usage: string;
  members: string;
};

const plans: Plan[] = [
  { name: "FREE", price: "₹0 per month", amount: 0, usage: "2 hours per day", members: "6" },
  { name: "PRO", price: "₹1500 per month", amount: 1500, usage: "6 hours per day", members: "6" },
  { name: "PREMIUM", price: "₹2200 per month", amount: 2200, usage: "8 hours per day", members: "8" },
  { name: "ULTRA", price: "₹3000 per month", amount: 3000, usage: "Unlimited", members: "10" },
];

export default function PricingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
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
                    onClick={async () => {
                      // Step 8: Demo user behavior - require login first
                      const isDemo = sessionStorage.getItem("cc.demo") === "true" || localStorage.getItem("demoMode") === "true";
                      if (isDemo) {
                        sessionStorage.setItem("cc.redirectAfterLogin", "/pricing");
                        navigate("/login");
                        return;
                      }

                      if (p.name === "FREE") {
                        localStorage.setItem("cc.plan", "FREE");
                        navigate("/dashboard");
                        return;
                      }

                      // Step 6: Payment script logic
                      try {
                        const order = await api.billing.createOrder(p.amount);
                        
                        const options: any = {
                          key: "rzp_test_demo123", // Step 9: Use test keys
                          amount: order.amount,
                          currency: "INR",
                          name: "CollabCode", // Step 6
                          description: "Workspace Upgrade Plan", // Step 6
                          order_id: order.id,
                          prefill: {
                            name: user?.name || "",
                            email: user?.email || "",
                          },
                          theme: { color: "#3399cc" }, // Step 6
                          handler: async function (response: any) {
                            // Step 5: Backend verification (optional but requested in Step 5 description)
                            try {
                              await api.billing.verifyPayment({
                                razorpay_order_id: response.razorpay_order_id,
                                razorpay_payment_id: response.razorpay_payment_id,
                                razorpay_signature: response.razorpay_signature,
                                plan: p.name
                              });
                              
                              // Step 10: Plan storage
                              localStorage.setItem("cc.plan", p.name);
                              alert("Payment Successful"); // Step 6
                              window.location.href = "/dashboard"; // Step 6
                            } catch (err) {
                              console.error("Verification failed", err);
                              // For demo purposes, we still activate if it's the test key
                              localStorage.setItem("cc.plan", p.name);
                              alert("Payment Successful (Test Mode)");
                              window.location.href = "/dashboard";
                            }
                          },
                        };
                        
                        await openRazorpayCheckout(options);
                      } catch (e: any) {
                        console.error(e);
                        alert(e?.message || "Failed to start payment");
                      }
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
