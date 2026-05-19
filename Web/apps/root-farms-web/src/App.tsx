import { useState } from "react";
import { AuthScreen } from "./components/AuthScreen";
import { BetaTesterBanner } from "./components/BetaTesterBanner";
import { PlaceholderTab } from "./components/PlaceholderTab";
import { RootEconomyScreen } from "./components/RootEconomyScreen";
import { PlotDetailScreen } from "./components/PlotDetailScreen";
import { PlotsGridScreen } from "./components/PlotsGridScreen";
import { SettingsScreen } from "./components/SettingsScreen";
import { FarmhandsScreen } from "./components/FarmhandsScreen";
import { GuideScreen } from "./components/GuideScreen";
import { SideNav } from "./components/SideNav";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { VarmintAlertModal } from "./components/VarmintAlertModal";
import { WelcomeBackModal } from "./components/WelcomeBackModal";
import { GameProvider } from "./contexts/GameContext";
import type { TabId } from "./game/types";

function RootFarmsWebApp({ onSignIn }: { onSignIn: () => void }) {
  const [tab, setTab] = useState<TabId>("plots");
  const [plotId, setPlotId] = useState<number | null>(null);

  let body: React.ReactNode;
  if (tab === "plots") {
    body =
      plotId != null ? (
        <PlotDetailScreen plotId={plotId} onBack={() => setPlotId(null)} variant="web" />
      ) : (
        <PlotsGridScreen onOpenPlot={setPlotId} />
      );
  } else if (tab === "farmhands") {
    body = <FarmhandsScreen />;
  } else if (tab === "guide") {
    body = <GuideScreen />;
  } else if (tab === "settings") {
    body = <SettingsScreen onSignIn={onSignIn} />;
  } else if (tab === "leaderboard") {
    body = <RootEconomyScreen variant="web" />;
  } else {
    body = <PlaceholderTab title="Replant" blurb="Reset for permanent multipliers — prestige for Root Farms." />;
  }

  return (
    <div className="app-shell app-shell--web">
      <SideNav tab={tab} onTab={(t) => { setTab(t); setPlotId(null); }} />
      <main className="app-main app-main--web">
        <BetaTesterBanner onSignIn={onSignIn} />
        {body}
      </main>
      <WelcomeBackModal />
      <VarmintAlertModal />
    </div>
  );
}

function RootFarmsGate() {
  const auth = useAuth();
  const [showSignIn, setShowSignIn] = useState(false);

  if (!auth.decided) {
    return <div className="boot">Loading…</div>;
  }

  if (showSignIn && !auth.authed) {
    return <AuthScreen onContinueAsBetaTester={() => setShowSignIn(false)} />;
  }

  if (!auth.canPlay) {
    return <AuthScreen onContinueAsBetaTester={() => setShowSignIn(false)} />;
  }

  return (
    <GameProvider>
      <RootFarmsWebApp onSignIn={() => setShowSignIn(true)} />
    </GameProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <RootFarmsGate />
    </AuthProvider>
  );
}
