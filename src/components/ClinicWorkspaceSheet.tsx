import React, { useEffect, useState } from 'react';
import {
  ArrowRightCircle,
  Check,
  CheckCheck,
  Clock,
  MessageSquare,
  Pill,
  Search,
  Send,
  Users,
  X,
} from 'lucide-react';
import {
  calculatePatientAge,
  fetchInitialAdwiaCatalog,
  getPatientDisplayName,
  markClinicMessagesRead,
  passPatientToDoctor,
  searchAdwiaCatalog,
  sendClinicTeamMessage,
} from '../lib/supabase';
import type {
  AdwiaDrugRecord,
  ClinicMessageRecord,
  ClinicRole,
  PatientRecord,
  WaitingItem,
} from '../types/robot';

export type WorkspaceTab = 'queue' | 'patients' | 'drugs' | 'messages';

const STATUS_LABELS: Record<string, string> = {
  new: 'جديد',
  pending_confirmation: 'بانتظار التأكيد',
  confirmed: 'موعد مؤكد',
  waiting: 'في الانتظار',
  patient_arrived: 'وصل المريض',
  in_visit: 'في الفحص',
  completed: 'مكتمل',
  cancelled: 'ملغى',
  no_show: 'لم يحضر',
};

function formatWaitingMinutes(item: WaitingItem): string | null {
  const ref = item.handed_to_doctor_at || item.start_at || item.created_at;
  if (!ref) return null;
  const diffMs = Date.now() - new Date(ref).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0 || diffMs > 12 * 3600_000) return null;
  const mins = Math.round(diffMs / 60_000);
  return mins <= 1 ? 'الآن' : `منذ ${mins} د`;
}

interface ClinicWorkspaceSheetProps {
  open: boolean;
  initialTab?: WorkspaceTab;
  initialDrugQuery?: string;
  onClose: () => void;
  clinicId: string;
  role: ClinicRole;
  doctorName: string;
  assistantName?: string | null;
  waitingList: WaitingItem[];
  patients: PatientRecord[];
  messages: ClinicMessageRecord[];
  activePatient: PatientRecord | null;
  onSelectActivePatient: (patient: PatientRecord | null) => void;
  onAskRobotAbout: (prompt: string) => void;
  onRefreshData: () => void;
}

export const ClinicWorkspaceSheet: React.FC<ClinicWorkspaceSheetProps> = ({
  open,
  initialTab = 'queue',
  initialDrugQuery = '',
  onClose,
  clinicId,
  role,
  doctorName,
  assistantName,
  waitingList,
  patients,
  messages,
  activePatient,
  onSelectActivePatient,
  onAskRobotAbout,
  onRefreshData,
}) => {
  const [tab, setTab] = useState<WorkspaceTab>(initialTab);
  const [patientQuery, setPatientQuery] = useState('');
  const [drugQuery, setDrugQuery] = useState('');
  const [drugResults, setDrugResults] = useState<AdwiaDrugRecord[]>([]);
  const [searchingDrugs, setSearchingDrugs] = useState(false);
  const [teamMsgInput, setTeamMsgInput] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);
  const [passingId, setPassingId] = useState<string | null>(null);

  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);

  useEffect(() => {
    if (!open || tab !== 'drugs') return;
    const preset = initialDrugQuery.trim();
    if (preset) {
      setDrugQuery(preset);
      setSearchingDrugs(true);
      searchAdwiaCatalog(preset).then((list) => {
        setDrugResults(list);
        setSearchingDrugs(false);
      });
    } else if (drugResults.length === 0 && !drugQuery.trim()) {
      setSearchingDrugs(true);
      fetchInitialAdwiaCatalog().then((list) => {
        setDrugResults(list);
        setSearchingDrugs(false);
      });
    }
  }, [open, tab, initialDrugQuery]);

  useEffect(() => {
    if (open && tab === 'messages' && clinicId && messages.some((m) => m.is_read === false)) {
      markClinicMessagesRead(clinicId).then(() => onRefreshData());
    }
  }, [open, tab, clinicId, messages, onRefreshData]);

  if (!open) return null;

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

  const handleSearchDrugs = async (e: React.FormEvent) => {
    e.preventDefault();
    setSearchingDrugs(true);
    const list = drugQuery.trim()
      ? await searchAdwiaCatalog(drugQuery)
      : await fetchInitialAdwiaCatalog();
    setDrugResults(list);
    setSearchingDrugs(false);
  };

  const sendMessageText = async (textToSend: string) => {
    if (!textToSend.trim() || !clinicId) return;
    setSendingMsg(true);
    const senderLabel =
      role === 'doctor' ? `د. ${doctorName}` : assistantName || 'الاستقبال';
    await sendClinicTeamMessage(clinicId, role, senderLabel, textToSend);
    setTeamMsgInput('');
    setSendingMsg(false);
    onRefreshData();
  };

  const handleSendTeamMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    await sendMessageText(teamMsgInput);
  };

  const handlePassToDoctor = async (item: WaitingItem) => {
    setPassingId(item.id);
    await passPatientToDoctor(item.id, item.doctor_id);
    setPassingId(null);
    onRefreshData();
  };

  const orderedMessages = [...messages].reverse();

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-t-3xl sm:rounded-3xl bg-white shadow-2xl border border-slate-200/80 max-h-[88vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pt-3 pb-1 flex justify-center sm:hidden">
          <div className="w-10 h-1.5 rounded-full bg-slate-300" />
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-900">ملفات العيادة الحية</h2>
            <p className="text-xs text-slate-500 standard-digits">
              الانتظار والمواعيد: {waitingList.length} · المرضى: {patients.length} · الرسائل:{' '}
              {messages.length}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
            aria-label="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="px-4 pt-3">
          <div className="grid grid-cols-4 gap-1 p-1 bg-slate-100 rounded-xl">
            {(
              [
                { id: 'queue', label: 'الانتظار', Icon: Clock },
                { id: 'patients', label: 'المرضى', Icon: Users },
                { id: 'drugs', label: 'الأدوية', Icon: Pill },
                { id: 'messages', label: 'الممرض', Icon: MessageSquare },
              ] as const
            ).map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`min-h-[40px] flex items-center justify-center gap-1 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                  tab === id ? 'bg-white text-sky-700 shadow-xs' : 'text-slate-600'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="p-5 overflow-y-auto clean-scroll flex-1 space-y-3">
          {/* Waiting Queue & Appointments Tab */}
          {tab === 'queue' && (
            <>
              {waitingList.length === 0 ? (
                <div className="py-10 text-center text-sm text-slate-500">
                  لا توجد مواعيد أو مرضى في قاعة الانتظار حالياً.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden">
                  {waitingList.map((item, idx) => {
                    const statusKey = String(item.status || 'waiting').toLowerCase();
                    const statusLabel = STATUS_LABELS[statusKey] || statusKey;
                    const waitLabel = formatWaitingMinutes(item);
                    const canPass =
                      statusKey === 'waiting' ||
                      statusKey === 'patient_arrived' ||
                      statusKey === 'confirmed';

                    return (
                      <div
                        key={item.id || idx}
                        className="p-3.5 flex items-center justify-between gap-2 bg-white"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono-tabular text-xs font-bold text-sky-700">
                              #{item.queue_number ?? idx + 1}
                            </span>
                            <p className="text-sm font-bold text-slate-900 truncate">
                              {item.patient_name || 'مريض مسجل'}
                            </p>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5 truncate standard-digits">
                            {[
                              statusLabel,
                              waitLabel,
                              item.reason_for_visit,
                              item.patient_phone,
                              item.appointment_time || item.booking_date,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {canPass && (
                            <button
                              type="button"
                              onClick={() => handlePassToDoctor(item)}
                              disabled={passingId === item.id}
                              className="min-h-[38px] px-2.5 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-bold hover:bg-emerald-100 flex items-center gap-1 whitespace-nowrap"
                              title="تمرير المريض إلى قاعة الفحص"
                            >
                              <ArrowRightCircle className="w-3.5 h-3.5" />
                              <span>{passingId === item.id ? '...' : 'إدخال'}</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              onAskRobotAbout(
                                `ما هو وضع المريض ${
                                  item.patient_name || `#${item.queue_number ?? idx + 1}`
                                } (${statusLabel})؟`
                              );
                              onClose();
                            }}
                            className="min-h-[38px] px-2.5 rounded-xl bg-sky-50 text-sky-700 text-xs font-bold hover:bg-sky-100 whitespace-nowrap"
                          >
                            اسأل الروبوت
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* Patients Tab */}
          {tab === 'patients' && (
            <>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={patientQuery}
                  onChange={(e) => setPatientQuery(e.target.value)}
                  placeholder="ابحث عن مريض بالاسم، الرقم أو الهاتف..."
                  className="w-full min-h-[44px] pr-10 pl-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-sky-500"
                />
              </div>

              {activePatient && (
                <div className="p-3 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-sky-900 truncate">
                      المريض النشط للنقاش: {getPatientDisplayName(activePatient)}
                    </p>
                    <p className="text-[11px] text-sky-700 truncate">
                      {[
                        activePatient.chronic_diseases,
                        activePatient.allergies,
                        activePatient.blood_group ? `فصيلة ${activePatient.blood_group}` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ') || 'لا توجد أمراض مزمنة مسجلة'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onSelectActivePatient(null)}
                    className="min-h-[36px] px-2.5 text-xs font-bold text-sky-800 hover:bg-sky-100 rounded-lg"
                  >
                    إلغاء
                  </button>
                </div>
              )}

              {filteredPatients.length === 0 ? (
                <div className="py-8 text-center text-sm text-slate-500">
                  لا توجد ملفات مرضى مطابقة.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden">
                  {filteredPatients.map((p) => {
                    const selected = activePatient?.id === p.id;
                    const age = calculatePatientAge(p.date_of_birth);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          onSelectActivePatient(selected ? null : p);
                          onClose();
                        }}
                        className={`w-full min-h-[58px] px-4 py-3 flex items-center justify-between text-right transition-colors ${
                          selected ? 'bg-sky-50/70' : 'bg-white hover:bg-slate-50'
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-900 truncate">
                            {getPatientDisplayName(p)}
                            {p.patient_number && (
                              <span className="text-[11px] font-mono-tabular text-slate-400 mr-2">
                                #{p.patient_number}
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-slate-500 truncate mt-0.5">
                            {[
                              age !== null ? `${age} سنة` : null,
                              p.chronic_diseases && p.chronic_diseases !== 'لا توجد'
                                ? `أمراض: ${p.chronic_diseases}`
                                : null,
                              p.allergies && p.allergies !== 'لا توجد'
                                ? `حساسية: ${p.allergies}`
                                : null,
                              p.phone,
                            ]
                              .filter(Boolean)
                              .join(' · ') || 'ملف طبي'}
                          </p>
                        </div>
                        {selected && <Check className="w-4 h-4 text-sky-600 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* Adwia Drugs Catalog Tab */}
          {tab === 'drugs' && (
            <>
              <form onSubmit={handleSearchDrugs} className="flex gap-2">
                <input
                  type="text"
                  value={drugQuery}
                  onChange={(e) => setDrugQuery(e.target.value)}
                  placeholder="ابحث بالاسم التجاري أو DCI أو التصنيف..."
                  className="flex-1 min-h-[44px] px-3.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-sky-500"
                />
                <button
                  type="submit"
                  disabled={searchingDrugs}
                  className="min-h-[44px] px-4 rounded-xl bg-sky-600 text-white text-sm font-bold hover:bg-sky-700 disabled:opacity-40"
                >
                  {searchingDrugs ? '...' : 'بحث'}
                </button>
              </form>

              {searchingDrugs && drugResults.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500">
                  جاري تحميل قائمة الأدوية المعتمدة...
                </div>
              ) : drugResults.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500">
                  لا توجد نتائج مطابقة لهذا الاسم في قاعدة adwia.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden">
                  {drugResults.map((d, i) => {
                    const title = d.name || d.dci || 'دواء';
                    const sub = [
                      d.dci,
                      d.dosage,
                      d.pharmaceutical_form,
                      d.packaging,
                      d.laboratory,
                    ]
                      .filter(Boolean)
                      .join(' · ');
                    return (
                      <div
                        key={String(d.id ?? i)}
                        className="p-3.5 flex items-center justify-between gap-3 bg-white"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2" dir="ltr">
                            <p className="text-sm font-bold text-slate-900 truncate">{title}</p>
                            {d.type && (
                              <span className="text-[10px] font-mono-tabular font-bold text-sky-700 shrink-0">
                                {d.type}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 truncate mt-0.5" dir="ltr">
                            {sub || d.category || 'دواء معتمد'}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            onAskRobotAbout(
                              `أعطني تفاصيل الاستعمال والجرعة والتعارضات لدواء ${title}${
                                d.dci ? ` (${d.dci})` : ''
                              }`
                            );
                            onClose();
                          }}
                          className="min-h-[40px] px-3 rounded-xl bg-sky-50 text-sky-700 text-xs font-bold hover:bg-sky-100 whitespace-nowrap"
                        >
                          استشارة الروبوت
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* Clinic Two-Way Messages (Doctor <-> Nurse/Reception) */}
          {tab === 'messages' && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {[
                  'أدخل المريض التالي من فضلك',
                  'جهّز ملف المريض القادم',
                  'سآخذ استراحة قصيرة لـ 10 دقائق',
                ].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    disabled={sendingMsg}
                    onClick={() => sendMessageText(preset)}
                    className="min-h-[34px] px-2.5 rounded-xl bg-slate-100 hover:bg-sky-50 text-slate-700 hover:text-sky-700 text-[11px] font-semibold transition-colors"
                  >
                    {preset}
                  </button>
                ))}
              </div>

              <form onSubmit={handleSendTeamMessage} className="flex gap-2">
                <input
                  type="text"
                  value={teamMsgInput}
                  onChange={(e) => setTeamMsgInput(e.target.value)}
                  placeholder={
                    role === 'doctor'
                      ? 'اكتب رسالة لتظهر فوراً عند الممرض في المنصة...'
                      : 'اكتب رسالة لتظهر فوراً عند الطبيب...'
                  }
                  className="flex-1 min-h-[44px] px-3.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-sky-500"
                />
                <button
                  type="submit"
                  disabled={sendingMsg || !teamMsgInput.trim()}
                  className="min-h-[44px] min-w-[44px] px-3.5 rounded-xl bg-sky-600 text-white flex items-center justify-center hover:bg-sky-700 disabled:opacity-40"
                  aria-label="إرسال رسالة"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>

              {orderedMessages.length === 0 ? (
                <div className="py-8 text-center text-sm text-slate-500">
                  لا توجد رسائل متبادلة بين الطبيب والممرض بعد. الرسائل المرسلة هنا تظهر فوراً في المنصة.
                </div>
              ) : (
                <div className="space-y-2">
                  {orderedMessages.map((m) => {
                    const isDoctorMsg = m.sender_role === 'doctor';
                    const isMine =
                      (role === 'doctor' && isDoctorMsg) ||
                      (role === 'receptionist' && !isDoctorMsg);
                    return (
                      <div
                        key={String(m.id)}
                        className={`flex flex-col ${isMine ? 'items-start' : 'items-end'}`}
                      >
                        <div
                          className={`max-w-[85%] p-3 rounded-2xl border ${
                            isMine
                              ? 'bg-sky-600 text-white border-sky-600 rounded-tr-sm'
                              : 'bg-slate-50 text-slate-900 border-slate-200/80 rounded-tl-sm'
                          }`}
                        >
                          <div
                            className={`flex items-center justify-between gap-3 text-[11px] mb-1 ${
                              isMine ? 'text-sky-100' : 'text-slate-500'
                            }`}
                          >
                            <span className="font-bold">
                              {m.sender_name ||
                                (isDoctorMsg
                                  ? 'الطبيب'
                                  : m.sender_role === 'nurse'
                                    ? 'الممرض'
                                    : 'الاستقبال')}
                            </span>
                            <span className="standard-digits flex items-center gap-1">
                              {m.created_at
                                ? new Date(m.created_at).toLocaleTimeString('ar-DZ', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })
                                : ''}
                              {isMine && (
                                <CheckCheck
                                  className={`w-3.5 h-3.5 ${
                                    m.is_read ? 'text-emerald-200' : 'text-sky-200/70'
                                  }`}
                                />
                              )}
                            </span>
                          </div>
                          <p className="text-sm leading-relaxed">{m.message}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
