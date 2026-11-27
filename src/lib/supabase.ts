import { createClient, type User } from '@supabase/supabase-js';
import type {
  AdwiaDrugRecord,
  ClinicAccountingEntry,
  ClinicMessageRecord,
  ClinicRecord,
  ClinicRevenueSummary,
  ClinicRole,
  ClinicScheduleRecord,
  DoctorRecord,
  MedicalProtocolRecord,
  MedicalServiceRecord,
  MedicalVisitRecord,
  PatientDocumentRecord,
  PatientRecord,
  PrescriptionRecord,
  ProfileRecord,
  WaitingItem,
  WaitingQueueRecord,
} from '../types/robot';

export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://bjrnyvyxldwxytbureyp.supabase.co';
export const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'sb_publishable_4qIti3E8QklNBmOX85B2RA_WG9JHmIM';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export const ACTIVE_WAITING_STATUSES = new Set([
  'patient_arrived',
  'confirmed',
  'waiting',
  'new',
  'pending_confirmation',
  'in_visit',
]);

export const PAST_TERMINAL_STATUSES = new Set([
  'completed',
  'cancelled',
  'no_show',
]);

export function getAppointmentEffectiveDate(apt: Pick<WaitingItem, 'booking_date' | 'start_at' | 'created_at'>): string {
  const bd = String(apt.booking_date || '').trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(bd)) return bd;
  if (apt.start_at) return formatAlgiersDate(apt.start_at);
  if (apt.created_at) return formatAlgiersDate(apt.created_at);
  return '';
}

export function isPastAppointment(apt: WaitingItem, todayDate = getTodayAlgiersDate()): boolean {
  const status = String(apt.status || '').toLowerCase();
  if (PAST_TERMINAL_STATUSES.has(status)) return true;
  if (status === 'in_visit' || status === 'waiting' || status === 'patient_arrived') return false;
  const dateStr = getAppointmentEffectiveDate(apt);
  return Boolean(dateStr && dateStr < todayDate);
}

export function isUpcomingAppointment(apt: WaitingItem, todayDate = getTodayAlgiersDate()): boolean {
  const status = String(apt.status || '').toLowerCase();
  if (PAST_TERMINAL_STATUSES.has(status)) return false;
  const dateStr = getAppointmentEffectiveDate(apt);
  return Boolean(dateStr && dateStr >= todayDate);
}

// --- Formatting & Algiers Timezone Helpers (Strict Western Digits 0123456789) ---

export function toWesternDigits(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

export function getTodayAlgiersDate(): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Algiers',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const y = parts.find((p) => p.type === 'year')?.value || '2026';
    const m = parts.find((p) => p.type === 'month')?.value || '01';
    const d = parts.find((p) => p.type === 'day')?.value || '01';
    return `${y}-${m}-${d}`;
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export function formatAlgiersTime(value?: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return toWesternDigits(value);
  return toWesternDigits(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Algiers',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d)
  );
}

export function formatAlgiersDate(value?: string | null): string {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    return toWesternDigits(value.slice(0, 10));
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return toWesternDigits(value);
  return toWesternDigits(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Algiers',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d)
  );
}

export function getClinicDisplayName(clinic: ClinicRecord | null | undefined): string {
  if (!clinic) return 'عيادتي';
  return clinic.name || clinic.clinic_name || `عيادة ${clinic.doctor_name || clinic.id}`;
}

export function getClinicImageUrl(
  clinic?: ClinicRecord | null,
  doctorProfile?: DoctorRecord | null,
  userProfile?: ProfileRecord | null
): string | null {
  const candidates = [
    clinic?.logo_path,
    clinic?.doctor_photo,
    doctorProfile?.photo_path,
    userProfile?.avatar_url,
    clinic?.cover_path,
  ];
  for (const raw of candidates) {
    const val = typeof raw === 'string' ? raw.trim() : '';
    if (!val) continue;
    if (
      val.startsWith('http://') ||
      val.startsWith('https://') ||
      val.startsWith('data:') ||
      val.startsWith('/')
    ) {
      return val;
    }
    return `${SUPABASE_URL}/storage/v1/object/public/clinic-assets/${val.replace(/^\/+/, '')}`;
  }
  return null;
}

export function getPatientDisplayName(p: PatientRecord | null | undefined): string {
  if (!p) return 'مريض';
  return p.full_name || 'مريض بدون اسم';
}

export function calculatePatientAge(
  dateOfBirth?: string | null,
  explicitAge?: number | null
): number | null {
  if (typeof explicitAge === 'number' && Number.isFinite(explicitAge) && explicitAge >= 0) {
    return explicitAge;
  }
  if (!dateOfBirth) return null;
  const parsed = new Date(dateOfBirth);
  if (Number.isNaN(parsed.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - parsed.getFullYear();
  const m = now.getMonth() - parsed.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < parsed.getDate())) {
    age -= 1;
  }
  return age >= 0 && age < 130 ? age : null;
}

export function isDocCertificateVisit(visit: MedicalVisitRecord): boolean {
  return String(visit.clinical_notes || '').trim().startsWith('[DOC]');
}

export function parseAppointmentNotes(raw?: string | null): {
  cleanNotes: string;
  attachments: string[];
  docFee: number | null;
} {
  let text = String(raw || '');
  const attachments: string[] = [];

  text = text.replace(/\[DOC_ATTACHMENTS\]([\s\S]*?)\[\/DOC_ATTACHMENTS\]/g, (_m, inner) => {
    const trimmed = String(inner || '').trim();
    if (trimmed) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          parsed.forEach((item) => {
            if (typeof item === 'string') attachments.push(item);
            else if (item && typeof item === 'object') {
              attachments.push(String((item as Record<string, unknown>).name || (item as Record<string, unknown>).url || JSON.stringify(item)));
            }
          });
        } else {
          attachments.push(trimmed);
        }
      } catch {
        attachments.push(trimmed);
      }
    }
    return '';
  });

  let docFee: number | null = null;
  text = text.replace(/\[DOC_FEE:(\d+(?:\.\d+)?)\]/g, (_m, numStr) => {
    const num = Number(numStr);
    if (Number.isFinite(num)) docFee = num;
    return '';
  });

  return {
    cleanNotes: text.trim(),
    attachments,
    docFee,
  };
}

export function resolveAppointmentFee(
  apt: WaitingItem,
  services: MedicalServiceRecord[],
  clinic: ClinicRecord | null
): number {
  if (typeof apt.fee === 'number' && Number.isFinite(apt.fee) && apt.fee > 0) {
    return apt.fee;
  }
  const parsed = parseAppointmentNotes(apt.administrative_notes);
  if (parsed.docFee !== null && parsed.docFee > 0) {
    return parsed.docFee;
  }
  if (apt.service_id) {
    const svc = services.find((s) => s.id === apt.service_id);
    if (svc && typeof svc.price === 'number' && Number.isFinite(svc.price) && svc.price > 0) {
      return svc.price;
    }
  }
  return clinic?.consultation_fee && Number.isFinite(Number(clinic.consultation_fee))
    ? Number(clinic.consultation_fee)
    : 1500;
}

function formatSupabaseErr(table: string, error: { code?: string; message: string } | null): string | null {
  if (!error) return null;
  return `${table}: ${error.code ? `[${error.code}] ` : ''}${error.message}`;
}

export interface PlatformLoginResult {
  success: boolean;
  authUser: User | null;
  clinic: ClinicRecord | null;
  role: ClinicRole;
  accountEmail: string;
  accountName: string;
  userIdForPrefs: string;
  error: string | null;
}

// --- Doctor-Only Hybrid Platform Auth (Read-Only aligned with 3iadati spec Section 3) ---

export async function signInPlatformAccount(
  emailInput: string,
  password: string
): Promise<PlatformLoginResult> {
  const emailNorm = emailInput.trim().toLowerCase();
  if (!emailNorm || !password) {
    return {
      success: false,
      authUser: null,
      clinic: null,
      role: 'doctor',
      accountEmail: emailNorm,
      accountName: '',
      userIdForPrefs: '',
      error: 'يرجى إدخال البريد الإلكتروني وكلمة المرور.',
    };
  }

  let clinicsSelectError: string | null = null;

  try {
    // Reject receptionist / assistant email explicitly (Doctor-only app)
    const { data: assistantCheck } = await supabase
      .from('clinics')
      .select('id, assistant_email')
      .ilike('assistant_email', emailNorm)
      .limit(1)
      .maybeSingle();

    if (assistantCheck) {
      return {
        success: false,
        authUser: null,
        clinic: null,
        role: 'doctor',
        accountEmail: emailNorm,
        accountName: '',
        userIdForPrefs: '',
        error: 'هذا التطبيق مخصص للأطباء فقط. لا يمكن الدخول بحساب الممرض أو الاستقبال.',
      };
    }

    // Step 1: Lookup in public.clinics directly by email (not public_clinics, which omits doctor_password)
    const { data: clinicRows, error: clinicErr } = await supabase
      .from('clinics')
      .select('*')
      .ilike('email', emailNorm)
      .limit(10);

    if (clinicErr) {
      clinicsSelectError = formatSupabaseErr('clinics', clinicErr);
    }

    const candidateClinics: ClinicRecord[] = Array.isArray(clinicRows)
      ? (clinicRows as unknown as ClinicRecord[])
      : [];

    // Prioritize clinic with real patient data or 'clinic_1'
    if (candidateClinics.length > 1) {
      candidateClinics.sort((a, b) => {
        if (a.id === 'clinic_1') return -1;
        if (b.id === 'clinic_1') return 1;
        return 0;
      });
    }

    const matchedClinic = candidateClinics[0] || null;

    // Step 2a: Direct doctor_password match if present on public.clinics
    if (matchedClinic?.doctor_password && String(matchedClinic.doctor_password) === password) {
      const { doctor_password: _dp, ...safeClinic } = matchedClinic;
      const clinicId = safeClinic.id || (emailNorm === 'ghouila681@gmail.com' ? 'clinic_1' : '');
      const userId = safeClinic.owner_user_id || 'user_doc_owner';
      return {
        success: true,
        authUser: null,
        clinic: { ...safeClinic, id: clinicId } as ClinicRecord,
        role: 'doctor',
        accountEmail: emailNorm,
        accountName: safeClinic.doctor_name || 'الطبيب',
        userIdForPrefs: userId,
        error: null,
      };
    }

    // Step 2b: Check doctor_subscription_requests password if registered there
    const { data: subReq } = await supabase
      .from('doctor_subscription_requests')
      .select('id, email, password, status, approved_clinic_id, doctor_name')
      .ilike('email', emailNorm)
      .limit(1)
      .maybeSingle();

    if (subReq && String((subReq as Record<string, unknown>).password || '') === password) {
      const approvedClinicId = String((subReq as Record<string, unknown>).approved_clinic_id || '');
      let resolvedClinic: ClinicRecord | null = matchedClinic;
      if (!resolvedClinic && approvedClinicId) {
        resolvedClinic = await fetchClinicById(approvedClinicId);
      }
      if (!resolvedClinic && emailNorm === 'ghouila681@gmail.com') {
        resolvedClinic = (await fetchClinicById('clinic_1')) || {
          id: 'clinic_1',
          owner_user_id: 'user_doc_ghouil',
          email: emailNorm,
          doctor_name: String((subReq as Record<string, unknown>).doctor_name || 'الطبيب'),
        };
      }
      if (resolvedClinic) {
        const { doctor_password: _dp, ...safeClinic } = resolvedClinic;
        return {
          success: true,
          authUser: null,
          clinic: safeClinic as ClinicRecord,
          role: 'doctor',
          accountEmail: emailNorm,
          accountName:
            safeClinic.doctor_name ||
            String((subReq as Record<string, unknown>).doctor_name || 'الطبيب'),
          userIdForPrefs: safeClinic.owner_user_id || 'user_doc_owner',
          error: null,
        };
      }
    }

    // Step 2c: Supabase Auth signInWithPassword
    const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
      email: emailNorm,
      password,
    });

    if (!authErr && authData.user) {
      const resolved = await resolveClinicForAuthUser(authData.user, emailNorm);
      if (resolved.detectedRole !== 'doctor') {
        await signOutPlatformAccount();
        return {
          success: false,
          authUser: null,
          clinic: null,
          role: 'doctor',
          accountEmail: emailNorm,
          accountName: '',
          userIdForPrefs: '',
          error: 'هذا التطبيق مخصص للأطباء فقط. لا يمكن الدخول بحساب الممرض أو الاستقبال.',
        };
      }

      // Prioritize the clinic that actually has records over empty placeholders
      const finalClinic =
        resolved.primaryClinic ||
        matchedClinic ||
        (emailNorm === 'ghouila681@gmail.com'
          ? (await fetchClinicById('clinic_1')) || {
              id: 'clinic_1',
              owner_user_id: 'user_doc_ghouil',
              email: emailNorm,
              name: 'عيادتي',
              doctor_name: String(authData.user.user_metadata?.full_name || 'الطبيب'),
            }
          : null);

      if (finalClinic) {
        const { doctor_password: _dp, ...safeClinic } = finalClinic;
        return {
          success: true,
          authUser: authData.user,
          clinic: safeClinic as ClinicRecord,
          role: 'doctor',
          accountEmail: authData.user.email || emailNorm,
          accountName:
            safeClinic.doctor_name ||
            String(authData.user.user_metadata?.full_name || 'الطبيب'),
          userIdForPrefs: safeClinic.owner_user_id || authData.user.id || 'user_doc_owner',
          error: null,
        };
      }
    }

    // Step 2d: Read-Only verification RPC fallback (if SELECT on clinics wasn't granted yet or passwords live in private schema)
    const { data: rpcData, error: rpcErr } = await supabase.rpc('verify_clinic_login', {
      p_email: emailNorm,
      p_password: password,
    });

    if (!rpcErr && rpcData && typeof rpcData === 'object') {
      const payload = rpcData as {
        success?: boolean;
        role?: ClinicRole;
        clinic?: ClinicRecord;
        account_name?: string;
        user_id_for_prefs?: string;
      };
      if (payload.success && payload.clinic) {
        if (payload.role === 'receptionist') {
          return {
            success: false,
            authUser: null,
            clinic: null,
            role: 'doctor',
            accountEmail: emailNorm,
            accountName: '',
            userIdForPrefs: '',
            error: 'هذا التطبيق مخصص للأطباء فقط. لا يمكن الدخول بحساب الممرض أو الاستقبال.',
          };
        }
        const clinicId =
          payload.clinic.id || (emailNorm === 'ghouila681@gmail.com' ? 'clinic_1' : '');
        return {
          success: true,
          authUser: null,
          clinic: { ...payload.clinic, id: clinicId },
          role: 'doctor',
          accountEmail: emailNorm,
          accountName: payload.account_name || payload.clinic.doctor_name || 'الطبيب',
          userIdForPrefs:
            payload.clinic.owner_user_id || payload.user_id_for_prefs || 'user_doc_owner',
          error: null,
        };
      }
    }

    const rpcErrText = rpcErr ? formatSupabaseErr('verify_clinic_login', rpcErr) : null;
    const permissionIssues = [clinicsSelectError, rpcErrText].filter(Boolean);

    return {
      success: false,
      authUser: null,
      clinic: null,
      role: 'doctor',
      accountEmail: emailNorm,
      accountName: '',
      userIdForPrefs: '',
      error:
        permissionIssues.length > 0
          ? `تعذر التحقق من الصلاحيات في Supabase (${permissionIssues.join(' | ')}). تأكد من تشغيل كود صلاحيات القراءة (GRANT SELECT) في مشروع bjrnyvyxldwxytbureyp.`
          : 'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
    };
  } catch (err) {
    return {
      success: false,
      authUser: null,
      clinic: null,
      role: 'doctor',
      accountEmail: emailNorm,
      accountName: '',
      userIdForPrefs: '',
      error: err instanceof Error ? err.message : 'تعذر تسجيل الدخول، تحقق من الاتصال.',
    };
  }
}

export async function signOutPlatformAccount(): Promise<void> {
  try {
    await supabase.auth.signOut();
  } catch { /* ignore */ }
}

export async function resolveClinicForAuthUser(
  authUser: User,
  emailOverride?: string
): Promise<{
  clinics: ClinicRecord[];
  primaryClinic: ClinicRecord | null;
  detectedRole: ClinicRole;
}> {
  let detectedRole: ClinicRole = 'doctor';
  const metaRole = String(authUser.user_metadata?.role || '').toLowerCase();
  if (metaRole === 'receptionist' || metaRole === 'nurse') {
    detectedRole = 'receptionist';
  }

  const emailNorm = (emailOverride || authUser.email || '').trim().toLowerCase();
  const foundClinics: ClinicRecord[] = [];
  const seenIds = new Set<string>();
  const addClinic = (c: ClinicRecord | null | undefined) => {
    if (c && c.id && !seenIds.has(c.id)) {
      const { doctor_password: _dp, ...safe } = c;
      seenIds.add(c.id);
      foundClinics.push(safe as ClinicRecord);
    }
  };

  // 1. Lookup by email in public.clinics first
  if (emailNorm) {
    const { data: byEmail } = await supabase
      .from('clinics')
      .select('*')
      .ilike('email', emailNorm)
      .limit(5);
    if (Array.isArray(byEmail)) {
      byEmail.forEach((row) => addClinic(row as unknown as ClinicRecord));
    }
  }

  // 2. Lookup by owner_user_id = authUser.id
  const { data: byOwner } = await supabase
    .from('clinics')
    .select('*')
    .eq('owner_user_id', authUser.id)
    .limit(5);
  if (Array.isArray(byOwner)) {
    byOwner.forEach((row) => addClinic(row as unknown as ClinicRecord));
  }

  // 3. Lookup via doctors.user_id = authUser.id
  try {
    const { data: doctorRows } = await supabase
      .from('doctors')
      .select('clinic_id')
      .eq('user_id', authUser.id);
    if (Array.isArray(doctorRows) && doctorRows.length > 0) {
      const ids = doctorRows
        .map((r) => (typeof r.clinic_id === 'string' ? r.clinic_id : ''))
        .filter(Boolean);
      if (ids.length > 0) {
        const { data: docClinics } = await supabase.from('clinics').select('*').in('id', ids);
        if (Array.isArray(docClinics)) {
          docClinics.forEach((row) => addClinic(row as unknown as ClinicRecord));
        }
      }
    }
  } catch { /* ignore */ }

  // 4. Ensure clinic_1 is included for ghouila681@gmail.com
  if (emailNorm === 'ghouila681@gmail.com') {
    const c1Already = foundClinics.some((c) => c.id === 'clinic_1');
    if (!c1Already) {
      const fallbackC1 = await fetchClinicById('clinic_1');
      if (fallbackC1) addClinic(fallbackC1);
    }
  }

  // 5. If multiple clinics found, sort them so that clinics with patients/appointments come first
  if (foundClinics.length > 1) {
    try {
      const cIds = foundClinics.map((c) => c.id);
      const [patCountsRes, aptCountsRes] = await Promise.all([
        supabase.from('patients').select('clinic_id').in('clinic_id', cIds).limit(100),
        supabase.from('appointments').select('clinic_id').in('clinic_id', cIds).limit(100),
      ]);

      const scores = new Map<string, number>();
      if (Array.isArray(patCountsRes.data)) {
        patCountsRes.data.forEach((r) => {
          scores.set(r.clinic_id, (scores.get(r.clinic_id) || 0) + 2);
        });
      }
      if (Array.isArray(aptCountsRes.data)) {
        aptCountsRes.data.forEach((r) => {
          scores.set(r.clinic_id, (scores.get(r.clinic_id) || 0) + 1);
        });
      }

      foundClinics.sort((a, b) => {
        if (a.id === 'clinic_1') return -1;
        if (b.id === 'clinic_1') return 1;
        return (scores.get(b.id) || 0) - (scores.get(a.id) || 0);
      });
    } catch {
      // Fallback: put clinic_1 first if present
      foundClinics.sort((a, b) => (a.id === 'clinic_1' ? -1 : b.id === 'clinic_1' ? 1 : 0));
    }
  }

  return {
    clinics: foundClinics,
    primaryClinic: foundClinics[0] || null,
    detectedRole,
  };
}

export async function sendClinicTeamMessage(
  clinicId: string,
  senderRole: 'doctor' | 'nurse' | 'receptionist',
  senderName: string,
  messageText: string
): Promise<{ success: boolean; data?: ClinicMessageRecord; error?: string }> {
  const cleanMsg = messageText.trim();
  if (!cleanMsg || !clinicId) {
    return { success: false, error: 'الرسالة أو معرف العيادة غير صالح.' };
  }

  try {
    const { data, error } = await supabase
      .from('clinic_messages')
      .insert({
        clinic_id: clinicId,
        sender_role: senderRole,
        sender_name: senderName,
        message: cleanMsg,
      })
      .select('*')
      .maybeSingle();

    if (error) {
      return {
        success: false,
        error: formatSupabaseErr('clinic_messages', error) || error.message,
      };
    }
    return { success: true, data: data as unknown as ClinicMessageRecord };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'تعذر إرسال الرسالة إلى قاعدة البيانات.',
    };
  }
}

export async function fetchClinicById(clinicId: string): Promise<ClinicRecord | null> {
  if (!clinicId) return null;
  try {
    const { data, error } = await supabase
      .from('clinics')
      .select('*')
      .eq('id', clinicId)
      .maybeSingle();
    if (!error && data) {
      const { doctor_password: _dp, ...safe } = data as unknown as ClinicRecord;
      return safe as ClinicRecord;
    }

    const { data: pubData, error: pubErr } = await supabase
      .from('public_clinics')
      .select('*')
      .eq('id', clinicId)
      .maybeSingle();
    if (!pubErr && pubData) return pubData as ClinicRecord;
    return null;
  } catch {
    return null;
  }
}

export interface ClinicLiveSnapshot {
  clinic: ClinicRecord | null;
  doctorProfile: DoctorRecord | null;
  userProfile: ProfileRecord | null;
  schedules: ClinicScheduleRecord[];
  patients: PatientRecord[];
  waitingList: WaitingItem[];
  appointments: WaitingItem[];
  waitingQueue: WaitingQueueRecord[];
  clinicalVisits: MedicalVisitRecord[];
  issuedDocuments: MedicalVisitRecord[];
  prescriptions: PrescriptionRecord[];
  patientDocuments: PatientDocumentRecord[];
  services: MedicalServiceRecord[];
  messages: ClinicMessageRecord[];
  accountingEntries: ClinicAccountingEntry[];
  revenueSummary: ClinicRevenueSummary | null;
  errors: string[];
  error: string | null;
}

export async function fetchClinicSnapshot(
  clinicId: string,
  ownerUserId?: string | null
): Promise<ClinicLiveSnapshot> {
  const empty: ClinicLiveSnapshot = {
    clinic: null,
    doctorProfile: null,
    userProfile: null,
    schedules: [],
    patients: [],
    waitingList: [],
    appointments: [],
    waitingQueue: [],
    clinicalVisits: [],
    issuedDocuments: [],
    prescriptions: [],
    patientDocuments: [],
    services: [],
    messages: [],
    accountingEntries: [],
    revenueSummary: null,
    errors: [],
    error: null,
  };

  if (!clinicId || clinicId === 'clinic_demo_local') {
    return empty;
  }

  const today = getTodayAlgiersDate();
  const monthStart = `${today.slice(0, 7)}-01`;

  const [
    clinicRes,
    doctorsRes,
    schedulesRes,
    patientsRes,
    appointmentsRes,
    queueRes,
    visitsRes,
    prescriptionsRes,
    documentsRes,
    servicesRes,
    messagesRes,
    accountingRes,
    revenueRes,
    profileRes,
  ] = await Promise.all([
    supabase.from('clinics').select('*').eq('id', clinicId).maybeSingle(),
    supabase.from('doctors').select('*').eq('clinic_id', clinicId).limit(10),
    supabase.from('clinic_schedules').select('*').eq('clinic_id', clinicId),
    supabase
      .from('patients')
      .select('*')
      .eq('clinic_id', clinicId)
      .order('created_at', { ascending: false })
      .limit(1000),
    supabase
      .from('appointments')
      .select('*')
      .eq('clinic_id', clinicId)
      .order('booking_date', { ascending: false })
      .order('queue_number', { ascending: true })
      .limit(500),
    supabase
      .from('waiting_queue')
      .select('*')
      .eq('clinic_id', clinicId)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('medical_visits')
      .select('*')
      .eq('clinic_id', clinicId)
      .order('created_at', { ascending: false })
      .limit(80),
    supabase
      .from('prescriptions')
      .select('*')
      .eq('clinic_id', clinicId)
      .order('created_at', { ascending: false })
      .limit(60),
    supabase
      .from('patient_documents')
      .select('*')
      .eq('clinic_id', clinicId)
      .order('created_at', { ascending: false })
      .limit(60),
    supabase.from('medical_services').select('*').eq('clinic_id', clinicId).eq('is_active', true),
    supabase
      .from('clinic_messages')
      .select('*')
      .eq('clinic_id', clinicId)
      .order('created_at', { ascending: true })
      .limit(100),
    supabase
      .from('clinic_accounting_entries')
      .select('*')
      .eq('clinic_id', clinicId)
      .order('entry_date', { ascending: false })
      .limit(40),
    supabase.rpc('get_clinic_revenue_summary', {
      p_clinic_id: clinicId,
      p_from_date: monthStart,
      p_to_date: today,
      p_only_realized: true,
    }),
    ownerUserId
      ? supabase.from('profiles').select('*').eq('id', ownerUserId).maybeSingle()
      : supabase.from('profiles').select('*').eq('clinic_id', clinicId).limit(1).maybeSingle(),
  ]);

  const errors: string[] = [];
  const trackErr = (table: string, res: { error: { code?: string; message: string } | null }) => {
    const formatted = formatSupabaseErr(table, res.error);
    if (formatted) errors.push(formatted);
  };

  trackErr('clinics', clinicRes);
  trackErr('doctors', doctorsRes);
  trackErr('patients', patientsRes);
  trackErr('appointments', appointmentsRes);
  trackErr('medical_visits', visitsRes);
  trackErr('prescriptions', prescriptionsRes);
  trackErr('patient_documents', documentsRes);
  trackErr('clinic_messages', messagesRes);
  // Secondary tables (report if 42501 permission denied, ignore missing optional table)
  if (schedulesRes.error && !schedulesRes.error.message.includes('Could not find')) {
    trackErr('clinic_schedules', schedulesRes);
  }
  if (accountingRes.error && !accountingRes.error.message.includes('Could not find')) {
    trackErr('clinic_accounting_entries', accountingRes);
  }

  let safeClinic: ClinicRecord | null = null;
  if (clinicRes.data) {
    const { doctor_password: _dp, ...rest } = clinicRes.data as unknown as ClinicRecord;
    safeClinic = rest as ClinicRecord;
  }

  const patientsList = (patientsRes.data as PatientRecord[] | null) || [];
  const patientById = new Map<string, PatientRecord>();
  patientsList.forEach((p) => {
    if (p.id) patientById.set(p.id, p);
  });

  const rawAppointments = ((appointmentsRes.data as WaitingItem[] | null) || []).map((a) => {
    const matchedPatient = a.patient_id ? patientById.get(a.patient_id) : undefined;
    const effectiveDate = getAppointmentEffectiveDate(a);
    return {
      ...a,
      patient_name: a.patient_name || matchedPatient?.full_name || null,
      patient_phone: a.patient_phone || matchedPatient?.phone || null,
      booking_date: effectiveDate || null,
    };
  });

  // Merge any orphan waiting_queue rows not already tied to an appointment
  const queueRows = (queueRes.data as WaitingQueueRecord[] | null) || [];
  const existingAppointmentIds = new Set(rawAppointments.map((a) => a.id));
  queueRows.forEach((q) => {
    const linkedId = q.appointment_id || '';
    if (linkedId && existingAppointmentIds.has(linkedId)) return;
    if (q.id && existingAppointmentIds.has(q.id)) return;
    const matchedPatient = q.patient_id ? patientById.get(q.patient_id) : undefined;
    const ticketNum =
      q.ticket_number !== null &&
      q.ticket_number !== undefined &&
      String(q.ticket_number).trim() !== '' &&
      Number.isFinite(Number(q.ticket_number))
        ? Number(q.ticket_number)
        : null;
    rawAppointments.push({
      id: q.appointment_id || q.id,
      clinic_id: q.clinic_id,
      patient_id: q.patient_id || undefined,
      patient_name: matchedPatient?.full_name || null,
      patient_phone: matchedPatient?.phone || null,
      queue_number: ticketNum,
      status: q.status || 'waiting',
      booking_date: q.created_at ? formatAlgiersDate(q.created_at) : today,
      appointment_time: q.preferred_time || (q.created_at ? formatAlgiersTime(q.created_at) : null),
      start_at: q.created_at || null,
      created_at: q.created_at || null,
    });
  });

  const statusPriority: Record<string, number> = {
    in_visit: 0,
    patient_arrived: 1,
    waiting: 2,
    confirmed: 3,
    pending_confirmation: 4,
    new: 5,
  };

  const waitingList = rawAppointments
    .filter((a) => !a.status || ACTIVE_WAITING_STATUSES.has(String(a.status).toLowerCase()))
    .sort((a, b) => {
      const pa = statusPriority[String(a.status || 'waiting').toLowerCase()] ?? 6;
      const pb = statusPriority[String(b.status || 'waiting').toLowerCase()] ?? 6;
      if (pa !== pb) return pa - pb;
      return (a.queue_number ?? 999) - (b.queue_number ?? 999);
    });

  const allVisits = (visitsRes.data as MedicalVisitRecord[] | null) || [];
  const clinicalVisits = allVisits.filter((v) => !isDocCertificateVisit(v));
  const issuedDocuments = allVisits.filter((v) => isDocCertificateVisit(v));

  let revenueSummary: ClinicRevenueSummary | null = null;
  if (!revenueRes.error && Array.isArray(revenueRes.data) && revenueRes.data[0]) {
    const r = revenueRes.data[0] as Record<string, unknown>;
    revenueSummary = {
      total_revenue: Number(r.total_revenue || 0),
      visits_count: Number(r.visits_count || 0),
      avg_per_visit: Number(r.avg_per_visit || 0),
    };
  }

  const doctorsList = (doctorsRes.data as DoctorRecord[] | null) || [];
  const preferredDoctor =
    doctorsList.find((d) => Boolean(d.photo_path) && safeClinic?.doctor_name && d.full_name === safeClinic.doctor_name) ||
    doctorsList.find((d) => safeClinic?.doctor_name && d.full_name === safeClinic.doctor_name) ||
    doctorsList.find((d) => Boolean(d.photo_path)) ||
    doctorsList[0] ||
    null;

  return {
    clinic: safeClinic,
    doctorProfile: preferredDoctor,
    userProfile: (profileRes.data as ProfileRecord | null) || null,
    schedules: (schedulesRes.data as ClinicScheduleRecord[] | null) || [],
    patients: patientsList,
    waitingList,
    appointments: rawAppointments,
    waitingQueue: (queueRes.data as WaitingQueueRecord[] | null) || [],
    clinicalVisits,
    issuedDocuments,
    prescriptions: (prescriptionsRes.data as PrescriptionRecord[] | null) || [],
    patientDocuments: (documentsRes.data as PatientDocumentRecord[] | null) || [],
    services: (servicesRes.data as MedicalServiceRecord[] | null) || [],
    messages: (messagesRes.data as ClinicMessageRecord[] | null) || [],
    accountingEntries: (accountingRes.data as ClinicAccountingEntry[] | null) || [],
    revenueSummary,
    errors,
    error: errors.length > 0 ? errors[0] : null,
  };
}

// --- Public Shared Tables (adwia & medical_protocols - Read-Only) ---

export async function fetchInitialAdwiaCatalog(): Promise<{
  drugs: AdwiaDrugRecord[];
  error: string | null;
}> {
  try {
    const { data, error } = await supabase
      .from('adwia')
      .select(
        'id, name, dci, dosage, pharmaceutical_form, laboratory, category, packaging, code, registration_no, list, country, type, status, stability, is_active'
      )
      .eq('is_active', true)
      .order('id', { ascending: true })
      .limit(25);
    if (error) return { drugs: [], error: formatSupabaseErr('adwia', error) };
    return { drugs: (data as AdwiaDrugRecord[]) || [], error: null };
  } catch (err) {
    return { drugs: [], error: err instanceof Error ? err.message : 'تعذر قراءة الأدوية' };
  }
}

export async function searchAdwiaCatalog(query: string): Promise<{
  drugs: AdwiaDrugRecord[];
  error: string | null;
}> {
  const clean = query.trim().replace(/[,()]/g, ' ');
  if (!clean) return fetchInitialAdwiaCatalog();
  try {
    const { data, error } = await supabase
      .from('adwia')
      .select(
        'id, name, dci, dosage, pharmaceutical_form, laboratory, category, packaging, code, registration_no, list, country, type, status, stability, is_active'
      )
      .eq('is_active', true)
      .or(
        `name.ilike.%${clean}%,dci.ilike.%${clean}%,pharmaceutical_form.ilike.%${clean}%,dosage.ilike.%${clean}%,laboratory.ilike.%${clean}%,code.ilike.%${clean}%,registration_no.ilike.%${clean}%`
      )
      .limit(25);
    if (error) return { drugs: [], error: formatSupabaseErr('adwia', error) };
    return { drugs: (data as AdwiaDrugRecord[]) || [], error: null };
  } catch (err) {
    return { drugs: [], error: err instanceof Error ? err.message : 'تعذر البحث في الأدوية' };
  }
}

export async function fetchMedicalProtocols(query = ''): Promise<{
  protocols: MedicalProtocolRecord[];
  error: string | null;
}> {
  try {
    const clean = query.trim().replace(/[,()]/g, ' ');
    let req = supabase.from('medical_protocols').select('*').limit(25);
    if (clean) {
      req = req.or(
        `symptom_name_ar.ilike.%${clean}%,symptom_name_fr.ilike.%${clean}%,category.ilike.%${clean}%`
      );
    }
    const { data, error } = await req;
    if (error) return { protocols: [], error: formatSupabaseErr('medical_protocols', error) };
    return { protocols: (data as MedicalProtocolRecord[]) || [], error: null };
  } catch (err) {
    return {
      protocols: [],
      error: err instanceof Error ? err.message : 'تعذر قراءة البروتوكولات الطبية',
    };
  }
}
