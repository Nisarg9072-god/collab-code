import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/UI/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/UI/avatar";
import { Button } from "@/components/UI/button";
import { Calendar, Mail, User as UserIcon, Tag, LogOut, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const displayName = user.displayName || user.name;
  const memberSince = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
    : "Unknown";

  return (
    <div className="min-h-screen w-full relative overflow-hidden flex items-center justify-center p-4">
      <div className="fixed inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-br from-background via-background/95 to-background/90" />
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-teal-500/10 rounded-full blur-[128px]" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-[128px]" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        <Card className="bg-white/10 backdrop-blur-2xl border-white/20 shadow-2xl">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto mb-4 relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-teal-500 to-cyan-500 rounded-full blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200" />
              <Avatar className="h-24 w-24 border-2 border-white/20 relative">
                <AvatarImage src="" alt={user.email} />
                <AvatarFallback className="text-2xl bg-gradient-to-br from-teal-500 to-cyan-500 text-white">
                  {(displayName || user.email).charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </div>
            <CardTitle className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/80">
              {displayName || "My Profile"}
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-6">
            <div className="space-y-4">
              {/* Email */}
              <div className="group flex items-center gap-4 p-3 rounded-lg bg-white/5 border border-white/10 hover:border-teal-500/30 transition-colors">
                <div className="p-2 rounded-md bg-teal-500/10 text-teal-500 group-hover:text-teal-400 transition-colors">
                  <Mail className="h-5 w-5" />
                </div>
                <div className="flex-1 overflow-hidden">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Email Address</p>
                  <p className="text-sm font-medium truncate" title={user.email}>{user.email}</p>
                </div>
              </div>

              {/* Display Name (if set) */}
              {displayName && (
                <div className="group flex items-center gap-4 p-3 rounded-lg bg-white/5 border border-white/10 hover:border-teal-500/30 transition-colors">
                  <div className="p-2 rounded-md bg-teal-500/10 text-teal-500 group-hover:text-teal-400 transition-colors">
                    <Tag className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Display Name</p>
                    <p className="text-sm font-medium">{displayName}</p>
                  </div>
                </div>
              )}

              {/* Member Since */}
              <div className="group flex items-center gap-4 p-3 rounded-lg bg-white/5 border border-white/10 hover:border-teal-500/30 transition-colors">
                <div className="p-2 rounded-md bg-teal-500/10 text-teal-500 group-hover:text-teal-400 transition-colors">
                  <Calendar className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Member Since</p>
                  <p className="text-sm font-medium text-white/70">{memberSince}</p>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 pt-2">
              <Button
                variant="outline"
                className="w-full bg-white/5 border-white/10 text-white hover:bg-white/10"
                onClick={() => navigate("/dashboard")}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Dashboard
              </Button>
              <Button
                variant="destructive"
                className="w-full bg-red-500/10 text-red-500 border-red-500/20 hover:bg-red-500/20"
                onClick={handleLogout}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Log Out
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
