import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import {
  AlertTriangle,
  ArrowUpLeft,
  Bell,
  BellRing,
  Bot,
  Building2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  ExternalLink,
  LogIn,
  MessageCircle,
  MessageSquare,
  Mic,
  MicOff,
  Send,
  SlidersHorizontal,
  Stethoscope,
  X,
} from 'lucide-react';
import { AssistantRobot, type AssistantRobotHandle } from './components/robot/AssistantRobot';
import { ClinicStageBackdrop } from './components/ClinicStageBackdrop';
import { ClinicConnectSheet } from './components/ClinicConnectSheet';
import { RobotStudioSheet } from './components/RobotStudioSheet';
import {
  ClinicWorkspaceSheet,
  type QueueFilterMode,
  type WorkspaceTab,
} from './components/ClinicWorkspaceSheet';
import { ChatHistorySheet, ChatTranscriptContent } from './components/ChatHistorySheet';
import { NotificationsSheet } from './components/NotificationsSheet';
import {
  calculatePatientAge,
  fetchClinicById,
  fetchClinicSnapshot,
  formatAlgiersTime,
  getAppointmentEffectiveDate,
  getClinicDisplayName,
  getClinicImageUrl,
  getPatientDisplayName,
  getTodayAlgiersDate,
  isPastAppointment,
  isUpcomingAppointment,
  resolveClinicForAuthUser,
  sendClinicTeamMessage,
  supabase,
  toWesternDigits,
  type ClinicLiveSnapshot,
} from './lib/supabase';
import {
  DEFAULT_ROBOT_PREFERENCES,
  deriveClinicThemeFallback,
  fetchUserRobotPrefsFromSupabase,
  normalizeClinicRobotDefaults,
  normalizeRobotPreferences,
  readLocalClinicRobotDefaults,
  readLocalUserRobotPrefs,
  resolveRobotUserKey,
  saveUserRobotPrefsToSupabase,
  writeLocalClinicRobotDefaults,
  writeLocalUserRobotPrefs,
  type RobotPreferences,
} from './lib/robotPreferences';
import type { RobotAction } from './lib/robotActions';
import {
  DEFAULT_AI_CONFIG,
  readLocalAiConfig,
  writeLocalAiConfig,
  type AiAssistantConfig,
} from './lib/aiSettings';
import {
  dispatchSystemNotification,
  getNotificationPermissionState,
  registerNotificationServiceWorker,
  requestAppNotificationPermission,
  type AppNotificationItem,
  type NotificationPermissionState,
} from './lib/notifications';
import type {
  ChatMessage,
  ChatMode,
  ClinicAccountingEntry,
  ClinicMessageRecord,
  ClinicRecord,
  ClinicRevenueSummary,
  ClinicRole,
  ClinicScheduleRecord,
  DoctorRecord,
  MedicalServiceRecord,
  MedicalSourceLink,
  MedicalVisitRecord,
  PatientDocumentRecord,
  PatientRecord,
  PrescriptionRecord,
  ProfileRecord,
  RobotState,
  SuggestedClinicAction,
  WaitingItem,
  WaitingQueueRecord,
} from './types/robot';

const QUICK_NURSE_MESSAGES = [
  'استدعاء المريض التالي',
  'يرجى تجهيز ملف المريض',
  'انتهت الاستشارة الحالية',
] as const;

const CLINIC_SESSION_KEY = '3iadati_mobile_session_v2';

interface SavedSession {
  clinicId: string;
  role: ClinicRole;
  isAuthenticated?: boolean;
  accountEmail?: string;
  accountName?: string;
  userIdForPrefs?: string;
}

function readSavedSession(): SavedSession | null {
  try {
    const raw = localStorage.getItem(CLINIC_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedSession>;
    if (
      parsed.clinicId &&
      parsed.isAuthenticated === true &&
      parsed.role === 'doctor' &&
      parsed.accountEmail
    ) {
      return {
        clinicId: parsed.clinicId,
        role: 'doctor',
        isAuthenticated: true,
        accountEmail: parsed.accountEmail,
        accountName: parsed.accountName,
        userIdForPrefs: parsed.userIdForPrefs,
      };
    }
    localStorage.removeItem(CLINIC_SESSION_KEY);
  } catch { /* ignore */ }
  return null;
}

function writeSavedSession(session: SavedSession | null): void {
  try {
    if (!session) {
      localStorage.removeItem(CLINIC_SESSION_KEY);
      return;
    }
    localStorage.setItem(CLINIC_SESSION_KEY, JSON.stringify(session));
  } catch { /* ignore */ }
}

const VALID_ROBOT_ACTIONS: ReadonlySet<string> = new Set([
  'smile',
  'laugh',
  'sad',
  'fly',
  'dance',
  'love',
  'wink',
  'scan',
  'wave',
  'clap',
  'nod',
  'no',
  'bow',
  'open',
  'raise',
  'beckon',
  'shrug',
  'cele',
  'look',
]);

const VALID_ROBOT_STATES: ReadonlySet<string> = new Set([
  'idle',
  'attention',
  'thinking',
  'working',
  'success',
  'alert',
  'sleep',
  'happy',
  'laugh',
  'sad',
  'fly',
]);

export default function App() {
  const robotRef = useRef<AssistantRobotHandle | null>(null);
  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Diff trackers for automatic notifications
  const snapshotInitializedRef = useRef(false);
  const knownWaitingIdsRef = useRef<Set<string>>(new Set());
  const knownMessageIdsRef = useRef<Set<string>>(new Set());
  const alertedDelayIdsRef = useRef<Set<string>>(new Set());

  // Platform Auth & Clinic State
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [isAuthenticatedSession, setIsAuthenticatedSession] = useState(false);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [accountName, setAccountName] = useState<string | null>(null);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [clinic, setClinic] = useState<ClinicRecord | null>(null);
  const [role, setRole] = useState<ClinicRole>('doctor');
  const [prefs, setPrefs] = useState<RobotPreferences>(DEFAULT_ROBOT_PREFERENCES);
  const [syncedPrefsUserKey, setSyncedPrefsUserKey] = useState<string | null>(null);
  const [syncSaving, setSyncSaving] = useState(false);
  const [clinicImgFailed, setClinicImgFailed] = useState(false);
  const [aiConfig, setAiConfig] = useState<AiAssistantConfig>(DEFAULT_AI_CONFIG);

  // Live Supabase Clinic Snapshot (Read-Only)
  const [doctorProfile, setDoctorProfile] = useState<DoctorRecord | null>(null);
  const [userProfile, setUserProfile] = useState<ProfileRecord | null>(null);
  const [schedules, setSchedules] = useState<ClinicScheduleRecord[]>([]);
  const [patients, setPatients] = useState<PatientRecord[]>([]);
  const [waitingList, setWaitingList] = useState<WaitingItem[]>([]);
  const [appointments, setAppointments] = useState<WaitingItem[]>([]);
  const [waitingQueue, setWaitingQueue] = useState<WaitingQueueRecord[]>([]);
  const [clinicalVisits, setClinicalVisits] = useState<MedicalVisitRecord[]>([]);
  const [issuedDocuments, setIssuedDocuments] = useState<MedicalVisitRecord[]>([]);
  const [recentPrescriptions, setRecentPrescriptions] = useState<PrescriptionRecord[]>([]);
  const [patientDocuments, setPatientDocuments] = useState<PatientDocumentRecord[]>([]);
  const [services, setServices] = useState<MedicalServiceRecord[]>([]);
  const [clinicMessages, setClinicMessages] = useState<ClinicMessageRecord[]>([]);
  const [accountingEntries, setAccountingEntries] = useState<ClinicAccountingEntry[]>([]);
  const [revenueSummary, setRevenueSummary] = useState<ClinicRevenueSummary | null>(null);
  const [snapshotErrors, setSnapshotErrors] = useState<string[]>([]);
  const [activePatient, setActivePatient] = useState<PatientRecord | null>(null);

  // Notifications State
  const [notifPermission, setNotifPermission] = useState<NotificationPermissionState>(() =>
    getNotificationPermissionState()
  );
  const [notifBannerDismissed, setNotifBannerDismissed] = useState(false);
  const [notificationsLog, setNotificationsLog] = useState<AppNotificationItem[]>([]);

  // Robot Interactive Stage State & Dual-Tab Conversation State
  const [chatMode, setChatMode] = useState<ChatMode>('nurse');
  const [robotState, setRobotState] = useState<RobotState>('idle');
  const [isListening, setIsListening] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isSendingToNurse, setIsSendingToNurse] = useState(false);
  const [nurseSendError, setNurseSendError] = useState<string | null>(null);
  const [nurseReadTs, setNurseReadTs] = useState<number>(0);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [inputText, setInputText] = useState('');
  const [bubbleText, setBubbleText] = useState<string>(
    'أهلاً دكتور! اختر تبويب الممرض لإرسال رسالة مباشرة، أو تبويب الروبوت الذكي للاستشارات الطبية والمصادر.'
  );
  const [bubbleDetails, setBubbleDetails] = useState<string | null>(null);
  const [bubbleSources, setBubbleSources] = useState<MedicalSourceLink[]>([]);
  const [bubbleDetailsOpen, setBubbleDetailsOpen] = useState(false);
  const [bubbleAction, setBubbleAction] = useState<{
    type: string;
    target?: string;
    label: string;
  } | null>(null);
  const [bubbleSuggestions, setBubbleSuggestions] = useState<SuggestedClinicAction[]>([]);
  const [bubbleIsAlert, setBubbleIsAlert] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // Sheets & Drawers
  const [connectOpen, setConnectOpen] = useState(false);
  const [studioOpen, setStudioOpen] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>('queue');
  const [workspaceQueueFilter, setWorkspaceQueueFilter] = useState<QueueFilterMode>('active');
  const [chatSheetOpen, setChatSheetOpen] = useState(false);
  const [notifSheetOpen, setNotifSheetOpen] = useState(false);

  const clinicId = clinic?.id || 'default_clinic';
  const userKey = resolveRobotUserKey(
    role,
    sessionUserId || authUser?.id || clinic?.owner_user_id || clinic?.owner_id || clinicId,
    clinicId
  );
  const clinicImageUrl = getClinicImageUrl(clinic, doctorProfile, userProfile);

  useEffect(() => {
    setClinicImgFailed(false);
  }, [clinicImageUrl]);

  useEffect(() => {
    if (!clinic?.id) return;
    try {
      const savedTs = Number(localStorage.getItem(`3iadati_nurse_read_${clinic.id}`) || '0');
      if (Number.isFinite(savedTs) && savedTs > 0) {
        setNurseReadTs(savedTs);
      } else {
        const now = Date.now();
        localStorage.setItem(`3iadati_nurse_read_${clinic.id}`, String(now));
        setNurseReadTs(now);
      }
    } catch {
      setNurseReadTs(Date.now());
    }
  }, [clinic?.id]);

  const markNurseMessagesRead = useCallback(() => {
    const now = Date.now();
    setNurseReadTs(now);
    if (clinic?.id) {
      try {
        localStorage.setItem(`3iadati_nurse_read_${clinic.id}`, String(now));
      } catch { /* ignore */ }
    }
  }, [clinic?.id]);

  const handleSelectChatMode = useCallback(
    (nextMode: ChatMode) => {
      setChatMode(nextMode);
      if (nextMode === 'nurse') {
        markNurseMessagesRead();
      }
    },
    [markNurseMessagesRead]
  );

  const unreadMessagesCount = clinicMessages.filter((m) => {
    if (m.sender_role === 'doctor') return false;
    if (m.is_read === true) return false;
    const msgTs = m.created_at ? new Date(m.created_at).getTime() : 0;
    return msgTs > nurseReadTs;
  }).length;
  const carryEnvelope = prefs.behaviors.courierAnimation && unreadMessagesCount > 0;

  // Trigger both system notification + in-app notification log
  const pushClinicNotification = useCallback(
    async (
      title: string,
      body: string,
      category: AppNotificationItem['category'],
      tag?: string
    ) => {
      const item: AppNotificationItem = {
        id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        title,
        body,
        category,
        timestamp: formatAlgiersTime(new Date().toISOString()),
      };
      setNotificationsLog((prev) => [item, ...prev].slice(0, 30));
      await dispatchSystemNotification({ title, body, tag, playSound: true });
    },
    []
  );

  const handleRequestNotifications = useCallback(async () => {
    const result = await requestAppNotificationPermission();
    setNotifPermission(result);
    if (result === 'granted') {
      setNotifBannerDismissed(true);
      await pushClinicNotification(
        'مساعد عيادتي جاهز للتنبيه',
        'تم تفعيل الإشعارات بنجاح. سننبهك فور وصول مرضى جدد أو رسائل من الاستقبال.',
        'system',
        '3iadati_welcome_notif'
      );
      robotRef.current?.play('clap');
    }
  }, [pushClinicNotification]);

  const handleTestNotification = useCallback(async () => {
    if (notifPermission !== 'granted') {
      await handleRequestNotifications();
      return;
    }
    await pushClinicNotification(
      'تنبيه تجريبي من مساعد عيادتي',
      waitingList.length > 0
        ? `يوجد حالياً ${toWesternDigits(waitingList.length)} مرضى في قاعة الانتظار.`
        : 'نظام الإشعارات يعمل بشكل مثالي على جهازك.',
      'system'
    );
    robotRef.current?.play('nod');
  }, [handleRequestNotifications, notifPermission, pushClinicNotification, waitingList.length]);

  // Register Service Worker for reliable notifications on boot
  useEffect(() => {
    registerNotificationServiceWorker();
    setNotifPermission(getNotificationPermissionState());
  }, []);

  // Process snapshot & fire automatic notifications for new waiting patients / delays / messages
  const applyLiveSnapshot = useCallback(
    (
      snapshot: ClinicLiveSnapshot,
      effectivePrefs: RobotPreferences,
      extraErrors: string[] = []
    ) => {
      if (snapshot.clinic) {
        setClinic(snapshot.clinic);
      }
      setDoctorProfile(snapshot.doctorProfile);
      setUserProfile(snapshot.userProfile);
      setSchedules(snapshot.schedules);
      setPatients(snapshot.patients);
      setWaitingList(snapshot.waitingList);
      setAppointments(snapshot.appointments);
      setWaitingQueue(snapshot.waitingQueue);
      setClinicalVisits(snapshot.clinicalVisits);
      setIssuedDocuments(snapshot.issuedDocuments);
      setRecentPrescriptions(snapshot.prescriptions);
      setPatientDocuments(snapshot.patientDocuments);
      setServices(snapshot.services);
      setClinicMessages(snapshot.messages);
      setAccountingEntries(snapshot.accountingEntries);
      setRevenueSummary(snapshot.revenueSummary);
      setSnapshotErrors(Array.from(new Set([...snapshot.errors, ...extraErrors].filter(Boolean))));

      if (!snapshotInitializedRef.current) {
        snapshotInitializedRef.current = true;
        knownWaitingIdsRef.current = new Set(snapshot.waitingList.map((w) => String(w.id)));
        knownMessageIdsRef.current = new Set(snapshot.messages.map((m) => String(m.id)));
        return;
      }

      // Check newly arrived / waiting patients in appointments
      for (const item of snapshot.waitingList) {
        const idStr = String(item.id);
        if (!knownWaitingIdsRef.current.has(idStr)) {
          knownWaitingIdsRef.current.add(idStr);
          const pName = item.patient_name || 'مريض جديد';
          pushClinicNotification(
            'موعد أو مريض جديد في العيادة',
            `${pName}${item.reason_for_visit ? ` — ${item.reason_for_visit}` : ''}`,
            'waiting',
            `wait_${idStr}`
          );
          setRobotState('happy');
          robotRef.current?.play('beckon');
          setBubbleText(`دكتور، وصل المريض ${pName} إلى قاعة الانتظار.`);
          setBubbleAction({ type: 'open_queue', target: '', label: 'النظر لقاعة الانتظار' });
          setBubbleSuggestions([]);
        }
      }

      // Check long waiting alerts (waiting / patient_arrived)
      if (effectivePrefs.behaviors.waitingAlerts) {
        const thresholdMs = (effectivePrefs.behaviors.waitingThresholdMin || 15) * 60_000;
        const now = Date.now();
        for (const item of snapshot.waitingList) {
          const st = String(item.status || '').toLowerCase();
          if (st !== 'waiting' && st !== 'patient_arrived') continue;
          const idStr = String(item.id);
          const refTime = item.handed_to_doctor_at || item.start_at || item.created_at;
          if (!refTime || alertedDelayIdsRef.current.has(idStr)) continue;
          const waitedMs = now - new Date(refTime).getTime();
          if (Number.isFinite(waitedMs) && waitedMs >= thresholdMs && waitedMs < 12 * 3600_000) {
            alertedDelayIdsRef.current.add(idStr);
            const mins = Math.round(waitedMs / 60_000);
            const pName = item.patient_name || 'مريض';
            pushClinicNotification(
              'تنبيه تأخر في الانتظار',
              `${pName} ينتظر منذ ${toWesternDigits(mins)} دقيقة.`,
              'alert',
              `delay_${idStr}`
            );
            setRobotState('alert');
            robotRef.current?.play('sad');
          }
        }
      }

      // Check new incoming messages from Nurse / Reception
      for (const msg of snapshot.messages) {
        const idStr = String(msg.id);
        if (!knownMessageIdsRef.current.has(idStr)) {
          knownMessageIdsRef.current.add(idStr);
          if (msg.sender_role !== 'doctor' && msg.is_read !== true) {
            const sender = msg.sender_name || 'الممرض والاستقبال';
            pushClinicNotification(
              `رسالة جديدة من ${sender}`,
              msg.message || 'لديك رسالة جديدة في العيادة.',
              'message',
              `msg_${idStr}`
            );
            setBubbleText(`رسالة من ${sender}: «${msg.message || ''}»`);
            setBubbleDetails(null);
            setBubbleSources([]);
            setBubbleDetailsOpen(false);
            setBubbleAction({ type: 'open_messages', target: '', label: 'فتح محادثة الممرض' });
            setRobotState('attention');
            robotRef.current?.play('wink');
          }
        }
      }
    },
    [pushClinicNotification]
  );

  // Load clinic data & sync robot preferences from Supabase (Strict Read-Only)
  const loadClinicContext = useCallback(
    async (
      targetClinic: ClinicRecord,
      targetRole: ClinicRole,
      prefsUserIdOverride?: string | null
    ) => {
      const cId = targetClinic.id;
      const effectiveUid =
        prefsUserIdOverride || targetClinic.owner_user_id || targetClinic.owner_id || cId;
      const uKey = resolveRobotUserKey(targetRole, effectiveUid, cId);
      const fallbackKeys = Array.from(
        new Set(
          [
            `doc_${cId}`,
            targetClinic.owner_user_id ? `doc_${targetClinic.owner_user_id}` : '',
            targetClinic.owner_id ? `doc_${targetClinic.owner_id}` : '',
          ].filter((k) => Boolean(k) && k !== uKey)
        )
      );

      snapshotInitializedRef.current = false;
      alertedDelayIdsRef.current.clear();

      // 1. Fetch fresh live snapshot first so clinic.robot_defaults & profile are up-to-date
      const snapshot = await fetchClinicSnapshot(cId, effectiveUid);
      const effectiveClinic = snapshot.clinic || targetClinic;

      // 2. Clinic robot defaults + inheritance (also harmonize with clinic primary color when empty)
      const rawDefaults =
        effectiveClinic.robot_defaults && Object.keys(effectiveClinic.robot_defaults as object).length > 0
          ? effectiveClinic.robot_defaults
          : { theme: deriveClinicThemeFallback(effectiveClinic) };
      const clinicDefaults = normalizeClinicRobotDefaults(rawDefaults);
      writeLocalClinicRobotDefaults(cId, clinicDefaults);

      const localPrefs = readLocalUserRobotPrefs(uKey, clinicDefaults);
      setPrefs(localPrefs);

      const remotePrefsRes = await fetchUserRobotPrefsFromSupabase(
        uKey,
        cId,
        clinicDefaults,
        fallbackKeys
      );
      if (remotePrefsRes.matchedUserKey) {
        setSyncedPrefsUserKey(remotePrefsRes.matchedUserKey);
      } else {
        setSyncedPrefsUserKey(uKey);
      }
      const effectivePrefs = remotePrefsRes.prefs || localPrefs;
      if (remotePrefsRes.prefs) {
        setPrefs(remotePrefsRes.prefs);
        writeLocalUserRobotPrefs(uKey, remotePrefsRes.prefs);
      }

      // 3. AI Settings (browser localStorage only)
      setAiConfig(readLocalAiConfig(cId));

      // 4. Apply live snapshot & surface any Supabase errors visibly
      applyLiveSnapshot(
        snapshot,
        effectivePrefs,
        remotePrefsRes.error ? [remotePrefsRes.error] : []
      );

      // 5. Friendly nurse greeting animation & contextual shortcuts
      if (effectivePrefs.behaviors.greetOnLogin) {
        setRobotState('happy');
        window.setTimeout(() => {
          robotRef.current?.play(snapshot.waitingList.length > 0 ? 'smile' : 'wave');
        }, 350);
      }

      const name = getClinicDisplayName(effectiveClinic);
      const waitCount = snapshot.waitingList.length;
      const patCount = snapshot.patients.length;
      const allErrors = [...snapshot.errors, ...(remotePrefsRes.error ? [remotePrefsRes.error] : [])];

      if (allErrors.length > 0 && waitCount === 0 && patCount === 0) {
        setBubbleText(
          `تم الدخول إلى ${name}، لكن قاعدة البيانات منعت قراءة الجداول (صلاحيات القراءة غير مفعلة بعد).`
        );
        setBubbleIsAlert(true);
        setBubbleAction({ type: 'open_overview', target: '', label: 'فحص تفاصيل الربط' });
        setBubbleSuggestions([]);
      } else {
        setBubbleText(
          waitCount > 0 || patCount > 0
            ? `أهلاً دكتور في ${name}. بصفتي ممرضك في عيادتي، لدينا ${toWesternDigits(waitCount)} في الانتظار والمواعيد و${toWesternDigits(patCount)} ملف مريض جاهز.`
            : `أهلاً دكتور في ${name}. أنا ممرضك الذكي في عيادتي، جاهز لأي ملف مريض أو دواء أو تنسيق.`
        );
        setBubbleAction(
          waitCount > 0 ? { type: 'open_queue', target: '', label: 'النظر لقاعة الانتظار' } : null
        );
        setBubbleSuggestions(
          patCount > 0 ? [{ type: 'open_patients', target: '', label: 'ملفات المرضى' }] : []
        );
        setBubbleIsAlert(false);
      }
    },
    [applyLiveSnapshot]
  );

  // Boot & Auth State Sync (strictly Doctor-only; never auto-logs into any public or demo clinic)
  useEffect(() => {
    let cancelled = false;

    const bootstrapSession = async () => {
      const saved = readSavedSession();
      const { data: sessionData } = await supabase.auth.getSession();
      const currentUser = sessionData?.session?.user || null;
      if (cancelled) return;
      setAuthUser(currentUser);

      // Case A: Authenticated Supabase Auth Doctor
      if (currentUser) {
        const resolved = await resolveClinicForAuthUser(currentUser);
        if (cancelled) return;
        if (resolved.detectedRole !== 'doctor') {
          await supabase.auth.signOut().catch(() => undefined);
        } else {
          // Always prioritize the clinic that actually has data (clinic_1 or clinic with patients)
          const chosen =
            (saved?.clinicId === 'clinic_1' && resolved.clinics.find((c) => c.id === 'clinic_1')) ||
            resolved.primaryClinic ||
            (saved?.clinicId && resolved.clinics.find((c) => c.id === saved.clinicId)) ||
            resolved.clinics[0];

          if (chosen) {
            setClinic(chosen);
            setRole('doctor');
            setIsAuthenticatedSession(true);
            setAccountEmail(currentUser.email || chosen.email || null);
            setAccountName(
              chosen.doctor_name || String(currentUser.user_metadata?.full_name || 'الطبيب')
            );
            setSessionUserId(currentUser.id);
            await loadClinicContext(chosen, 'doctor', currentUser.id);
            return;
          }
        }
      }

      // Case B: Restored Authenticated Doctor Session (verified previously with email & password)
      if (saved?.clinicId && saved.isAuthenticated && saved.role === 'doctor') {
        let clinicIdToRestore = saved.clinicId;
        // If saved clinic was an empty clinic and doctor is ghouila681, auto-upgrade to clinic_1!
        if (saved.accountEmail?.toLowerCase() === 'ghouila681@gmail.com' && clinicIdToRestore !== 'clinic_1') {
          clinicIdToRestore = 'clinic_1';
        }

        const restoredClinic = await fetchClinicById(clinicIdToRestore);
        if (cancelled) return;
        const emailMatches =
          restoredClinic &&
          saved.accountEmail &&
          (!restoredClinic.email ||
            restoredClinic.email.toLowerCase() === saved.accountEmail.toLowerCase());
        if (restoredClinic && emailMatches) {
          setClinic(restoredClinic);
          setRole('doctor');
          setIsAuthenticatedSession(true);
          setAccountEmail(saved.accountEmail || restoredClinic.email || null);
          setAccountName(saved.accountName || restoredClinic.doctor_name || null);
          const uid = saved.userIdForPrefs || restoredClinic.owner_user_id || restoredClinic.id;
          setSessionUserId(uid);
          await loadClinicContext(restoredClinic, 'doctor', uid);
          return;
        }
        writeSavedSession(null);
      }

      // Unauthenticated: require explicit Doctor Email + Password sign-in first
      setClinic(null);
      setRole('doctor');
      setIsAuthenticatedSession(false);
      setAccountEmail(null);
      setAccountName(null);
      setSessionUserId(null);
      setPrefs(readLocalUserRobotPrefs('doctor_guest'));
      setAiConfig(readLocalAiConfig('default'));
      setBubbleText('مرحباً دكتور! يرجى تسجيل الدخول بالبريد الإلكتروني وكلمة المرور أولاً.');
      setBubbleAction(null);
      setBubbleSuggestions([]);
      setConnectOpen(true);
    };

    bootstrapSession();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthUser(session?.user || null);
    });

    return () => {
      cancelled = true;
      authListener.subscription.unsubscribe();
    };
  }, [loadClinicContext]);

  const refreshLiveClinicData = useCallback(async () => {
    if (!clinic || clinic.id === 'clinic_demo_local') return;
    const ownerUid = sessionUserId || clinic.owner_user_id || null;
    const snapshot = await fetchClinicSnapshot(clinic.id, ownerUid);
    applyLiveSnapshot(snapshot, prefs);
  }, [applyLiveSnapshot, clinic, prefs, sessionUserId]);

  const syncRobotAppearanceFromRemote = useCallback(
    async (cId: string, overrideDefaultsRaw?: unknown) => {
      const hasExplicitOverrideDefaults =
        overrideDefaultsRaw &&
        typeof overrideDefaultsRaw === 'object' &&
        Object.keys(overrideDefaultsRaw as object).length > 0;
      const hasClinicDefaults =
        clinic?.robot_defaults &&
        typeof clinic.robot_defaults === 'object' &&
        Object.keys(clinic.robot_defaults as object).length > 0;

      const defaults = hasExplicitOverrideDefaults
        ? normalizeClinicRobotDefaults(overrideDefaultsRaw)
        : hasClinicDefaults
          ? normalizeClinicRobotDefaults(clinic.robot_defaults)
          : normalizeClinicRobotDefaults({ theme: deriveClinicThemeFallback(clinic) });

      writeLocalClinicRobotDefaults(cId, defaults);

      const fallbackKeys = Array.from(
        new Set(
          [
            syncedPrefsUserKey || '',
            `doc_${cId}`,
            clinic?.owner_user_id ? `doc_${clinic.owner_user_id}` : '',
            clinic?.owner_id ? `doc_${clinic.owner_id}` : '',
          ].filter((k) => Boolean(k) && k !== userKey)
        )
      );

      const remoteRes = await fetchUserRobotPrefsFromSupabase(
        userKey,
        cId,
        defaults,
        fallbackKeys
      );

      if (remoteRes.matchedUserKey) {
        setSyncedPrefsUserKey(remoteRes.matchedUserKey);
      }

      if (remoteRes.prefs) {
        setPrefs(remoteRes.prefs);
        writeLocalUserRobotPrefs(userKey, remoteRes.prefs);
      } else {
        const localNext = readLocalUserRobotPrefs(userKey, defaults);
        if (!localNext.hasCustomOverride) {
          const inherited = normalizeRobotPreferences(null, defaults);
          setPrefs(inherited);
          writeLocalUserRobotPrefs(userKey, inherited);
        }
      }
    },
    [clinic, syncedPrefsUserKey, userKey]
  );

  // Real-time Read-Only Supabase subscription across all 8 platform tables + 25s poll fallback
  useEffect(() => {
    if (!clinic || clinic.id === 'clinic_demo_local') return;
    const cId = clinic.id;

    const channel = supabase
      .channel(`robot-readonly-${cId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'appointments', filter: `clinic_id=eq.${cId}` },
        () => {
          refreshLiveClinicData();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'patients', filter: `clinic_id=eq.${cId}` },
        () => {
          refreshLiveClinicData();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'medical_visits', filter: `clinic_id=eq.${cId}` },
        () => {
          refreshLiveClinicData();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'prescriptions', filter: `clinic_id=eq.${cId}` },
        () => {
          refreshLiveClinicData();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'patient_documents', filter: `clinic_id=eq.${cId}` },
        () => {
          refreshLiveClinicData();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'clinic_messages', filter: `clinic_id=eq.${cId}` },
        () => {
          refreshLiveClinicData();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'clinics', filter: `id=eq.${cId}` },
        (payload) => {
          if (payload.new && typeof payload.new === 'object') {
            const { doctor_password: _dp, ...safeNext } = payload.new as Record<string, unknown>;
            setClinic((prev) => ({ ...(prev || {}), ...safeNext } as ClinicRecord));
            syncRobotAppearanceFromRemote(cId, safeNext.robot_defaults);
          } else {
            refreshLiveClinicData();
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_robot_preferences', filter: `clinic_id=eq.${cId}` },
        () => {
          syncRobotAppearanceFromRemote(cId);
        }
      )
      .subscribe();

    const pollId = window.setInterval(() => {
      refreshLiveClinicData();
    }, 25_000);

    return () => {
      window.clearInterval(pollId);
      supabase.removeChannel(channel);
    };
  }, [clinic, refreshLiveClinicData, syncRobotAppearanceFromRemote]);

  const handlePlatformLoginSuccess = async (params: {
    clinic: ClinicRecord;
    role: ClinicRole;
    authUser: User | null;
    accountEmail: string;
    accountName: string;
    userIdForPrefs: string;
  }) => {
    setAuthUser(params.authUser);
    setClinic(params.clinic);
    setRole(params.role);
    setIsAuthenticatedSession(true);
    setAccountEmail(params.accountEmail);
    setAccountName(params.accountName);
    setSessionUserId(params.userIdForPrefs);
    setActivePatient(null);

    writeSavedSession({
      clinicId: params.clinic.id,
      role: params.role,
      isAuthenticated: true,
      accountEmail: params.accountEmail,
      accountName: params.accountName,
      userIdForPrefs: params.userIdForPrefs,
    });

    await loadClinicContext(params.clinic, params.role, params.userIdForPrefs);
  };

  const handleSelectClinic = async (selected: ClinicRecord, selectedRole: ClinicRole) => {
    setClinic(selected);
    setRole(selectedRole);
    setActivePatient(null);
    writeSavedSession({
      clinicId: selected.id,
      role: selectedRole,
      isAuthenticated: isAuthenticatedSession,
      accountEmail: accountEmail || undefined,
      accountName: accountName || undefined,
      userIdForPrefs: sessionUserId || selected.owner_user_id || selected.id,
    });
    await loadClinicContext(
      selected,
      selectedRole,
      sessionUserId || selected.owner_user_id || selected.id
    );
  };

  const handleSignedOut = () => {
    setAuthUser(null);
    setIsAuthenticatedSession(false);
    setAccountEmail(null);
    setAccountName(null);
    setSessionUserId(null);
    setDoctorProfile(null);
    setUserProfile(null);
    setSchedules([]);
      setPatients([]);
    setWaitingList([]);
    setAppointments([]);
    setWaitingQueue([]);
    setClinicalVisits([]);
    setIssuedDocuments([]);
    setRecentPrescriptions([]);
    setPatientDocuments([]);
    setServices([]);
    setClinicMessages([]);
    setAccountingEntries([]);
    setRevenueSummary(null);
    setSnapshotErrors([]);
    setActivePatient(null);
    writeSavedSession(null);
    setClinic(null);
    setBubbleAction(null);
    setBubbleSuggestions([]);
    setBubbleText('تم تسجيل الخروج. أدخل البريد الإلكتروني وكلمة المرور للطبيب للدخول مجدداً.');
    setConnectOpen(true);
  };

  // Sync robot appearance changes both locally and back to Supabase (user_robot_preferences)
  const handleUpdatePrefs = async (next: RobotPreferences) => {
    setPrefs(next);
    writeLocalUserRobotPrefs(userKey, next);
    if (clinic && clinic.id !== 'clinic_demo_local') {
      const targetPrefKey = syncedPrefsUserKey || userKey;
      setSyncSaving(true);
      await saveUserRobotPrefsToSupabase(targetPrefKey, clinic.id, next);
      setSyncSaving(false);
    }
  };

  const handleUpdateAiConfig = (next: AiAssistantConfig) => {
    setAiConfig(next);
    writeLocalAiConfig(clinicId, next);
  };

  const handleSendTeamMessage = useCallback(
    async (text: string): Promise<{ success: boolean; error?: string }> => {
      if (!clinic || !text.trim()) {
        return { success: false, error: 'يرجى تسجيل الدخول وكتابة رسالة صالحة.' };
      }
      const clean = text.trim();
      const senderLabel = `د. ${clinic.doctor_name || 'الطبيب'}`;
      setIsSendingToNurse(true);
      setNurseSendError(null);
      setBubbleDetails(null);
      setBubbleSources([]);
      setBubbleDetailsOpen(false);
      setBubbleIsAlert(false);

      const res = await sendClinicTeamMessage(clinic.id, 'doctor', senderLabel, clean);
      setIsSendingToNurse(false);

      if (res.success && res.data) {
        knownMessageIdsRef.current.add(String(res.data.id));
        setClinicMessages((prev) => {
          const exists = prev.some((m) => String(m.id) === String(res.data!.id));
          return exists ? prev : [...prev, res.data!];
        });
        setBubbleText(`جاري توصيل رسالتك إلى الممرض: «${clean}»`);
        setBubbleAction(null);
        setBubbleSuggestions([]);
        await robotRef.current?.deliverToNurse();
        setBubbleText(`تم تسليم رسالتك إلى واجهة الممرض: «${clean}»`);
        return { success: true };
      }

      const errMsg = res.error || 'تعذر إرسال الرسالة إلى الممرض.';
      setNurseSendError(errMsg);
      setRobotState('alert');
      setBubbleIsAlert(true);
      setBubbleText('تعذر إرسال الرسالة إلى الممرض بسبب صلاحيات الإدخال في قاعدة البيانات.');
      robotRef.current?.play('shrug');
      return { success: false, error: errMsg };
    },
    [clinic]
  );

  const handleTriggerAction = useCallback(
    (actionType: string, actionTarget?: string | null) => {
      if (!isAuthenticatedSession) {
        setConnectOpen(true);
        return;
      }
      const target = String(actionTarget || '').trim();
      if (actionType === 'open_queue') {
        const filterTarget: QueueFilterMode =
          target === 'past' || target === 'upcoming' || target === 'all' ? target : 'active';
        setWorkspaceQueueFilter(filterTarget);
        setWorkspaceTab('queue');
        setWorkspaceOpen(true);
      } else if (actionType === 'open_patients') {
        if (target) {
          const q = target.toLowerCase();
          const found = patients.find(
            (p) =>
              p.id === target ||
              (p.patient_number && p.patient_number.toLowerCase() === q) ||
              getPatientDisplayName(p).toLowerCase().includes(q)
          );
          if (found) setActivePatient(found);
        }
        setWorkspaceTab('patients');
        setWorkspaceOpen(true);
      } else if (actionType === 'open_messages') {
        handleSelectChatMode('nurse');
        setChatSheetOpen(true);
      } else if (actionType === 'send_message') {
        handleSelectChatMode('nurse');
        if (target) {
          handleSendTeamMessage(target);
        }
      } else if (actionType === 'open_overview') {
        setWorkspaceTab('overview');
        setWorkspaceOpen(true);
      }
    },
    [handleSelectChatMode, handleSendTeamMessage, isAuthenticatedSession, patients]
  );

  // Send message (from text input or voice transcript) to /api/ai/robot
  const sendMessage = useCallback(
    async (rawText: string) => {
      const text = rawText.trim();
      if (!text || isThinking) return;

      if (!isAuthenticatedSession || !clinic) {
        setBubbleText('يرجى تسجيل الدخول بحساب الطبيب (البريد الإلكتروني وكلمة المرور) أولاً.');
        setConnectOpen(true);
        return;
      }

      setInputText('');
      setLiveTranscript('');

      const nowStr = formatAlgiersTime(new Date().toISOString());
      const userMsg: ChatMessage = {
        id: `u_${Date.now()}`,
        role: 'user',
        text,
        timestamp: nowStr,
      };

      setMessages((prev) => [...prev, userMsg]);
      setIsThinking(true);
      setRobotState('thinking');
      setBubbleText('جاري البحث في المصادر الطبية الموثوقة وصياغة الإجابة...');
      setBubbleDetails(null);
      setBubbleSources([]);
      setBubbleDetailsOpen(false);
      setBubbleAction(null);
      setBubbleSuggestions([]);
      setBubbleIsAlert(false);

      const todayDate = getTodayAlgiersDate();
      const queryLower = text.toLowerCase();
      const prioritizedPatients = [...patients].sort((a, b) => {
        const aMatch =
          getPatientDisplayName(a).toLowerCase().includes(queryLower) ||
          (a.patient_number || '').toLowerCase().includes(queryLower) ||
          (a.phone || '').includes(queryLower);
        const bMatch =
          getPatientDisplayName(b).toLowerCase().includes(queryLower) ||
          (b.patient_number || '').toLowerCase().includes(queryLower) ||
          (b.phone || '').includes(queryLower);
        if (aMatch && !bMatch) return -1;
        if (!aMatch && bMatch) return 1;
        return 0;
      });
      const upcomingApts = appointments.filter((a) => isUpcomingAppointment(a, todayDate));
      const pastApts = appointments.filter((a) => isPastAppointment(a, todayDate));

      try {
        const res = await fetch('/api/ai/robot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: text,
            history: messages.slice(-8).map((m) => ({ role: m.role, text: m.text })),
            model: aiConfig.model,
            operationMode: aiConfig.operationMode,
            language: 'ar',
            allowPatientContext: aiConfig.allowPatientContext,
            allowOrgAdvice: aiConfig.allowOrgAdvice,
            autoFallbackOnQuota: aiConfig.autoFallbackOnQuota,
            clinicContext: {
              clinicName: getClinicDisplayName(clinic),
              doctorName: clinic?.doctor_name || 'الطبيب',
              specialty: clinic?.specialty || 'عيادة طبية',
              userRole: role,
              todayDate,
              waitingCount: waitingList.length,
              totalAppointmentsCount: appointments.length,
              upcomingAppointmentsCount: upcomingApts.length,
              pastAppointmentsCount: pastApts.length,
              waitingListSample: waitingList.slice(0, 25).map((w) => ({
                queueNumber: w.queue_number,
                name: w.patient_name,
                status: w.status,
                reason: w.reason_for_visit,
                phone: w.patient_phone,
                date: getAppointmentEffectiveDate(w),
                time: w.appointment_time || w.booking_date,
                createdAt: w.start_at || w.created_at,
              })),
              allAppointmentsSample: appointments.slice(0, 40).map((a) => ({
                name: a.patient_name,
                phone: a.patient_phone,
                date: getAppointmentEffectiveDate(a),
                time: a.appointment_time,
                status: a.status,
                category: isPastAppointment(a, todayDate)
                  ? 'past'
                  : isUpcomingAppointment(a, todayDate)
                    ? 'upcoming'
                    : 'active',
                reason: a.reason_for_visit,
                queueNumber: a.queue_number,
              })),
              unreadTeamMessages: unreadMessagesCount,
              teamMessagesSample: clinicMessages.slice(0, 8).map((m) => ({
                senderName: m.sender_name,
                senderRole: m.sender_role,
                message: m.message,
                isRead: m.is_read,
                createdAt: m.created_at,
              })),
            },
            patientContext: aiConfig.allowPatientContext
              ? {
                  activePatient: activePatient
                    ? {
                        name: getPatientDisplayName(activePatient),
                        patientNumber: activePatient.patient_number,
                        age: calculatePatientAge(activePatient.date_of_birth),
                        gender: activePatient.gender,
                        bloodGroup: activePatient.blood_group,
                        chronicDiseases: activePatient.chronic_diseases,
                        allergies: activePatient.allergies,
                        medicalNotes: activePatient.medical_notes,
                      }
                    : null,
                  recentPatientsCount: patients.length,
                  patientsSample: prioritizedPatients.slice(0, 40).map((p) => ({
                    name: getPatientDisplayName(p),
                    patientNumber: p.patient_number,
                    phone: p.phone,
                    chronicDiseases: p.chronic_diseases,
                    allergies: p.allergies,
                  })),
                  recentVisitsSample: clinicalVisits.slice(0, 15).map((v) => {
                    const matched = patients.find((p) => p.id === v.patient_id);
                    return {
                      patientName: matched ? getPatientDisplayName(matched) : undefined,
                      diagnosis: v.diagnosis,
                      clinicalNotes: v.clinical_notes,
                      treatmentNotes: v.treatment_notes,
                      date: v.visit_date || v.created_at,
                    };
                  }),
                  recentPrescriptionsSample: recentPrescriptions.slice(0, 10).map((rx) => ({
                    patientName: rx.patient_name,
                    medications: rx.medications,
                    advice: rx.advice,
                  })),
                }
              : {},
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'تعذر الاتصال بالمساعد الذكي');
        }

        const replyText = String(data.reply || 'تم استلام طلبك بنجاح.');
        const nextState: RobotState = VALID_ROBOT_STATES.has(data.robotState)
          ? (data.robotState as RobotState)
          : 'attention';
        let nextAction = VALID_ROBOT_ACTIONS.has(data.robotAction)
          ? (data.robotAction as RobotAction)
          : null;

        if (!nextAction && Array.isArray(data.matchedDrugs) && data.matchedDrugs.length > 0) {
          nextAction = 'scan';
        }

        const suggestions: SuggestedClinicAction[] = Array.isArray(data.suggestedActions)
          ? data.suggestedActions.filter(
              (s: unknown): s is SuggestedClinicAction =>
                Boolean(s && typeof s === 'object' && (s as SuggestedClinicAction).label)
            )
          : [];

        const sourcesList: MedicalSourceLink[] = Array.isArray(data.sources)
          ? data.sources.filter(
              (s: unknown): s is MedicalSourceLink =>
                Boolean(s && typeof s === 'object' && (s as MedicalSourceLink).uri)
            )
          : [];
        const detailsText = typeof data.details === 'string' && data.details.trim() ? data.details.trim() : null;

        const isAlert = nextState === 'alert';
        const assistantMsg: ChatMessage = {
          id: `a_${Date.now()}`,
          role: 'assistant',
          text: replyText,
          timestamp: formatAlgiersTime(new Date().toISOString()),
          details: detailsText,
          sources: sourcesList,
          modelUsed: typeof data.modelUsed === 'string' ? data.modelUsed : null,
          actionType: data.actionType,
          actionTarget: data.actionTarget,
          actionLabel: data.actionLabel,
          suggestedActions: suggestions,
          isAlert,
        };

        setMessages((prev) => [...prev, assistantMsg]);
        setBubbleText(replyText);
        setBubbleDetails(detailsText);
        setBubbleSources(sourcesList);
        setBubbleDetailsOpen(false);
        setBubbleIsAlert(isAlert);
        setBubbleAction(
          data.actionType && data.actionType !== 'none' && data.actionLabel
            ? {
                type: data.actionType,
                target: data.actionTarget,
                label: data.actionLabel,
              }
            : null
        );
        setBubbleSuggestions(suggestions);

        setIsThinking(false);
        setRobotState(nextState);

        if (isAlert && notifPermission === 'granted') {
          pushClinicNotification('تنبيه طبي من مساعد عيادتي', replyText, 'alert');
        }

        if (nextAction) {
          robotRef.current?.play(nextAction);
        } else if (nextState === 'success' && prefs.behaviors.clapOnSuccess) {
          robotRef.current?.play('clap');
        }

        if (data.actionType === 'send_message' && data.actionTarget) {
          handleSendTeamMessage(String(data.actionTarget));
        }

        window.setTimeout(() => {
          setRobotState((curr) => (curr === nextState && !isAlert ? 'idle' : curr));
        }, 4500);
      } catch (err) {
        const errMsg =
          err instanceof Error ? err.message : 'حدث خطأ أثناء معالجة طلبك.';
        setIsThinking(false);
        setRobotState('alert');
        setBubbleText(errMsg);
        setBubbleIsAlert(true);
        robotRef.current?.play('shrug');
      }
    },
    [
      activePatient,
      aiConfig,
      appointments,
      clinic,
      clinicMessages,
      clinicalVisits,
      handleSendTeamMessage,
      isAuthenticatedSession,
      isThinking,
      messages,
      notifPermission,
      patients,
      prefs.behaviors.clapOnSuccess,
      pushClinicNotification,
      recentPrescriptions,
      role,
      unreadMessagesCount,
      waitingList,
    ]
  );

  // Voice Input Handler (SpeechRecognition + MediaRecorder -> /api/ai/transcribe fallback)
  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch { /* ignore */ }
      recognitionRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch { /* ignore */ }
    }
    setIsListening(false);
  }, []);

  const startFallbackAudioRecorder = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          audioChunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setIsListening(false);
        const blob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        });
        if (blob.size < 300) {
          setRobotState('idle');
          return;
        }
        setRobotState('thinking');
        setBubbleText('جاري الاستماع وفهم رسالتك الصوتية...');
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64 = String(reader.result || '').split(',')[1] || '';
          try {
            const res = await fetch('/api/ai/transcribe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                audioBase64: base64,
                mimeType: blob.type || 'audio/webm',
                operationMode: aiConfig.operationMode,
              }),
            });
            const data = await res.json();
            if (res.ok && data.text) {
              sendMessage(data.text);
            } else {
              setRobotState('idle');
              setBubbleText(data.error || 'لم أتمكن من سماع الصوت بوضوح، حاول مرة أخرى.');
            }
          } catch {
            setRobotState('idle');
            setBubbleText('تعذر تفريغ الصوت، يمكنك الكتابة في الأسفل.');
          }
        };
        reader.readAsDataURL(blob);
      };

      recorder.start();
      setIsListening(true);
      setRobotState('attention');
      setBubbleText('أنا أسمعك الآن... اضغط الميكروفون مجدداً عند الانتهاء.');
    } catch {
      setIsListening(false);
      setRobotState('alert');
      setBubbleText('يرجى السماح بالوصول إلى الميكروفون للتحدث صوتياً.');
    }
  }, [aiConfig.operationMode, sendMessage]);

  const toggleVoiceListening = useCallback(() => {
    if (isListening) {
      stopListening();
      return;
    }

    const SpeechRecognitionCtor =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognitionCtor) {
      try {
        const recognition = new SpeechRecognitionCtor();
        recognition.lang = 'ar-DZ';
        recognition.interimResults = true;
        recognition.continuous = false;
        recognitionRef.current = recognition;

        let finalTranscript = '';

        recognition.onstart = () => {
          setIsListening(true);
          setRobotState('attention');
          setLiveTranscript('');
          setBubbleText('أنا أسمعك... تفضل بالكلام');
        };

        recognition.onresult = (event: any) => {
          let interim = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const chunk = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              finalTranscript += `${chunk} `;
            } else {
              interim += chunk;
            }
          }
          const combined = (finalTranscript + interim).trim();
          if (combined) {
            setLiveTranscript(combined);
            setBubbleText(`«${combined}»`);
          }
        };

        recognition.onerror = (ev: any) => {
          recognitionRef.current = null;
          setIsListening(false);
          if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
            setRobotState('alert');
            setBubbleText('صلاحية الميكروفون مرفوضة. فعّلها من إعدادات المتصفح.');
          } else {
            startFallbackAudioRecorder();
          }
        };

        recognition.onend = () => {
          recognitionRef.current = null;
          setIsListening(false);
          const toSend = finalTranscript.trim() || liveTranscript.trim();
          if (toSend) {
            sendMessage(toSend);
          } else {
            setRobotState('idle');
          }
        };

        recognition.start();
        return;
      } catch {
        // Fallback below
      }
    }

    startFallbackAudioRecorder();
  }, [
    isListening,
    liveTranscript,
    sendMessage,
    startFallbackAudioRecorder,
    stopListening,
  ]);

  // Direct tap on the Talking-Tom-style Nurse Robot (triggers contextual reactions automatically)
  const handleRobotTap = () => {
    if (!isAuthenticatedSession || !clinic) {
      robotRef.current?.play('wave');
      setBubbleText('مرحباً دكتور! يرجى تسجيل الدخول بالبريد الإلكتروني وكلمة المرور للوصول لعيادتك.');
      setConnectOpen(true);
      return;
    }
    if (carryEnvelope) {
      robotRef.current?.play('fly');
      handleSelectChatMode('nurse');
      setChatSheetOpen(true);
      return;
    }

    const reactions: Array<{
      state: RobotState;
      action: RobotAction;
      text: string;
      suggested?: { type: string; target?: string; label: string };
    }> = [
      {
        state: 'happy',
        action: 'smile',
        text: `تحت أمرك ${role === 'doctor' ? 'دكتور' : 'بك'}! ${
          waitingList.length > 0
            ? `لدينا الآن ${toWesternDigits(waitingList.length)} مرضى في قاعة الانتظار بعيادتي.`
            : 'قاعة الانتظار هادئة ومرتبة الآن.'
        }`,
        suggested:
          waitingList.length > 0
            ? { type: 'open_queue', target: '', label: 'النظر لقاعة الانتظار' }
            : undefined,
      },
      {
        state: 'attention',
        action: 'scan',
        text: 'أنا ممرضك الذكي في عيادتي، اسألني عن ملف أي مريض أو دور الانتظار.',
        suggested: { type: 'open_patients', target: '', label: 'ملفات المرضى' },
      },
      {
        state: 'happy',
        action: 'love',
        text: `سعيد بالعمل معك داخل ${getClinicDisplayName(clinic)} لتسهيل متابعة المرضى.`,
        suggested:
          patients.length > 0
            ? { type: 'open_patients', target: '', label: 'ملفات المرضى' }
            : undefined,
      },
      {
        state: 'attention',
        action: 'wink',
        text: 'أتابع قائمة الانتظار ورسائل الاستقبال لحظياً؛ أخبرني إن أردت مراسلة الممرض.',
        suggested: { type: 'open_messages', target: '', label: 'رسائل الاستقبال' },
      },
    ];
    const pick = reactions[Math.floor(Math.random() * reactions.length)];
    setBubbleText(pick.text);
    setBubbleDetails(null);
    setBubbleSources([]);
    setBubbleDetailsOpen(false);
    setBubbleAction(pick.suggested || null);
    setBubbleSuggestions([]);
    setBubbleIsAlert(false);
    setRobotState(pick.state);
    robotRef.current?.play(pick.action);
    window.setTimeout(() => setRobotState('idle'), 2800);
  };

  const dispatchDoctorInput = useCallback(
    async (rawText: string) => {
      const clean = rawText.trim();
      if (!clean) return;
      if (chatMode === 'nurse') {
        if (!isAuthenticatedSession || !clinic) {
          setBubbleText('يرجى تسجيل الدخول بحساب الطبيب أولاً للتواصل مع الممرض.');
          setConnectOpen(true);
          return;
        }
        setInputText('');
        const res = await handleSendTeamMessage(clean);
        if (!res.success) {
          setInputText(clean);
        }
        return;
      }
      await sendMessage(clean);
    },
    [chatMode, clinic, handleSendTeamMessage, isAuthenticatedSession, sendMessage]
  );

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isThinking || isSendingToNurse) return;
    dispatchDoctorInput(inputText);
  };

  return (
    <div className="h-[100dvh] w-full flex flex-col bg-[#f5fbf8] text-slate-900 overflow-hidden">
      {/* Compact 3-Zone Top App Bar (<= 56px) */}
      <header className="relative z-30 h-14 px-3 sm:px-5 bg-white/90 backdrop-blur-md border-b border-emerald-100/90 flex items-center justify-between gap-2 shrink-0">
        {/* Zone 1: Platform Account & Clinic Image / Switcher */}
        <button
          type="button"
          onClick={() => setConnectOpen(true)}
          className="min-h-[44px] px-2 rounded-xl flex items-center gap-2.5 hover:bg-slate-100/80 transition-colors min-w-0 max-w-[52%]"
        >
          {isAuthenticatedSession && clinicImageUrl && !clinicImgFailed ? (
            <img
              src={clinicImageUrl}
              alt={getClinicDisplayName(clinic)}
              onError={() => setClinicImgFailed(true)}
              className="w-9 h-9 rounded-xl object-cover border border-slate-200 shadow-xs shrink-0"
            />
          ) : (
            <span
              className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${
                isAuthenticatedSession
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : 'bg-amber-50 border-amber-200 text-amber-700'
              }`}
            >
              {isAuthenticatedSession ? <Building2 className="w-4 h-4" /> : <LogIn className="w-4 h-4" />}
            </span>
          )}
          <span className="text-right min-w-0">
            <span className="block text-sm font-bold text-slate-900 truncate">
              {isAuthenticatedSession ? getClinicDisplayName(clinic) : 'تسجيل دخول الطبيب'}
            </span>
            <span className="block text-[11px] text-slate-500 truncate">
              {isAuthenticatedSession
                ? `الطبيب · ${accountEmail || ''}`
                : 'دخول بحساب عيادتي'}
            </span>
          </span>
        </button>

        {/* Zone 2: Active Patient (if selected) or Clean Title */}
        <div className="hidden sm:flex items-center justify-center min-w-0">
          {activePatient ? (
            <button
              type="button"
              onClick={() => {
                setWorkspaceTab('patients');
                setWorkspaceOpen(true);
              }}
              className="min-h-[36px] px-3 rounded-xl bg-emerald-50 border border-emerald-200/80 text-xs font-semibold text-emerald-800 flex items-center gap-1.5 truncate max-w-[240px]"
            >
              <Stethoscope className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{getPatientDisplayName(activePatient)}</span>
            </button>
          ) : (
            <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">
              عيادة المساعد الذكي
            </span>
          )}
        </div>

        {/* Zone 3: Quick Triggers (Notifications + Clinic Workspace + Robot Studio) */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setNotifSheetOpen(true)}
            className={`relative min-h-[44px] min-w-[44px] px-2 rounded-xl flex items-center justify-center transition-colors ${
              notifPermission === 'granted'
                ? 'text-slate-700 hover:bg-slate-100/80'
                : 'text-emerald-700 bg-emerald-50/80 hover:bg-emerald-100/80'
            }`}
            aria-label="الإشعارات"
          >
            {notifPermission === 'granted' ? (
              <BellRing className="w-5 h-5" />
            ) : (
              <Bell className="w-5 h-5" />
            )}
            {notificationsLog.length > 0 && (
              <span className="absolute top-1.5 left-1.5 text-[10px] font-bold font-mono-tabular text-emerald-700 standard-digits">
                {toWesternDigits(notificationsLog.length)}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              if (!isAuthenticatedSession) {
                setConnectOpen(true);
                return;
              }
              setWorkspaceQueueFilter(
                waitingList.length === 0 && appointments.length > 0 ? 'all' : 'active'
              );
              setWorkspaceTab(unreadMessagesCount > 0 ? 'messages' : 'queue');
              setWorkspaceOpen(true);
            }}
            className="relative min-h-[44px] min-w-[44px] px-2 rounded-xl flex items-center justify-center gap-1.5 text-slate-700 hover:bg-slate-100/80 transition-colors"
            aria-label="ملفات العيادة والانتظار"
          >
            <ClipboardList className="w-5 h-5" />
            <span className="hidden md:inline text-xs font-bold whitespace-nowrap">
              العيادة
            </span>
            {(waitingList.length > 0 || unreadMessagesCount > 0) && (
              <span className="text-[11px] font-bold font-mono-tabular text-emerald-700 standard-digits">
                {toWesternDigits(waitingList.length + unreadMessagesCount)}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setStudioOpen(true)}
            className="min-h-[44px] min-w-[44px] px-2 rounded-xl flex items-center justify-center gap-1.5 text-slate-700 hover:bg-slate-100/80 transition-colors"
            aria-label="تخصيص الروبوت والذكاء"
          >
            <SlidersHorizontal className="w-5 h-5" />
            <span className="hidden md:inline text-xs font-bold whitespace-nowrap">
              التخصيص
            </span>
          </button>
        </div>
      </header>

      {/* Non-intrusive inline Notification Permission Bar (only when permission === 'default') */}
      {notifPermission === 'default' && !notifBannerDismissed && (
        <div className="relative z-20 bg-emerald-50/95 border-b border-emerald-200/80 px-3 sm:px-5 py-1.5 flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-emerald-950 truncate">
            فعّل الإشعارات لتصلك تنبيهات وصول المرضى ورسائل الاستقبال فوراً
          </p>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleRequestNotifications}
              className="min-h-[34px] px-3 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 whitespace-nowrap"
            >
              تفعيل الإشعارات
            </button>
            <button
              type="button"
              onClick={() => setNotifBannerDismissed(true)}
              className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg text-emerald-800 hover:bg-emerald-100"
              aria-label="إخفاء"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Explicit Supabase Permission / Read Error Banner (never swallowed as zero rows) */}
      {isAuthenticatedSession && snapshotErrors.length > 0 && (
        <div className="relative z-20 bg-amber-50 border-b border-amber-200 px-3 sm:px-5 py-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
            <p className="text-xs font-semibold text-amber-950 truncate standard-digits">
              تعذر قراءة بعض الجداول من Supabase ({snapshotErrors[0]})
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                setWorkspaceTab('overview');
                setWorkspaceOpen(true);
              }}
              className="min-h-[32px] px-2.5 rounded-lg bg-white border border-amber-300 text-amber-900 text-[11px] font-bold hover:bg-amber-100 whitespace-nowrap"
            >
              التفاصيل
            </button>
            <button
              type="button"
              onClick={refreshLiveClinicData}
              className="min-h-[32px] px-2.5 rounded-lg bg-amber-600 text-white text-[11px] font-bold hover:bg-amber-700 whitespace-nowrap"
            >
              إعادة المحاولة
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area: Talking-Tom Center Stage (+ Desktop Side Transcript) */}
      <div className="flex-1 min-h-0 flex flex-col lg:grid lg:grid-cols-[1fr_390px] xl:grid-cols-[1fr_430px]">
        {/* Interactive Clinic Room Stage */}
        <main className="relative flex-1 min-h-0 flex flex-col items-center justify-between overflow-hidden px-4 pt-3 pb-3">
          <ClinicStageBackdrop isAlert={bubbleIsAlert} isListening={isListening} />

          {/* Floating Speech Bubble directly above the robot */}
          <div className="relative z-10 w-full max-w-md mt-1 sm:mt-3">
            <div
              className={`rounded-3xl px-5 py-3.5 shadow-sm backdrop-blur-md border transition-colors duration-300 ${
                bubbleIsAlert
                  ? 'bg-red-50/92 border-red-200 text-slate-900'
                  : isListening
                    ? 'bg-emerald-50/92 border-emerald-200 text-slate-900'
                    : 'bg-white/92 border-emerald-100 text-slate-800'
              }`}
            >
              <p className="text-sm sm:text-[15px] font-semibold leading-relaxed text-center text-balance">
                {bubbleText}
              </p>

              {(bubbleDetails || bubbleSources.length > 0) && (
                <div className="mt-2.5">
                  <button
                    type="button"
                    onClick={() => setBubbleDetailsOpen((v) => !v)}
                    className="mx-auto min-h-[32px] px-3 rounded-xl bg-emerald-50/90 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-1.5 hover:bg-emerald-100/80 transition-colors"
                  >
                    <span>
                      عرض التفاصيل والمصادر
                      {bubbleSources.length > 0 ? ` (${toWesternDigits(bubbleSources.length)})` : ''}
                    </span>
                    {bubbleDetailsOpen ? (
                      <ChevronUp className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )}
                  </button>

                  {bubbleDetailsOpen && (
                    <div className="mt-2.5 max-h-56 overflow-y-auto clean-scroll rounded-2xl bg-white border border-emerald-100 p-3 text-right space-y-2.5 text-xs text-slate-700 shadow-xs">
                      {bubbleDetails && (
                        <div className="whitespace-pre-wrap leading-relaxed text-slate-800">
                          {bubbleDetails}
                        </div>
                      )}
                      {bubbleSources.length > 0 && (
                        <div className="pt-2 border-t border-slate-100 space-y-1">
                          <p className="text-[11px] font-bold text-emerald-800">المصادر الطبية الموثوقة:</p>
                          {bubbleSources.map((src, idx) => (
                            <a
                              key={`bsrc_${idx}`}
                              href={src.uri}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-emerald-50/60 border border-emerald-100 hover:bg-emerald-50 text-emerald-900 transition-colors"
                            >
                              <span className="truncate font-semibold">{src.title}</span>
                              <span className="flex items-center gap-1 text-[10px] text-emerald-700 shrink-0">
                                <span>{src.domain || 'مرجع'}</span>
                                <ExternalLink className="w-3 h-3" />
                              </span>
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="mt-2.5 flex items-center justify-center gap-2 flex-wrap">
                {!isAuthenticatedSession && (
                  <button
                    type="button"
                    onClick={() => setConnectOpen(true)}
                    className="min-h-[38px] px-3.5 rounded-xl bg-emerald-600 text-white text-xs font-bold flex items-center gap-1.5 hover:bg-emerald-700 transition-colors"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    <span>دخول بحساب المنصة</span>
                  </button>
                )}

                {bubbleAction && (
                  <button
                    type="button"
                    onClick={() => handleTriggerAction(bubbleAction.type, bubbleAction.target)}
                    className="min-h-[38px] px-3.5 rounded-xl bg-emerald-600 text-white text-xs font-bold flex items-center gap-1.5 hover:bg-emerald-700 transition-colors"
                  >
                    <span>{bubbleAction.label}</span>
                    <ArrowUpLeft className="w-3.5 h-3.5" />
                  </button>
                )}

                {bubbleSuggestions.map((act, idx) => (
                  <button
                    key={`${act.type}_${idx}`}
                    type="button"
                    onClick={() => handleTriggerAction(act.type, act.target)}
                    className="min-h-[36px] px-3 rounded-xl bg-white/95 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-1 hover:bg-emerald-50 transition-colors"
                  >
                    <span>{act.label}</span>
                    <ArrowUpLeft className="w-3.5 h-3.5" />
                  </button>
                ))}
              </div>
            </div>
            {/* Bubble pointer tail */}
            <div
              className={`w-4 h-4 rotate-45 mx-auto -mt-2 border-b border-r ${
                bubbleIsAlert
                  ? 'bg-red-50 border-red-200'
                  : isListening
                    ? 'bg-emerald-50 border-emerald-200'
                    : 'bg-white border-emerald-100'
              }`}
            />
          </div>

          {/* Centerpiece: Standing 3iadati Nurse Robot in its private clinic */}
          <div className="relative z-10 flex-1 flex flex-col items-center justify-center my-auto">
            <div className="relative flex flex-col items-center">
              <AssistantRobot
                ref={robotRef}
                state={robotState}
                theme={prefs.theme}
                outfit={prefs.outfit}
                motion={prefs.motion}
                size={prefs.size}
                glowing={
                  isThinking ||
                  isListening ||
                  Boolean(inputText.trim()) ||
                  robotState !== 'idle'
                }
                embedded
                speaking={false}
                carrying={carryEnvelope}
                envelopeCount={unreadMessagesCount}
                userId={userKey}
                onOpen={handleRobotTap}
                className="stage-hero"
              />
              {/* Soft ground shadow beneath the hovering robot */}
              <div
                className="w-36 sm:w-44 h-4 rounded-full bg-slate-900/12 blur-md -mt-2 transition-transform duration-500"
                aria-hidden="true"
              />
            </div>

            {activePatient && (
              <button
                type="button"
                onClick={() => {
                  setWorkspaceTab('patients');
                  setWorkspaceOpen(true);
                }}
                className="mt-2 sm:hidden min-h-[36px] px-3 rounded-xl bg-white/90 border border-emerald-200 text-xs font-bold text-emerald-800 flex items-center gap-1.5 shadow-xs"
              >
                <Stethoscope className="w-3.5 h-3.5" />
                <span>المريض: {getPatientDisplayName(activePatient)}</span>
              </button>
            )}
          </div>
        </main>

        {/* Desktop Side Panel: Dual-Tab Conversation (Direct Nurse + Medical AI) */}
        <aside className="hidden lg:flex flex-col border-r border-emerald-100/90 bg-white min-h-0">
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between shrink-0">
            <div>
              <h2 className="text-sm font-bold text-slate-900">قسم المحادثة</h2>
              <p className="text-xs text-slate-500 standard-digits">
                المواعيد: {toWesternDigits(appointments.length)} · المرضى:{' '}
                {toWesternDigits(patients.length)} · الكشوفات:{' '}
                {toWesternDigits(clinicalVisits.length)}
              </p>
            </div>
            <button
              type="button"
              onClick={refreshLiveClinicData}
              className="min-h-[36px] px-2.5 rounded-lg text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
            >
              تحديث البيانات
            </button>
          </div>
          <div className="flex-1 min-h-0 p-4 flex flex-col overflow-hidden">
            <ChatTranscriptContent
              chatMode={chatMode}
              onChangeChatMode={handleSelectChatMode}
              messages={messages}
              clinicMessages={clinicMessages}
              unreadNurseCount={unreadMessagesCount}
              nurseSendError={nurseSendError}
              onTriggerAction={handleTriggerAction}
              onClearAi={() => setMessages([])}
            />
          </div>
        </aside>
      </div>

      {/* Bottom Thumb-Zone Two-Tab Composer Bar */}
      <footer className="relative z-30 bg-white/95 backdrop-blur-md border-t border-emerald-100/90 px-3 sm:px-5 pt-2 pb-safe shrink-0">
        <div className="max-w-3xl mx-auto space-y-2">
          {/* Compact Two-Tab Selector + Quick Nurse Phrases */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="inline-flex items-center p-0.5 rounded-xl bg-emerald-50 border border-emerald-100">
              <button
                type="button"
                onClick={() => handleSelectChatMode('nurse')}
                className={`min-h-[32px] px-3 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                  chatMode === 'nurse'
                    ? 'bg-white text-emerald-800 shadow-2xs border border-emerald-200/80'
                    : 'text-slate-600 hover:text-emerald-800'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>الممرض</span>
                {unreadMessagesCount > 0 && (
                  <span className="min-w-[16px] h-4 px-1 rounded-full bg-emerald-600 text-white text-[10px] font-bold flex items-center justify-center standard-digits">
                    {toWesternDigits(unreadMessagesCount)}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => handleSelectChatMode('ai')}
                className={`min-h-[32px] px-3 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                  chatMode === 'ai'
                    ? 'bg-white text-emerald-800 shadow-2xs border border-emerald-200/80'
                    : 'text-slate-600 hover:text-emerald-800'
                }`}
              >
                <Bot className="w-3.5 h-3.5" />
                <span>الروبوت الذكي</span>
              </button>
            </div>

            {chatMode === 'nurse' ? (
              <div className="flex items-center gap-1.5 overflow-x-auto clean-scroll py-0.5">
                {QUICK_NURSE_MESSAGES.map((quickText) => (
                  <button
                    key={quickText}
                    type="button"
                    disabled={isSendingToNurse}
                    onClick={() => handleSendTeamMessage(quickText)}
                    className="min-h-[30px] px-2.5 rounded-lg bg-white border border-slate-200 text-slate-700 text-[11px] font-semibold hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-800 whitespace-nowrap transition-colors disabled:opacity-50"
                  >
                    {quickText}
                  </button>
                ))}
              </div>
            ) : (
              <span className="text-[11px] font-semibold text-emerald-700 hidden sm:inline">
                الذكاء الاصطناعي الطبي بمصادر موثوقة
              </span>
            )}
          </div>

          <form onSubmit={handleTextSubmit} className="flex items-center gap-2">
            {/* Mobile Chat Transcript Toggle */}
            <button
              type="button"
              onClick={() => {
                if (chatMode === 'nurse') markNurseMessagesRead();
                setChatSheetOpen(true);
              }}
              className="relative lg:hidden min-h-[46px] min-w-[46px] rounded-2xl border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 flex items-center justify-center shrink-0"
              aria-label="سجل المحادثة"
            >
              <MessageCircle className="w-5 h-5" />
              {(chatMode === 'nurse' ? clinicMessages.length : messages.length) > 0 && (
                <span className="absolute -top-1 -left-1 min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-600 text-white text-[10px] font-bold flex items-center justify-center standard-digits">
                  {toWesternDigits(chatMode === 'nurse' ? clinicMessages.length : messages.length)}
                </span>
              )}
            </button>

            {/* Text Input */}
            <div className="flex-1 flex items-center bg-slate-100/90 border border-slate-200/80 rounded-2xl pr-3.5 pl-1.5 focus-within:bg-white focus-within:border-emerald-500 transition-colors">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={
                  chatMode === 'nurse'
                    ? 'اكتب رسالة مباشرة إلى الممرض...'
                    : isListening
                      ? 'جاري الاستماع لصوتك يا دكتور...'
                      : 'اسأل الذكاء الاصطناعي عن الطب، الجينات، الأدوية والمواد الفعالة...'
                }
                disabled={isThinking || isSendingToNurse}
                className="w-full min-h-[44px] bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
              />
              {inputText.trim() && (
                <button
                  type="submit"
                  disabled={isThinking || isSendingToNurse}
                  className="min-h-[38px] min-w-[38px] rounded-xl bg-emerald-600 text-white flex items-center justify-center hover:bg-emerald-700 disabled:opacity-40 shrink-0"
                  aria-label="إرسال"
                >
                  <Send className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Voice Microphone Button (AI Tab) */}
            {chatMode === 'ai' && (
              <button
                type="button"
                onClick={toggleVoiceListening}
                disabled={isThinking}
                className={`min-h-[48px] min-w-[48px] rounded-2xl flex items-center justify-center transition-all shrink-0 shadow-sm ${
                  isListening
                    ? 'bg-red-500 text-white scale-105 shadow-red-500/25'
                    : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-600/20'
                } disabled:opacity-50`}
                aria-label={isListening ? 'إيقاف الاستماع' : 'تحدث مع الروبوت الذكي'}
              >
                {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>
            )}
          </form>
        </div>
      </footer>

      {/* Sheets & Modals */}
      <ClinicConnectSheet
        open={connectOpen}
        onClose={() => setConnectOpen(false)}
        authUser={authUser}
        activeAccountEmail={accountEmail}
        activeAccountName={accountName}
        isAuthenticatedSession={isAuthenticatedSession}
        currentClinic={clinic}
        currentRole={role}
        onPlatformLoginSuccess={handlePlatformLoginSuccess}
        onSelectClinic={handleSelectClinic}
        onSignedOut={handleSignedOut}
      />

      <NotificationsSheet
        open={notifSheetOpen}
        onClose={() => setNotifSheetOpen(false)}
        permission={notifPermission}
        notifications={notificationsLog}
        onRequestPermission={handleRequestNotifications}
        onTestNotification={handleTestNotification}
        onClearLog={() => setNotificationsLog([])}
      />

      <RobotStudioSheet
        open={studioOpen}
        onClose={() => setStudioOpen(false)}
        prefs={prefs}
        onUpdatePrefs={handleUpdatePrefs}
        aiConfig={aiConfig}
        onUpdateAiConfig={handleUpdateAiConfig}
        syncSaving={syncSaving}
      />

      <ClinicWorkspaceSheet
        open={workspaceOpen}
        initialTab={workspaceTab}
        initialQueueFilter={workspaceQueueFilter}
        onClose={() => {
          setWorkspaceOpen(false);
        }}
        clinic={clinic}
        doctorProfile={doctorProfile}
        userProfile={userProfile}
        schedules={schedules}
        waitingList={waitingList}
        appointments={appointments}
        waitingQueue={waitingQueue}
        patients={patients}
        clinicalVisits={clinicalVisits}
        issuedDocuments={issuedDocuments}
        prescriptions={recentPrescriptions}
        patientDocuments={patientDocuments}
        services={services}
        messages={clinicMessages}
        accountingEntries={accountingEntries}
        revenueSummary={revenueSummary}
        snapshotErrors={snapshotErrors}
        activePatient={activePatient}
        onSelectActivePatient={setActivePatient}
        onAskRobotAbout={(prompt) => {
          handleSelectChatMode('ai');
          sendMessage(prompt);
        }}
        onRefreshData={refreshLiveClinicData}
        onSendMessageToNurse={handleSendTeamMessage}
      />

      <ChatHistorySheet
        open={chatSheetOpen}
        onClose={() => setChatSheetOpen(false)}
        chatMode={chatMode}
        onChangeChatMode={handleSelectChatMode}
        messages={messages}
        clinicMessages={clinicMessages}
        unreadNurseCount={unreadMessagesCount}
        nurseSendError={nurseSendError}
        onTriggerAction={handleTriggerAction}
        onClearAi={() => setMessages([])}
      />
    </div>
  );
}
