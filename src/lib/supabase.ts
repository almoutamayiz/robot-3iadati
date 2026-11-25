import { createClient, type User } from '@supabase/supabase-js';
import type {
  AdwiaDrugRecord,
  ClinicMessageRecord,
  ClinicRecord,
  ClinicRole,
  MedicalVisitRecord,
  PatientRecord,
  PrescriptionRecord,
  WaitingItem,
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

const SAFE_CLINIC_COLUMNS =
  'id, owner_user_id, name, slug, specialty, description, phone, email, address, city, wilaya, is_public, doctor_name, assistant_name, consultation_fee, is_emergency_closed, emergency_close_reason, robot_defaults';
const PUBLIC_CLINIC_COLUMNS =
  'id, name, slug, specialty, description, phone, email, address, city, wilaya, is_public, doctor_name, assistant_name, consultation_fee, is_emergency_closed, emergency_close_reason';

export const ACTIVE_WAITING_STATUSES = new Set([
  'waiting',
  'patient_arrived',
  'in_visit',
  'confirmed',
  'pending_confirmation',
  'new',
]);

export function getClinicDisplayName(clinic: ClinicRecord | null | undefined): string {
  if (!clinic) return 'عيادتي';
  return clinic.name || clinic.clinic_name || `عيادة ${clinic.doctor_name || clinic.id}`;
}

export function getPatientDisplayName(p: PatientRecord | null | undefined): string {
  if (!p) return 'مريض';
  return p.full_name || 'مريض بدون اسم';
}

export function calculatePatientAge(dateOfBirth?: string | null): number | null {
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

// --- Doctor-only platform authentication ---
// Medical data access requires a real Supabase Auth session because RLS uses auth.uid().
// The legacy clinic-password RPC cannot create auth.uid(), so it must never be treated as
// an authenticated medical-data session.

export async function signInPlatformAccount(
  emailInput: string,
  password: string
): Promise<PlatformLoginResult> {
  const email = emailInput.trim().toLowerCase();
  if (!email || !password) {
    return {
      success: false,
      authUser: null,
      clinic: null,
      role: 'doctor',
      accountEmail: email,
      accountName: '',
      userIdForPrefs: '',
      error: 'يرجى إدخال البريد الإلكتروني وكلمة المرور.',
    };
  }

  try {
    // Supabase Auth is required for medical-data access and RLS isolation.

    // 2. Try Doctor authentication via Supabase Auth
    const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (!authErr && authData.user) {
      const resolved = await resolveClinicForAuthUser(authData.user);
      if (resolved.detectedRole !== 'doctor') {
        await signOutPlatformAccount();
        return {
          success: false,
          authUser: null,
          clinic: null,
          role: 'doctor',
          accountEmail: email,
          accountName: '',
          userIdForPrefs: '',
          error: 'هذا التطبيق مخصص للأطباء فقط. يرجى تسجيل الدخول بحساب الطبيب.',
        };
      }
      return {
        success: true,
        authUser: authData.user,
        clinic: resolved.primaryClinic,
        role: 'doctor',
        accountEmail: authData.user.email || email,
        accountName:
          resolved.primaryClinic?.doctor_name ||
          String(authData.user.user_metadata?.full_name || 'الطبيب'),
        userIdForPrefs: authData.user.id,
        error: null,
      };
    }

    return {
      success: false,
      authUser: null,
      clinic: null,
      role: 'doctor',
      accountEmail: email,
      accountName: '',
      userIdForPrefs: '',
      error: authErr?.message || 'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
    };
  } catch (err) {
    return {
      success: false,
      authUser: null,
      clinic: null,
      role: 'doctor',
      accountEmail: email,
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

export async function resolveClinicForAuthUser(authUser: User): Promise<{
  clinics: ClinicRecord[];
  primaryClinic: ClinicRecord | null;
  detectedRole: ClinicRole;
}> {
  let detectedRole: ClinicRole = 'doctor';
  const metaRole = String(authUser.user_metadata?.role || '').toLowerCase();
  if (metaRole === 'receptionist' || metaRole === 'nurse') {
    detectedRole = 'receptionist';
  }

  const foundClinics: ClinicRecord[] = [];
  const seenIds = new Set<string>();
  const addClinic = (c: ClinicRecord | null | undefined) => {
    if (c && c.id && !seenIds.has(c.id)) {
      seenIds.add(c.id);
      foundClinics.push(c);
    }
  };

  // Look up clinics linked via doctors.user_id = auth.uid()
  const doctorLinkIds: string[] = [];
  try {
    const { data: doctorRows } = await supabase
      .from('doctors')
      .select('clinic_id')
      .eq('user_id', authUser.id);
    if (Array.isArray(doctorRows)) {
      for (const row of doctorRows) {
        if (typeof row.clinic_id === 'string' && row.clinic_id) {
          doctorLinkIds.push(row.clinic_id);
        }
      }
    }
  } catch { /* ignore */ }

  const clinicLookups = await Promise.allSettled([
    supabase.from('clinics').select(SAFE_CLINIC_COLUMNS).eq('owner_user_id', authUser.id),
    authUser.email
      ? supabase.from('clinics').select(SAFE_CLINIC_COLUMNS).ilike('email', authUser.email)
      : Promise.resolve({ data: null, error: null }),
    ...doctorLinkIds.map((cid) =>
      supabase.from('clinics').select(SAFE_CLINIC_COLUMNS).eq('id', cid).maybeSingle()
    ),
  ]);

  for (const res of clinicLookups) {
    if (res.status !== 'fulfilled') continue;
    const d = res.value?.data;
    if (Array.isArray(d)) {
      d.forEach((row) => addClinic(row as unknown as ClinicRecord));
    } else if (d && typeof d === 'object') {
      addClinic(d as unknown as ClinicRecord);
    }
  }

  const primary = foundClinics[0] || null;
  return {
    clinics: foundClinics,
    primaryClinic: primary,
    detectedRole,
  };
}

export async function fetchClinicById(clinicId: string): Promise<ClinicRecord | null> {
  if (!clinicId) return null;
  try {
    const { data, error } = await supabase
      .from('clinics')
      .select(SAFE_CLINIC_COLUMNS)
      .eq('id', clinicId)
      .maybeSingle();
    if (!error && data) return data as unknown as ClinicRecord;

    const { data: pubData, error: pubErr } = await supabase
      .from('public_clinics')
      .select(PUBLIC_CLINIC_COLUMNS)
      .eq('id', clinicId)
      .maybeSingle();
    if (!pubErr && pubData) return pubData as ClinicRecord;
    return null;
  } catch {
    return null;
  }
}

export interface ClinicLiveSnapshot {
  patients: PatientRecord[];
  waitingList: WaitingItem[];
  appointments: WaitingItem[];
  recentVisits: MedicalVisitRecord[];
  prescriptions: PrescriptionRecord[];
  messages: ClinicMessageRecord[];
  error?: string | null;
}

export async function fetchClinicSnapshot(clinicId: string): Promise<ClinicLiveSnapshot> {
  if (!clinicId || clinicId === 'clinic_demo_local') {
    return {
      patients: [],
      waitingList: [],
      appointments: [],
      recentVisits: [],
      prescriptions: [],
      messages: [],
    };
  }

  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session?.user) {
    return {
      patients: [],
      waitingList: [],
      appointments: [],
      recentVisits: [],
      prescriptions: [],
      messages: [],
      error: 'لا يمكن تحميل البيانات الطبية دون جلسة Supabase Auth صالحة.',
    };
  }

  const [patientsRes, appointmentsRes, visitsRes, prescriptionsRes, messagesRes] =
    await Promise.all([
      supabase
        .from('patients')
        .select(
          'id, clinic_id, patient_number, full_name, date_of_birth, phone, email, address, city, gender, has_social_security, chronic_diseases, allergies, blood_group, medical_notes, created_at, updated_at'
        )
        .eq('clinic_id', clinicId)
        .order('created_at', { ascending: false })
        .limit(80),
      supabase
        .from('appointments')
        .select(
          'id, clinic_id, patient_id, doctor_id, service_id, start_at, end_at, booking_date, appointment_time, status, queue_number, patient_name, patient_phone, reason_for_visit, booking_source, administrative_notes, fee, handed_to_doctor_at, completed_at, created_at, updated_at'
        )
        .eq('clinic_id', clinicId)
        .order('queue_number', { ascending: true })
        .order('start_at', { ascending: true })
        .limit(60),
      supabase
        .from('medical_visits')
        .select(
          'id, clinic_id, patient_id, doctor_id, appointment_id, visit_date, clinical_notes, diagnosis, treatment_notes, created_at'
        )
        .eq('clinic_id', clinicId)
        .order('created_at', { ascending: false })
        .limit(25),
      supabase
        .from('prescriptions')
        .select(
          'id, clinic_id, patient_id, doctor_id, visit_id, patient_name, doctor_name, advice, medications, created_at'
        )
        .eq('clinic_id', clinicId)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('clinic_messages')
        .select(
          'id, clinic_id, sender_role, sender_name, message, is_read, created_at'
        )
        .eq('clinic_id', clinicId)
        .order('created_at', { ascending: false })
        .limit(30),
    ]);

  const allAppointments = (appointmentsRes.data as WaitingItem[] | null) || [];
  const statusPriority: Record<string, number> = {
    in_visit: 0,
    patient_arrived: 1,
    waiting: 2,
    confirmed: 3,
    pending_confirmation: 4,
    new: 5,
  };
  const waitingList = allAppointments
    .filter(
      (a) => !a.status || ACTIVE_WAITING_STATUSES.has(String(a.status).toLowerCase())
    )
    .sort((a, b) => {
      const pa = statusPriority[String(a.status || 'waiting').toLowerCase()] ?? 6;
      const pb = statusPriority[String(b.status || 'waiting').toLowerCase()] ?? 6;
      if (pa !== pb) return pa - pb;
      return (a.queue_number ?? 999) - (b.queue_number ?? 999);
    });

  return {
    patients: (patientsRes.data as PatientRecord[] | null) || [],
    waitingList,
    appointments: allAppointments,
    recentVisits: (visitsRes.data as MedicalVisitRecord[] | null) || [],
    prescriptions: (prescriptionsRes.data as PrescriptionRecord[] | null) || [],
    messages: (messagesRes.data as ClinicMessageRecord[] | null) || [],
    error: patientsRes.error?.message || appointmentsRes.error?.message || null,
  };
}

export async function fetchInitialAdwiaCatalog(): Promise<AdwiaDrugRecord[]> {
  try {
    const { data, error } = await supabase
      .from('adwia')
      .select(
        'id, name, dci, dosage, pharmaceutical_form, laboratory, category, packaging, code, type, status, is_active'
      )
      .eq('is_active', true)
      .order('id', { ascending: true })
      .limit(20);
    if (error || !data) return [];
    return data as AdwiaDrugRecord[];
  } catch {
    return [];
  }
}

export async function passPatientToDoctor(
  appointmentId: string,
  doctorId?: string | null
): Promise<boolean> {
  if (!appointmentId) return false;
  try {
    const { error } = await supabase.rpc('pass_patient_to_doctor', {
      p_appointment_id: appointmentId,
      p_doctor_id: doctorId || null,
    });
    return !error;
  } catch {
    return false;
  }
}

export async function searchAdwiaCatalog(query: string): Promise<AdwiaDrugRecord[]> {
  const clean = query.trim().replace(/[,()]/g, ' ');
  if (!clean) return [];
  try {
    const { data, error } = await supabase.rpc('search_adwia_smart', {
      search_term: clean.slice(0, 100),
      max_results: 15,
    });
    if (error || !data) return [];
    return data as AdwiaDrugRecord[];
  } catch {
    return [];
  }
}

export async function sendClinicTeamMessage(
  clinicId: string,
  senderRole: ClinicRole,
  senderName: string,
  text: string
): Promise<boolean> {
  if (!clinicId || !text.trim()) return false;
  // Obey CHECK (sender_role IN ('doctor', 'nurse', 'reception'))
  const dbRole = senderRole === 'doctor' ? 'doctor' : 'reception';
  try {
    const { error } = await supabase.from('clinic_messages').insert({
      clinic_id: clinicId,
      sender_role: dbRole,
      sender_name: senderName || (dbRole === 'doctor' ? 'الطبيب' : 'الاستقبال'),
      message: text.trim(),
      is_read: false,
    });
    return !error;
  } catch {
    return false;
  }
}

export async function markClinicMessagesRead(clinicId: string): Promise<void> {
  if (!clinicId || clinicId === 'clinic_demo_local') return;
  try {
    await supabase
      .from('clinic_messages')
      .update({ is_read: true })
      .eq('clinic_id', clinicId)
      .eq('is_read', false);
  } catch { /* ignore */ }
}
