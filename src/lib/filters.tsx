import { createContext, useContext, useState, type ReactNode } from 'react';

import { DEFAULT_FILTERS, type SearchFilters } from './vehicles';

type FiltersState = {
  filters: SearchFilters;
  setFilters: (f: SearchFilters) => void;
};

const FiltersContext = createContext<FiltersState | null>(null);

// Shared between the Explore tab and the Filters screen.
export function FiltersProvider({ children }: { children: ReactNode }) {
  const [filters, setFilters] = useState<SearchFilters>(DEFAULT_FILTERS);
  return (
    <FiltersContext.Provider value={{ filters, setFilters }}>{children}</FiltersContext.Provider>
  );
}

export function useFilters() {
  const ctx = useContext(FiltersContext);
  if (!ctx) throw new Error('useFilters must be used inside FiltersProvider');
  return ctx;
}
