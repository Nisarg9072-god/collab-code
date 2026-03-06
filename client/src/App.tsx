import React, { useEffect } from "react";
import { Toaster } from "@/components/UI/toaster";
import { Toaster as Sonner } from "@/components/UI/sonner";
import { TooltipProvider } from "@/components/UI/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/context/AuthContext";
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from "react-router-dom";
import Index from "./pages/Index";
import LoginPage from "./pages/auth/LoginPage";
import RegisterPage from "./pages/auth/RegisterPage";
import WorkspaceDetail from "./pages/WorkspaceDetail";
import WorkspaceEntry from "./pages/WorkspaceEntry";
import WorkspaceEditor from "./pages/WorkspaceEditor";
import Dashboard from "./pages/Dashboard";
import ProfilePage from "./pages/ProfilePage";
import NotFound from "./pages/NotFound";
import { useAuth } from "./context/AuthContext";
import { Navigate } from "react-router-dom";
import PricingPage from "./pages/PricingPage";
import SuccessPage from "./pages/SuccessPage";
import CheckoutPage from "./pages/CheckoutPage";

function RedirectAfterLogin() {
  const { user } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (user) {
      const target = sessionStorage.getItem("cc.redirectAfterLogin");
      if (target) {
        sessionStorage.removeItem("cc.redirectAfterLogin");
        navigate(target);
      }
    }
  }, [user, navigate]);
  return null;
}

// Protected Route Component
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

const queryClient = new QueryClient();


const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem storageKey="theme">
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <RedirectAfterLogin />
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/pricing" element={<PricingPage />} />
              <Route path="/checkout/:plan" element={<CheckoutPage />} />
              <Route path="/payment-success" element={<SuccessPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/dashboard" element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              } />
              <Route path="/profile" element={
                <ProtectedRoute>
                  <ProfilePage />
                </ProtectedRoute>
              } />
              <Route path="/workspace" element={
                <ProtectedRoute>
                  <WorkspaceEntry />
                </ProtectedRoute>
              } />
              <Route path="/workspace/:id" element={
                <ProtectedRoute>
                  <WorkspaceDetail />
                </ProtectedRoute>
              } />
              <Route path="/workspace/:id/editor" element={
                <ProtectedRoute>
                  <WorkspaceEditor />
                </ProtectedRoute>
              } />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </ThemeProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
