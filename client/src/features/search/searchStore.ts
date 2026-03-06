
import { create } from 'zustand';
import { SearchResult } from './searchTypes';

interface SearchState {
  query: string;
  replaceQuery: string;
  results: SearchResult[];
  loading: boolean;
  setQuery: (query: string) => void;
  setReplaceQuery: (replaceQuery: string) => void;
  setResults: (results: SearchResult[]) => void;
  setLoading: (loading: boolean) => void;
}

export const useSearchStore = create<SearchState>((set) => ({
  query: '',
  replaceQuery: '',
  results: [],
  loading: false,
  setQuery: (query) => set({ query }),
  setReplaceQuery: (replaceQuery) => set({ replaceQuery }),
  setResults: (results) => set({ results }),
  setLoading: (loading) => set({ loading }),
}));
