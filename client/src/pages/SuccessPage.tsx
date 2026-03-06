import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";
import { Button } from "@/components/UI/button";
import { useNavigate, useLocation } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";

export default function SuccessPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const query = new URLSearchParams(location.search);
  const plan = query.get("plan") || "FREE";
  const paymentId = query.get("id") || "N/A";

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="pt-28 pb-16 px-6">
        <div className="mx-auto max-w-xl text-center space-y-6">
          <div className="flex justify-center">
            <CheckCircle2 className="h-16 w-16 text-teal-500" />
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold text-foreground">Payment Successful</h1>
            <p className="text-muted-foreground">Your plan has been activated successfully.</p>
          </div>
          
          <div className="bg-card border border-border rounded-xl p-6 text-left space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-border">
              <span className="text-sm text-muted-foreground">Plan Name</span>
              <span className="font-medium text-foreground">{plan}</span>
            </div>
            <div className="flex justify-between items-center pb-3 border-b border-border">
              <span className="text-sm text-muted-foreground">Payment Status</span>
              <span className="font-medium text-teal-500">Completed</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Transaction ID</span>
              <span className="font-mono text-xs text-foreground">{paymentId}</span>
            </div>
          </div>

          <div className="pt-4">
            <Button size="lg" onClick={() => navigate("/dashboard")} className="w-full sm:w-auto px-8">
              Go to Workspace
            </Button>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
