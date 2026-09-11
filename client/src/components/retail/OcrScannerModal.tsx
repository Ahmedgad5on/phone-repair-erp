import React, { useState } from 'react';
import { ScanText, X, CheckCircle2, Sparkles, FileText } from 'lucide-react';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';

interface OcrScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanResult: (data: { nationalId?: string; imei?: string; phone?: string; birthDate?: string; governorate?: string }) => void;
}

/**
 * OCR ID & Warranty Scanner Component (Dev Proposal 14)
 */
export const OcrScannerModal: React.FC<OcrScannerModalProps> = ({ isOpen, onClose, onScanResult }) => {
  const { showToast } = useToast();
  const [inputText, setInputText] = useState('بطاقة رقم قومي: 29805140102941 - هاتف 01099887766 - إيصال سريال 359821102938472');
  const [loading, setLoading] = useState(false);

  const handleRunOcr = async () => {
    setLoading(true);
    try {
      const res = await api.parseOcrDocument?.(inputText);
      if (res) {
        onScanResult({
          nationalId: res.extractedNationalId,
          imei: res.extractedImei,
          phone: res.extractedPhone,
          birthDate: res.birthDate,
          governorate: res.governorate
        });
        showToast('تم استخراج وقراءة بيانات الهوية والسيريال بنجاح', 'success');
        onClose();
      }
    } catch (err: any) {
      showToast(err.message || 'فشل المسح الضوئي', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700/80 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="bg-slate-950 p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-xl border border-indigo-500/30">
              <ScanText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">الماسح الضوئي للرقم القومي والضمان (OCR Scanner)</h2>
              <p className="text-[11px] text-slate-400">National ID & Warranty Card Parser</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white bg-slate-800 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-3.5 text-xs text-slate-300">
          <p className="leading-relaxed text-slate-400">
            ألصق نص الهوية الممسوح ضوئياً عبر الكاميرا أو القارئ الضوئي لاستخراج الرقم القومي والمحافظة ورقم الهاتف والسيريال تلقائياً:
          </p>

          <textarea
            rows={4}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white text-xs font-mono outline-none focus:border-indigo-500"
          />

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl hover:bg-slate-700"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={handleRunOcr}
              disabled={loading}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-900/40 flex items-center gap-1.5"
            >
              <Sparkles className="w-4 h-4" />
              {loading ? 'جارِ التحليل...' : 'استخراج وتعبئة الحقول'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
