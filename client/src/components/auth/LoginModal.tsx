import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../i18n/LanguageContext';
import { useToast } from '../../context/ToastContext';
import { Shield, KeyRound, User, Lock } from 'lucide-react';

interface LoginModalProps {
  isOpen: boolean;
  onClose?: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onClose }) => {
  const { login } = useAuth();
  const { language } = useLanguage();
  const { showToast } = useToast();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const isAr = language === 'ar';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      showToast(isAr ? 'يرجى إدخال اسم المستخدم وكلمة المرور' : 'Please enter username and password', 'warning');
      return;
    }
    setIsSubmitting(true);
    try {
      await login(username, password);
      showToast(isAr ? 'تم تسجيل الدخول بنجاح' : 'Signed in successfully', 'success');
      if (onClose) onClose();
    } catch (err: any) {
      showToast(err.message || (isAr ? 'فشل تسجيل الدخول' : 'Sign in failed'), 'error');
    } finally {
      setIsSubmitting(false);
    }
  };


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-md bg-slate-900 border border-slate-700/60 rounded-2xl shadow-2xl p-6 text-slate-100 relative">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-indigo-500/20 text-indigo-400 rounded-xl border border-indigo-500/30">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight">
              {isAr ? 'تسجيل دخول النظام' : 'ERP System Login'}
            </h2>
            <p className="text-xs text-slate-400">
              {isAr ? 'أدخل بيانات الحساب المشفرة بالـ JWT' : 'Secure JWT authentication'}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              {isAr ? 'اسم المستخدم' : 'Username'}
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
                className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-10 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                placeholder={isAr ? 'اسم المستخدم' : 'username'}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              {isAr ? 'كلمة المرور' : 'Password'}
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-10 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full mt-2 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 text-white font-medium rounded-xl shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            <KeyRound className="w-4 h-4" />
            {isSubmitting
              ? (isAr ? 'جاري التحقق...' : 'Signing in...')
              : (isAr ? 'دخول آمن' : 'Sign In')}
          </button>
        </form>
      </div>
    </div>
  );
};

