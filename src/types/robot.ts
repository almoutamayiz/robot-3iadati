export type RobotState =
  | 'idle'
  | 'attention'
  | 'thinking'
  | 'working'
  | 'success'
  | 'alert'
  | 'sleep'
  | 'happy'
  | 'laugh'
  | 'sad'
  | 'fly';

export type ClinicRole = 'doctor' | 'receptionist';

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

export interface ClinicRecord {
  id: string;
  owner_user_id?: string | null;
  name?: string | null;
  clinic_name?: string | null;
  slug?: string | null;
  specialty?: string | null;
  description?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  wilaya?: string | null;
  is_public?: boolean | null;
  doctor_name?: string | null;
  assistant_name?: string | null;
  assistant_email?: string | null;
  assistant_active?: boolean | null;
  consultation_fee?: number | null;
  is_emergency_closed?: boolean | null;
  emergency_close_reason?: string | null;
  robot_defaults?: unknown;
}

export interface DoctorRecord {
  id: string;
  clinic_id: string;
  user_id?: string | null;
  email?: string | null;
  full_name: string;
  specialty?: string | null;
  is_active?: boolean | null;
}

export interface PatientRecord {
  id: string;
  clinic_id: string;
  patient_number?: string | null;
  full_name: string;
  date_of_birth?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  gender?: 'male' | 'female' | string | null;
  has_social_security?: boolean | null;
  social_security_number?: string | null;
  chronic_diseases?: string | null;
  allergies?: string | null;
  blood_group?: string | null;
  medical_notes?: string | null;
  created_at?: string | null;
}

export interface WaitingItem {
  id: string;
  clinic_id?: string;
  patient_id?: string | null;
  doctor_id?: string | null;
  service_id?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  booking_date?: string | null;
  appointment_time?: string | null;
  status?: AppointmentStatus | string | null;
  queue_number?: number | null;
  patient_name?: string | null;
  patient_phone?: string | null;
  reason_for_visit?: string | null;
  booking_source?: string | null;
  administrative_notes?: string | null;
  fee?: number | null;
  handed_to_doctor_at?: string | null;
  completed_at?: string | null;
  created_at?: string | null;
}

export interface MedicalVisitRecord {
  id: string;
  clinic_id?: string;
  patient_id?: string | null;
  doctor_id?: string | null;
  appointment_id?: string | null;
  visit_date?: string | null;
  diagnosis?: string | null;
  clinical_notes?: string | null;
  treatment_notes?: string | null;
  created_at?: string | null;
}

export interface PrescriptionRecord {
  id: string;
  clinic_id?: string;
  patient_id?: string | null;
  doctor_id?: string | null;
  visit_id?: string | null;
  patient_name?: string | null;
  doctor_name?: string | null;
  advice?: string | null;
  medications?: Array<{
    id?: string;
    drug_name?: string;
    dci?: string;
    form_and_strength?: string;
    dosage?: string;
    frequency?: string;
    duration?: string;
    instructions?: string;
  }>;
  created_at?: string | null;
}

export interface ClinicMessageRecord {
  id: string | number;
  clinic_id?: string;
  sender_role?: 'doctor' | 'nurse' | 'reception' | string | null;
  sender_name?: string | null;
  message?: string | null;
  is_read?: boolean | null;
  created_at?: string | null;
}

export interface AdwiaDrugRecord {
  id?: string | number;
  name?: string | null;
  dci?: string | null;
  dosage?: string | null;
  pharmaceutical_form?: string | null;
  laboratory?: string | null;
  category?: string | null;
  packaging?: string | null;
  code?: string | null;
  type?: 'GE' | 'PR' | string | null;
  status?: 'F' | 'I' | string | null;
  is_active?: boolean | null;
}

export interface SuggestedClinicAction {
  type: string;
  target?: string | null;
  label: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
  actionType?: string | null;
  actionTarget?: string | null;
  actionLabel?: string | null;
  suggestedActions?: SuggestedClinicAction[];
  isAlert?: boolean;
  drugsMentioned?: AdwiaDrugRecord[];
}
