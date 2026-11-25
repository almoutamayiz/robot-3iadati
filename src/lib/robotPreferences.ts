import { supabase } from './supabase';

export type RobotTheme = 'white' | 'black' | 'gold' | 'teal' | 'navy';

export type RobotOutfitItem =
  | 'hat'
  | 'glasses'
  | 'headset'
  | 'jacket'
  | 'coat'
  | 'tie'
  | 'steth'
  | 'shoes';

export type RobotMotionLevel = 'calm' | 'normal' | 'off';
export type RobotSize = 's' | 'm' | 'l';
export type RobotPositionMode = 'free' | 'fixed';

export interface RobotPositionPreference {
  mode: RobotPositionMode;
  side: 'left' | 'right';
  yPct: number;
}

export interface RobotBehaviorsPreference {
  greetOnLogin: boolean;
  clapOnSuccess: boolean;
  pointAtMissingFields: boolean;
  waitingAlerts: boolean;
  courierAnimation: boolean;
  waitingThresholdMin: number;
}

export interface RobotPreferences {
  enabled: boolean;
  theme: RobotTheme;
  outfit: RobotOutfitItem[];
  motion: RobotMotionLevel;
  size: RobotSize;
  position: RobotPositionPreference;
  behaviors: RobotBehaviorsPreference;
  hasCustomOverride?: boolean;
}

export interface RobotClinicDefaults {
  theme: RobotTheme;
  outfit: RobotOutfitItem[];
  motion: RobotMotionLevel;
  size: RobotSize;
  behaviors: RobotBehaviorsPreference;
}

export const VALID_ROBOT_THEMES: readonly RobotTheme[] = ['white', 'black', 'gold', 'teal', 'navy'];
export const VALID_ROBOT_OUTFITS: readonly RobotOutfitItem[] = [
  'hat', 'glasses', 'headset', 'jacket', 'coat', 'tie', 'steth', 'shoes',
];

export const DEFAULT_ROBOT_BEHAVIORS: RobotBehaviorsPreference = {
  greetOnLogin: true,
  clapOnSuccess: true,
  pointAtMissingFields: true,
  waitingAlerts: true,
  courierAnimation: true,
  waitingThresholdMin: 15,
};

export const DEFAULT_ROBOT_POSITION: RobotPositionPreference = {
  mode: 'free',
  side: 'right',
  yPct: 0.76,
};

export const DEFAULT_ROBOT_PREFERENCES: RobotPreferences = {
  enabled: true,
  theme: 'white',
  outfit: [],
  motion: 'calm',
  size: 'm',
  position: { ...DEFAULT_ROBOT_POSITION },
  behaviors: { ...DEFAULT_ROBOT_BEHAVIORS },
  hasCustomOverride: false,
};

export const DEFAULT_CLINIC_ROBOT_DEFAULTS: RobotClinicDefaults = {
  theme: 'white',
  outfit: [],
  motion: 'calm',
  size: 'm',
  behaviors: { ...DEFAULT_ROBOT_BEHAVIORS },
};

const USER_PREFS_STORAGE_PREFIX = '3iadati_robot_prefs_v1_';
const CLINIC_DEFAULTS_STORAGE_PREFIX = '3iadati_robot_clinic_defaults_v1_';

export function sanitizeOutfitList(items: unknown): RobotOutfitItem[] {
  if (!Array.isArray(items)) return [];
  const validSet = new Set<string>(VALID_ROBOT_OUTFITS);
  const deduped: RobotOutfitItem[] = [];
  for (const raw of items) {
    if (typeof raw === 'string' && validSet.has(raw) && !deduped.includes(raw as RobotOutfitItem)) {
      deduped.push(raw as RobotOutfitItem);
    }
  }
  if (deduped.includes('jacket') && deduped.includes('coat')) {
    const lastJacket = deduped.lastIndexOf('jacket');
    const lastCoat = deduped.lastIndexOf('coat');
    const dropItem = lastJacket > lastCoat ? 'coat' : 'jacket';
    return deduped.filter((x) => x !== dropItem);
  }
  return deduped;
}

export function normalizeClinicRobotDefaults(raw: unknown): RobotClinicDefaults {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Partial<RobotClinicDefaults>;
  const rawBehaviors = (
    src.behaviors && typeof src.behaviors === 'object' ? src.behaviors : {}
  ) as Partial<RobotBehaviorsPreference>;

  return {
    theme: VALID_ROBOT_THEMES.includes(src.theme as RobotTheme)
      ? (src.theme as RobotTheme)
      : DEFAULT_CLINIC_ROBOT_DEFAULTS.theme,
    outfit: sanitizeOutfitList(src.outfit),
    motion:
      src.motion === 'calm' || src.motion === 'normal' || src.motion === 'off'
        ? src.motion
        : DEFAULT_CLINIC_ROBOT_DEFAULTS.motion,
    size:
      src.size === 's' || src.size === 'm' || src.size === 'l'
        ? src.size
        : DEFAULT_CLINIC_ROBOT_DEFAULTS.size,
    behaviors: {
      greetOnLogin: typeof rawBehaviors.greetOnLogin === 'boolean' ? rawBehaviors.greetOnLogin : DEFAULT_ROBOT_BEHAVIORS.greetOnLogin,
      clapOnSuccess: typeof rawBehaviors.clapOnSuccess === 'boolean' ? rawBehaviors.clapOnSuccess : DEFAULT_ROBOT_BEHAVIORS.clapOnSuccess,
      pointAtMissingFields: typeof rawBehaviors.pointAtMissingFields === 'boolean' ? rawBehaviors.pointAtMissingFields : DEFAULT_ROBOT_BEHAVIORS.pointAtMissingFields,
      waitingAlerts: typeof rawBehaviors.waitingAlerts === 'boolean' ? rawBehaviors.waitingAlerts : DEFAULT_ROBOT_BEHAVIORS.waitingAlerts,
      courierAnimation: typeof rawBehaviors.courierAnimation === 'boolean' ? rawBehaviors.courierAnimation : DEFAULT_ROBOT_BEHAVIORS.courierAnimation,
      waitingThresholdMin:
        typeof rawBehaviors.waitingThresholdMin === 'number' && Number.isFinite(rawBehaviors.waitingThresholdMin)
          ? Math.max(5, Math.min(60, Math.round(rawBehaviors.waitingThresholdMin)))
          : DEFAULT_ROBOT_BEHAVIORS.waitingThresholdMin,
    },
  };
}

export function normalizeRobotPreferences(
  raw: unknown,
  clinicDefaults?: Partial<RobotClinicDefaults> | null
): RobotPreferences {
  const baseDefaults = normalizeClinicRobotDefaults(clinicDefaults || DEFAULT_CLINIC_ROBOT_DEFAULTS);
  const src = (raw && typeof raw === 'object' ? raw : null) as Partial<RobotPreferences> | null;

  if (!src) {
    return {
      enabled: true,
      theme: baseDefaults.theme,
      outfit: [...baseDefaults.outfit],
      motion: baseDefaults.motion,
      size: baseDefaults.size,
      position: { ...DEFAULT_ROBOT_POSITION },
      behaviors: { ...baseDefaults.behaviors },
      hasCustomOverride: false,
    };
  }

  const hasCustomOverride = src.hasCustomOverride === true;
  const rawPos = (src.position && typeof src.position === 'object' ? src.position : {}) as Partial<RobotPositionPreference>;
  const rawBehaviors = (src.behaviors && typeof src.behaviors === 'object' ? src.behaviors : {}) as Partial<RobotBehaviorsPreference>;

  const yPctRaw = typeof rawPos.yPct === 'number' && Number.isFinite(rawPos.yPct) ? rawPos.yPct : DEFAULT_ROBOT_POSITION.yPct;
  const clampedYPct = yPctRaw > 1 ? Math.max(0.05, Math.min(0.95, yPctRaw / 100)) : Math.max(0.05, Math.min(0.95, yPctRaw));

  if (!hasCustomOverride && clinicDefaults) {
    return {
      enabled: typeof src.enabled === 'boolean' ? src.enabled : true,
      theme: baseDefaults.theme,
      outfit: [...baseDefaults.outfit],
      motion: baseDefaults.motion,
      size: baseDefaults.size,
      position: {
        mode: rawPos.mode === 'fixed' || rawPos.mode === 'free' ? rawPos.mode : DEFAULT_ROBOT_POSITION.mode,
        side: rawPos.side === 'left' || rawPos.side === 'right' ? rawPos.side : DEFAULT_ROBOT_POSITION.side,
        yPct: clampedYPct,
      },
      behaviors: { ...baseDefaults.behaviors },
      hasCustomOverride: false,
    };
  }

  return {
    enabled: typeof src.enabled === 'boolean' ? src.enabled : true,
    theme: VALID_ROBOT_THEMES.includes(src.theme as RobotTheme) ? (src.theme as RobotTheme) : baseDefaults.theme,
    outfit: src.outfit !== undefined ? sanitizeOutfitList(src.outfit) : [...baseDefaults.outfit],
    motion: src.motion === 'calm' || src.motion === 'normal' || src.motion === 'off' ? src.motion : baseDefaults.motion,
    size: src.size === 's' || src.size === 'm' || src.size === 'l' ? src.size : baseDefaults.size,
    position: {
      mode: rawPos.mode === 'fixed' || rawPos.mode === 'free' ? rawPos.mode : DEFAULT_ROBOT_POSITION.mode,
      side: rawPos.side === 'left' || rawPos.side === 'right' ? rawPos.side : DEFAULT_ROBOT_POSITION.side,
      yPct: clampedYPct,
    },
    behaviors: {
      greetOnLogin: typeof rawBehaviors.greetOnLogin === 'boolean' ? rawBehaviors.greetOnLogin : baseDefaults.behaviors.greetOnLogin,
      clapOnSuccess: typeof rawBehaviors.clapOnSuccess === 'boolean' ? rawBehaviors.clapOnSuccess : baseDefaults.behaviors.clapOnSuccess,
      pointAtMissingFields: typeof rawBehaviors.pointAtMissingFields === 'boolean' ? rawBehaviors.pointAtMissingFields : baseDefaults.behaviors.pointAtMissingFields,
      waitingAlerts: typeof rawBehaviors.waitingAlerts === 'boolean' ? rawBehaviors.waitingAlerts : baseDefaults.behaviors.waitingAlerts,
      courierAnimation: typeof rawBehaviors.courierAnimation === 'boolean' ? rawBehaviors.courierAnimation : baseDefaults.behaviors.courierAnimation,
      waitingThresholdMin:
        typeof rawBehaviors.waitingThresholdMin === 'number' && Number.isFinite(rawBehaviors.waitingThresholdMin)
          ? Math.max(5, Math.min(60, Math.round(rawBehaviors.waitingThresholdMin)))
          : baseDefaults.behaviors.waitingThresholdMin,
    },
    hasCustomOverride,
  };
}

export function resolveRobotUserKey(role: string, userId?: string, clinicId?: string): string {
  if (role === 'receptionist') return `nurse_${clinicId || 'clinic'}`;
  if (role === 'doctor' || role === 'dr' || role === 'clinic_owner') return `doc_${userId || clinicId || 'clinic'}`;
  if (userId && userId !== 'user_guest') return userId;
  return 'public_guest';
}

export function readLocalUserRobotPrefs(userKey: string, clinicDefaults?: Partial<RobotClinicDefaults> | null): RobotPreferences {
  if (typeof window === 'undefined' || !userKey) return normalizeRobotPreferences(null, clinicDefaults);
  try {
    const raw = localStorage.getItem(`${USER_PREFS_STORAGE_PREFIX}${userKey}`);
    return raw ? normalizeRobotPreferences(JSON.parse(raw), clinicDefaults) : normalizeRobotPreferences(null, clinicDefaults);
  } catch {
    return normalizeRobotPreferences(null, clinicDefaults);
  }
}

export function writeLocalUserRobotPrefs(userKey: string, prefs: RobotPreferences): void {
  if (typeof window === 'undefined' || !userKey) return;
  try {
    localStorage.setItem(`${USER_PREFS_STORAGE_PREFIX}${userKey}`, JSON.stringify(prefs));
  } catch { /* ignore */ }
}

export function readLocalClinicRobotDefaults(clinicId?: string): RobotClinicDefaults | null {
  if (typeof window === 'undefined' || !clinicId) return null;
  try {
    const raw = localStorage.getItem(`${CLINIC_DEFAULTS_STORAGE_PREFIX}${clinicId}`);
    return raw ? normalizeClinicRobotDefaults(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function writeLocalClinicRobotDefaults(clinicId: string, defaults: RobotClinicDefaults): void {
  if (typeof window === 'undefined' || !clinicId) return;
  try {
    localStorage.setItem(`${CLINIC_DEFAULTS_STORAGE_PREFIX}${clinicId}`, JSON.stringify(defaults));
  } catch { /* ignore */ }
}

export async function fetchUserRobotPrefsFromSupabase(
  userKey: string,
  clinicId: string,
  clinicDefaults?: Partial<RobotClinicDefaults> | null
): Promise<RobotPreferences | null> {
  if (!userKey || !clinicId) return null;
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const authUserId = sessionData.session?.user.id;
    if (!authUserId) return null;
    const { data, error } = await supabase
      .from('user_robot_preferences')
      .select('preferences')
      .eq('user_id', authUserId)
      .eq('clinic_id', clinicId)
      .maybeSingle();
    if (error || !data?.preferences) return null;
    return normalizeRobotPreferences(data.preferences, clinicDefaults);
  } catch {
    return null;
  }
}

export async function saveUserRobotPrefsToSupabase(
  userKey: string,
  clinicId: string,
  prefs: RobotPreferences
): Promise<boolean> {
  if (!userKey || !clinicId) return false;
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const authUserId = sessionData.session?.user.id;
    if (!authUserId) return false;
    const { error } = await supabase.from('user_robot_preferences').upsert(
      {
        user_id: authUserId,
        clinic_id: clinicId,
        preferences: prefs,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,clinic_id' }
    );
    return !error;
  } catch {
    return false;
  }
}
