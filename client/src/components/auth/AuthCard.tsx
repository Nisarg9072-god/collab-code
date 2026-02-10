import React from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { cn } from "@/lib/utils";

interface AuthCardProps {
  children: React.ReactNode;
  title: string;
  description: string;
  footer?: React.ReactNode;
  className?: string;
}

export function AuthCard({ children, title, description, footer, className }: AuthCardProps) {
  return (
    <GlassCard 
      className={cn(
        "w-full max-w-md p-8 space-y-6 animate-in fade-in zoom-in duration-500 shadow-2xl", 
        // User specific Auth Card styles
        "bg-white/10 backdrop-blur-2xl border-white/20",
        className
      )}
      hoverEffect={true}
    >
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-white drop-shadow-md">
          {title}
        </h1>
        <p className="text-white/70">
          {description}
        </p>
      </div>

      <div className="space-y-4">
        {children}
      </div>

      {footer && (
        <div className="text-center text-sm text-white/60 pt-2 border-t border-white/10 mt-6">
          {footer}
        </div>
      )}
    </GlassCard>
  );
}
