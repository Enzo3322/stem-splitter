import { AboutView } from "./components/AboutView";
import { DeviceBadge } from "./components/DeviceBadge";
import { LibraryView } from "./components/LibraryView";
import { ModelPrefetchBanner } from "./components/ModelPrefetchBanner";
import { ProgressView } from "./components/ProgressView";
import { SettingsView } from "./components/SettingsView";
import { Sidebar } from "./components/Sidebar";
import { StemPlayer } from "./components/StemPlayer";
import { UrlInput } from "./components/UrlInput";
import { usePrefetchModel } from "./hooks/usePrefetchModel";
import { useSidecarEvents } from "./hooks/useSidecarEvents";
import { useJobStore } from "./stores/jobStore";
import { useViewStore } from "./stores/viewStore";

export default function App() {
  useSidecarEvents();
  usePrefetchModel();
  const view = useViewStore((s) => s.view);
  const setView = useViewStore((s) => s.setView);

  return (
    <div className="flex h-full">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 overflow-y-auto">
          {view === "home" && <HomeView />}
          {view === "library" && <LibraryView />}
          {view === "settings" && <SettingsView onClose={() => setView("home")} />}
          {view === "about" && <AboutView onClose={() => setView("home")} />}
        </main>
        <footer className="border-t border-neutral-800 px-6 py-2">
          <DeviceBadge />
        </footer>
      </div>
    </div>
  );
}

function HomeView() {
  const status = useJobStore((s) => s.status);
  const stems = useJobStore((s) => s.stems);
  const cacheKey = useJobStore((s) => s.cacheKey);
  const title = useJobStore((s) => s.title);

  if (
    status === "downloading" ||
    status === "separating" ||
    status === "error" ||
    status === "cancelled"
  ) {
    return <ProgressView />;
  }
  if (status === "ready" && stems.length > 0 && cacheKey) {
    return <StemPlayer stems={stems} cacheKey={cacheKey} title={title} />;
  }
  return (
    <>
      <ModelPrefetchBanner />
      <UrlInput />
    </>
  );
}
