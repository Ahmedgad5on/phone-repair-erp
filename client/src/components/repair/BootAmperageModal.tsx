import React, { useState, useEffect } from 'react';
import { Activity, X, Zap, CheckCircle2, AlertTriangle, Play, RefreshCw } from 'lucide-react';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';

interface BootAmperageModalProps {
  isOpen: boolean;
  onClose: () => void;
  ticketId: string;
  deviceModel: string;
}

/**
 * Boot Amperage Curve Logger & Diagnostic Visualizer (Dev Proposal 1)
 * Visualizes live DC power supply current draw curve with pattern matching
 */
export const BootAmperageModal: React.FC<BootAmperageModalProps> = ({
  isOpen,
  onClose,
  ticketId,
  deviceModel
}) => {
  const { showToast } = useToast();
  const [samples, setSamples] = useState<Array<{ sample_ms: number; current_ma: number; voltage_v: number }>>([]);
  const [analysis, setAnalysis] = useState<any>(null);
  const [isSimulating, setIsSimulating] = useState(false);

  const loadData = async () => {
    try {
      const res = await api.getBootAmperageLogs?.(ticketId);
      if (res && res.logs && res.logs.length > 0) {
        setSamples(res.logs);
        setAnalysis(res.analysis);
      } else {
        // Preset normal curve if empty
        generateSampleCurve('NORMAL');
      }
    } catch (e) {
      generateSampleCurve('NORMAL');
    }
  };

  const generateSampleCurve = (type: 'NORMAL' | 'SHORT' | 'LOOP' | 'NAND') => {
    const generated: Array<{ sample_ms: number; current_ma: number; voltage_v: number }> = [];
    let current = 0;

    for (let ms = 0; ms <= 2000; ms += 100) {
      if (type === 'SHORT') {
        current = ms < 100 ? 0 : 2400 + Math.random() * 200;
      } else if (type === 'LOOP') {
        current = (Math.sin(ms / 150) * 300 + 450);
      } else if (type === 'NAND') {
        current = ms < 300 ? ms * 0.7 : 210 + (Math.random() * 15);
      } else {
        // Normal Boot Sequence
        if (ms < 200) current = 80;
        else if (ms < 600) current = 350 + Math.random() * 50;
        else if (ms < 1200) current = 920 + Math.random() * 80;
        else current = 480 + Math.random() * 30;
      }
      generated.push({ sample_ms: ms, current_ma: Math.round(current), voltage_v: 4.2 });
    }
    setSamples(generated);
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, ticketId]);

  const handleSaveCurve = async () => {
    try {
      const res = await api.logBootAmperage?.({
        ticket_id: ticketId,
        samples
      });
      setAnalysis(res?.analysis);
      showToast('تم حفظ وتحليل منحنى سحب التيار بنجاح', 'success');
    } catch (err: any) {
      showToast(err.message || 'فشل حفظ المنحنى', 'error');
    }
  };

  if (!isOpen) return null;

  const maxCurrent = Math.max(...samples.map(s => s.current_ma), 1000);

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700/80 rounded-3xl w-full max-w-4xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-slate-950 p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/20 text-amber-400 rounded-2xl border border-amber-500/30">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">راسم منحنى سحب تيار الإقلاع (Boot Amperage Curve Logger)</h2>
              <p className="text-xs text-slate-400">{deviceModel} - DC Bench Power Supply USB Telemetry</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white bg-slate-800 rounded-xl">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto">
          {/* Diagnostic Curve Simulator Selector */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-950 p-3.5 rounded-2xl border border-slate-800">
            <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-indigo-400" />
              نماذج منحنيات الأعطال القياسية للمقارنة:
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => generateSampleCurve('NORMAL')}
                className="px-3 py-1.5 bg-emerald-950 text-emerald-300 border border-emerald-800 text-xs rounded-xl hover:bg-emerald-900"
              >
                إقلاع طبيعي (Normal)
              </button>
              <button
                onClick={() => generateSampleCurve('SHORT')}
                className="px-3 py-1.5 bg-rose-950 text-rose-300 border border-rose-800 text-xs rounded-xl hover:bg-rose-900"
              >
                شورت صريح (Short to GND)
              </button>
              <button
                onClick={() => generateSampleCurve('LOOP')}
                className="px-3 py-1.5 bg-amber-950 text-amber-300 border border-amber-800 text-xs rounded-xl hover:bg-amber-900"
              >
                ريستارت متكرر (PMIC Loop)
              </button>
              <button
                onClick={() => generateSampleCurve('NAND')}
                className="px-3 py-1.5 bg-blue-950 text-blue-300 border border-blue-800 text-xs rounded-xl hover:bg-blue-900"
              >
                تجمد معالج/ذاكرة (NAND Freeze)
              </button>
            </div>
          </div>

          {/* SVG Canvas Plotting the Curve */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4">
            <div className="flex justify-between text-xs text-slate-400 mb-2 font-mono">
              <span>Voltage: 4.20V DC</span>
              <span>Peak Current: {maxCurrent} mA</span>
              <span>Duration: 2000 ms</span>
            </div>

            <div className="h-56 w-full relative">
              <svg className="w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 2000 300">
                {/* Grid horizontal lines */}
                <line x1="0" y1="75" x2="2000" y2="75" stroke="#1e293b" strokeDasharray="4" />
                <line x1="0" y1="150" x2="2000" y2="150" stroke="#1e293b" strokeDasharray="4" />
                <line x1="0" y1="225" x2="2000" y2="225" stroke="#1e293b" strokeDasharray="4" />

                {/* Plot line */}
                {samples.length > 1 && (
                  <polyline
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth="3"
                    strokeLinecap="round"
                    points={samples.map(s => {
                      const x = s.sample_ms;
                      const y = 300 - Math.min(290, (s.current_ma / Math.max(maxCurrent, 1000)) * 280);
                      return `${x},${y}`;
                    }).join(' ')}
                  />
                )}
              </svg>
            </div>
          </div>

          {/* AI / Heuristic Analysis Feedback */}
          {analysis && (
            <div className={`p-4 rounded-2xl border text-xs leading-relaxed ${
              analysis.pattern === 'NORMAL_BOOT_SEQUENCE'
                ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-200'
                : 'bg-rose-950/40 border-rose-800/60 text-rose-200'
            }`}>
              <div className="font-bold text-sm mb-1 flex items-center gap-2">
                {analysis.pattern === 'NORMAL_BOOT_SEQUENCE' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-400" />
                )}
                نمط العطل المكتشف: {analysis.pattern} (دقة {Math.round(analysis.confidence * 100)}%)
              </div>
              <p className="mb-2">{analysis.diagnosis}</p>
              {analysis.recommendedAction && (
                <div className="font-semibold text-white bg-black/40 p-2.5 rounded-xl border border-white/10">
                  الإجراء الفني الموصى به: {analysis.recommendedAction}
                </div>
              )}
            </div>
          )}

          {/* Action Footer */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl"
            >
              إغلاق
            </button>
            <button
              onClick={handleSaveCurve}
              className="px-5 py-2 text-xs bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-900/40"
            >
              حفظ المنحنى في تذكرة الصيانة
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
