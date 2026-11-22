import React, { useEffect, useRef, useState } from 'react';
import { Check, Cpu, Palette, Shirt, Sparkles, Volume2, X } from 'lucide-react';
import { AssistantRobot, type AssistantRobotHandle } from './robot/AssistantRobot';
import {
  ROBOT_ACTIONS_LIST,
  ROBOT_OUTFITS_LIST,
  ROBOT_OUTFIT_PRESETS,
  ROBOT_THEMES_LIST,
  toggleRobotOutfitItem,
  type RobotAction,
} from '../lib/robotActions';
import type {
  RobotMotionLevel,
  RobotPreferences,
  RobotTheme,
} from '../lib/robotPreferences';
import type { AiAssistantConfig, AiModelChoice, AiOperationMode } from '../lib/aiSettings';

interface AiStatusInfo {
  ready: boolean;
  hasEnvironmentKey: boolean;
  poolSize: number;
  availableKeysCount: number;
}

interface RobotStudioSheetProps {
  open: boolean;
  onClose: () => void;
  prefs: RobotPreferences;
  onUpdatePrefs: (next: RobotPreferences) => void;
  aiConfig: AiAssistantConfig;
  onUpdateAiConfig: (next: AiAssistantConfig) => void;
  syncSaving: boolean;
}

type StudioTab = 'appearance' | 'actions' | 'ai';

export const RobotStudioSheet: React.FC<RobotStudioSheetProps> = ({
  open,
  onClose,
  prefs,
  onUpdatePrefs,
  aiConfig,
  onUpdateAiConfig,
  syncSaving,
}) => {
  const [tab, setTab] = useState<StudioTab>('appearance');
  const [aiStatus, setAiStatus] = useState<AiStatusInfo | null>(null);
  const [activeAction, setActiveAction] = useState<RobotAction | null>(null);
  const previewRobotRef = useRef<AssistantRobotHandle | null>(null);

  useEffect(() => {
    if (!open) return;
    fetch('/api/ai/status')
      .then((r) => r.json())
      .then((d) => setAiStatus(d))
      .catch(() => setAiStatus(null));
  }, [open]);

  if (!open) return null;

  const setTheme = (theme: RobotTheme) => {
    onUpdatePrefs({ ...prefs, theme, hasCustomOverride: true });
  };

  const toggleOutfit = (itemId: (typeof ROBOT_OUTFITS_LIST)[number]['id']) => {
    onUpdatePrefs({
      ...prefs,
      outfit: toggleRobotOutfitItem(prefs.outfit, itemId),
      hasCustomOverride: true,
    });
  };

  const applyPreset = (items: (typeof ROBOT_OUTFITS_LIST)[number]['id'][]) => {
    onUpdatePrefs({
      ...prefs,
      outfit: [...items],
      hasCustomOverride: true,
    });
  };

  const setMotion = (motion: RobotMotionLevel) => {
    onUpdatePrefs({ ...prefs, motion, hasCustomOverride: true });
  };

  const testAction = async (action: RobotAction) => {
    setActiveAction(action);
    await previewRobotRef.current?.play(action, { ignoreMotionOff: true });
    setActiveAction(null);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-t-3xl sm:rounded-3xl bg-white shadow-2xl border border-slate-200/80 max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pt-3 pb-1 flex justify-center sm:hidden">
          <div className="w-10 h-1.5 rounded-full bg-slate-300" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-900">تخصيص الروبوت والذكاء</h2>
            <p className="text-xs text-slate-500">
              {syncSaving ? 'جاري المزامنة مع عيادتي...' : 'متزامن مع حسابك في منصة عيادتي'}
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

        {/* Live Preview Stage */}
        <div className="bg-gradient-to-b from-slate-50 to-slate-100/70 border-b border-slate-100 py-3 flex flex-col items-center justify-center">
          <AssistantRobot
            ref={previewRobotRef}
            state="idle"
            theme={prefs.theme}
            outfit={prefs.outfit}
            motion={prefs.motion}
            embedded
            className="!w-[116px]"
          />
        </div>

        {/* Segmented Tabs */}
        <div className="px-5 pt-3">
          <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-xl">
            <button
              type="button"
              onClick={() => setTab('appearance')}
              className={`min-h-[40px] flex items-center justify-center gap-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                tab === 'appearance' ? 'bg-white text-sky-700 shadow-xs' : 'text-slate-600'
              }`}
            >
              <Palette className="w-3.5 h-3.5" />
              <span>المظهر والملابس</span>
            </button>
            <button
              type="button"
              onClick={() => setTab('actions')}
              className={`min-h-[40px] flex items-center justify-center gap-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                tab === 'actions' ? 'bg-white text-sky-700 shadow-xs' : 'text-slate-600'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>الحركات ({ROBOT_ACTIONS_LIST.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setTab('ai')}
              className={`min-h-[40px] flex items-center justify-center gap-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                tab === 'ai' ? 'bg-white text-sky-700 shadow-xs' : 'text-slate-600'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>الذكاء والصوت</span>
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="p-5 space-y-5 overflow-y-auto clean-scroll flex-1">
          {tab === 'appearance' && (
            <>
              {/* Themes */}
              <div>
                <p className="text-xs font-bold text-slate-700 mb-2.5">لون الهيكل</p>
                <div className="grid grid-cols-5 gap-2">
                  {ROBOT_THEMES_LIST.map((t) => {
                    const active = prefs.theme === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setTheme(t.id)}
                        className={`min-h-[60px] p-2 rounded-2xl border flex flex-col items-center justify-center gap-1.5 transition-all ${
                          active
                            ? 'border-sky-600 bg-sky-50/70'
                            : 'border-slate-200 hover:border-slate-300 bg-white'
                        }`}
                      >
                        <span
                          className="w-7 h-7 rounded-full border border-slate-300/80 shadow-xs flex items-center justify-center"
                          style={{ background: t.swatchGradient }}
                        >
                          {active && (
                            <Check
                              className={`w-3.5 h-3.5 ${
                                t.id === 'white' || t.id === 'gold'
                                  ? 'text-slate-900'
                                  : 'text-white'
                              }`}
                            />
                          )}
                        </span>
                        <span className="text-[11px] font-semibold text-slate-700 truncate max-w-full">
                          {t.label.ar.split(' ')[0]}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Quick Presets */}
              <div>
                <p className="text-xs font-bold text-slate-700 mb-2">أطقم جاهزة</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {ROBOT_OUTFIT_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => applyPreset(preset.items)}
                      className="min-h-[44px] px-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-sky-50 hover:border-sky-300 text-xs font-bold text-slate-700 transition-colors whitespace-nowrap"
                    >
                      {preset.label.ar}
                    </button>
                  ))}
                </div>
              </div>

              {/* 8 Outfit Items */}
              <div>
                <p className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1.5">
                  <Shirt className="w-3.5 h-3.5 text-slate-500" />
                  <span>قطع الملابس والإكسسوارات</span>
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {ROBOT_OUTFITS_LIST.map((item) => {
                    const active = prefs.outfit.includes(item.id);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => toggleOutfit(item.id)}
                        className={`min-h-[44px] px-3 rounded-xl border text-xs font-semibold flex items-center justify-between transition-colors ${
                          active
                            ? 'border-sky-600 bg-sky-50 text-sky-800'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <span className="truncate">{item.label.ar}</span>
                        {active && <Check className="w-3.5 h-3.5 text-sky-600 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Motion Level */}
              <div>
                <p className="text-xs font-bold text-slate-700 mb-2">مستوى الحركة</p>
                <div className="grid grid-cols-3 gap-2 p-1 bg-slate-100 rounded-xl">
                  {(
                    [
                      { id: 'calm', label: 'هادئ' },
                      { id: 'normal', label: 'نشط' },
                      { id: 'off', label: 'إيقاف' },
                    ] as const
                  ).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMotion(m.id)}
                      className={`min-h-[40px] rounded-lg text-xs font-bold transition-colors ${
                        prefs.motion === m.id
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {tab === 'actions' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-500">
                اضغط على أي حركة لمشاهدتها مباشرة على الروبوت:
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {ROBOT_ACTIONS_LIST.map((act) => (
                  <button
                    key={act.id}
                    type="button"
                    onClick={() => testAction(act.id)}
                    className={`min-h-[54px] p-2.5 rounded-xl border text-right transition-colors ${
                      activeAction === act.id
                        ? 'border-sky-600 bg-sky-50'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <p className="text-xs font-bold text-slate-900">{act.label.ar}</p>
                    <p className="text-[11px] text-slate-500 truncate mt-0.5">{act.phrase.ar}</p>
                  </button>
                ))}
              </div>

              <div className="pt-3 border-t border-slate-100 space-y-2.5">
                <p className="text-xs font-bold text-slate-700">السلوكيات التلقائية</p>
                {(
                  [
                    { key: 'greetOnLogin', label: 'ترحيب تلقائي عند فتح العيادة' },
                    { key: 'clapOnSuccess', label: 'تصفيق عند إتمام المهام الطبية' },
                    { key: 'waitingAlerts', label: 'تنبيه عند تأخر المرضى في الانتظار' },
                    { key: 'courierAnimation', label: 'حمل ظرف الرسائل الفورية للاستقبال' },
                  ] as const
                ).map((b) => (
                  <label
                    key={b.key}
                    className="flex items-center justify-between min-h-[44px] px-3 rounded-xl border border-slate-200 cursor-pointer"
                  >
                    <span className="text-xs font-semibold text-slate-800">{b.label}</span>
                    <input
                      type="checkbox"
                      checked={prefs.behaviors[b.key]}
                      onChange={(e) =>
                        onUpdatePrefs({
                          ...prefs,
                          hasCustomOverride: true,
                          behaviors: {
                            ...prefs.behaviors,
                            [b.key]: e.target.checked,
                          },
                        })
                      }
                      className="w-4 h-4 accent-sky-600"
                    />
                  </label>
                ))}
              </div>
            </div>
          )}

          {tab === 'ai' && (
            <div className="space-y-4">
              {/* Server readiness summary (non-secret status only) */}
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-900">حالة محرك الذكاء (Server)</p>
                  <p className="text-[11px] text-slate-500 mt-0.5 standard-digits">
                    {aiStatus
                      ? aiStatus.ready
                        ? `جاهز · ${aiStatus.availableKeysCount} مفتاح متاح (Pool: ${aiStatus.poolSize})`
                        : 'غير مهيأ في متغيرات البيئة (Vercel / Secrets)'
                      : 'جاري فحص الجاهزية...'}
                  </p>
                </div>
                <span
                  className={`text-xs font-bold ${
                    aiStatus?.ready ? 'text-emerald-700' : 'text-amber-700'
                  }`}
                >
                  {aiStatus?.ready ? 'متصل' : 'بانتظار المفتاح'}
                </span>
              </div>

              {/* Model selection */}
              <div>
                <p className="text-xs font-bold text-slate-700 mb-2">نموذج الذكاء</p>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      {
                        id: 'gemini-3.1-flash-lite',
                        title: 'Flash Lite',
                        desc: 'سريع واقتصادي للمحادثات الفورية',
                      },
                      {
                        id: 'gemini-4-hydrogen',
                        title: 'Gemini 4 Hydrogen',
                        desc: 'توازن عالٍ للتحليل الطبي والإداري',
                      },
                    ] as Array<{ id: AiModelChoice; title: string; desc: string }>
                  ).map((m) => {
                    const active = aiConfig.model === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => onUpdateAiConfig({ ...aiConfig, model: m.id })}
                        className={`p-3 rounded-2xl border text-right transition-colors ${
                          active
                            ? 'border-sky-600 bg-sky-50/70'
                            : 'border-slate-200 bg-white hover:bg-slate-50'
                        }`}
                      >
                        <p className="text-xs font-bold text-slate-900">{m.title}</p>
                        <p className="text-[11px] text-slate-500 mt-1">{m.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Key Operation Mode */}
              <div>
                <p className="text-xs font-bold text-slate-700 mb-2">وضع توزيع الطلبات</p>
                <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 rounded-xl">
                  {(
                    [
                      { id: 'auto', label: 'تلقائي' },
                      { id: 'environment', label: 'مفتاح البيئة' },
                      { id: 'secrets_pool', label: 'مجمع المفاتيح' },
                    ] as Array<{ id: AiOperationMode; label: string }>
                  ).map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => onUpdateAiConfig({ ...aiConfig, operationMode: mode.id })}
                      className={`min-h-[40px] rounded-lg text-xs font-bold transition-colors ${
                        aiConfig.operationMode === mode.id
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600'
                      }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Voice Reply Options */}
              <div className="pt-2 border-t border-slate-100 space-y-2.5">
                <p className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Volume2 className="w-3.5 h-3.5 text-slate-500" />
                  <span>النطق الصوتي للروبوت</span>
                </p>
                <label className="flex items-center justify-between min-h-[44px] px-3 rounded-xl border border-slate-200 cursor-pointer">
                  <span className="text-xs font-semibold text-slate-800">
                    نطق ردود الروبوت صوتياً تلقائياً
                  </span>
                  <input
                    type="checkbox"
                    checked={aiConfig.voiceReply}
                    onChange={(e) =>
                      onUpdateAiConfig({ ...aiConfig, voiceReply: e.target.checked })
                    }
                    className="w-4 h-4 accent-sky-600"
                  />
                </label>

                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { id: 'Kore', label: 'صوت دافئ واضح (Kore)' },
                      { id: 'Puck', label: 'صوت حيوي (Puck)' },
                    ] as const
                  ).map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => onUpdateAiConfig({ ...aiConfig, voiceName: v.id })}
                      className={`min-h-[42px] px-3 rounded-xl border text-xs font-semibold ${
                        aiConfig.voiceName === v.id
                          ? 'border-sky-600 bg-sky-50 text-sky-800'
                          : 'border-slate-200 bg-white text-slate-700'
                      }`}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Clinical Permissions */}
              <div className="pt-2 border-t border-slate-100 space-y-2">
                <p className="text-xs font-bold text-slate-700">صلاحيات السياق الطبي</p>
                {(
                  [
                    { key: 'allowDrugDb', label: 'الاستعلام من قاعدة الأدوية (adwia)' },
                    { key: 'allowPatientContext', label: 'مشاركة سياق المريض النشط والحساسية' },
                    { key: 'allowOrgAdvice', label: 'اقتراحات إدارة العيادة وقائمة الانتظار' },
                    { key: 'autoFallbackOnQuota', label: 'التبديل التلقائي عند امتلاء الحصة' },
                  ] as const
                ).map((perm) => (
                  <label
                    key={perm.key}
                    className="flex items-center justify-between min-h-[44px] px-3 rounded-xl border border-slate-200 cursor-pointer"
                  >
                    <span className="text-xs font-semibold text-slate-800">{perm.label}</span>
                    <input
                      type="checkbox"
                      checked={aiConfig[perm.key]}
                      onChange={(e) =>
                        onUpdateAiConfig({
                          ...aiConfig,
                          [perm.key]: e.target.checked,
                        })
                      }
                      className="w-4 h-4 accent-sky-600"
                    />
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
