import { create } from "zustand";

export type View = "home" | "library" | "settings" | "about";

interface ViewState {
  view: View;
  setView: (v: View) => void;
}

export const useViewStore = create<ViewState>((set) => ({
  view: "home",
  setView: (view) => set({ view }),
}));
