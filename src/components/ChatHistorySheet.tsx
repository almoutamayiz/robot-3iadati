import React from 'react';
import { ArrowUpLeft, Trash2, Volume2, X } from 'lucide-react';
import type { ChatMessage } from '../types/robot';

interface ChatTranscriptContentProps {
  messages: ChatMessage[];
  onReplayVoice: (text: string) => void;
  onTriggerAction: (actionType: string, actionTarget?: string | null) => void;
  onClear: () => void;
}

export const ChatTranscriptContent: React.FC<ChatTranscriptContentProps> = ({
  messages,
  onReplayVoice,
  onTriggerAction,
  onClear,
}) => {
  if (messages.length === 0) {
    return (
      <div className="py-12 text-center px-4">
        <p className="text-sm font-semibold text-slate-700">سجل المحادثة فارغ</p>
        <p className="text-xs text-slate-500 mt-1">
          تحدث مع الروبوت بالصوت أو الكتابة ليظهر الحوار هنا.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onClear}
          className="min-h-[36px] px-2.5 flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>مسح السجل</span>
        </button>
      </div>

      {messages.map((m) => {
        const isUser = m.role === 'user';
        return (
          <div
            key={m.id}
            className={`flex flex-col ${isUser ? 'items-start' : 'items-end'}`}
          >
            <div
              className={`max-w-[88%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                isUser
                  ? 'bg-sky-600 text-white rounded-tr-sm'
                  : m.isAlert
                    ? 'bg-red-50 border border-red-200 text-slate-900 rounded-tl-sm'
                    : 'bg-slate-100 text-slate-900 rounded-tl-sm'
              }`}
            >
              <p className="whitespace-pre-wrap">{m.text}</p>

              {!isUser && m.drugsMentioned && m.drugsMentioned.length > 0 && (
                <div className="mt-2 pt-2 border-t border-slate-200/80 space-y-1">
                  {m.drugsMentioned.slice(0, 3).map((d, idx) => (
                    <p key={idx} className="text-[11px] text-slate-600" dir="ltr">
                      {d.name} · {[d.dci, d.dosage, d.pharmaceutical_form].filter(Boolean).join(' ')}
                    </p>
                  ))}
                </div>
              )}

              {!isUser && (
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => onReplayVoice(m.text)}
                    className="min-h-[32px] px-2 rounded-lg bg-white/80 hover:bg-white text-slate-600 text-[11px] font-semibold flex items-center gap-1 border border-slate-200/70"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>استماع</span>
                  </button>

                  {m.actionType && m.actionType !== 'none' && m.actionLabel && (
                    <button
                      type="button"
                      onClick={() => onTriggerAction(m.actionType!, m.actionTarget)}
                      className="min-h-[32px] px-2.5 rounded-lg bg-sky-600 text-white text-[11px] font-bold flex items-center gap-1 hover:bg-sky-700"
                    >
                      <span>{m.actionLabel}</span>
                      <ArrowUpLeft className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {m.suggestedActions?.map((act, idx) => (
                    <button
                      key={`${act.type}_${idx}`}
                      type="button"
                      onClick={() => onTriggerAction(act.type, act.target)}
                      className="min-h-[32px] px-2.5 rounded-lg bg-white text-sky-700 border border-sky-200 text-[11px] font-bold flex items-center gap-1 hover:bg-sky-50"
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
    </div>
  );
};

interface ChatHistorySheetProps {
  open: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  onReplayVoice: (text: string) => void;
  onTriggerAction: (actionType: string, actionTarget?: string | null) => void;
  onClear: () => void;
}

export const ChatHistorySheet: React.FC<ChatHistorySheetProps> = ({
  open,
  onClose,
  messages,
  onReplayVoice,
  onTriggerAction,
  onClear,
}) => {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 backdrop-blur-xs lg:hidden"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-t-3xl bg-white shadow-2xl border border-slate-200/80 max-h-[82vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pt-3 pb-1 flex justify-center">
          <div className="w-10 h-1.5 rounded-full bg-slate-300" />
        </div>
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-900">سجل المحادثة</h2>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
            aria-label="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 overflow-y-auto clean-scroll flex-1">
          <ChatTranscriptContent
            messages={messages}
            onReplayVoice={onReplayVoice}
            onTriggerAction={(t, target) => {
              onTriggerAction(t, target);
              onClose();
            }}
            onClear={onClear}
          />
        </div>
      </div>
    </div>
  );
};
