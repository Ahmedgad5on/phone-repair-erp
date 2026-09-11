import React from 'react';
import { useToast, ToastType } from '../../context/ToastContext';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';

const icons: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />,
  warning: <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />,
  error: <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />,
  info: <Info className="w-5 h-5 text-sky-400 shrink-0" />
};

const bgColors: Record<ToastType, string> = {
  success: 'bg-emerald-950/90 border-emerald-500/30 text-emerald-100',
  warning: 'bg-amber-950/90 border-amber-500/30 text-amber-100',
  error: 'bg-rose-950/90 border-rose-500/30 text-rose-100',
  info: 'bg-sky-950/90 border-sky-500/30 text-sky-100'
};

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-5 left-5 z-50 flex flex-col gap-2 max-w-sm pointer-events-none">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border backdrop-blur-md shadow-2xl transition-all duration-300 animate-in fade-in slide-in-from-top-2 ${bgColors[t.type]}`}
        >
          {icons[t.type]}
          <span className="text-sm font-medium flex-1">{t.message}</span>
          <button
            onClick={() => removeToast(t.id)}
            className="text-slate-400 hover:text-white p-1 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
};
