import React from 'react';
import { Keyboard, X } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({ isOpen, onClose }) => {
  const { language } = useLanguage();
  const isAr = language === 'ar';

  if (!isOpen) return null;

  const shortcuts = [
    { key: 'F1', desc: isAr ? 'التركيز الفوري على ماسح الباركود ونقطة البيع' : 'Focus POS barcode scanner' },
    { key: 'F2', desc: isAr ? 'إتمام البيع والدفع الفوري وطباعة الفاتورة' : 'Complete payment & print receipt' },
    { key: 'F3', desc: isAr ? 'تحويل الفاتورة كمسودة لطابور الكاشير' : 'Send draft to cashier queue' },
    { key: 'F4', desc: isAr ? 'فتح معالج استلام جهاز صيانة جديد وقائمة الفحص' : 'Open new repair intake wizard' },
    { key: 'Ctrl + K', desc: isAr ? 'فتح شريط البحث الشامل السريع في كل النظام' : 'Open universal global search' },
    { key: 'Esc', desc: isAr ? 'إلغاء النافذة المنبثقة أو تفريغ سلة المشتريات' : 'Close modal or clear active cart' }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl p-6 text-slate-100 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-xl border border-indigo-500/30">
              <Keyboard className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">{isAr ? 'اختصارات لوحة المفاتيح المعتمدة' : 'Keyboard Shortcuts'}</h3>
              <p className="text-xs text-slate-400">{isAr ? 'سرعة قصوى في نقطة البيع ومعمل الصيانة' : 'High productivity shortcuts'}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2 text-xs">
          {shortcuts.map((s, idx) => (
            <div key={idx} className="flex items-center justify-between p-2.5 bg-slate-950/60 rounded-xl border border-slate-800/80">
              <span className="text-slate-300 font-medium">{s.desc}</span>
              <kbd className="px-2.5 py-1 bg-slate-800 border border-slate-700 rounded-lg text-indigo-300 font-mono font-bold text-xs shadow-inner">
                {s.key}
              </kbd>
            </div>
          ))}
        </div>

        <div className="pt-2 text-center text-slate-500 text-[11px]">
          {isAr ? 'تعمل الاختصارات فورياً من أي شاشة داخل النظام' : 'Shortcuts are globally active across views'}
        </div>
      </div>
    </div>
  );
};
