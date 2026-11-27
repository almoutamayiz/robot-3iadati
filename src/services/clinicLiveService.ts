import { createClient } from '@supabase/supabase-js';
import { useState, useEffect, useCallback } from 'react';

// =========================================================================
// 1. الاتصال المعتمد بقاعدة البيانات
// =========================================================================
export const SUPABASE_URL =
  (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_SUPABASE_URL) ||
  'https://bjrnyvyxldwxytbureyp.supabase.co';

export const SUPABASE_ANON_KEY =
  (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_SUPABASE_ANON_KEY) ||
  'sb_publishable_4qIti3E8QklNBmOX85B2RA_WG9JHmIM';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// =========================================================================
// 2. التعريفات البرمجية الدقيقة (TypeScript Types)
// =========================================================================
export interface Patient {
  id: string;
  clinic_id: string;
  patient_number?: string;
  full_name: string;
  date_of_birth?: string;
  phone: string;
  email?: string;
  address?: string;
  city?: string;
  gender?: 'male' | 'female';
  age?: number;
  has_social_security?: boolean;
  social_security_number?: string;
  chronic_diseases?: string;
  allergies?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  blood_group?: string;
  medical_notes?: string;
  created_at: string;
}

export type AppointmentStatus =
  | 'new'
  | 'pending_confirmation'
  | 'confirmed'
  | 'waiting'
  | 'patient_arrived'
  | 'in_visit'
  | 'completed'
  | 'cancelled'
  | 'no_show';

export interface Appointment {
  id: string;
  clinic_id: string;
  patient_id: string;
  doctor_id?: string;
  service_id?: string;
  patient_name?: string;
  patient_phone?: string;
  service_name?: string;
  booking_date?: string;
  appointment_time?: string;
  queue_number?: number;
  is_emergency?: boolean;
  fee?: number;
  start_at: string;
  end_at: string;
  status: AppointmentStatus;
  booking_source: 'patient_portal' | 'reception' | 'doctor';
  reason_for_visit?: string;
  administrative_notes?: string;
  cancellation_reason?: string;
  handed_to_doctor_at?: string;
  completed_at?: string;
  created_at: string;
}

export interface WaitingQueueItem {
  id: string;
  clinic_id: string;
  patient_id: string;
  service_id?: string;
  appointment_id?: string;
  ticket_number: string;
  preferred_time?: string;
  priority: 'normal' | 'urgent' | 'vip';
  status: 'waiting' | 'called' | 'completed' | 'cancelled';
  called_at?: string;
  created_at: string;
}

export interface ClinicMessageRecord {
  id?: string | number;
  clinic_id: string;
  sender_role: 'doctor' | 'nurse' | 'reception';
  sender_name?: string;
  message: string;
  is_read?: boolean;
  created_at?: string;
}

// دالة مساعدة لاستخراج الأتعاب المضمنة إن وُجدت
export function extractEmbeddedFee(notes?: string | null): number | undefined {
  if (!notes) return undefined;
  const match = String(notes).match(/\[DOC_FEE:(\d+(?:\.\d+)?)\]/);
  return match && match[1] ? Number(match[1]) : undefined;
}

// =========================================================================
// 3. دوال الجلب المباشرة من Supabase
// =========================================================================

/**
 * جلب قائمة مرضى العيادة
 */
export async function fetchPatients(clinicId: string): Promise<{ data: Patient[]; error: unknown }> {
  if (!clinicId) return { data: [], error: 'No clinicId provided' };
  try {
    const { data, error } = await supabase
      .from('patients')
      .select('*')
      .eq('clinic_id', clinicId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Supabase fetchPatients error:', error.code, error.message);
      return { data: [], error };
    }
    return { data: (data as Patient[]) || [], error: null };
  } catch (err) {
    console.error('❌ fetchPatients exception:', err);
    return { data: [], error: err };
  }
}

/**
 * جلب مواعيد وقاعة انتظار العيادة
 */
export async function fetchAppointments(clinicId: string): Promise<{ data: Appointment[]; error: unknown }> {
  if (!clinicId) return { data: [], error: 'No clinicId provided' };
  try {
    const { data, error } = await supabase
      .from('appointments')
      .select('*')
      .eq('clinic_id', clinicId)
      .order('start_at', { ascending: true });

    if (error) {
      console.error('❌ Supabase fetchAppointments error:', error.code, error.message);
      return { data: [], error };
    }

    const normalized = ((data as Appointment[]) || []).map((apt) => {
      const embedded = extractEmbeddedFee(apt.administrative_notes);
      return {
        ...apt,
        fee: apt.fee !== undefined && apt.fee !== null ? Number(apt.fee) : embedded,
      };
    });

    return { data: normalized, error: null };
  } catch (err) {
    console.error('❌ fetchAppointments exception:', err);
    return { data: [], error: err };
  }
}

/**
 * جلب طابور الانتظار المساعد (waiting_queue)
 */
export async function fetchWaitingQueue(clinicId: string): Promise<{ data: WaitingQueueItem[]; error: unknown }> {
  if (!clinicId) return { data: [], error: 'No clinicId provided' };
  try {
    const { data, error } = await supabase
      .from('waiting_queue')
      .select('*')
      .eq('clinic_id', clinicId)
      .order('created_at', { ascending: true });

    if (error) {
      console.warn('Supabase fetchWaitingQueue notice:', error.message);
      return { data: [], error };
    }
    return { data: (data as WaitingQueueItem[]) || [], error: null };
  } catch (err) {
    return { data: [], error: err };
  }
}

/**
 * جلب رسائل المحادثة بين الطبيب والممرض
 */
export async function fetchClinicMessages(clinicId: string): Promise<{ data: ClinicMessageRecord[]; error: unknown }> {
  if (!clinicId) return { data: [], error: 'No clinicId provided' };
  try {
    const { data, error } = await supabase
      .from('clinic_messages')
      .select('*')
      .eq('clinic_id', clinicId)
      .order('created_at', { ascending: true })
      .limit(150);

    if (error) {
      console.error('❌ Supabase fetchClinicMessages error:', error.code, error.message);
      return { data: [], error };
    }
    return { data: (data as ClinicMessageRecord[]) || [], error: null };
  } catch (err) {
    console.error('❌ fetchClinicMessages exception:', err);
    return { data: [], error: err };
  }
}

/**
 * إرسال رسالة بين الطبيب والممرض
 */
export async function sendClinicMessage(
  clinicId: string,
  senderRole: 'doctor' | 'nurse' | 'reception',
  senderName: string,
  message: string
): Promise<{ success: boolean; data?: ClinicMessageRecord; error?: unknown }> {
  if (!clinicId || !message.trim()) return { success: false, error: 'Empty payload' };
  try {
    const payload: {
      clinic_id: string;
      sender_role: string;
      sender_name: string;
      message: string;
    } = {
      clinic_id: clinicId,
      sender_role: senderRole,
      sender_name: senderName,
      message: message.trim(),
    };

    const { data, error } = await supabase
      .from('clinic_messages')
      .insert(payload)
      .select()
      .maybeSingle();

    if (error) {
      console.error('❌ sendClinicMessage error:', error.code, error.message);
      return { success: false, error };
    }
    return { success: true, data: data as ClinicMessageRecord };
  } catch (err) {
    return { success: false, error: err };
  }
}

// =========================================================================
// 4. خطاف ريأكت المتكامل للمراقبة الحية (useClinicLiveMonitor)
// =========================================================================
export function useClinicLiveMonitor(options: {
  clinicId: string;
  userRole?: 'doctor' | 'nurse' | 'reception' | 'super_admin';
  userName?: string;
}) {
  const { clinicId, userRole = 'doctor', userName = 'المستخدم' } = options;

  const [patients, setPatients] = useState<Patient[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [waitingQueue, setWaitingQueue] = useState<WaitingQueueItem[]>([]);
  const [messages, setMessages] = useState<ClinicMessageRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [lastError, setLastError] = useState<string | null>(null);

  // تحديث كافة البيانات
  const refreshAll = useCallback(async () => {
    if (!clinicId) return;

    const [pRes, aRes, wRes, mRes] = await Promise.all([
      fetchPatients(clinicId),
      fetchAppointments(clinicId),
      fetchWaitingQueue(clinicId),
      fetchClinicMessages(clinicId),
    ]);

    // التقاط أي أخطاء صلاحيات (42501 أو غيرها) لتنبيه المطور فوراً
    if (pRes.error || aRes.error || mRes.error) {
      const err = (pRes.error || aRes.error || mRes.error) as { message?: string; code?: string } | null;
      const errMsg = err?.message || err?.code || 'Unknown DB error';
      setLastError(errMsg);
    } else {
      setLastError(null);
    }

    if (!pRes.error) setPatients(pRes.data);
    if (!aRes.error) setAppointments(aRes.data);
    if (!wRes.error) setWaitingQueue(wRes.data);
    if (!mRes.error) setMessages(mRes.data);

    setIsLoading(false);
  }, [clinicId]);

  // التحميل الأولي + التحديث الدوري الاحتياطي كل 4 ثوانٍ
  useEffect(() => {
    if (!clinicId) return;
    setIsLoading(true);
    refreshAll();

    const intervalId = window.setInterval(() => {
      refreshAll();
    }, 4000);

    return () => window.clearInterval(intervalId);
  }, [clinicId, refreshAll]);

  // الاشتراك اللحظي الفوري عبر Supabase Realtime
  useEffect(() => {
    if (!clinicId) return;

    const channel = supabase
      .channel(`robot-live-monitor-${clinicId}`)
      // متابعة المرضى
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'patients', filter: `clinic_id=eq.${clinicId}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setPatients((prev) => [payload.new as Patient, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as Patient;
            setPatients((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
          } else if (payload.eventType === 'DELETE') {
            const oldId = (payload.old as { id?: string })?.id;
            if (oldId) setPatients((prev) => prev.filter((p) => p.id !== oldId));
          }
        }
      )
      // متابعة المواعيد وقاعة الانتظار
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'appointments', filter: `clinic_id=eq.${clinicId}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setAppointments((prev) => [...prev, payload.new as Appointment]);
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as Appointment;
            setAppointments((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
          } else if (payload.eventType === 'DELETE') {
            const oldId = (payload.old as { id?: string })?.id;
            if (oldId) setAppointments((prev) => prev.filter((a) => a.id !== oldId));
          }
        }
      )
      // متابعة الرسائل اللحظية بين الطبيب والممرض
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'clinic_messages', filter: `clinic_id=eq.${clinicId}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newMsg = payload.new as ClinicMessageRecord;
            setMessages((prev) => {
              if (prev.some((m) => m.id === newMsg.id)) return prev;
              return [...prev, newMsg];
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [clinicId]);

  // تصنيف قاعة الانتظار بحسب الحالات الطبية الرسمية للمنصة
  const waitingPatients = appointments.filter((a) =>
    ['patient_arrived', 'confirmed', 'waiting', 'new', 'pending_confirmation'].includes(a.status)
  );

  const inVisitPatient = appointments.find((a) => a.status === 'in_visit') || null;

  const completedPatients = appointments.filter((a) => a.status === 'completed');

  // إرسال رسالة من هذا الحساب
  const sendMsg = useCallback(
    async (text: string) => {
      const senderRole: 'doctor' | 'nurse' | 'reception' =
        userRole === 'nurse' || userRole === 'reception' ? 'nurse' : 'doctor';
      return await sendClinicMessage(clinicId, senderRole, userName, text);
    },
    [clinicId, userRole, userName]
  );

  return {
    patients,
    patientCount: patients.length,
    allAppointments: appointments,
    waitingPatients,
    waitingCount: waitingPatients.length,
    inVisitPatient,
    completedPatients,
    waitingQueue,
    messages,
    sendMessage: sendMsg,
    isLoading,
    lastError,
    refreshAll,
  };
}
