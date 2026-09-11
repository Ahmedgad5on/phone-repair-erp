import React, { useState, useEffect } from 'react';
import { Cpu, X, CheckCircle2, AlertOctagon, Check, Search, Sliders } from 'lucide-react';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';

interface DiodeReadingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  deviceModel: string;
}

/**
 * Diode Mode Readings Database & Pin Comparator (Dev Proposal 2)
 * Compares multimeter diode mode voltage readings against ground
 */
export const DiodeReadingsModal: React.FC<DiodeReadingsModalProps> = ({ isOpen, onClose, deviceModel }) => {
  const { showToast } = useToast();
  const [readings, setReadings] = useState<any[]>([]);
  const [selectedConnector, setSelectedConnector] = useState('USB_C');
  const [measuredValues, setMeasuredValues] = useState<Record<number, string>>({});
  const [comparisonResults, setComparisonResults] = useState<any | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadDiodeDb();
    }
  }, [isOpen, selectedConnector]);

  const loadDiodeDb = async () => {
    try {
      const data = await api.getDiodeReadings?.('iPhone 15 Pro', selectedConnector) || [];
      setReadings(data);

      // Pre-fill measured values with normal reference values by default for ease of technician testing
      const initialMeasured: Record<number, string> = {};
      data.forEach((r: any) => {
        initialMeasured[r.pin_number] = r.expected_value.toString();
      });
      setMeasuredValues(initialMeasured);
    } catch (e) {
      console.error(e);
    }
  };

  const handleCompare = async () => {
    const pinsPayload = readings.map(r => ({
      pin_number: r.pin_number,
      measured_value: parseFloat(measuredValues[r.pin_number] || '0')
    }));

    try {
      const res = await api.compareDiodeReadings?.('iPhone 15 Pro', selectedConnector, pinsPayload);
      setComparisonResults(res);
      if (res.isHealthy) {
        showToast('كافة قياسات الممانعة سليمة ومطابقة للمرجع المصنعي', 'success');
      } else {
        showToast('تم اكتشاف خطوط ممانعة غير سليمة (شورت أو خط مقطوع)', 'warning');
      }
    } catch (err: any) {
      showToast(err.message || 'فشل فحص المقارنة', 'error');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700/80 rounded-3xl w-full max-w-4xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-slate-950 p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-500/20 text-blue-400 rounded-2xl border border-blue-500/30">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">قاعدة بيانات الممانعات والمقارنة بالملتيميتر (Diode Mode Readings DB)</h2>
              <p className="text-xs text-slate-400">iPhone 15 Pro - Multimeter Red Probe to Ground Reference</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white bg-slate-800 rounded-xl">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 overflow-y-auto">
          {/* Connector selector */}
          <div className="flex gap-2">
            <button
              onClick={() => setSelectedConnector('USB_C')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                selectedConnector === 'USB_C'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              منفذ الشحن USB Type-C Connector
            </button>
            <button
              onClick={() => setSelectedConnector('DISPLAY_FPC')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                selectedConnector === 'DISPLAY_FPC'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              كونكتور الشاشة Display FPC
            </button>
          </div>

          {/* Table of Pins */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-900/90 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="p-3">رقم البن (Pin)</th>
                  <th className="p-3">اسم الخط (Net Name)</th>
                  <th className="p-3">نوع الخط</th>
                  <th className="p-3">الممانعة المرجعية (V)</th>
                  <th className="p-3">القراءة المقاسة بالملتيميتر (V)</th>
                  <th className="p-3">حالة القياس</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {readings.map((r) => {
                  const comparison = comparisonResults?.comparisons?.find((c: any) => c.pin_number === r.pin_number);
                  const status = comparison?.status || 'NOT_CHECKED';
                  return (
                    <tr key={r.id} className="hover:bg-slate-900/40 transition-colors">
                      <td className="p-3 font-bold text-white">{r.pin_number}</td>
                      <td className="p-3 text-indigo-300">{r.pin_name}</td>
                      <td className="p-3 text-slate-400 font-sans">{r.line_type}</td>
                      <td className="p-3 font-bold text-slate-200">{r.expected_value.toFixed(3)} V</td>
                      <td className="p-3">
                        <input
                          type="number"
                          step="0.001"
                          value={measuredValues[r.pin_number] ?? ''}
                          onChange={(e) => setMeasuredValues({ ...measuredValues, [r.pin_number]: e.target.value })}
                          className="w-24 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-white text-xs font-mono focus:border-blue-500 outline-none"
                        />
                      </td>
                      <td className="p-3">
                        {status === 'PASS' && (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-sans font-bold flex items-center gap-1 w-fit">
                            <Check className="w-3 h-3" /> سليم PASS
                          </span>
                        )}
                        {status === 'SHORT_TO_GND' && (
                          <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 font-sans font-bold flex items-center gap-1 w-fit">
                            <AlertOctagon className="w-3 h-3" /> شورت SHORT
                          </span>
                        )}
                        {status === 'OPEN_LINE' && (
                          <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-sans font-bold w-fit">
                            خط مقطوع O.L
                          </span>
                        )}
                        {status === 'NOT_CHECKED' && (
                          <span className="text-slate-500 font-sans">بانتظار الفحص</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl"
            >
              إغلاق
            </button>
            <button
              onClick={handleCompare}
              className="px-5 py-2 text-xs bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-lg shadow-blue-900/40"
            >
              مقارنة وفحص الممانعات بالذكاء الاصطناعي
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
