import React from 'react';
import { Bell, BellOff, BellRing, Send, Trash2, X } from 'lucide-react';
import type {
  AppNotificationItem,
  NotificationPermissionState,
} from '../lib/notifications';

interface NotificationsSheetProps {
  open: boolean;
  onClose: () => void;
  permission: NotificationPermissionState;
  notifications: AppNotificationItem[];
  onRequestPermission: () => void;
  onTestNotification: () => void;
  onClearLog: () => void;
}

export const NotificationsSheet: React.FC<NotificationsSheetProps> = ({
  open,
  onClose,
  permission,
  notifications,
  onRequestPermission,
  onTestNotification,
  onClearLog,
}) => {
  if (!open) return null;

  const statusText =
    permission === 'granted'
      ? 'الإشعارات مفعّلة وتعمل في الخلفية'
      : permission === 'denied'
        ? 'تم حظر الإشعارات من إعدادات المتصفح'
        : permission === 'unsupported'
          ? 'المتصفح الحالي لا يدعم إشعارات النظام'
          : 'بانتظار موافقتك على إذن الإشعارات';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/40 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-t-3xl sm:rounded-3xl bg-white shadow-2xl border border-slate-200/80 max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pt-3 pb-1 flex justify-center sm:hidden">
          <div className="w-10 h-1.5 rounded-full bg-slate-300" />
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-900">مركز الإشعارات والتنبيهات</h2>
            <p className="text-xs text-slate-500 mt-0.5">{statusText}</p>
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

        <div className="p-5 space-y-4 overflow-y-auto clean-scroll flex-1">
          {/* Permission & Test Action Card */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  permission === 'granted'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : permission === 'denied'
                      ? 'bg-red-50 text-red-700 border border-red-200'
                      : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                }`}
              >
                {permission === 'granted' ? (
                  <BellRing className="w-5 h-5" />
                ) : permission === 'denied' ? (
                  <BellOff className="w-5 h-5" />
                ) : (
                  <Bell className="w-5 h-5" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900">
                  {permission === 'granted'
                    ? 'إذن الإشعارات مفعّل'
                    : permission === 'denied'
                      ? 'الإشعارات محظورة'
                      : 'تفعيل إشعارات العيادة'}
                </p>
                <p className="text-xs text-slate-500">
                  تنبيهات فورية لوصول المرضى، طول الانتظار، ورسائل الاستقبال.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {permission !== 'granted' && permission !== 'unsupported' && (
                <button
                  type="button"
                  onClick={onRequestPermission}
                  className="flex-1 min-h-[44px] px-4 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-colors whitespace-nowrap"
                >
                  طلب إذن الإشعارات الآن
                </button>
              )}

              <button
                type="button"
                onClick={onTestNotification}
                disabled={permission !== 'granted'}
                className="flex-1 min-h-[44px] px-4 rounded-xl border border-slate-200 bg-white text-slate-800 text-xs font-bold hover:bg-slate-100 disabled:opacity-45 flex items-center justify-center gap-1.5 whitespace-nowrap"
              >
                <Send className="w-3.5 h-3.5" />
                <span>إطلاق إشعار تجريبي</span>
              </button>
            </div>

            {permission === 'denied' && (
              <p className="text-[11px] text-red-700">
                لفك الحظر: افتح إعدادات الموقع في المتصفح (أيقونة القفل بجانب الرابط) وغيّر الإشعارات إلى «سماح».
              </p>
            )}
          </div>

          {/* Notification Log */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-slate-700 standard-digits">
                سجل التنبيهات ({notifications.length})
              </p>
              {notifications.length > 0 && (
                <button
                  type="button"
                  onClick={onClearLog}
                  className="min-h-[34px] px-2 flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-red-600 rounded-lg"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>مسح</span>
                </button>
              )}
            </div>

            {notifications.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-2xl">
                لا توجد إشعارات مسجلة بعد. ستظهر هنا عند وصول مريض أو رسالة جديدة.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden">
                {notifications.map((n) => (
                  <div key={n.id} className="p-3.5 bg-white">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-bold text-slate-900">{n.title}</p>
                      <span className="text-[10px] text-slate-400 standard-digits shrink-0">
                        {n.timestamp}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">{n.body}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
