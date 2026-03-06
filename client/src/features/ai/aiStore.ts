import { create } from 'zustand';

export type AIAction = 'explain' | 'generate' | 'fix' | 'refactor' | 'test' | 'chat' | 'review';

export interface AIMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface ReviewIssue {
  line: number;
  severity: 'error' | 'warning' | 'info';
  message: string;
  fix: string;
}

export interface WorkspaceContext {
  workspaceId: string;
  workspaceName: string;
  fileList: string[];
}

export interface SemanticMatch {
  fileName: string;
  reason: string;
}

export interface CrossFileIssue {
  files: string[];
  severity: 'error' | 'warning' | 'info';
  message: string;
  suggestion: string;
}

export interface MultiFileReviewResult {
  summary: string;
  crossFileIssues: CrossFileIssue[];
  architectureSuggestions: string[];
  integrationRisks: string[];
}

export interface ProjectSummaryResult {
  overview: string;
  mainFiles: { file: string; role: string }[];
  keyFlows: string[];
  risks: string[];
  nextSteps: string[];
}

export interface PRSummaryResult {
  title: string;
  summary: string;
  keyChanges: string[];
  testingChecklist: string[];
  risksAndNotes: string[];
}

export interface ReleaseNotesResult {
  releaseSummary: string;
  features: string[];
  fixes: string[];
  improvements: string[];
  knownIssues: string[];
  upgradeNotes: string[];
}

export interface RepoHealthResult {
  healthScore: number;
  healthLabel: string;
  architectureConcerns: string[];
  maintainabilityRisks: string[];
  testingGaps: string[];
  consistencyIssues: string[];
  topRecommendations: string[];
}

interface AIState {
  messages: AIMessage[];
  loading: boolean;
  workspaceContext: WorkspaceContext | null;
  reviewResults: ReviewIssue[];
  reviewLoading: boolean;
  reviewParseError: string | null;
  commitSuggestions: string[];
  commitSuggestionsLoading: boolean;
  semanticResults: SemanticMatch[];
  semanticLoading: boolean;
  semanticParseError: string | null;
  multiReviewResult: MultiFileReviewResult | null;
  multiReviewLoading: boolean;
  multiReviewParseError: string | null;
  projectSummaryResult: ProjectSummaryResult | null;
  projectSummaryLoading: boolean;
  projectSummaryParseError: string | null;
  // Phase 16
  prSummaryResult: PRSummaryResult | null;
  prSummaryLoading: boolean;
  prSummaryParseError: string | null;
  releaseNotesResult: ReleaseNotesResult | null;
  releaseNotesLoading: boolean;
  releaseNotesParseError: string | null;
  repoHealthResult: RepoHealthResult | null;
  repoHealthLoading: boolean;
  repoHealthParseError: string | null;

  addMessage: (message: AIMessage) => void;
  setLoading: (loading: boolean) => void;
  clearMessages: () => void;
  setWorkspaceContext: (ctx: WorkspaceContext | null) => void;
  setReviewResults: (issues: ReviewIssue[], parseError?: string | null) => void;
  setReviewLoading: (loading: boolean) => void;
  clearReview: () => void;
  setCommitSuggestions: (suggestions: string[]) => void;
  setCommitSuggestionsLoading: (loading: boolean) => void;
  clearCommitSuggestions: () => void;
  setSemanticResults: (matches: SemanticMatch[], parseError?: string | null) => void;
  setSemanticLoading: (loading: boolean) => void;
  clearSemanticResults: () => void;
  setMultiReviewResult: (result: MultiFileReviewResult | null, parseError?: string | null) => void;
  setMultiReviewLoading: (loading: boolean) => void;
  clearMultiReview: () => void;
  setProjectSummaryResult: (summary: ProjectSummaryResult | null, parseError?: string | null) => void;
  setProjectSummaryLoading: (loading: boolean) => void;
  clearProjectSummary: () => void;
  // Phase 16 actions
  setPRSummaryResult: (result: PRSummaryResult | null, parseError?: string | null) => void;
  setPRSummaryLoading: (loading: boolean) => void;
  clearPRSummary: () => void;
  setReleaseNotesResult: (result: ReleaseNotesResult | null, parseError?: string | null) => void;
  setReleaseNotesLoading: (loading: boolean) => void;
  clearReleaseNotes: () => void;
  setRepoHealthResult: (result: RepoHealthResult | null, parseError?: string | null) => void;
  setRepoHealthLoading: (loading: boolean) => void;
  clearRepoHealth: () => void;
}

export const useAIStore = create<AIState>((set) => ({
  messages: [],
  loading: false,
  workspaceContext: null,
  reviewResults: [],
  reviewLoading: false,
  reviewParseError: null,
  commitSuggestions: [],
  commitSuggestionsLoading: false,
  semanticResults: [],
  semanticLoading: false,
  semanticParseError: null,
  multiReviewResult: null,
  multiReviewLoading: false,
  multiReviewParseError: null,
  projectSummaryResult: null,
  projectSummaryLoading: false,
  projectSummaryParseError: null,
  prSummaryResult: null,
  prSummaryLoading: false,
  prSummaryParseError: null,
  releaseNotesResult: null,
  releaseNotesLoading: false,
  releaseNotesParseError: null,
  repoHealthResult: null,
  repoHealthLoading: false,
  repoHealthParseError: null,

  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
  setLoading: (loading) => set({ loading }),
  clearMessages: () => set({ messages: [] }),
  setWorkspaceContext: (ctx) => set({ workspaceContext: ctx }),
  setReviewResults: (issues, parseError = null) => set({ reviewResults: issues, reviewParseError: parseError }),
  setReviewLoading: (loading) => set({ reviewLoading: loading }),
  clearReview: () => set({ reviewResults: [], reviewParseError: null }),
  setCommitSuggestions: (suggestions) => set({ commitSuggestions: suggestions }),
  setCommitSuggestionsLoading: (loading) => set({ commitSuggestionsLoading: loading }),
  clearCommitSuggestions: () => set({ commitSuggestions: [] }),
  setSemanticResults: (matches, parseError = null) => set({ semanticResults: matches, semanticParseError: parseError }),
  setSemanticLoading: (loading) => set({ semanticLoading: loading }),
  clearSemanticResults: () => set({ semanticResults: [], semanticParseError: null }),
  setMultiReviewResult: (result, parseError = null) => set({ multiReviewResult: result, multiReviewParseError: parseError }),
  setMultiReviewLoading: (loading) => set({ multiReviewLoading: loading }),
  clearMultiReview: () => set({ multiReviewResult: null, multiReviewParseError: null }),
  setProjectSummaryResult: (summary, parseError = null) => set({ projectSummaryResult: summary, projectSummaryParseError: parseError }),
  setProjectSummaryLoading: (loading) => set({ projectSummaryLoading: loading }),
  clearProjectSummary: () => set({ projectSummaryResult: null, projectSummaryParseError: null }),
  setPRSummaryResult: (result, parseError = null) => set({ prSummaryResult: result, prSummaryParseError: parseError }),
  setPRSummaryLoading: (loading) => set({ prSummaryLoading: loading }),
  clearPRSummary: () => set({ prSummaryResult: null, prSummaryParseError: null }),
  setReleaseNotesResult: (result, parseError = null) => set({ releaseNotesResult: result, releaseNotesParseError: parseError }),
  setReleaseNotesLoading: (loading) => set({ releaseNotesLoading: loading }),
  clearReleaseNotes: () => set({ releaseNotesResult: null, releaseNotesParseError: null }),
  setRepoHealthResult: (result, parseError = null) => set({ repoHealthResult: result, repoHealthParseError: parseError }),
  setRepoHealthLoading: (loading) => set({ repoHealthLoading: loading }),
  clearRepoHealth: () => set({ repoHealthResult: null, repoHealthParseError: null }),
}));
