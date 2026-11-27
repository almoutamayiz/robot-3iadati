import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Building2,
  Check,
  Clock,
  FileText,
  MessageSquare,
  Search,
  Send,
  Stethoscope,
  Users,
  X,
} from 'lucide-react';
import {
  calculatePatientAge,
  formatAlgiersDate,
  formatAlgiersTime,
  getAppointmentEffectiveDate,
  getClinicDisplayName,
  getClinicImageUrl,
  getPatientDisplayName,
  getTodayAlgiersDate,
  isPastAppointment,
  isUpcomingAppointment,
  parseAppointmentNotes,
  resolveAppointmentFee,
  toWesternDigits,
} from '../lib/supabase';
import type {
  ClinicAccountingEntry,
  ClinicMessageRecord,
  ClinicRecord,
  ClinicRevenueSummary,
  ClinicScheduleRecord,
  DoctorRecord,
  MedicalServiceRecord,
  MedicalVisitRecord,
  PatientDocumentRecord,
  PatientRecord,
  PrescriptionRecord,
  ProfileRecord,
  WaitingItem,
  WaitingQueueRecord,
} from '../types/robot';

export type WorkspaceTab = 'queue' | 'patients' | 'messages' | 'overview';
export type QueueFilterMode = 'active' | 'all' | 'upcoming' | 'past';

const STATUS_LABELS: Record<string, string> = {
  new: 'جديد',
  pending_confirmation: 'بانتظار التأكيد',
  confirmed: 'موعد مؤكد',
  waiting: 'في الانتظار',
  patient_arrived: 'وصل المريض',
  in_visit: 'داخل غرفة الفحص',
  completed: 'مكتمل',
  cancelled: 'ملغى',
  no_show: 'لم يحضر',
};

const QUICK_NURSE_MESSAGES = [
  'استدعاء المريض التالي',
  'يرجى تجهيز ملف المريض',
  'انتهت الاستشارة الحالية',
] as const;

function formatWaitingMinutes(item: WaitingItem): string | null {
  const ref = item.handed_to_doctor_at || item.start_at || item.created_at;
  if (!ref) return null;
  const diffMs = Date.now() - new Date(ref).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0 || diffMs > 12 * 3600_000) return null;
  const mins = Math.round(diffMs / 60_000);
  return mins <= 1 ? 'الآن' : `منذ ${toWesternDigits(mins)} د`;
}

interface ClinicWorkspaceSheetProps {
  open: boolean;
  initialTab?: WorkspaceTab;
  initialQueueFilter?: QueueFilterMode;
  onClose: () => void;
  clinic: ClinicRecord | null;
  doctorProfile: DoctorRecord | null;
  userProfile: ProfileRecord | null;
  schedules: ClinicScheduleRecord[];
  waitingList: WaitingItem[];
  appointments: WaitingItem[];
  waitingQueue: WaitingQueueRecord[];
  patients: PatientRecord[];
  clinicalVisits: MedicalVisitRecord[];
  issuedDocuments: MedicalVisitRecord[];
  prescriptions: PrescriptionRecord[];
  patientDocuments: PatientDocumentRecord[];
  services: MedicalServiceRecord[];
  messages: ClinicMessageRecord[];
  accountingEntries: ClinicAccountingEntry[];
  revenueSummary: ClinicRevenueSummary | null;
  snapshotErrors: string[];
  activePatient: PatientRecord | null;
  onSelectActivePatient: (patient: PatientRecord | null) => void;
  onAskRobotAbout: (prompt: string) => void;
  onRefreshData: () => void;
  onSendMessageToNurse?: (text: string) => Promise<{ success: boolean; error?: string } | void>;
}

export const ClinicWorkspaceSheet: React.FC<ClinicWorkspaceSheetProps> = ({
  open,
  initialTab = 'queue',
  initialQueueFilter = 'active',
  onClose,
  clinic,
  doctorProfile,
  userProfile,
  schedules,
  waitingList,
  appointments,
  waitingQueue,
  patients,
  clinicalVisits,
  issuedDocuments,
  prescriptions,
  patientDocuments,
  services,
  messages,
  accountingEntries,
  revenueSummary,
  snapshotErrors,
  activePatient,
  onSelectActivePatient,
  onAskRobotAbout,
  onRefreshData,
  onSendMessageToNurse,
}) => {
  const [tab, setTab] = useState<WorkspaceTab>(initialTab);
  const [queueFilter, setQueueFilter] = useState<QueueFilterMode>(initialQueueFilter);
  const [appointmentQuery, setAppointmentQuery] = useState('');
  const [patientQuery, setPatientQuery] = useState('');
  const [inspectingPatient, setInspectingPatient] = useState<PatientRecord | null>(null);
  const [nurseMsgInput, setNurseMsgInput] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);
  const [sendMsgError, setSendMsgError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) {
      setTab(initialTab);
      setQueueFilter(initialQueueFilter);
      if (initialTab === 'patients' && activePatient) {
        setInspectingPatient(activePatient);
      } else {
        setInspectingPatient(null);
      }
    }
  }, [open, initialTab, initialQueueFilter, activePatient]);

  useEffect(() => {
    if (open && tab === 'messages') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [open, tab, messages.length]);

  if (!open) return null;

  const clinicImageUrl = getClinicImageUrl(clinic, doctorProfile, userProfile);

  const filteredPatients = patients.filter((p) => {
    const q = patientQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      getPatientDisplayName(p).toLowerCase().includes(q) ||
      (p.phone || '').toLowerCase().includes(q) ||
      (p.patient_number || '').toLowerCase().includes(q) ||
      (p.chronic_diseases || '').toLowerCase().includes(q)
    );
  });

  const todayDate = getTodayAlgiersDate();
  const upcomingAppointments = appointments
    .filter((a) => isUpcomingAppointment(a, todayDate))
    .sort((a, b) => getAppointmentEffectiveDate(a).localeCompare(getAppointmentEffectiveDate(b)));
  const pastAppointments = appointments
    .filter((a) => isPastAppointment(a, todayDate))
    .sort((a, b) => getAppointmentEffectiveDate(b).localeCompare(getAppointmentEffectiveDate(a)));
  const allAppointmentsSorted = [...appointments].sort((a, b) =>
    getAppointmentEffectiveDate(b).localeCompare(getAppointmentEffectiveDate(a))
  );

  const baseAppointmentsList =
    queueFilter === 'active'
      ? waitingList
      : queueFilter === 'upcoming'
        ? upcomingAppointments
        : queueFilter === 'past'
          ? pastAppointments
          : allAppointmentsSorted;

  const displayedAppointments = baseAppointmentsList.filter((item) => {
    const q = appointmentQuery.trim().toLowerCase();
    if (!q) return true;
    const linked = item.patient_id ? patients.find((p) => p.id === item.patient_id) : undefined;
    const pName = (item.patient_name || (linked ? getPatientDisplayName(linked) : '')).toLowerCase();
    const pPhone = (item.patient_phone || linked?.phone || '').toLowerCase();
    const dateStr = getAppointmentEffectiveDate(item).toLowerCase();
    const reason = (item.reason_for_visit || item.service_name || '').toLowerCase();
    return pName.includes(q) || pPhone.includes(q) || dateStr.includes(q) || reason.includes(q);
  });

  const getPatientHistoryStats = (patientId: string) => {
    const visits = clinicalVisits.filter((v) => v.patient_id === patientId);
    const docsIssued = issuedDocuments.filter((v) => v.patient_id === patientId);
    const rxList = prescriptions.filter((rx) => rx.patient_id === patientId);
    const docs = patientDocuments.filter((d) => d.patient_id === patientId);
    const patientAppointments = appointments
      .filter((a) => a.patient_id === patientId)
      .sort((a, b) => getAppointmentEffectiveDate(b).localeCompare(getAppointmentEffectiveDate(a)));
    const totalHistoryCount =
      visits.length + rxList.length + docsIssued.length + docs.length + patientAppointments.length;
    return {
      visits,
      docsIssued,
      rxList,
      docs,
      patientAppointments,
      isReturning: visits.length + rxList.length + docsIssued.length + docs.length > 0 || totalHistoryCount > 1,
    };
  };

  const handleOpenPatientFile = (patient: PatientRecord) => {
    onSelectActivePatient(patient);
    setInspectingPatient(patient);
    setTab('patients');
  };

  const viewedPatient = inspectingPatient;
  const viewedStats = viewedPatient ? getPatientHistoryStats(viewedPatient.id) : null;

  // Chronological order (oldest -> newest at bottom)
  const orderedMessages = [...messages].sort((a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    return ta - tb;
  });

  const handleSendNurseText = async (textToSend: string) => {
    const clean = textToSend.trim();
    if (!clean || sendingMsg || !onSendMessageToNurse) return false;
    setSendingMsg(true);
    setSendMsgError(null);
    const res = await onSendMessageToNurse(clean);
    setSendingMsg(false);
    if (res && !res.success && res.error) {
      setSendMsgError(res.error);
      return false;
    }
    return true;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-t-3xl sm:rounded-3xl bg-white shadow-2xl border border-slate-200/80 max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pt-3 pb-1 flex justify-center sm:hidden">
          <div className="w-10 h-1.5 rounded-full bg-slate-300" />
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900">ملفات العيادة الحية</h2>
              <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg">
                متزامن
              </span>
            </div>
            <p className="text-xs text-slate-500 standard-digits mt-0.5">
              المواعيد: {toWesternDigits(appointments.length)} · المرضى:{' '}
              {toWesternDigits(patients.length)} · الرسائل: {toWesternDigits(messages.length)}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onRefreshData}
              className="min-h-[38px] px-3 rounded-xl text-xs font-bold text-emerald-700 hover:bg-emerald-50"
            >
              تحديث
            </button>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
              aria-label="إغلاق"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs (4 focused clinic tabs) */}
        <div className="px-4 pt-3">
          <div className="grid grid-cols-4 gap-1 p-1 bg-slate-100 rounded-xl">
            {(
              [
                { id: 'queue', label: 'المواعيد', Icon: Clock },
                { id: 'patients', label: 'المرضى', Icon: Users },
                { id: 'messages', label: 'الممرض', Icon: MessageSquare },
                { id: 'overview', label: 'العيادة', Icon: BarChart3 },
              ] as const
            ).map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setTab(id);
                  if (id !== 'patients') setInspectingPatient(null);
                }}
                className={`min-h-[40px] flex items-center justify-center gap-1 rounded-lg text-[11px] sm:text-xs font-bold transition-colors whitespace-nowrap ${
                  tab === id ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-600'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="p-5 overflow-y-auto clean-scroll flex-1 space-y-3">
          {/* Explicit Supabase Error Visibility */}
          {snapshotErrors.length > 0 && (
            <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-red-900 space-y-1">
              <div className="flex items-center gap-2 text-xs font-bold">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                <span>تعذر قراءة بعض جداول قاعدة البيانات ({toWesternDigits(snapshotErrors.length)})</span>
              </div>
              <p className="text-[11px] text-red-700 font-mono-tabular break-all" dir="ltr">
                {snapshotErrors.slice(0, 3).join(' | ')}
              </p>
            </div>
          )}

          {/* Waiting Queue & All Appointments (Past / Upcoming / Active) Tab */}
          {tab === 'queue' && (
            <div className="space-y-3">
              {/* Compact Dropdown + Search Filter */}
              <div className="flex flex-col sm:flex-row gap-2">
                <select
                  value={queueFilter}
                  onChange={(e) => setQueueFilter(e.target.value as QueueFilterMode)}
                  aria-label="تصفية المواعيد"
                  className="min-h-[42px] px-3 rounded-xl border border-emerald-200 bg-emerald-50/50 text-xs font-bold text-emerald-900 focus:outline-none focus:border-emerald-500 standard-digits"
                >
                  <option value="active">
                    الانتظار الحالي ({toWesternDigits(waitingList.length)})
                  </option>
                  <option value="all">
                    جميع المواعيد ({toWesternDigits(appointments.length)})
                  </option>
                  <option value="upcoming">
                    المواعيد القادمة ({toWesternDigits(upcomingAppointments.length)})
                  </option>
                  <option value="past">
                    المواعيد السابقة ({toWesternDigits(pastAppointments.length)})
                  </option>
                </select>

                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={appointmentQuery}
                    onChange={(e) => setAppointmentQuery(e.target.value)}
                    placeholder="ابحث بالمريض، التاريخ أو السبب..."
                    className="w-full min-h-[42px] pr-9 pl-3 rounded-xl border border-slate-200 bg-white text-xs sm:text-sm focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {displayedAppointments.length === 0 && waitingQueue.length === 0 ? (
                <div className="py-10 text-center text-sm text-slate-500 space-y-2">
                  <p>
                    {snapshotErrors.length > 0
                      ? 'لم يتم جلب قائمة المواعيد بسبب خطأ الصلاحيات الموضح أعلاه.'
                      : queueFilter === 'active'
                        ? 'لا توجد مواعيد في قاعة الانتظار الحالية.'
                        : 'لا توجد مواعيد مطابقة ضمن هذا التصنيف.'}
                  </p>
                  {queueFilter !== 'all' && appointments.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setQueueFilter('all')}
                      className="min-h-[36px] px-3.5 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-bold hover:bg-emerald-100"
                    >
                      عرض جميع المواعيد ({toWesternDigits(appointments.length)})
                    </button>
                  )}
                </div>
              ) : (
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden">
                  {displayedAppointments.map((item, idx) => {
                    const statusKey = String(item.status || 'waiting').toLowerCase();
                    const statusLabel = STATUS_LABELS[statusKey] || statusKey;
                    const isActiveItem = !isPastAppointment(item, todayDate);
                    const waitLabel = isActiveItem ? formatWaitingMinutes(item) : null;
                    const parsedNotes = parseAppointmentNotes(item.administrative_notes);
                    const fee = resolveAppointmentFee(item, services, clinic);
                    const dateStr = getAppointmentEffectiveDate(item);
                    const timeStr =
                      toWesternDigits(item.appointment_time) || formatAlgiersTime(item.start_at);
                    const linkedPatient = item.patient_id
                      ? patients.find((p) => p.id === item.patient_id)
                      : patients.find(
                          (p) =>
                            item.patient_name &&
                            getPatientDisplayName(p).toLowerCase() === item.patient_name.toLowerCase()
                        );
                    const displayName =
                      item.patient_name ||
                      (linkedPatient ? getPatientDisplayName(linkedPatient) : 'مريض مسجل');
                    const isInVisit = statusKey === 'in_visit';

                    return (
                      <div
                        key={item.id || idx}
                        className={`p-3.5 flex items-center justify-between gap-2 ${
                          isInVisit ? 'bg-amber-50/70' : 'bg-white'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            if (linkedPatient) {
                              handleOpenPatientFile(linkedPatient);
                            }
                          }}
                          className="min-w-0 flex-1 text-right space-y-0.5 group"
                        >
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono-tabular text-xs font-bold text-emerald-700">
                              #{toWesternDigits(item.queue_number ?? idx + 1)}
                            </span>
                            <p className="text-sm font-bold text-slate-900 truncate group-hover:text-emerald-700">
                              {displayName}
                            </p>
                            {isInVisit && (
                              <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded">
                                داخل الفحص
                              </span>
                            )}
                            {statusKey === 'completed' && (
                              <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded">
                                مكتمل
                              </span>
                            )}
                            {item.is_emergency && (
                              <span className="text-[10px] font-bold text-red-700 bg-red-50 px-1.5 py-0.5 rounded">
                                مستعجل
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 truncate standard-digits">
                            {[
                              statusLabel,
                              waitLabel,
                              item.service_name || item.reason_for_visit,
                              toWesternDigits(item.patient_phone || linkedPatient?.phone),
                              [dateStr, timeStr].filter(Boolean).join(' '),
                              `${toWesternDigits(fee)} دج`,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </p>
                          {(parsedNotes.cleanNotes || parsedNotes.attachments.length > 0) && (
                            <p className="text-[11px] text-slate-600 truncate">
                              {parsedNotes.cleanNotes}
                              {parsedNotes.attachments.length > 0
                                ? ` · مرفقات: ${toWesternDigits(parsedNotes.attachments.length)}`
                                : ''}
                            </p>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            if (linkedPatient) {
                              handleOpenPatientFile(linkedPatient);
                            } else {
                              onAskRobotAbout(
                                `ما وضع الموعد للمريض ${displayName} (${statusLabel})؟`
                              );
                              onClose();
                            }
                          }}
                          className="min-h-[38px] px-2.5 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-bold hover:bg-emerald-100 whitespace-nowrap shrink-0"
                        >
                          {linkedPatient ? 'الملف الطبي' : 'ملخص الروبوت'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Patients & Clinical Records Tab */}
          {tab === 'patients' && (
            <>
              {viewedPatient && viewedStats ? (
                /* Focused Patient Medical File View */
                <div className="space-y-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setInspectingPatient(null)}
                      className="min-h-[38px] px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold flex items-center gap-1.5"
                    >
                      <ArrowRight className="w-3.5 h-3.5" />
                      <span>قائمة المرضى</span>
                    </button>

                    <span
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                        viewedStats.isReturning
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : 'bg-amber-50 text-amber-800 border border-amber-200'
                      }`}
                    >
                      {viewedStats.isReturning ? 'مريض مداوم في العيادة' : 'مريض جديد'}
                    </span>
                  </div>

                  {/* Patient Card */}
                  <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-200/80 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-base font-bold text-slate-900">
                            {getPatientDisplayName(viewedPatient)}
                          </h3>
                          {viewedPatient.patient_number && (
                            <span className="text-xs font-mono-tabular text-emerald-800 bg-white px-2 py-0.5 rounded-md border border-emerald-200">
                              {toWesternDigits(viewedPatient.patient_number)}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-600 mt-1 standard-digits">
                          {[
                            calculatePatientAge(viewedPatient.date_of_birth, viewedPatient.age) !== null
                              ? `${toWesternDigits(
                                  calculatePatientAge(viewedPatient.date_of_birth, viewedPatient.age)
                                )} سنة`
                              : null,
                            viewedPatient.gender === 'female'
                              ? 'أنثى'
                              : viewedPatient.gender === 'male'
                                ? 'ذكر'
                                : null,
                            viewedPatient.blood_group ? `فصيلة ${viewedPatient.blood_group}` : null,
                            toWesternDigits(viewedPatient.phone),
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          onAskRobotAbout(
                            `لخص لي الحالة الطبية للمريض ${getPatientDisplayName(viewedPatient)}.`
                          );
                          onClose();
                        }}
                        className="min-h-[36px] px-3 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 shrink-0"
                      >
                        ملخص الروبوت
                      </button>
                    </div>

                    {(viewedPatient.chronic_diseases ||
                      viewedPatient.allergies ||
                      viewedPatient.medical_notes) && (
                      <div className="p-3 rounded-xl bg-white/95 border border-emerald-100 text-xs text-slate-700 space-y-1">
                        {viewedPatient.chronic_diseases && (
                          <p>
                            <span className="font-bold text-slate-900">الأمراض المزمنة: </span>
                            {viewedPatient.chronic_diseases}
                          </p>
                        )}
                        {viewedPatient.allergies && (
                          <p>
                            <span className="font-bold text-slate-900">الحساسية: </span>
                            {viewedPatient.allergies}
                          </p>
                        )}
                        {viewedPatient.medical_notes && (
                          <p>
                            <span className="font-bold text-slate-900">ملاحظات طبية: </span>
                            {viewedPatient.medical_notes}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Returning vs New Medical History */}
                    {viewedStats.isReturning ? (
                      <>
                        <div className="grid grid-cols-4 gap-1.5 text-center standard-digits">
                          <div className="bg-white/95 rounded-xl py-1.5 px-1 border border-emerald-100">
                            <p className="text-xs font-bold text-slate-900">
                              {toWesternDigits(viewedStats.visits.length)}
                            </p>
                            <p className="text-[10px] text-slate-500">كشوفات</p>
                          </div>
                          <div className="bg-white/95 rounded-xl py-1.5 px-1 border border-emerald-100">
                            <p className="text-xs font-bold text-slate-900">
                              {toWesternDigits(viewedStats.rxList.length)}
                            </p>
                            <p className="text-[10px] text-slate-500">وصفات</p>
                          </div>
                          <div className="bg-white/95 rounded-xl py-1.5 px-1 border border-emerald-100">
                            <p className="text-xs font-bold text-slate-900">
                              {toWesternDigits(viewedStats.docsIssued.length)}
                            </p>
                            <p className="text-[10px] text-slate-500">شهادات</p>
                          </div>
                          <div className="bg-white/95 rounded-xl py-1.5 px-1 border border-emerald-100">
                            <p className="text-xs font-bold text-slate-900">
                              {toWesternDigits(viewedStats.docs.length)}
                            </p>
                            <p className="text-[10px] text-slate-500">مستندات</p>
                          </div>
                        </div>

                        {viewedStats.visits.length > 0 && (
                          <div className="space-y-1.5 pt-1">
                            <p className="text-xs font-bold text-emerald-950">سجل الكشوفات السابقة:</p>
                            {viewedStats.visits.map((v) => (
                              <div
                                key={v.id}
                                className="text-xs text-slate-800 bg-white rounded-xl p-2.5 border border-emerald-100 space-y-0.5"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-bold text-slate-900">
                                    {v.diagnosis || 'كشف سريري'}
                                  </span>
                                  <span className="font-mono-tabular text-[11px] font-semibold text-emerald-700">
                                    {formatAlgiersDate(v.visit_date || v.created_at)}
                                  </span>
                                </div>
                                {(v.clinical_notes || v.treatment_notes) && (
                                  <p className="text-[11px] text-slate-600">
                                    {[v.clinical_notes, v.treatment_notes].filter(Boolean).join(' — ')}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {viewedStats.rxList.length > 0 && (
                          <div className="space-y-1.5 pt-1">
                            <p className="text-xs font-bold text-emerald-950">الوصفات الطبية السابقة:</p>
                            {viewedStats.rxList.map((rx) => (
                              <div
                                key={rx.id}
                                className="text-xs text-slate-800 bg-white rounded-xl p-2.5 border border-emerald-100 space-y-1"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-bold text-slate-900">وصفة طبية</span>
                                  <span className="font-mono-tabular text-[11px] text-emerald-700">
                                    {formatAlgiersDate(rx.created_at)}
                                  </span>
                                </div>
                                {Array.isArray(rx.medications) && rx.medications.length > 0 && (
                                  <ul className="text-[11px] text-slate-600 list-disc pr-4 space-y-0.5">
                                    {rx.medications.map((med, mIdx) => (
                                      <li key={mIdx}>
                                        {[med.drug_name || med.dci, med.dosage, med.frequency, med.duration]
                                          .filter(Boolean)
                                          .join(' · ')}
                                      </li>
                                    ))}
                                  </ul>
                                )}
                                {rx.advice && (
                                  <p className="text-[11px] text-slate-500">نصائح: {rx.advice}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {(viewedStats.docsIssued.length > 0 || viewedStats.docs.length > 0) && (
                          <div className="space-y-1.5 pt-1">
                            <p className="text-xs font-bold text-emerald-950 flex items-center gap-1">
                              <FileText className="w-3.5 h-3.5" />
                              <span>الشهادات والمستندات:</span>
                            </p>
                            {viewedStats.docsIssued.map((doc) => (
                              <div
                                key={doc.id}
                                className="text-[11px] text-slate-700 bg-white rounded-xl p-2 border border-emerald-100"
                              >
                                {formatAlgiersDate(doc.visit_date || doc.created_at)} ·{' '}
                                {String(doc.clinical_notes || doc.diagnosis || '').replace(/^\[DOC\]\s*/, '')}
                              </div>
                            ))}
                            {viewedStats.docs.map((doc) => (
                              <div
                                key={doc.id}
                                className="text-[11px] text-slate-700 bg-white rounded-xl p-2 border border-emerald-100"
                              >
                                {doc.document_name || 'مستند طبي'}
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="p-3.5 rounded-xl bg-white border border-amber-200/80 text-xs text-slate-700 leading-relaxed">
                        <p className="font-bold text-amber-900">مريض جديد — أول زيارة</p>
                        <p className="text-slate-600 mt-0.5">
                          لا توجد كشوفات أو وصفات طبية مسجلة مسبقاً لهذا المريض في العيادة.
                        </p>
                      </div>
                    )}

                    {viewedStats.patientAppointments.length > 0 && (
                      <div className="space-y-1.5 pt-1">
                        <p className="text-xs font-bold text-emerald-950">مواعيد المريض (السابقة والقادمة):</p>
                        {viewedStats.patientAppointments.map((apt) => {
                          const stKey = String(apt.status || 'waiting').toLowerCase();
                          const stLabel = STATUS_LABELS[stKey] || stKey;
                          const aptDate = getAppointmentEffectiveDate(apt);
                          const aptTime = toWesternDigits(apt.appointment_time) || formatAlgiersTime(apt.start_at);
                          return (
                            <div
                              key={apt.id}
                              className="text-xs text-slate-800 bg-white rounded-xl p-2.5 border border-emerald-100 flex items-center justify-between gap-2 standard-digits"
                            >
                              <span className="truncate">
                                {[aptDate, aptTime, apt.reason_for_visit].filter(Boolean).join(' · ') || 'موعد طبي'}
                              </span>
                              <span className="text-[11px] font-bold text-emerald-700 shrink-0">
                                {stLabel}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* Patients Directory List */
                <>
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={patientQuery}
                      onChange={(e) => setPatientQuery(e.target.value)}
                      placeholder="ابحث عن مريض بالاسم، الرقم أو الهاتف..."
                      className="w-full min-h-[44px] pr-10 pl-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  {filteredPatients.length === 0 ? (
                    <div className="py-8 text-center text-sm text-slate-500">
                      {snapshotErrors.length > 0
                        ? 'تعذر عرض المرضى بسبب خطأ الصلاحيات أعلاه.'
                        : 'لا توجد ملفات مرضى مطابقة.'}
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden">
                      {filteredPatients.map((p) => {
                        const selected = activePatient?.id === p.id;
                        const age = calculatePatientAge(p.date_of_birth, p.age);
                        const stats = getPatientHistoryStats(p.id);
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => handleOpenPatientFile(p)}
                            className={`w-full min-h-[60px] px-4 py-3 flex items-center justify-between gap-2 text-right transition-colors ${
                              selected ? 'bg-emerald-50/70' : 'bg-white hover:bg-slate-50'
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <p className="text-sm font-bold text-slate-900 truncate">
                                  {getPatientDisplayName(p)}
                                </p>
                                {p.patient_number && (
                                  <span className="text-[11px] font-mono-tabular text-slate-400">
                                    {toWesternDigits(p.patient_number)}
                                  </span>
                                )}
                                <span
                                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                    stats.isReturning
                                      ? 'bg-emerald-50 text-emerald-700'
                                      : 'bg-slate-100 text-slate-600'
                                  }`}
                                >
                                  {stats.isReturning
                                    ? `مداوم · ${toWesternDigits(stats.visits.length)}`
                                    : 'جديد'}
                                </span>
                              </div>
                              <p className="text-xs text-slate-500 truncate mt-0.5 standard-digits">
                                {[
                                  age !== null ? `${toWesternDigits(age)} سنة` : null,
                                  p.chronic_diseases && p.chronic_diseases !== 'لا توجد'
                                    ? `أمراض: ${p.chronic_diseases}`
                                    : null,
                                  p.allergies && p.allergies !== 'لا توجد'
                                    ? `حساسية: ${p.allergies}`
                                    : null,
                                  toWesternDigits(p.phone),
                                ]
                                  .filter(Boolean)
                                  .join(' · ') || 'ملف طبي'}
                              </p>
                            </div>
                            {selected && <Check className="w-4 h-4 text-emerald-600 shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* Direct Nurse Conversation Tab */}
          {tab === 'messages' && (
            <div className="flex flex-col h-[58vh] min-h-[340px] justify-between gap-3">
              {/* Chat Feed */}
              <div className="flex-1 overflow-y-auto clean-scroll rounded-2xl bg-slate-50/80 border border-slate-200/80 p-3 space-y-2.5">
                {orderedMessages.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-sm text-slate-500 text-center px-4">
                    {snapshotErrors.length > 0
                      ? 'تعذر جلب الرسائل بسبب خطأ الصلاحيات.'
                      : 'ابدأ المحادثة مباشرة مع الممرض أو الاستقبال.'}
                  </div>
                ) : (
                  orderedMessages.map((m, idx) => {
                    const isDoctorMsg = m.sender_role === 'doctor';
                    return (
                      <div
                        key={String(m.id ?? idx)}
                        className={`flex flex-col ${isDoctorMsg ? 'items-start' : 'items-end'}`}
                      >
                        <div
                          className={`max-w-[84%] px-3.5 py-2.5 rounded-2xl border ${
                            isDoctorMsg
                              ? 'bg-emerald-600 text-white border-emerald-600 rounded-tr-sm'
                              : 'bg-white text-slate-900 border-slate-200 rounded-tl-sm'
                          }`}
                        >
                          <div
                            className={`flex items-center justify-between gap-3 text-[10.5px] mb-1 ${
                              isDoctorMsg ? 'text-emerald-100' : 'text-slate-500'
                            }`}
                          >
                            <span className="font-bold">
                              {m.sender_name || (isDoctorMsg ? 'الطبيب' : 'الممرض')}
                            </span>
                            <span className="standard-digits">
                              {formatAlgiersTime(m.created_at)}
                            </span>
                          </div>
                          <p className="text-sm leading-relaxed">{m.message}</p>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Error banner if database insert fails */}
              {sendMsgError && (
                <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
                  <p className="font-bold">تعذر حفظ الرسالة في Supabase: {sendMsgError}</p>
                </div>
              )}

              {/* Exactly 3 simple quick canned messages */}
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_NURSE_MESSAGES.map((quickText) => (
                    <button
                      key={quickText}
                      type="button"
                      disabled={sendingMsg}
                      onClick={() => handleSendNurseText(quickText)}
                      className="min-h-[34px] px-3 rounded-xl bg-white border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-800 transition-colors"
                    >
                      {quickText}
                    </button>
                  ))}
                </div>

                {/* Direct Message Composer */}
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const ok = await handleSendNurseText(nurseMsgInput);
                    if (ok) setNurseMsgInput('');
                  }}
                  className="flex items-center gap-2"
                >
                  <input
                    type="text"
                    value={nurseMsgInput}
                    onChange={(e) => setNurseMsgInput(e.target.value)}
                    placeholder="اكتب رسالة مباشرة للممرض..."
                    className="flex-1 min-h-[44px] px-3.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:border-emerald-500"
                  />
                  <button
                    type="submit"
                    disabled={sendingMsg || !nurseMsgInput.trim()}
                    className="min-h-[44px] px-4 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-40 flex items-center gap-1.5 shrink-0"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{sendingMsg ? '...' : 'إرسال'}</span>
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* Clinic Profile, Schedules & Revenue Overview Tab */}
          {tab === 'overview' && (
            <div className="space-y-4">
              {/* Doctor & Clinic Profile Card */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
                <div className="flex items-center gap-3">
                  {clinicImageUrl ? (
                    <img
                      src={clinicImageUrl}
                      alt={getClinicDisplayName(clinic)}
                      className="w-11 h-11 rounded-xl object-cover border border-slate-200 shrink-0"
                    />
                  ) : (
                    <div className="w-11 h-11 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                      <Building2 className="w-5 h-5" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900 truncate">
                      {getClinicDisplayName(clinic)}
                    </p>
                    <p className="text-xs text-slate-600 truncate">
                      {[
                        doctorProfile?.full_name || userProfile?.full_name || clinic?.doctor_name,
                        doctorProfile?.specialty || clinic?.specialty,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                </div>
                <div className="text-xs text-slate-600 space-y-1 pt-1 border-t border-slate-200/70 standard-digits">
                  {(clinic?.phone || doctorProfile?.professional_phone || userProfile?.phone) && (
                    <p>
                      الهاتف:{' '}
                      {toWesternDigits(
                        clinic?.phone || doctorProfile?.professional_phone || userProfile?.phone
                      )}
                    </p>
                  )}
                  {(clinic?.address || clinic?.city || clinic?.wilaya) && (
                    <p>
                      العنوان:{' '}
                      {[clinic?.address, clinic?.city, clinic?.wilaya].filter(Boolean).join('، ')}
                    </p>
                  )}
                  <p>
                    التسعيرة الافتراضية:{' '}
                    {toWesternDigits(clinic?.consultation_fee ?? 1500)} دج
                  </p>
                </div>
              </div>

              {/* Revenue & Visits Summary */}
              {revenueSummary && (
                <div className="grid grid-cols-3 gap-2 standard-digits">
                  <div className="p-3 rounded-2xl border border-slate-200 bg-white text-center">
                    <p className="text-sm font-bold text-emerald-700">
                      {toWesternDigits(Math.round(revenueSummary.total_revenue))} دج
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">مداخيل الشهر</p>
                  </div>
                  <div className="p-3 rounded-2xl border border-slate-200 bg-white text-center">
                    <p className="text-sm font-bold text-slate-900">
                      {toWesternDigits(revenueSummary.visits_count)}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">كشوفات محققة</p>
                  </div>
                  <div className="p-3 rounded-2xl border border-slate-200 bg-white text-center">
                    <p className="text-sm font-bold text-slate-900">
                      {toWesternDigits(Math.round(revenueSummary.avg_per_visit))} دج
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">متوسط الكشف</p>
                  </div>
                </div>
              )}

              {/* Working Schedule */}
              {schedules.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Stethoscope className="w-3.5 h-3.5 text-slate-500" />
                    <span>جدول عمل العيادة</span>
                  </p>
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden standard-digits">
                    {schedules.map((s) => (
                      <div
                        key={String(s.day_id)}
                        className="px-3.5 py-2 flex items-center justify-between text-xs bg-white"
                      >
                        <span className="font-semibold text-slate-800">
                          {s.day_name_ar || s.day_name_fr || String(s.day_id)}
                        </span>
                        <span className={s.is_open ? 'text-emerald-700 font-semibold' : 'text-slate-400'}>
                          {s.is_open
                            ? `${toWesternDigits(s.start_time || '08:00')} - ${toWesternDigits(
                                s.end_time || '16:00'
                              )}`
                            : 'مغلق'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Accounting Entries */}
              {accountingEntries.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-bold text-slate-700">آخر القيود المحاسبية</p>
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden standard-digits">
                    {accountingEntries.slice(0, 6).map((entry) => (
                      <div
                        key={entry.entry_id}
                        className="px-3.5 py-2.5 flex items-center justify-between text-xs bg-white"
                      >
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-800 truncate">
                            {entry.service_label || 'استشارة طبية'}
                          </p>
                          <p className="text-[11px] text-slate-400">
                            {formatAlgiersDate(entry.entry_date || entry.created_at)} · {entry.status}
                          </p>
                        </div>
                        <span className="font-bold text-slate-900 shrink-0">
                          {toWesternDigits(entry.amount_dzd ?? 0)} دج
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
