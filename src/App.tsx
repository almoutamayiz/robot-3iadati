import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import {
  ArrowUpLeft,
  Bell,
  BellRing,
  Building2,
  ClipboardList,
  LogIn,
  MessageCircle,
  Mic,
  MicOff,
  Send,
  SlidersHorizontal,
  Stethoscope,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { AssistantRobot, type AssistantRobotHandle } from './components/robot/AssistantRobot';
import { ClinicStageBackdrop } from './components/ClinicStageBackdrop';
import { ClinicConnectSheet } from './components/ClinicConnectSheet';
import { RobotStudioSheet } from './components/RobotStudioSheet';
import { ClinicWorkspaceSheet, type WorkspaceTab } from './components/ClinicWorkspaceSheet';
import { ChatHistorySheet, ChatTranscriptContent } from './components/ChatHistorySheet';
import { NotificationsSheet } from './components/NotificationsSheet';
import {
  calculatePatientAge,
  fetchClinicById,
  fetchClinicSnapshot,
  getClinicDisplayName,
  getPatientDisplayName,
  resolveClinicForAuthUser,
  sendClinicTeamMessage,
  supabase,
  updateClinicRobotDefaults,
} from './lib/supabase';
import {
  DEFAULT_ROBOT_PREFERENCES,
  fetchUserRobotPrefsFromSupabase,
  normalizeClinicRobotDefaults,
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
  ClinicMessageRecord,
  ClinicRecord,
  ClinicRole,
  MedicalVisitRecord,
  PatientRecord,
  PrescriptionRecord,
  RobotState,
  SuggestedClinicAction,
  WaitingItem,
} from './types/robot';

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
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
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
  const [aiConfig, setAiConfig] = useState<AiAssistantConfig>(DEFAULT_AI_CONFIG);
  const [syncSaving, setSyncSaving] = useState(false);

  // Live Supabase Clinic Snapshot
  const [patients, setPatients] = useState<PatientRecord[]>([]);
  const [waitingList, setWaitingList] = useState<WaitingItem[]>([]);
  const [recentVisits, setRecentVisits] = useState<MedicalVisitRecord[]>([]);
  const [recentPrescriptions, setRecentPrescriptions] = useState<PrescriptionRecord[]>([]);
  const [clinicMessages, setClinicMessages] = useState<ClinicMessageRecord[]>([]);
  const [activePatient, setActivePatient] = useState<PatientRecord | null>(null);

  // Notifications State
  const [notifPermission, setNotifPermission] = useState<NotificationPermissionState>(() =>
    getNotificationPermissionState()
  );
  const [notifBannerDismissed, setNotifBannerDismissed] = useState(false);
  const [notificationsLog, setNotificationsLog] = useState<AppNotificationItem[]>([]);

  // Robot Interactive Stage State
  const [robotState, setRobotState] = useState<RobotState>('idle');
  const [isListening, setIsListening] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [inputText, setInputText] = useState('');
  const [bubbleText, setBubbleText] = useState<string>(
    'أهلاً دكتور! أنا ممرضك الذكي في منصة عيادتي، جاهز لمساعدتك وتنظيم العيادة.'
  );
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
  const [workspaceDrugQuery, setWorkspaceDrugQuery] = useState('');
  const [chatSheetOpen, setChatSheetOpen] = useState(false);
  const [notifSheetOpen, setNotifSheetOpen] = useState(false);

  const clinicId = clinic?.id || 'default_clinic';
  const userKey = resolveRobotUserKey(
    role,
    sessionUserId || authUser?.id || clinic?.owner_user_id || clinicId,
    clinicId
  );

  const unreadMessagesCount = clinicMessages.filter((m) => m.is_read === false).length;
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
        timestamp: new Date().toLocaleTimeString('ar-DZ', {
          hour: '2-digit',
          minute: '2-digit',
        }),
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
        ? `يوجد حالياً ${waitingList.length} مرضى في قاعة الانتظار.`
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

  // Stop any ongoing speech playback
  const stopSpeaking = useCallback(() => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  }, []);

  // Speak robot reply aloud using Gemini TTS with browser fallback
  const speakText = useCallback(
    async (text: string) => {
      if (!aiConfig.voiceReply || !text.trim()) return;
      stopSpeaking();

      const fallbackBrowserTTS = () => {
        if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
        try {
          const utter = new SpeechSynthesisUtterance(text);
          utter.lang = 'ar-SA';
          utter.rate = 1.02;
          utter.onstart = () => setIsSpeaking(true);
          utter.onend = () => setIsSpeaking(false);
          utter.onerror = () => setIsSpeaking(false);
          window.speechSynthesis.speak(utter);
        } catch {
          setIsSpeaking(false);
        }
      };

      try {
        setIsSpeaking(true);
        const res = await fetch('/api/ai/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text,
            voiceName: aiConfig.voiceName,
            operationMode: aiConfig.operationMode,
          }),
        });
        if (!res.ok) {
          fallbackBrowserTTS();
          return;
        }
        const data = (await res.json()) as { audioBase64?: string; mimeType?: string };
        if (!data.audioBase64) {
          fallbackBrowserTTS();
          return;
        }
        const audio = new Audio(
          `data:${data.mimeType || 'audio/wav'};base64,${data.audioBase64}`
        );
        audioPlayerRef.current = audio;
        audio.onended = () => {
          setIsSpeaking(false);
          audioPlayerRef.current = null;
        };
        audio.onerror = () => {
          setIsSpeaking(false);
          audioPlayerRef.current = null;
          fallbackBrowserTTS();
        };
        await audio.play().catch(() => {
          fallbackBrowserTTS();
        });
      } catch {
        fallbackBrowserTTS();
      }
    },
    [aiConfig.operationMode, aiConfig.voiceName, aiConfig.voiceReply, stopSpeaking]
  );

  // Process snapshot & fire automatic notifications for new waiting patients / delays / messages
  const applyLiveSnapshot = useCallback(
    (
      snapshot: {
        patients: PatientRecord[];
        waitingList: WaitingItem[];
        recentVisits: MedicalVisitRecord[];
        prescriptions: PrescriptionRecord[];
        messages: ClinicMessageRecord[];
      },
      effectivePrefs: RobotPreferences
    ) => {
      setPatients(snapshot.patients);
      setWaitingList(snapshot.waitingList);
      setRecentVisits(snapshot.recentVisits);
      setRecentPrescriptions(snapshot.prescriptions);
      setClinicMessages(snapshot.messages);

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
          const refTime = item.start_at || item.created_at;
          if (!refTime || alertedDelayIdsRef.current.has(idStr)) continue;
          const waitedMs = now - new Date(refTime).getTime();
          if (Number.isFinite(waitedMs) && waitedMs >= thresholdMs && waitedMs < 12 * 3600_000) {
            alertedDelayIdsRef.current.add(idStr);
            const mins = Math.round(waitedMs / 60_000);
            const pName = item.patient_name || 'مريض';
            pushClinicNotification(
              'تنبيه تأخر في الانتظار',
              `${pName} ينتظر منذ ${mins} دقيقة.`,
              'alert',
              `delay_${idStr}`
            );
            setRobotState('alert');
            robotRef.current?.play('sad');
          }
        }
      }

      // Check new unread team messages
      for (const msg of snapshot.messages) {
        const idStr = String(msg.id);
        if (!knownMessageIdsRef.current.has(idStr)) {
          knownMessageIdsRef.current.add(idStr);
          if (msg.is_read === false) {
            const sender =
              msg.sender_name || (msg.sender_role === 'doctor' ? 'الطبيب' : 'الاستقبال');
            pushClinicNotification(
              `رسالة جديدة من ${sender}`,
              msg.message || 'لديك رسالة جديدة في العيادة.',
              'message',
              `msg_${idStr}`
            );
            setRobotState('attention');
            robotRef.current?.play('wink');
          }
        }
      }
    },
    [pushClinicNotification]
  );

  // Load clinic data & sync robot preferences from Supabase
  const loadClinicContext = useCallback(
    async (
      targetClinic: ClinicRecord,
      targetRole: ClinicRole,
      prefsUserIdOverride?: string | null
    ) => {
      const cId = targetClinic.id;
      const effectiveUid = prefsUserIdOverride || targetClinic.owner_user_id || cId;
      const uKey = resolveRobotUserKey(targetRole, effectiveUid, cId);

      snapshotInitializedRef.current = false;
      alertedDelayIdsRef.current.clear();

      // 1. Clinic robot defaults
      const clinicDefaults = targetClinic.robot_defaults
        ? normalizeClinicRobotDefaults(targetClinic.robot_defaults)
        : readLocalClinicRobotDefaults(cId);
      if (clinicDefaults) {
        writeLocalClinicRobotDefaults(cId, clinicDefaults);
      }

      // 2. User robot preferences
      const localPrefs = readLocalUserRobotPrefs(uKey, clinicDefaults);
      setPrefs(localPrefs);

      const remotePrefs = await fetchUserRobotPrefsFromSupabase(uKey, cId, clinicDefaults);
      const effectivePrefs = remotePrefs || localPrefs;
      if (remotePrefs) {
        setPrefs(remotePrefs);
        writeLocalUserRobotPrefs(uKey, remotePrefs);
      }

      // 3. AI Settings (browser localStorage only)
      setAiConfig(readLocalAiConfig(cId));

      // 4. Live clinic snapshot
      const snapshot = await fetchClinicSnapshot(cId);
      applyLiveSnapshot(snapshot, effectivePrefs);

      // 5. Friendly nurse greeting animation & contextual shortcuts
      if (effectivePrefs.behaviors.greetOnLogin) {
        setRobotState('happy');
        window.setTimeout(() => {
          robotRef.current?.play(snapshot.waitingList.length > 0 ? 'smile' : 'wave');
        }, 350);
      }

      const name = getClinicDisplayName(targetClinic);
      const waitCount = snapshot.waitingList.length;
      const patCount = snapshot.patients.length;
      setBubbleText(
        waitCount > 0 || patCount > 0
          ? `أهلاً دكتور في ${name}. بصفتي ممرضك في عيادتي، لدينا ${waitCount} في الانتظار والمواعيد و${patCount} ملف مريض جاهز.`
          : `أهلاً دكتور في ${name}. أنا ممرضك الذكي في عيادتي، جاهز لأي ملف مريض أو دواء أو تنسيق.`
      );
      setBubbleAction(
        waitCount > 0 ? { type: 'open_queue', target: '', label: 'النظر لقاعة الانتظار' } : null
      );
      setBubbleSuggestions(
        patCount > 0 ? [{ type: 'open_patients', target: '', label: 'ملفات المرضى' }] : []
      );
      setBubbleIsAlert(false);
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
          const chosen =
            (saved?.clinicId && resolved.clinics.find((c) => c.id === saved.clinicId)) ||
            resolved.primaryClinic;

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
        const restoredClinic = await fetchClinicById(saved.clinicId);
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
    const snapshot = await fetchClinicSnapshot(clinic.id);
    applyLiveSnapshot(snapshot, prefs);
  }, [applyLiveSnapshot, clinic, prefs]);

  // Real-time Supabase subscription matching platform tables + 25s poll fallback
  useEffect(() => {
    if (!clinic || clinic.id === 'clinic_demo_local') return;
    const cId = clinic.id;

    const channel = supabase
      .channel(`clinic_live_${cId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'appointments', filter: `clinic_id=eq.${cId}` },
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
        { event: '*', schema: 'public', table: 'clinics', filter: `id=eq.${cId}` },
        (payload) => {
          if (payload.new && typeof payload.new === 'object') {
            const nextDefaults = (payload.new as Record<string, unknown>).robot_defaults;
            if (nextDefaults) {
              const norm = normalizeClinicRobotDefaults(nextDefaults);
              writeLocalClinicRobotDefaults(cId, norm);
            }
          }
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
  }, [clinic, refreshLiveClinicData]);

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
    setPatients([]);
    setWaitingList([]);
    setRecentVisits([]);
    setRecentPrescriptions([]);
    setClinicMessages([]);
    setActivePatient(null);
    writeSavedSession(null);
    setClinic(null);
    setBubbleAction(null);
    setBubbleSuggestions([]);
    setBubbleText('تم تسجيل الخروج. أدخل البريد الإلكتروني وكلمة المرور للطبيب للدخول مجدداً.');
    setConnectOpen(true);
  };

  const handleUpdatePrefs = async (next: RobotPreferences) => {
    setPrefs(next);
    writeLocalUserRobotPrefs(userKey, next);
    if (clinic && clinic.id !== 'clinic_demo_local') {
      setSyncSaving(true);
      await saveUserRobotPrefsToSupabase(userKey, clinic.id, next);
      await updateClinicRobotDefaults(clinic.id, {
        theme: next.theme,
        outfit: next.outfit,
        motion: next.motion,
        size: next.size,
        behaviors: next.behaviors,
      });
      setSyncSaving(false);
    }
  };

  const handleUpdateAiConfig = (next: AiAssistantConfig) => {
    setAiConfig(next);
    writeLocalAiConfig(clinicId, next);
  };

  const handleTriggerAction = useCallback(
    (actionType: string, actionTarget?: string | null) => {
      if (!isAuthenticatedSession) {
        setConnectOpen(true);
        return;
      }
      const target = String(actionTarget || '').trim();
      if (actionType === 'open_queue') {
        setWorkspaceDrugQuery('');
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
        setWorkspaceDrugQuery('');
        setWorkspaceTab('patients');
        setWorkspaceOpen(true);
      } else if (actionType === 'open_drugs') {
        setWorkspaceDrugQuery(target);
        setWorkspaceTab('drugs');
        setWorkspaceOpen(true);
      } else if (actionType === 'open_messages' || actionType === 'send_message') {
        setWorkspaceDrugQuery('');
        setWorkspaceTab('messages');
        setWorkspaceOpen(true);
      }
    },
    [isAuthenticatedSession, patients]
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

      stopSpeaking();
      setInputText('');
      setLiveTranscript('');

      const nowStr = new Date().toLocaleTimeString('ar-DZ', {
        hour: '2-digit',
        minute: '2-digit',
      });
      const userMsg: ChatMessage = {
        id: `u_${Date.now()}`,
        role: 'user',
        text,
        timestamp: nowStr,
      };

      setMessages((prev) => [...prev, userMsg]);
      setIsThinking(true);
      setRobotState('thinking');
      setBubbleText('حاضر دكتور، أراجع لك بيانات عيادتي الآن...');
      setBubbleAction(null);
      setBubbleSuggestions([]);
      setBubbleIsAlert(false);

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
            allowDrugDb: aiConfig.allowDrugDb,
            allowPatientContext: aiConfig.allowPatientContext,
            allowOrgAdvice: aiConfig.allowOrgAdvice,
            autoFallbackOnQuota: aiConfig.autoFallbackOnQuota,
            clinicContext: {
              clinicName: getClinicDisplayName(clinic),
              doctorName: clinic?.doctor_name || 'الطبيب',
              specialty: clinic?.specialty || 'عيادة طبية',
              userRole: role,
              waitingCount: waitingList.length,
              waitingListSample: waitingList.slice(0, 25).map((w) => ({
                queueNumber: w.queue_number,
                name: w.patient_name,
                status: w.status,
                reason: w.reason_for_visit,
                phone: w.patient_phone,
                time: w.appointment_time || w.booking_date,
                createdAt: w.start_at || w.created_at,
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
                  patientsSample: patients.slice(0, 6).map((p) => ({
                    name: getPatientDisplayName(p),
                    chronicDiseases: p.chronic_diseases,
                    allergies: p.allergies,
                  })),
                  recentVisitsSample: recentVisits.slice(0, 4).map((v) => ({
                    diagnosis: v.diagnosis,
                    clinicalNotes: v.clinical_notes,
                    treatmentNotes: v.treatment_notes,
                    date: v.visit_date || v.created_at,
                  })),
                  recentPrescriptionsSample: recentPrescriptions.slice(0, 3).map((rx) => ({
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
        if (!nextAction && data.actionType === 'send_message') {
          nextAction = 'fly';
        }

        const suggestions: SuggestedClinicAction[] = Array.isArray(data.suggestedActions)
          ? data.suggestedActions.filter(
              (s: unknown): s is SuggestedClinicAction =>
                Boolean(s && typeof s === 'object' && (s as SuggestedClinicAction).label)
            )
          : [];

        const isAlert = nextState === 'alert';
        const assistantMsg: ChatMessage = {
          id: `a_${Date.now()}`,
          role: 'assistant',
          text: replyText,
          timestamp: new Date().toLocaleTimeString('ar-DZ', {
            hour: '2-digit',
            minute: '2-digit',
          }),
          actionType: data.actionType,
          actionTarget: data.actionTarget,
          actionLabel: data.actionLabel,
          suggestedActions: suggestions,
          isAlert,
          drugsMentioned: Array.isArray(data.matchedDrugs) ? data.matchedDrugs : undefined,
        };

        setMessages((prev) => [...prev, assistantMsg]);
        setBubbleText(replyText);
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

        // Automatically dispatch direct clinic message to nurse/receptionist if requested
        if (
          data.actionType === 'send_message' &&
          typeof data.actionTarget === 'string' &&
          data.actionTarget.trim() &&
          clinic &&
          clinic.id !== 'clinic_demo_local'
        ) {
          const senderLabel =
            role === 'doctor'
              ? `د. ${clinic.doctor_name || 'الطبيب'}`
              : clinic.assistant_name || 'الاستقبال';
          sendClinicTeamMessage(clinic.id, role, senderLabel, data.actionTarget.trim()).then(
            (ok) => {
              if (ok) refreshLiveClinicData();
            }
          );
        }

        if (aiConfig.voiceReply) {
          speakText(replyText);
        } else {
          // Animate mouth lip-sync briefly even when sound is muted
          setIsSpeaking(true);
          const talkMs = Math.min(3600, Math.max(1200, replyText.length * 42));
          window.setTimeout(() => setIsSpeaking(false), talkMs);
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
      clinic,
      clinicMessages,
      isAuthenticatedSession,
      isThinking,
      messages,
      notifPermission,
      patients,
      prefs.behaviors.clapOnSuccess,
      pushClinicNotification,
      recentPrescriptions,
      recentVisits,
      refreshLiveClinicData,
      role,
      speakText,
      stopSpeaking,
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
    stopSpeaking();

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
    stopSpeaking,
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
      setWorkspaceTab('messages');
      setWorkspaceOpen(true);
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
            ? `لدينا الآن ${waitingList.length} مرضى في قاعة الانتظار بعيادتي.`
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
        text: 'أنا ممرضك الذكي في عيادتي، اسألني عن ملف أي مريض أو دواء من قاعدة الأدوية.',
        suggested: { type: 'open_drugs', target: '', label: 'فتح قائمة الأدوية' },
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
    setBubbleAction(pick.suggested || null);
    setBubbleSuggestions([]);
    setBubbleIsAlert(false);
    setRobotState(pick.state);
    robotRef.current?.play(pick.action);
    if (aiConfig.voiceReply) {
      speakText(pick.text);
    }
    window.setTimeout(() => setRobotState('idle'), 2800);
  };

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    sendMessage(inputText);
  };

  return (
    <div className="h-[100dvh] w-full flex flex-col bg-[#f4f7fb] text-slate-900 overflow-hidden">
      {/* Compact 3-Zone Top App Bar (<= 56px) */}
      <header className="relative z-30 h-14 px-3 sm:px-5 bg-white/85 backdrop-blur-md border-b border-slate-200/80 flex items-center justify-between gap-2 shrink-0">
        {/* Zone 1: Platform Account & Clinic Switcher */}
        <button
          type="button"
          onClick={() => setConnectOpen(true)}
          className="min-h-[44px] px-2 rounded-xl flex items-center gap-2 hover:bg-slate-100/80 transition-colors min-w-0 max-w-[48%]"
        >
          <span
            className={`w-8 h-8 rounded-xl border flex items-center justify-center shrink-0 ${
              isAuthenticatedSession
                ? 'bg-sky-50 border-sky-200 text-sky-700'
                : 'bg-amber-50 border-amber-200 text-amber-700'
            }`}
          >
            {isAuthenticatedSession ? <Building2 className="w-4 h-4" /> : <LogIn className="w-4 h-4" />}
          </span>
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
              className="min-h-[36px] px-3 rounded-xl bg-sky-50 border border-sky-200/80 text-xs font-semibold text-sky-800 flex items-center gap-1.5 truncate max-w-[240px]"
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
                : 'text-sky-700 bg-sky-50/80 hover:bg-sky-100/80'
            }`}
            aria-label="الإشعارات"
          >
            {notifPermission === 'granted' ? (
              <BellRing className="w-5 h-5" />
            ) : (
              <Bell className="w-5 h-5" />
            )}
            {notificationsLog.length > 0 && (
              <span className="absolute top-1.5 left-1.5 text-[10px] font-bold font-mono-tabular text-sky-700">
                {notificationsLog.length}
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
              <span className="text-[11px] font-bold font-mono-tabular text-sky-700">
                {waitingList.length + unreadMessagesCount}
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
        <div className="relative z-20 bg-sky-50/95 border-b border-sky-200/80 px-3 sm:px-5 py-1.5 flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-sky-950 truncate">
            فعّل الإشعارات لتصلك تنبيهات وصول المرضى ورسائل الاستقبال فوراً
          </p>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleRequestNotifications}
              className="min-h-[34px] px-3 rounded-lg bg-sky-600 text-white text-xs font-bold hover:bg-sky-700 whitespace-nowrap"
            >
              تفعيل الإشعارات
            </button>
            <button
              type="button"
              onClick={() => setNotifBannerDismissed(true)}
              className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg text-sky-800 hover:bg-sky-100"
              aria-label="إخفاء"
            >
              <X className="w-4 h-4" />
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
                    ? 'bg-sky-50/92 border-sky-200 text-slate-900'
                    : 'bg-white/88 border-slate-200/80 text-slate-800'
              }`}
            >
              <p className="text-sm sm:text-[15px] font-semibold leading-relaxed text-center text-balance">
                {bubbleText}
              </p>

              <div className="mt-2.5 flex items-center justify-center gap-2 flex-wrap">
                {!isAuthenticatedSession && (
                  <button
                    type="button"
                    onClick={() => setConnectOpen(true)}
                    className="min-h-[38px] px-3.5 rounded-xl bg-slate-900 text-white text-xs font-bold flex items-center gap-1.5 hover:bg-slate-800 transition-colors"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    <span>دخول بحساب المنصة</span>
                  </button>
                )}

                {bubbleAction && (
                  <button
                    type="button"
                    onClick={() => handleTriggerAction(bubbleAction.type, bubbleAction.target)}
                    className="min-h-[38px] px-3.5 rounded-xl bg-sky-600 text-white text-xs font-bold flex items-center gap-1.5 hover:bg-sky-700 transition-colors"
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
                    className="min-h-[36px] px-3 rounded-xl bg-white/95 border border-sky-200 text-sky-800 text-xs font-bold flex items-center gap-1 hover:bg-sky-50 transition-colors"
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
                    ? 'bg-sky-50 border-sky-200'
                    : 'bg-white border-slate-200/80'
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
                embedded
                speaking={isSpeaking}
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
                className="mt-2 sm:hidden min-h-[36px] px-3 rounded-xl bg-white/85 border border-slate-200 text-xs font-bold text-sky-800 flex items-center gap-1.5 shadow-xs"
              >
                <Stethoscope className="w-3.5 h-3.5" />
                <span>المريض: {getPatientDisplayName(activePatient)}</span>
              </button>
            )}
          </div>
        </main>

        {/* Desktop Side Panel: Live Chat Transcript & Clinic Summary */}
        <aside className="hidden lg:flex flex-col border-r border-slate-200/80 bg-white min-h-0">
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900">سجل الحوار الطبي</h2>
              <p className="text-xs text-slate-500 standard-digits">
                الانتظار: {waitingList.length} · المرضى: {patients.length}
              </p>
            </div>
            <button
              type="button"
              onClick={refreshLiveClinicData}
              className="min-h-[36px] px-2.5 rounded-lg text-xs font-semibold text-sky-700 hover:bg-sky-50"
            >
              تحديث البيانات
            </button>
          </div>
          <div className="flex-1 overflow-y-auto clean-scroll p-4">
            <ChatTranscriptContent
              messages={messages}
              onReplayVoice={speakText}
              onTriggerAction={handleTriggerAction}
              onClear={() => setMessages([])}
            />
          </div>
        </aside>
      </div>

      {/* Bottom Thumb-Zone Voice & Text Bar */}
      <footer className="relative z-30 bg-white/92 backdrop-blur-md border-t border-slate-200/80 px-3 sm:px-5 pt-2.5 pb-safe shrink-0">
        <form
          onSubmit={handleTextSubmit}
          className="max-w-3xl mx-auto flex items-center gap-2"
        >
          {/* Voice Mute / Unmute */}
          <button
            type="button"
            onClick={() => {
              if (aiConfig.voiceReply) stopSpeaking();
              handleUpdateAiConfig({ ...aiConfig, voiceReply: !aiConfig.voiceReply });
            }}
            className={`min-h-[46px] min-w-[46px] rounded-2xl border flex items-center justify-center transition-colors shrink-0 ${
              aiConfig.voiceReply
                ? 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                : 'border-slate-200 bg-slate-100 text-slate-400'
            }`}
            aria-label={aiConfig.voiceReply ? 'كتم صوت الروبوت' : 'تفعيل صوت الروبوت'}
            title={aiConfig.voiceReply ? 'صوت الروبوت مفعّل' : 'صوت الروبوت مكتوم'}
          >
            {aiConfig.voiceReply ? (
              <Volume2 className="w-5 h-5" />
            ) : (
              <VolumeX className="w-5 h-5" />
            )}
          </button>

          {/* Mobile Chat Transcript Toggle */}
          <button
            type="button"
            onClick={() => setChatSheetOpen(true)}
            className="relative lg:hidden min-h-[46px] min-w-[46px] rounded-2xl border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 flex items-center justify-center shrink-0"
            aria-label="سجل المحادثة"
          >
            <MessageCircle className="w-5 h-5" />
            {messages.length > 0 && (
              <span className="absolute -top-1 -left-1 min-w-[18px] h-[18px] px-1 rounded-full bg-sky-600 text-white text-[10px] font-bold flex items-center justify-center standard-digits">
                {messages.length}
              </span>
            )}
          </button>

          {/* Text Input */}
          <div className="flex-1 flex items-center bg-slate-100/90 border border-slate-200/80 rounded-2xl pr-3.5 pl-1.5 focus-within:bg-white focus-within:border-sky-500 transition-colors">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={
                isListening
                  ? 'جاري الاستماع لصوتك يا دكتور...'
                  : 'تحدث أو اكتب لممرض عيادتي الذكي...'
              }
              disabled={isThinking}
              className="w-full min-h-[44px] bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
            />
            {inputText.trim() && (
              <button
                type="submit"
                disabled={isThinking}
                className="min-h-[38px] min-w-[38px] rounded-xl bg-sky-600 text-white flex items-center justify-center hover:bg-sky-700 disabled:opacity-40 shrink-0"
                aria-label="إرسال"
              >
                <Send className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Primary Voice Microphone Button */}
          <button
            type="button"
            onClick={toggleVoiceListening}
            disabled={isThinking}
            className={`min-h-[48px] min-w-[48px] rounded-2xl flex items-center justify-center transition-all shrink-0 shadow-sm ${
              isListening
                ? 'bg-red-500 text-white scale-105 shadow-red-500/25'
                : 'bg-sky-600 text-white hover:bg-sky-700 shadow-sky-600/20'
            } disabled:opacity-50`}
            aria-label={isListening ? 'إيقاف الاستماع' : 'تحدث مع الروبوت'}
          >
            {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>
        </form>
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
        initialDrugQuery={workspaceDrugQuery}
        onClose={() => {
          setWorkspaceOpen(false);
          setWorkspaceDrugQuery('');
        }}
        clinicId={clinicId}
        role={role}
        doctorName={clinic?.doctor_name || 'الطبيب'}
        assistantName={clinic?.assistant_name}
        waitingList={waitingList}
        patients={patients}
        messages={clinicMessages}
        activePatient={activePatient}
        onSelectActivePatient={setActivePatient}
        onAskRobotAbout={(prompt) => sendMessage(prompt)}
        onRefreshData={refreshLiveClinicData}
      />

      <ChatHistorySheet
        open={chatSheetOpen}
        onClose={() => setChatSheetOpen(false)}
        messages={messages}
        onReplayVoice={speakText}
        onTriggerAction={handleTriggerAction}
        onClear={() => setMessages([])}
      />
    </div>
  );
}
