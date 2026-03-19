"use client";

import { useState } from "react";
import { AuthModal } from "@/components/authModal";
import { LandingPage } from "@/components/landingPage";

interface LandingEntryProps {
  currentYear: number;
}

export function LandingEntry({ currentYear }: LandingEntryProps) {
  const [showAuthModal, setShowAuthModal] = useState(false);

  return (
    <>
      <LandingPage
        currentYear={currentYear}
        onAuthRequired={() => setShowAuthModal(true)}
      />
      <AuthModal open={showAuthModal} onOpenChange={setShowAuthModal} />
    </>
  );
}
