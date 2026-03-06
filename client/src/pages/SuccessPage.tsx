import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";
import { Button } from "@/components/UI/button";
import { useNavigate } from "react-router-dom";

export default function SuccessPage() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="pt-28 pb-16 px-6">
        <div className="mx-auto max-w-xl text-center space-y-4">
          <h1 className="text-3xl font-semibold text-foreground">Payment Successful</h1>
          <p className="text-muted-foreground">Your plan has been activated.</p>
          <div className="pt-2">
            <Button onClick={() => navigate("/dashboard")}>Go to Workspace</Button>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
