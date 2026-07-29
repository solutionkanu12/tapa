import { AppShell } from "@/components/AppShell";
import { Closing } from "@/components/Closing";
import { Hero } from "@/components/Hero";
import { HowItWorks } from "@/components/HowItWorks";
import { LiveMechanism } from "@/components/LiveMechanism";
import { Marquee } from "@/components/Marquee";
import { NavIsland } from "@/components/NavIsland";
import { ProblemSection } from "@/components/ProblemSection";
import { ScrollReveal } from "@/components/ScrollReveal";
import { SiteFooter } from "@/components/SiteFooter";
import { StatStrip } from "@/components/StatStrip";

export default function Home() {
  return (
    <AppShell
      landing={
        <>
          <ScrollReveal />
          <NavIsland />
          <Hero />
          <Marquee />
          <ProblemSection />
          <LiveMechanism />
          <HowItWorks />
          <StatStrip />
          <Closing />
          <SiteFooter />
        </>
      }
    />
  );
}
