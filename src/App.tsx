import { useState } from "react";
import { AboutView } from "./components/AboutView";
import { DeviceBadge } from "./components/DeviceBadge";
import { ModelPrefetchBanner } from "./components/ModelPrefetchBanner";
import { ProgressView } from "./components/ProgressView";
import { SettingsView } from "./components/SettingsView";
import { StemPlayer } from "./components/StemPlayer";
import { UrlInput } from "./components/UrlInput";
import { usePrefetchModel } from "./hooks/usePrefetchModel";
import { useSidecarEvents } from "./hooks/useSidecarEvents";
import { useJobStore } from "./stores/jobStore";

type Pane = "main" | "settings" | "about";

export default function App() {
  useSidecarEvents();
  usePrefetchModel();
  const status = useJobStore((s) => s.status);
  const stems = useJobStore((s) => s.stems);
  const cacheKey = useJobStore((s) => s.cacheKey);
  const [pane, setPane] = useState<Pane>("main");

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-neutral-800 px-6 py-4">
        <button
          onClick={() => setPane("main")}
          className="text-left"
        >
          <h1 className="text-xl font-semibold tracking-tight">Stem Splitter</h1>
          <p className="text-sm text-neutral-400">YouTube → 6 stems via Demucs</p>
        </button>
        <nav className="flex gap-2">
          <NavButton active={pane === "settings"} onClick={() => setPane(pane === "settings" ? "main" : "settings")}>
            Configurações
          </NavButton>
          <NavButton active={pane === "about"} onClick={() => setPane(pane === "about" ? "main" : "about")}>
            Sobre
          </NavButton>
        </nav>
      </header>

      <main className="flex-1 overflow-y-auto">
        {pane === "main" && <ModelPrefetchBanner />}
        {pane === "settings" && <SettingsView onClose={() => setPane("main")} />}
        {pane === "about" && <AboutView onClose={() => setPane("main")} />}
        {pane === "main" && (
          <>
            {status === "idle" && <UrlInput />}
            {(status === "downloading" ||
              status === "separating" ||
              status === "error" ||
              status === "cancelled") && <ProgressView />}
            {status === "ready" && stems.length > 0 && cacheKey && (
              <StemPlayer stems={stems} cacheKey={cacheKey} />
            )}
          </>
        )}
      </main>

      <footer className="border-t border-neutral-800 px-6 py-2">
        <DeviceBadge />
      </footer>
    </div>
  );
}

function NavButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
        active
          ? "border-neutral-600 bg-neutral-900 text-neutral-100"
          : "border-neutral-800 text-neutral-400 hover:bg-neutral-900"
      }`}
    >
      {children}
    </button>
  );
}
