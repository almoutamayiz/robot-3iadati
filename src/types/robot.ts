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
  owner_id?: string | null;
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
  maps_url?: string | null;
  logo_path?: string | null;
  cover_path?: string | null;
  timezone?: string | null;
  is_public?: boolean | null;
  theme_preset?: string | null;
  primary_color?: string | null;
  admin_theme_color?: string | null;
  dark_mode?: boolean | null;
  doctor_name?: string | null;
  doctor_bio?: string | null;
  doctor_photo?: string | null;
  doctor_password?: string | null;
  assistant_name?: string | null;
  assistant_phone?: string | null;
  assistant_active?: boolean | null;
  working_schedule?: unknown;
  exceptional_holidays?: unknown;
  is_emergency_closed?: boolean | null;
  emergency_close_reason?: string | null;
  consultation_fee?: number | null;
  subscription_plan_id?: string | null;
  subscription_status?: string | null;
  robot_defaults?: unknown;
  ai_settings?: unknown;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface DoctorRecord {
  id: string;
  clinic_id: string;
  user_id?: string | null;
  email?: string | null;
  full_name: string;
  specialty?: string | null;
  biography?: string | null;
  professional_phone?: string | null;
  photo_path?: string | null;
  is_active?: boolean | null;
  created_at?: string | null;
}

export interface ProfileRecord {
  id: string;
  email?: string | null;
  full_name?: string | null;
  phone?: string | null;
  specialty?: string | null;
  avatar_url?: string | null;
  maps_url?: string | null;
  role?: string | null;
  clinic_id?: string | null;
}

export interface ClinicScheduleRecord {
  clinic_id: string;
  day_id: string | number;
  day_name_ar?: string | null;
  day_name_fr?: string | null;
  is_open?: boolean | null;
  start_time?: string | null;
  end_time?: string | null;
}

export interface PatientRecord {
  id: string;
  clinic_id: string;
  patient_number?: string | null;
  full_name: string;
  date_of_birth?: string | null;
  age?: number | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  gender?: 'male' | 'female' | string | null;
  has_social_security?: boolean | null;
  social_security_number?: string | null;
  chronic_diseases?: string | null;
  allergies?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  blood_group?: string | null;
  medical_notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface WaitingItem {
  id: string;
  clinic_id?: string;
  patient_id?: string | null;
  doctor_id?: string | null;
  service_id?: string | null;
  service_name?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  booking_date?: string | null;
  appointment_time?: string | null;
  status?: AppointmentStatus | string | null;
  queue_number?: number | null;
  is_emergency?: boolean | null;
  patient_name?: string | null;
  patient_phone?: string | null;
  reason_for_visit?: string | null;
  booking_source?: string | null;
  administrative_notes?: string | null;
  cancellation_reason?: string | null;
  fee?: number | null;
  handed_to_doctor_at?: string | null;
  completed_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface WaitingQueueRecord {
  id: string;
  clinic_id?: string;
  patient_id?: string | null;
  service_id?: string | null;
  appointment_id?: string | null;
  ticket_number?: number | string | null;
  preferred_time?: string | null;
  priority?: number | string | null;
  status?: string | null;
  called_at?: string | null;
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
  fee?: number | null;
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
    route?: string;
    frequency?: string;
    duration?: string;
    quantity?: string | number;
    instructions?: string;
    adwia_id?: string | number;
  }>;
  created_at?: string | null;
}

export interface PatientDocumentRecord {
  id: string;
  clinic_id?: string;
  patient_id?: string | null;
  document_name?: string | null;
  document_type?: 'lab_test' | 'xray' | 'prescription' | 'general' | string | null;
  file_url?: string | null;
  file_size_bytes?: number | null;
  notes?: string | null;
  created_at?: string | null;
}

export interface MedicalServiceRecord {
  id: string;
  clinic_id?: string;
  name?: string | null;
  description?: string | null;
  duration_minutes?: number | null;
  price?: number | null;
  is_active?: boolean | null;
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
  registration_no?: string | null;
  list?: string | null;
  country?: string | null;
  type?: 'GE' | 'PR' | string | null;
  status?: 'F' | 'I' | string | null;
  stability?: string | null;
  is_active?: boolean | null;
}

export interface MedicalProtocolRecord {
  id: string | number;
  symptom_key?: string | null;
  symptom_name_ar?: string | null;
  symptom_name_fr?: string | null;
  category?: string | null;
  first_line_dcis?: unknown;
  target_dosage?: string | null;
  default_posology?: string | null;
  default_duration?: string | null;
  notes?: string | null;
}

export interface ClinicAccountingEntry {
  entry_id: string;
  clinic_id: string;
  patient_id?: string | null;
  entry_date?: string | null;
  status?: string | null;
  service_label?: string | null;
  amount_dzd?: number | null;
  is_realized?: boolean | null;
  created_at?: string | null;
}

export interface ClinicRevenueSummary {
  total_revenue: number;
  visits_count: number;
  avg_per_visit: number;
}

export type ChatMode = 'nurse' | 'ai';

export interface MedicalSourceLink {
  title: string;
  uri: string;
  domain?: string;
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
  details?: string | null;
  sources?: MedicalSourceLink[];
  searchQueries?: string[];
  modelUsed?: string | null;
  actionType?: string | null;
  actionTarget?: string | null;
  actionLabel?: string | null;
  suggestedActions?: SuggestedClinicAction[];
  isAlert?: boolean;
}
