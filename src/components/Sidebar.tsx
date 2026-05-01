import { useJobStore } from "../stores/jobStore";
import { useViewStore, type View } from "../stores/viewStore";

interface NavItem {
  id: View;
  label: string;
  icon: string;
}

const ITEMS: NavItem[] = [
  { id: "home", label: "Nova faixa", icon: "+" },
  { id: "library", label: "Biblioteca", icon: "♪" },
  { id: "settings", label: "Configurações", icon: "⚙" },
  { id: "about", label: "Sobre", icon: "?" },
];

export function Sidebar() {
  const view = useViewStore((s) => s.view);
  const setView = useViewStore((s) => s.setView);
  const jobStatus = useJobStore((s) => s.status);
  const resetJob = useJobStore((s) => s.reset);

  function handleClick(id: View) {
    if (id === "home") {
      // "Nova faixa" sempre limpa o job atual pra mostrar o input.
      // Faixa segue acessível pela Biblioteca (cache em disco).
      if (jobStatus !== "idle") resetJob();
    }
    setView(id);
  }

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-neutral-800 bg-neutral-950/40">
      <div className="border-b border-neutral-800 px-4 py-4">
        <h1 className="text-base font-semibold tracking-tight text-neutral-100">
          Stem Splitter
        </h1>
        <p className="text-xs text-neutral-500">YouTube → 6 stems</p>
      </div>
      <nav className="flex flex-1 flex-col gap-1 p-2">
        {ITEMS.map((item) => {
          const active = view === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleClick(item.id)}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                active
                  ? "bg-neutral-900 text-neutral-100"
                  : "text-neutral-400 hover:bg-neutral-900/60 hover:text-neutral-200"
              }`}
            >
              <span
                className={`inline-flex h-5 w-5 items-center justify-center text-base ${
                  active ? "text-emerald-400" : "text-neutral-500"
                }`}
              >
                {item.icon}
              </span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
