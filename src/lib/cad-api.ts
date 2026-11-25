import type { Enclosure } from '@/lib/cad-enclosure';

export const CAD_HISTORY_LIMIT = 40;
export const CAD_PROMPT_LIMIT = 1000;
export const CAD_LAUNCH_PROMPT = 'layerling:launch-prompt';
export const CAD_PROJECT_NAME_LIMIT = 120;

export interface CadProjectSummary {
  id: string;
  name: string;
  revision: number;
  createdAt: number;
  updatedAt: number;
}

export interface CadProject extends CadProjectSummary {
  versions: Enclosure[];
  index: number;
}

export interface CadProjectInput {
  id?: string;
  name: string;
  revision?: number;
  versions: Enclosure[];
  index: number;
}

export type CadPromptSource = 'ai' | 'rules';

export type CadQuota =
  | { source: 'rules' }
  | { source: 'ai'; limit: number; remaining: number; resetsAt: number };

export interface CadInterpretation {
  params: Enclosure;
  source: CadPromptSource;
  remaining?: number;
}
