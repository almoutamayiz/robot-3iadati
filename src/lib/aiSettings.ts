export type AiOperationMode = 'auto' | 'environment' | 'secrets_pool';
export type AiModelChoice = 'gemini-3.1-flash-lite' | 'gemini-4-hydrogen';

export interface AiAssistantConfig {
  enabled: boolean;
  operationMode: AiOperationMode;
  model: AiModelChoice;
  allowPatientContext: boolean;
  allowOrgAdvice: boolean;
  autoFallbackOnQuota: boolean;
}

export const DEFAULT_AI_CONFIG: AiAssistantConfig = {
  enabled: true,
  operationMode: 'auto',
  model: 'gemini-3.1-flash-lite',
  allowPatientContext: true,
  allowOrgAdvice: true,
  autoFallbackOnQuota: true,
};

const AI_CONFIG_STORAGE_PREFIX = '3iadati_ai_cfg_v1_';

export function normalizeAiConfig(raw: unknown): AiAssistantConfig {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Partial<AiAssistantConfig>;
  return {
    enabled: typeof src.enabled === 'boolean' ? src.enabled : DEFAULT_AI_CONFIG.enabled,
    operationMode:
      src.operationMode === 'auto' ||
      src.operationMode === 'environment' ||
      src.operationMode === 'secrets_pool'
        ? src.operationMode
        : DEFAULT_AI_CONFIG.operationMode,
    model:
      src.model === 'gemini-3.1-flash-lite' || src.model === 'gemini-4-hydrogen'
        ? src.model
        : DEFAULT_AI_CONFIG.model,
    allowPatientContext:
      typeof src.allowPatientContext === 'boolean'
        ? src.allowPatientContext
        : DEFAULT_AI_CONFIG.allowPatientContext,
    allowOrgAdvice:
      typeof src.allowOrgAdvice === 'boolean'
        ? src.allowOrgAdvice
        : DEFAULT_AI_CONFIG.allowOrgAdvice,
    autoFallbackOnQuota:
      typeof src.autoFallbackOnQuota === 'boolean'
        ? src.autoFallbackOnQuota
        : DEFAULT_AI_CONFIG.autoFallbackOnQuota,
  };
}

export function readLocalAiConfig(clinicId?: string): AiAssistantConfig {
  if (typeof window === 'undefined') return { ...DEFAULT_AI_CONFIG };
  const key = `${AI_CONFIG_STORAGE_PREFIX}${clinicId || 'default'}`;
  try {
    const raw = localStorage.getItem(key);
    return raw ? normalizeAiConfig(JSON.parse(raw)) : { ...DEFAULT_AI_CONFIG };
  } catch {
    return { ...DEFAULT_AI_CONFIG };
  }
}

export function writeLocalAiConfig(clinicId: string | undefined, cfg: AiAssistantConfig): void {
  if (typeof window === 'undefined') return;
  const key = `${AI_CONFIG_STORAGE_PREFIX}${clinicId || 'default'}`;
  try {
    localStorage.setItem(key, JSON.stringify(cfg));
  } catch { /* ignore */ }
}
