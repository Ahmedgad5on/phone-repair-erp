import React, { useState } from 'react';
import { ClipboardCheck, X, Check, AlertTriangle, Minus, Save, ShieldCheck } from 'lucide-react';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';

interface RapidInspectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  ticketId: string;
  deviceModel: string;
}

const INSPECTION_24_POINTS = [
  { id: 'p1', name: 'شاشة اللمس والاستجابة (Touchscreen)', cat: 'DISPLAY' },
  { id: 'p2', name: 'لوحة العرض ونقاء الألوان (OLED Panel)', cat: 'DISPLAY' },
  { id: 'p3', name: 'خاصية نغمات ترو تون (TrueTone)', cat: 'DISPLAY' },
  { id: 'p4', name: 'مستشعر الوجه والبصمة (Face ID / Touch ID)', cat: 'BIOMETRICS' },
  { id: 'p5', name: 'الكاميرا الخلفية الرئيسية 1x (Main Camera)', cat: 'CAMERAS' },
  { id: 'p6', name: 'عدسة التقريب والزاوية الواسعة 3x/0.5x', cat: 'CAMERAS' },
  { id: 'p7', name: 'الكاميرا الأمامية السيلفي (Front Camera)', cat: 'CAMERAS' },
  { id: 'p8', name: 'فلاش الكاميرا والإضاءة (Flashlight)', cat: 'CAMERAS' },
  { id: 'p9', name: 'سماعة المكالمات العلوية (Earpiece)', cat: 'AUDIO' },
  { id: 'p10', name: 'مكبر الصوت السفلي الاستريو (Loudspeaker)', cat: 'AUDIO' },
  { id: 'p11', name: 'الميكروفون الأساسي السفلي (Bottom Mic)', cat: 'AUDIO' },
  { id: 'p12', name: 'ميكروفون عزل الضوضاء والفيديو (Top Mic)', cat: 'AUDIO' },
  { id: 'p13', name: 'مستشعر التقارب والإطفاء (Proximity)', cat: 'SENSORS' },
  { id: 'p14', name: 'حساس الإضاءة المحيطة (Ambient Light)', cat: 'SENSORS' },
  { id: 'p15', name: 'البوصلة وحساس الدوران (Gyro & Compass)', cat: 'SENSORS' },
  { id: 'p16', name: 'أزرار رفع وخفض الصوت (Volume Buttons)', cat: 'BUTTONS' },
  { id: 'p17', name: 'زر التشغيل والقفل الجانبي (Power Button)', cat: 'BUTTONS' },
  { id: 'p18', name: 'مفتاح الصامت والمحرك الهزاز (Haptic Engine)', cat: 'BUTTONS' },
  { id: 'p19', name: 'منفذ الشحن السلكي والبيانات (Charging Port)', cat: 'POWER' },
  { id: 'p20', name: 'الشحن اللاسلكي السريع (Wireless Charging)', cat: 'POWER' },
  { id: 'p21', name: 'صحة البطارية ودورات الشحن (Battery Health)', cat: 'POWER' },
  { id: 'p22', name: 'شبكات الواي فاي (Wi-Fi 6GHz Connectivity)', cat: 'CONNECTIVITY' },
  { id: 'p23', name: 'البلوتوث وإقران الملحقات (Bluetooth 5.3)', cat: 'CONNECTIVITY' },
  { id: 'p24', name: 'الشبكة الخلوية وقارئ الشريحة (Cellular 5G)', cat: 'CONNECTIVITY' }
];

/**
 * Rapid 24-Point Digital Inspection Checklist (Dev Proposal 6)
 */
export const RapidInspectionModal: React.FC<RapidInspectionModalProps> = ({
  isOpen,
  onClose,
  ticketId,
  deviceModel
}) => {
  const { showToast } = useToast();
  const [stage, setStage] = useState<'PRE_REPAIR' | 'POST_REPAIR'>('PRE_REPAIR');
  const [checklist, setChecklist] = useState<Record<string, 'PASS' | 'FAIL' | 'ADVISORY' | 'NA'>>(() => {
    const initial: Record<string, 'PASS' | 'FAIL' | 'ADVISORY' | 'NA'> = {};
    INSPECTION_24_POINTS.forEach(p => (initial[p.id] = 'PASS'));
    return initial;
  });

  const setAllStatus = (status: 'PASS' | 'FAIL' | 'ADVISORY' | 'NA') => {
    const updated: Record<string, 'PASS' | 'FAIL' | 'ADVISORY' | 'NA'> = {};
    INSPECTION_24_POINTS.forEach(p => (updated[p.id] = status));
    setChecklist(updated);
  };

  const handleSave = async () => {
    try {
      await api.recordRapidInspection?.({
        ticket_id: ticketId,
        stage,
        checklist
      });
      showToast('تم حفظ نتائج الفحص الشامل الـ 24 نقطة بنجاح', 'success');
      onClose();
    } catch (err: any) {
      showToast(err.message || 'فشل حفظ الفحص', 'error');
    }
  };

  if (!isOpen) return null;

  const passCount = Object.values(checklist).filter(v => v === 'PASS').length;
  const failCount = Object.values(checklist).filter(v => v === 'FAIL').length;
  const advCount = Object.values(checklist).filter(v => v === 'ADVISORY').length;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700/80 rounded-3xl w-full max-w-4xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-slate-950 p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-2xl border border-emerald-500/30">
              <ClipboardCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">الفحص الرقمي الشامل 24 نقطة (Rapid 24-Point Digital Inspection)</h2>
              <p className="text-xs text-slate-400">{deviceModel} - معايير الفحص المعتمدة قبل وبعد الإصلاح</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white bg-slate-800 rounded-xl">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 overflow-y-auto">
          {/* Controls & Quick Select */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-950 p-4 rounded-2xl border border-slate-800">
            <div className="flex gap-2">
              <button
                onClick={() => setStage('PRE_REPAIR')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  stage === 'PRE_REPAIR' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'
                }`}
              >
                فحص الاستلام الأولي (Pre-Repair)
              </button>
              <button
                onClick={() => setStage('POST_REPAIR')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  stage === 'POST_REPAIR' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'
                }`}
              >
                فحص الجودة النهائي قبل التسليم (Post-Repair)
              </button>
            </div>

            <div className="flex items-center gap-3 text-xs font-bold">
              <span className="text-emerald-400">{passCount} سليم</span>
              <span className="text-rose-400">{failCount} عاطل</span>
              <span className="text-amber-400">{advCount} تنبيه</span>
              <button
                onClick={() => setAllStatus('PASS')}
                className="text-[11px] text-slate-400 hover:text-white underline mr-2"
              >
                تعيين الكل سليم
              </button>
            </div>
          </div>

          {/* 24-Point Check Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {INSPECTION_24_POINTS.map(p => {
              const status = checklist[p.id];
              return (
                <div key={p.id} className="flex items-center justify-between p-3 bg-slate-950/70 border border-slate-800/80 rounded-xl text-xs">
                  <div>
                    <div className="font-semibold text-white">{p.name}</div>
                    <div className="text-[10px] text-slate-500">{p.cat}</div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setChecklist({ ...checklist, [p.id]: 'PASS' })}
                      className={`px-2 py-1 rounded-lg font-bold text-[10px] ${
                        status === 'PASS' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                      }`}
                    >
                      سليم PASS
                    </button>
                    <button
                      type="button"
                      onClick={() => setChecklist({ ...checklist, [p.id]: 'FAIL' })}
                      className={`px-2 py-1 rounded-lg font-bold text-[10px] ${
                        status === 'FAIL' ? 'bg-rose-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                      }`}
                    >
                      تالف FAIL
                    </button>
                    <button
                      type="button"
                      onClick={() => setChecklist({ ...checklist, [p.id]: 'ADVISORY' })}
                      className={`px-2 py-1 rounded-lg font-bold text-[10px] ${
                        status === 'ADVISORY' ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                      }`}
                    >
                      تنبيه ADV
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl"
            >
              إلغاء
            </button>
            <button
              onClick={handleSave}
              className="px-5 py-2 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-900/40 flex items-center gap-1.5"
            >
              <Save className="w-4 h-4" />
              حفظ واعتماد التقرير الفني
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
