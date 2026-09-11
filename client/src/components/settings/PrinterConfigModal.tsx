import React, { useState } from 'react';
import { Printer, Check, Play, X, FileText } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { useToast } from '../../context/ToastContext';

interface PrinterConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PrinterConfigModal: React.FC<PrinterConfigModalProps> = ({ isOpen, onClose }) => {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const { showToast } = useToast();

  const [printerType, setPrinterType] = useState<'THERMAL' | 'A4'>(() => {
    return (localStorage.getItem('erp_printer_type') as any) || 'THERMAL';
  });

  const [autoPrint, setAutoPrint] = useState<boolean>(() => {
    return localStorage.getItem('erp_auto_print') === 'true';
  });

  if (!isOpen) return null;

  const handleSave = () => {
    localStorage.setItem('erp_printer_type', printerType);
    localStorage.setItem('erp_auto_print', String(autoPrint));
    showToast(isAr ? 'تم حفظ إعدادات الطابعة بنجاح' : 'Printer configuration saved', 'success');
    onClose();
  };

  const handleTestPrint = () => {
    showToast(isAr ? 'جاري إرسال صفحة اختبار الطباعة...' : 'Sending test print page...', 'info');
    const printWindow = window.open('', '_blank', 'width=400,height=600');
    if (printWindow) {
      printWindow.document.write(`
        <html>
        <head>
          <title>Test Print - Modular Mobile ERP</title>
          <style>
            body { font-family: monospace; padding: 20px; text-align: center; }
            hr { border: 1px dashed #000; }
          </style>
        </head>
        <body>
          <h2>*** اختبار الطابعة ***</h2>
          <p>MODULAR MOBILE ERP</p>
          <p>تاريخ: ${new Date().toLocaleString('ar-EG')}</p>
          <hr/>
          <p>نوع الطابعة: ${printerType === 'THERMAL' ? 'طابعة حرارية 80 مم (ESC/POS)' : 'طابعة ليزر A4'}</p>
          <p>رأس الطباعة: سليم 100%</p>
          <hr/>
          <p>تم الاختبار بنجاح!</p>
          <script>window.print(); window.close();</script>
        </body>
        </html>
      `);
      printWindow.document.close();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl p-6 text-slate-100 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-indigo-500/20 text-indigo-400 rounded-xl border border-indigo-500/30">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">{isAr ? 'إعدادات الطابعات والطباعة' : 'Printer Configuration'}</h3>
              <p className="text-xs text-slate-400">{isAr ? 'تحديد نوع الطباعة التلقائية واختبار الطابعات' : 'Configure ESC/POS thermal & A4'}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4 text-xs">
          <div>
            <label className="block text-slate-300 font-semibold mb-2">
              {isAr ? 'نوع الطابعة الافتراضية:' : 'Default Printer Type:'}
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setPrinterType('THERMAL')}
                className={`p-3.5 rounded-xl border flex flex-col items-center gap-2 transition cursor-pointer ${
                  printerType === 'THERMAL'
                    ? 'bg-indigo-950/60 border-indigo-500 text-white'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <Printer className="w-6 h-6 text-indigo-400" />
                <span className="font-semibold">{isAr ? 'حرارية (80 مم)' : 'Thermal (80mm)'}</span>
                <span className="text-[10px] text-slate-400 text-center">{isAr ? 'فواتير نقطة البيع السريعة' : 'POS Receipts'}</span>
              </button>

              <button
                type="button"
                onClick={() => setPrinterType('A4')}
                className={`p-3.5 rounded-xl border flex flex-col items-center gap-2 transition cursor-pointer ${
                  printerType === 'A4'
                    ? 'bg-indigo-950/60 border-indigo-500 text-white'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <FileText className="w-6 h-6 text-emerald-400" />
                <span className="font-semibold">{isAr ? 'ورق قياسي (A4)' : 'Standard (A4)'}</span>
                <span className="text-[10px] text-slate-400 text-center">{isAr ? 'فواتير ضريبية وشهادات ضمان' : 'Tax & Warranty'}</span>
              </button>
            </div>
          </div>

          <label className="flex items-center gap-3 p-3 bg-slate-950/60 border border-slate-800 rounded-xl cursor-pointer">
            <input
              type="checkbox"
              checked={autoPrint}
              onChange={e => setAutoPrint(e.target.checked)}
              className="w-4 h-4 rounded text-indigo-600 bg-slate-900 border-slate-700"
            />
            <div>
              <span className="font-semibold text-white block">{isAr ? 'طباعة تلقائية فور إتمام البيع' : 'Auto-print on sale completion'}</span>
              <span className="text-slate-400 text-[11px]">{isAr ? 'فتح نافذة الطباعة مباشرة دون الحاجة للضغط على زر الطباعة' : 'Triggers print immediately'}</span>
            </div>
          </label>

          <button
            type="button"
            onClick={handleTestPrint}
            className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-xl flex items-center justify-center gap-2 border border-slate-700 transition cursor-pointer"
          >
            <Play className="w-4 h-4 text-emerald-400" />
            {isAr ? 'إجراء اختبار طباعة تجريبي (Test Print)' : 'Execute Test Print'}
          </button>
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs text-slate-400 hover:text-white"
          >
            {isAr ? 'إلغاء' : 'Cancel'}
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-5 py-2 text-xs bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl shadow-lg shadow-indigo-600/30 transition cursor-pointer"
          >
            {isAr ? 'حفظ الإعدادات' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
};
