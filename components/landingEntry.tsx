"use client";

import { useState } from "react";
import { AuthModal } from "@/components/authModal";
import { LandingPage } from "@/components/landingPage";

export function LandingEntry() {
  const [showAuthModal, setShowAuthModal] = useState(false);

  return (
    <>
      <LandingPage onAuthRequired={() => setShowAuthModal(true)} />
      <AuthModal open={showAuthModal} onOpenChange={setShowAuthModal} />
    </>
  );
}
