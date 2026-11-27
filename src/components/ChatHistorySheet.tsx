import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpLeft,
  Bot,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  MessageSquare,
  Trash2,
  X,
} from 'lucide-react';
import { formatAlgiersTime } from '../lib/supabase';
import type { ChatMessage, ChatMode, ClinicMessageRecord } from '../types/robot';

interface ChatTranscriptContentProps {
  chatMode: ChatMode;
  onChangeChatMode: (mode: ChatMode) => void;
  messages: ChatMessage[];
  clinicMessages: ClinicMessageRecord[];
  unreadNurseCount?: number;
  nurseSendError?: string | null;
  onTriggerAction: (actionType: string, actionTarget?: string | null) => void;
  onClearAi: () => void;
}

export const ChatTranscriptContent: React.FC<ChatTranscriptContentProps> = ({
  chatMode,
  onChangeChatMode,
  messages,
  clinicMessages,
  unreadNurseCount = 0,
  nurseSendError,
  onTriggerAction,
  onClearAi,
}) => {
  const [expandedDetailsIds, setExpandedDetailsIds] = useState<Record<string, boolean>>({});
  const bottomEndRef = useRef<HTMLDivElement | null>(null);

  const orderedClinicMessages = [...clinicMessages].sort((a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    return ta - tb;
  });

  useEffect(() => {
    bottomEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMode, messages.length, orderedClinicMessages.length]);

  const toggleDetails = (id: string) => {
    setExpandedDetailsIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Two-Tab Conversation Switcher */}
      <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-emerald-50/80 border border-emerald-100 mb-3 shrink-0">
        <button
          type="button"
          onClick={() => onChangeChatMode('nurse')}
          className={`min-h-[38px] px-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
            chatMode === 'nurse'
              ? 'bg-white text-emerald-800 shadow-xs border border-emerald-200/80'
              : 'text-slate-600 hover:text-emerald-800'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5 shrink-0" />
          <span>الممرض</span>
          {unreadNurseCount > 0 && (
            <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-600 text-white text-[10px] font-bold flex items-center justify-center standard-digits">
              {unreadNurseCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => onChangeChatMode('ai')}
          className={`min-h-[38px] px-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
            chatMode === 'ai'
              ? 'bg-white text-emerald-800 shadow-xs border border-emerald-200/80'
              : 'text-slate-600 hover:text-emerald-800'
          }`}
        >
          <Bot className="w-3.5 h-3.5 shrink-0" />
          <span>الروبوت الذكي</span>
        </button>
      </div>

      {/* Tab 1: Direct Doctor <-> Nurse Conversation */}
      {chatMode === 'nurse' && (
        <div className="flex-1 min-h-0 overflow-y-auto clean-scroll space-y-2.5 pl-0.5">
          {nurseSendError && (
            <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="leading-relaxed">{nurseSendError}</p>
            </div>
          )}

          {orderedClinicMessages.length === 0 ? (
            <div className="py-12 text-center px-4">
              <p className="text-sm font-semibold text-slate-700">تواصل مباشر مع الممرض</p>
              <p className="text-xs text-slate-500 mt-1">
                أي رسالة تكتبها هنا تصل مباشرة إلى واجهة الممرض في الاستقبال.
              </p>
            </div>
          ) : (
            orderedClinicMessages.map((m, idx) => {
              const isDoctorMsg = m.sender_role === 'doctor';
              return (
                <div
                  key={String(m.id ?? idx)}
                  className={`flex flex-col ${isDoctorMsg ? 'items-start' : 'items-end'}`}
                >
                  <div
                    className={`max-w-[88%] px-3.5 py-2.5 rounded-2xl border ${
                      isDoctorMsg
                        ? 'bg-emerald-600 text-white border-emerald-600 rounded-tr-sm'
                        : 'bg-white text-slate-900 border-emerald-100 rounded-tl-sm shadow-2xs'
                    }`}
                  >
                    <div
                      className={`flex items-center justify-between gap-3 text-[10.5px] mb-1 ${
                        isDoctorMsg ? 'text-emerald-100' : 'text-emerald-700'
                      }`}
                    >
                      <span className="font-bold">
                        {m.sender_name || (isDoctorMsg ? 'الطبيب' : 'الممرض')}
                      </span>
                      <span className="standard-digits opacity-85">
                        {formatAlgiersTime(m.created_at)}
                      </span>
                    </div>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.message}</p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomEndRef} />
        </div>
      )}

      {/* Tab 2: Medical Specialist AI Conversation */}
      {chatMode === 'ai' && (
        <div className="flex-1 min-h-0 overflow-y-auto clean-scroll space-y-3 pl-0.5">
          {messages.length === 0 ? (
            <div className="py-12 text-center px-4">
              <p className="text-sm font-semibold text-slate-700">الذكاء الاصطناعي الطبي</p>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                اسأل عن الطب، الجينات، الأدوية، المواد الفعالة والتفاعلات الدوائية مع مصادر طبية موثوقة.
              </p>
            </div>
          ) : (
            <>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={onClearAi}
                  className="min-h-[32px] px-2.5 flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>مسح</span>
                </button>
              </div>

              {messages.map((m) => {
                const isUser = m.role === 'user';
                const hasDetails = Boolean(
                  !isUser && (m.details || (m.sources && m.sources.length > 0))
                );
                const isExpanded = Boolean(expandedDetailsIds[m.id]);

                return (
                  <div
                    key={m.id}
                    className={`flex flex-col ${isUser ? 'items-start' : 'items-end'}`}
                  >
                    <div
                      className={`max-w-[92%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                        isUser
                          ? 'bg-emerald-600 text-white rounded-tr-sm'
                          : m.isAlert
                            ? 'bg-red-50 border border-red-200 text-slate-900 rounded-tl-sm'
                            : 'bg-slate-50 border border-emerald-100/90 text-slate-900 rounded-tl-sm'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{m.text}</p>

                      {/* Collapsible Medical Details & Sources Dropdown */}
                      {hasDetails && (
                        <div className="mt-2.5 pt-2 border-t border-emerald-100/80">
                          <button
                            type="button"
                            onClick={() => toggleDetails(m.id)}
                            className="w-full min-h-[32px] px-2.5 py-1 rounded-xl bg-white border border-emerald-200/80 text-emerald-800 text-xs font-bold flex items-center justify-between gap-2 hover:bg-emerald-50/70 transition-colors"
                          >
                            <span>
                              عرض التفاصيل والمصادر
                              {m.sources && m.sources.length > 0
                                ? ` (${m.sources.length})`
                                : ''}
                            </span>
                            {isExpanded ? (
                              <ChevronUp className="w-3.5 h-3.5 shrink-0" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                            )}
                          </button>

                          {isExpanded && (
                            <div className="mt-2 p-3 rounded-xl bg-white border border-emerald-100 space-y-2.5 text-xs text-slate-700">
                              {m.details && (
                                <div className="whitespace-pre-wrap leading-relaxed text-slate-800">
                                  {m.details}
                                </div>
                              )}

                              {m.sources && m.sources.length > 0 && (
                                <div className="pt-2 border-t border-slate-100 space-y-1.5">
                                  <p className="text-[11px] font-bold text-emerald-800">
                                    المصادر والمواقع الطبية الموثوقة:
                                  </p>
                                  <div className="space-y-1">
                                    {m.sources.map((src, sIdx) => (
                                      <a
                                        key={`${m.id}_src_${sIdx}`}
                                        href={src.uri}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-emerald-50/50 border border-emerald-100 hover:bg-emerald-50 text-emerald-900 transition-colors"
                                      >
                                        <span className="truncate font-semibold">{src.title}</span>
                                        <span className="flex items-center gap-1 text-[10px] text-emerald-700 shrink-0">
                                          <span>{src.domain || 'مرجع'}</span>
                                          <ExternalLink className="w-3 h-3" />
                                        </span>
                                      </a>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Optional Clinic Navigation Shortcuts */}
                      {!isUser &&
                        (m.actionType || (m.suggestedActions && m.suggestedActions.length > 0)) && (
                          <div className="mt-2 flex items-center gap-2 flex-wrap">
                            {m.actionType && m.actionType !== 'none' && m.actionLabel && (
                              <button
                                type="button"
                                onClick={() => onTriggerAction(m.actionType!, m.actionTarget)}
                                className="min-h-[32px] px-2.5 rounded-lg bg-emerald-600 text-white text-[11px] font-bold flex items-center gap-1 hover:bg-emerald-700"
                              >
                                <span>{m.actionLabel}</span>
                                <ArrowUpLeft className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {m.suggestedActions
                              ?.filter((act) => act.type !== m.actionType)
                              .map((act, idx) => (
                                <button
                                  key={`${act.type}_${idx}`}
                                  type="button"
                                  onClick={() => onTriggerAction(act.type, act.target)}
                                  className="min-h-[32px] px-2.5 rounded-lg bg-white text-emerald-700 border border-emerald-200 text-[11px] font-bold flex items-center gap-1 hover:bg-emerald-50"
                                >
                                  <span>{act.label}</span>
                                  <ArrowUpLeft className="w-3.5 h-3.5" />
                                </button>
                              ))}
                          </div>
                        )}
                    </div>
                    <span className="text-[10px] text-slate-400 mt-1 px-1 standard-digits">
                      {m.timestamp}
                    </span>
                  </div>
                );
              })}
              <div ref={bottomEndRef} />
            </>
          )}
        </div>
      )}
    </div>
  );
};

interface ChatHistorySheetProps {
  open: boolean;
  onClose: () => void;
  chatMode: ChatMode;
  onChangeChatMode: (mode: ChatMode) => void;
  messages: ChatMessage[];
  clinicMessages: ClinicMessageRecord[];
  unreadNurseCount?: number;
  nurseSendError?: string | null;
  onTriggerAction: (actionType: string, actionTarget?: string | null) => void;
  onClearAi: () => void;
}

export const ChatHistorySheet: React.FC<ChatHistorySheetProps> = ({
  open,
  onClose,
  chatMode,
  onChangeChatMode,
  messages,
  clinicMessages,
  unreadNurseCount,
  nurseSendError,
  onTriggerAction,
  onClearAi,
}) => {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 backdrop-blur-xs lg:hidden"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-t-3xl bg-white shadow-2xl border border-emerald-100 max-h-[82vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pt-3 pb-1 flex justify-center">
          <div className="w-10 h-1.5 rounded-full bg-slate-300" />
        </div>
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-900">المحادثة</h2>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
            aria-label="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 flex-1 min-h-0 flex flex-col overflow-hidden">
          <ChatTranscriptContent
            chatMode={chatMode}
            onChangeChatMode={onChangeChatMode}
            messages={messages}
            clinicMessages={clinicMessages}
            unreadNurseCount={unreadNurseCount}
            nurseSendError={nurseSendError}
            onTriggerAction={(t, target) => {
              onTriggerAction(t, target);
              onClose();
            }}
            onClearAi={onClearAi}
          />
        </div>
      </div>
    </div>
  );
};
