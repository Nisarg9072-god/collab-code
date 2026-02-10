import React from "react";
import LandingPage from "@/pages/LandingPage";

export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen w-full overflow-hidden font-sans">
      {/* Background: Landing Page (Blurred & Static) */}
      <div className="absolute inset-0 z-0 pointer-events-none opacity-60">
        <LandingPage />
      </div>

      {/* Overlay: Backdrop Blur + Darken */}
      {/* 
         bg-black/30 -> Darken
         backdrop-blur-xl -> Blurs the LandingPage behind it
      */}
      <div className="absolute inset-0 z-10 bg-black/40 backdrop-blur-xl" />

      {/* Content Container (Centered) */}
      <div className="relative z-20 flex min-h-screen items-center justify-center p-4">
        {children}
      </div>
    </div>
  );
}
