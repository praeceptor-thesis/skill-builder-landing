/**
 * Registry data model. Mirrors the canonical types served by the Cloudflare
 * Worker registry (see worker/skill-persistence-worker.js). Kept self-contained
 * in this package, matching the repo convention where web/cli/mcp each carry
 * their own copy rather than importing packages/shared at runtime.
 */

export type SkillExample = {
  title?: string;
  input: string;
  output: string;
};

export type SkillTest = {
  name: string;
  input: string;
  expected: string;
};

export type SkillType = "basic" | "meta";

export type SkillSpec = {
  name: string;
  description: string;
  category: string;
  tags: string[];
  purpose: string;
  instructions: string[];
  promptTemplate: string;
  examples: SkillExample[];
  tests: SkillTest[];
  /** 'basic' (standalone) or 'meta' (orchestrates `dependencies`). */
  type?: SkillType;
  /** Full registry ids of required skills, installed alongside a meta skill. */
  dependencies?: string[];
};

export type Skill = {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  spec?: SkillSpec;
  markdown: string;
  author?: { id: string; name: string; email?: string };
  authorHandle?: string;
  forkedFrom?: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  downloads: number;
  type?: SkillType;
  dependencies?: string[];
};

export type TaxonomyFacet = { value: string; label?: string; count: number };

export type RegistryTaxonomy = {
  total: number;
  categories: TaxonomyFacet[];
  authors: TaxonomyFacet[];
  tags: TaxonomyFacet[];
  types: TaxonomyFacet[];
};

export type SkillSuggestionKind = "skill" | "tag" | "author" | "category";

export type SkillSuggestion = {
  kind: SkillSuggestionKind;
  value: string;
  label: string;
  category?: string;
  type?: SkillType;
  dependencies?: number;
  downloads?: number;
  count?: number;
};

export type SuggestResponse = { suggestions: SkillSuggestion[] };

export type ListSkillsResponse = {
  skills: Skill[];
  total: number;
  page: number;
  pageSize: number;
  facets?: RegistryTaxonomy;
};

export type GetSkillResponse = { skill: Skill };

export type RegistrySearchParams = {
  query?: string;
  category?: string;
  tags?: string[];
  author?: string;
  type?: SkillType;
  sort?: "recent" | "popular" | "downloads" | "relevant";
  page?: number;
  pageSize?: number;
  facets?: boolean;
};

/** Target coding tool that an installed skill is written for. */
export type InstallTarget = "claude" | "codex" | "cursor" | "file";
