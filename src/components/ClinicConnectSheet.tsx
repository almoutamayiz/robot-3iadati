import React, { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import {
  Building2,
  Check,
  KeyRound,
  LogIn,
  LogOut,
  Mail,
  Stethoscope,
  X,
} from 'lucide-react';
import {
  getClinicDisplayName,
  resolveClinicForAuthUser,
  signInPlatformAccount,
  signOutPlatformAccount,
} from '../lib/supabase';
import type { ClinicRecord, ClinicRole } from '../types/robot';

interface ClinicConnectSheetProps {
  open: boolean;
  onClose: () => void;
  authUser: User | null;
  activeAccountEmail: string | null;
  activeAccountName: string | null;
  isAuthenticatedSession: boolean;
  currentClinic: ClinicRecord | null;
  currentRole: ClinicRole;
  onPlatformLoginSuccess: (params: {
    clinic: ClinicRecord;
    role: ClinicRole;
    authUser: User | null;
    accountEmail: string;
    accountName: string;
    userIdForPrefs: string;
  }) => void;
  onSelectClinic: (clinic: ClinicRecord, role: ClinicRole) => void;
  onSignedOut: () => void;
}

export const ClinicConnectSheet: React.FC<ClinicConnectSheetProps> = ({
  open,
  onClose,
  authUser,
  activeAccountEmail,
  activeAccountName,
  isAuthenticatedSession,
  currentClinic,
  onPlatformLoginSuccess,
  onSelectClinic,
  onSignedOut,
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [ownedClinics, setOwnedClinics] = useState<ClinicRecord[]>([]);

  useEffect(() => {
    if (!open) return;
    setAuthError(null);
    if (isAuthenticatedSession && authUser) {
      resolveClinicForAuthUser(authUser).then((resolved) => {
        setOwnedClinics(resolved.clinics);
      });
    } else if (isAuthenticatedSession && currentClinic) {
      setOwnedClinics([currentClinic]);
    } else {
      setOwnedClinics([]);
    }
  }, [open, isAuthenticatedSession, authUser, currentClinic]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setAuthLoading(true);
    setAuthError(null);

    const res = await signInPlatformAccount(email, password);
    setAuthLoading(false);

    if (!res.success) {
      setAuthError(res.error || 'تعذر تسجيل الدخول.');
      return;
    }

    setPassword('');
    if (res.clinic) {
      onPlatformLoginSuccess({
        clinic: res.clinic,
        role: 'doctor',
        authUser: res.authUser,
        accountEmail: res.accountEmail,
        accountName: res.accountName,
        userIdForPrefs: res.userIdForPrefs,
      });
      onClose();
    } else {
      setAuthError('تم التحقق من حساب الطبيب، ولكن لا توجد عيادة مرتبطة بهذا الحساب حالياً.');
    }
  };

  const handleSignOut = async () => {
    setAuthLoading(true);
    await signOutPlatformAccount();
    setAuthLoading(false);
    setOwnedClinics([]);
    onSignedOut();
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/45 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-3xl sm:rounded-3xl bg-white shadow-2xl border border-slate-200/80 max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pt-3 pb-2 flex justify-center sm:hidden">
          <div className="w-10 h-1.5 rounded-full bg-slate-300" />
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-sky-50 border border-sky-200/80 text-sky-700 flex items-center justify-center shrink-0">
              <Stethoscope className="w-4 h-4" />
            </span>
            <div>
              <h2 className="text-base font-bold text-slate-900">تسجيل دخول الطبيب</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                حساب الطبيب الخاص في منصة عيادتي
              </p>
            </div>
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

        <div className="p-5 space-y-4 overflow-y-auto clean-scroll">
          {isAuthenticatedSession && activeAccountEmail ? (
            <>
              <div className="p-4 rounded-2xl bg-sky-50/70 border border-sky-200/80 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-sky-800">
                    حساب الطبيب النشط
                    {activeAccountName ? ` · د. ${activeAccountName}` : ''}
                  </p>
                  <p className="text-sm font-bold text-slate-900 truncate mt-0.5" dir="ltr">
                    {activeAccountEmail}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleSignOut}
                  disabled={authLoading}
                  className="min-h-[40px] px-3 rounded-xl bg-white border border-slate-200 text-xs font-bold text-red-600 hover:bg-red-50 flex items-center gap-1.5 shrink-0"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>خروج</span>
                </button>
              </div>

              {ownedClinics.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-600 mb-2">عيادتك المرتبطة بالحساب</p>
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden">
                    {ownedClinics.map((c) => {
                      const isActive = currentClinic?.id === c.id;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            onSelectClinic(c, 'doctor');
                            onClose();
                          }}
                          className={`w-full min-h-[56px] px-4 py-3 flex items-center justify-between text-right transition-colors ${
                            isActive ? 'bg-sky-50/70' : 'bg-white hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700 shrink-0">
                              <Building2 className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-slate-900 truncate">
                                {getClinicDisplayName(c)}
                              </p>
                              <p className="text-xs text-slate-500 truncate">
                                {[c.specialty, c.city || c.wilaya].filter(Boolean).join(' · ') ||
                                  'عيادة طبية'}
                              </p>
                            </div>
                          </div>
                          {isActive && <Check className="w-4 h-4 text-sky-600 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          ) : (
            <form
              onSubmit={handleLogin}
              className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3.5"
            >
              <div>
                <p className="text-sm font-bold text-slate-900">دخول الطبيب عبر البريد الإلكتروني</p>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  أدخل بريد Gmail / البريد الإلكتروني وكلمة المرور الخاصة بحسابك الطبي في منصة عيادتي.
                </p>
              </div>

              {authError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-700">
                  {authError}
                </div>
              )}

              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example@gmail.com"
                  dir="ltr"
                  className="w-full min-h-[46px] pr-10 pl-3.5 rounded-xl bg-white border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-sky-500 text-right"
                />
              </div>

              <div className="relative">
                <KeyRound className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="كلمة المرور"
                  dir="ltr"
                  className="w-full min-h-[46px] pr-10 pl-3.5 rounded-xl bg-white border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-sky-500 text-right"
                />
              </div>

              <button
                type="submit"
                disabled={authLoading || !email.trim() || !password}
                className="w-full min-h-[46px] rounded-xl bg-sky-600 text-white text-sm font-bold hover:bg-sky-700 disabled:opacity-40 flex items-center justify-center gap-2 transition-colors"
              >
                <LogIn className="w-4 h-4" />
                <span>{authLoading ? 'جاري التحقق من الحساب...' : 'تسجيل الدخول'}</span>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
