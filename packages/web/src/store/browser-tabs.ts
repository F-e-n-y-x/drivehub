import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export interface BrowserTab {
  /** Stable id used as React key and to address the tab. */
  id: string;
  /** Selected remote for this tab, or null for a fresh "New tab". */
  remoteId: string | null;
  /** Current folder path within the remote ("" = root). */
  path: string;
}

interface BrowserTabsState {
  tabs: BrowserTab[];
  activeTabId: string;
  /** Open a new tab (optionally seeded) and make it active. */
  addTab: (init?: { remoteId?: string | null; path?: string }) => void;
  /** Close a tab. Always keeps at least one tab open. */
  closeTab: (id: string) => void;
  /** Make a tab active. */
  setActive: (id: string) => void;
  /** Patch the active tab's remote and/or path. */
  updateActiveTab: (patch: { remoteId?: string | null; path?: string }) => void;
}

let counter = 0;
function newId(): string {
  counter += 1;
  // Time + counter keeps ids unique across reloads without a uuid dep.
  return `tab-${Date.now().toString(36)}-${counter}`;
}

function makeTab(init?: { remoteId?: string | null; path?: string }): BrowserTab {
  return {
    id: newId(),
    remoteId: init?.remoteId ?? null,
    path: init?.path ?? "",
  };
}

/**
 * Multi-tab state for the Remote Browser (Windows Explorer / browser-style).
 * Each tab independently remembers its `{remoteId, path}`, so switching tabs
 * restores that view. The clipboard store is separate and global, so copy/cut
 * in one tab can be pasted into another (even on a different remote).
 *
 * Persisted to sessionStorage so a reload keeps your open tabs for the session
 * without leaking them across browser restarts.
 */
export const useBrowserTabsStore = create<BrowserTabsState>()(
  persist(
    (set) => {
      const first = makeTab();
      return {
        tabs: [first],
        activeTabId: first.id,

        addTab: (init) =>
          set((s) => {
            const tab = makeTab(init);
            return { tabs: [...s.tabs, tab], activeTabId: tab.id };
          }),

        closeTab: (id) =>
          set((s) => {
            if (s.tabs.length <= 1) return s; // always keep ≥1 tab
            const idx = s.tabs.findIndex((t) => t.id === id);
            if (idx === -1) return s;
            const tabs = s.tabs.filter((t) => t.id !== id);
            let activeTabId = s.activeTabId;
            if (s.activeTabId === id) {
              // Activate the neighbor (prefer the previous tab).
              const next = tabs[Math.max(0, idx - 1)]!;
              activeTabId = next.id;
            }
            return { tabs, activeTabId };
          }),

        setActive: (id) =>
          set((s) =>
            s.tabs.some((t) => t.id === id) ? { activeTabId: id } : s,
          ),

        updateActiveTab: (patch) =>
          set((s) => ({
            tabs: s.tabs.map((t) =>
              t.id === s.activeTabId
                ? {
                    ...t,
                    remoteId:
                      patch.remoteId !== undefined ? patch.remoteId : t.remoteId,
                    path: patch.path !== undefined ? patch.path : t.path,
                  }
                : t,
            ),
          })),
      };
    },
    {
      name: "drivehub-browser-tabs",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (s) => ({ tabs: s.tabs, activeTabId: s.activeTabId }),
      // Guard against a persisted-but-empty tab list.
      merge: (persisted, current) => {
        const p = persisted as Partial<BrowserTabsState> | undefined;
        if (!p || !Array.isArray(p.tabs) || p.tabs.length === 0) return current;
        const tabs = p.tabs;
        const activeTabId = tabs.some((t) => t.id === p.activeTabId)
          ? p.activeTabId!
          : tabs[0]!.id;
        return { ...current, tabs, activeTabId };
      },
    },
  ),
);
