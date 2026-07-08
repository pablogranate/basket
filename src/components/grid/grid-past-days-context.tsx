"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

// The "Ver días anteriores" toggle button lives in the desktop toolbar's left
// column while the past-day cards it reveals render down in the content. This
// context is the single source of truth for the open state, shared by the
// toolbar button, the mobile in-content button, and the deferred cards panel.
type GridPastDaysContextValue = {
  open: boolean;
  toggle: () => void;
};

const GridPastDaysContext = createContext<GridPastDaysContextValue | null>(null);

export function GridPastDaysProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <GridPastDaysContext.Provider
      value={{ open, toggle: () => setOpen((current) => !current) }}
    >
      {children}
    </GridPastDaysContext.Provider>
  );
}

export function useGridPastDays() {
  return useContext(GridPastDaysContext);
}
