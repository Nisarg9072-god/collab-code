import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { AuthCard } from "@/components/auth/AuthCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Loader2 } from "lucide-react";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { login } = useAuth();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      // 1. Register
      await api.auth.register({ email, password });
      
      // 2. Auto-login on success (per strict requirements)
      const loginData = await api.auth.login({ email, password });
      
      // Manually set token then fetch user to populate context
      localStorage.setItem("token", loginData.token);
      const user = await api.auth.me();
      login(loginData.token, user);
      
      toast({
        title: "Account created!",
        description: "Welcome to CollabCode.",
      });
      navigate("/dashboard");
    } catch (err: any) {
      localStorage.removeItem("token");
      toast({
        variant: "destructive",
        title: "Registration failed",
        description: err.message || "Server unavailable",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <AuthCard
        title="Create Account"
        description="Join CollabCode to start building together"
        footer={
          <>
            Already have an account?{" "}
            <Link
              to="/login"
              className="text-white hover:text-cyan-300 font-medium underline-offset-4 hover:underline transition-colors"
            >
              Sign in
            </Link>
          </>
        }
      >
        <form onSubmit={handleRegister} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-white">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
              className="bg-white/5 border-white/10 text-white placeholder:text-white/40 focus:border-cyan-500/50 focus:ring-cyan-500/20 transition-all duration-200"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password" className="text-white">
              Password
            </Label>
            <Input
              id="password"
              type="password"
              placeholder="Create a strong password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              disabled={loading}
              className="bg-white/5 border-white/10 text-white placeholder:text-white/40 focus:border-cyan-500/50 focus:ring-cyan-500/20 transition-all duration-200"
            />
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white shadow-lg shadow-teal-500/25 transition-all duration-300 hover:scale-[1.02]"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating Account...
              </>
            ) : (
              "Sign Up"
            )}
          </Button>
        </form>
      </AuthCard>
    </AuthLayout>
  );
}
