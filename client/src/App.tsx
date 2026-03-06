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

// Protected Route Component
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  const sp = new URLSearchParams(location.search);
  const demo =
    sp.get("demo") === "true" ||
    (typeof window !== "undefined" && (sessionStorage.getItem("cc.demo") === "true" || localStorage.getItem("demoMode") === "true"));
  if (demo) return <>{children}</>;
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

const queryClient = new QueryClient();

function DemoNotice() {
  const location = useLocation();
  const navigate = useNavigate();
  const demo =
    new URLSearchParams(location.search).get("demo") === "true" ||
    (typeof window !== "undefined" && (sessionStorage.getItem("cc.demo") === "true" || localStorage.getItem("demoMode") === "true"));
  if (demo) {
    if (typeof window !== "undefined" && new URLSearchParams(location.search).get("demo") === "true") {
      sessionStorage.setItem("cc.demo", "true");
      localStorage.setItem("demoMode", "true");
    }
  }
  if (!demo) return null;
  return (
    <div className="w-full text-xs text-amber-800 bg-amber-100 border-b border-amber-200 px-3 py-1 flex items-center justify-center gap-3">
      <span>Demo Mode – You are exploring the platform without logging in.</span>
      <button
        className="underline text-amber-900 hover:text-amber-700"
        onClick={() => {
          sessionStorage.removeItem("cc.demo");
          localStorage.removeItem("demoMode");
          navigate("/login");
        }}
      >
        Login to Save Work
      </button>
    </div>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem storageKey="theme">
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <DemoNotice />
            <Routes>
              <Route path="/" element={<Index />} />
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
