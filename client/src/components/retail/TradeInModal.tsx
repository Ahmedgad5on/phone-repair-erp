import React, { useState, useEffect } from 'react';
import { Smartphone, RefreshCw, CheckCircle2, AlertTriangle, ArrowDownRight, X, ShieldCheck } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { useToast } from '../../context/ToastContext';

interface TradeInModalProps {
  isOpen: boolean;
  currentTotal: number;
  customerId?: string;
  onClose: () => void;
  onApplyCredit: (data: {
    trade_in_id?: string;
    device_model: string;
    imei: string;
    condition_grade: string;
    assessed_value: number;
  }) => void;
}

export const TradeInModal: React.FC<TradeInModalProps> = ({
  isOpen,
  currentTotal,
  customerId,
  onClose,
  onApplyCredit
}) => {
  const { language } = useLanguage();
  const { showToast } = useToast();
  const isAr = language === 'ar';

  const [deviceModel, setDeviceModel] = useState('iPhone 13 128GB');
  const [imei, setImei] = useState('358912345678901');
  const [conditionGrade, setConditionGrade] = useState<'GRADE_A' | 'GRADE_B' | 'GRADE_C' | 'GRADE_D'>('GRADE_B');
  const [batteryHealth, setBatteryHealth] = useState<number>(86);
  const [screenCondition, setScreenCondition] = useState<'INTACT' | 'SCRATCHED' | 'CRACKED'>('INTACT');
  const [defects, setDefects] = useState<string[]>([]);
  const [basePriceInput, setBasePriceInput] = useState<number>(18000);

  const [assessedValue, setAssessedValue] = useState<number>(0);
  const [deductions, setDeductions] = useState<Array<{ reason: string; amount: number }>>([]);
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Evaluate price live or via API
  const handleEvaluate = async () => {
    setIsEvaluating(true);
    try {
      const res = await fetch('/api/retail/trade-in/assess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_model: deviceModel,
          imei,
          condition_grade: conditionGrade,
          battery_health: batteryHealth,
          screen_condition: screenCondition,
          functional_defects: defects,
          base_market_price: basePriceInput
        })
      });

      if (!res.ok) {
        throw new Error('Failed to evaluate trade-in value');
      }

      const data = await res.json();
      setAssessedValue(data.assessed_value);
      setDeductions(data.deductions || []);
    } catch (err: any) {
      // Fallback local estimation
      let mult = conditionGrade === 'GRADE_A' ? 0.95 : conditionGrade === 'GRADE_B' ? 0.82 : conditionGrade === 'GRADE_C' ? 0.68 : 0.45;
      let val = Math.round(basePriceInput * mult);
      if (batteryHealth < 80) val -= Math.round(val * 0.1);
      if (screenCondition === 'CRACKED') val -= Math.round(val * 0.25);
      val -= defects.length * 500;
      val = Math.max(500, val);
      setAssessedValue(val);
    } finally {
      setIsEvaluating(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      handleEvaluate();
    }
  }, [isOpen, deviceModel, conditionGrade, batteryHealth, screenCondition, defects, basePriceInput]);

  if (!isOpen) return null;

  const toggleDefect = (defectName: string) => {
    if (defects.includes(defectName)) {
      setDefects(defects.filter(d => d !== defectName));
    } else {
      setDefects([...defects, defectName]);
    }
  };

  const handleApply = async () => {
    if (!deviceModel || !imei) {
      showToast(isAr ? 'يرجى إدخال موديل الجهاز والرقم التسلسلي/IMEI' : 'Model and IMEI are required', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      // Save assessment in DB
      const res = await fetch('/api/retail/trade-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: customerId || 'cust-walkin',
          device_model: deviceModel,
          imei: imei.trim(),
          condition_grade: conditionGrade,
          assessed_value: assessedValue,
          applied_credit: assessedValue,
          status: 'APPLIED'
        })
      });

      const saved = await res.json();

      onApplyCredit({
        trade_in_id: saved.id,
        device_model: deviceModel,
        imei: imei.trim(),
        condition_grade: conditionGrade,
        assessed_value: assessedValue
      });

      showToast(
        isAr ? `تم خصم رصيد استبدال ${assessedValue.toLocaleString()} ج.م من الفاتورة!` : `Trade-in credit of ${assessedValue} EGP applied!`,
        'success'
      );
      onClose();
    } catch (err: any) {
      showToast(err.message || 'Error saving trade-in assessment', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 select-text">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 px-6 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-500/10 text-amber-400 rounded-lg border border-amber-500/20">
              <RefreshCw className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                {isAr ? 'تقييم واستبدال الأجهزة المستعملة (Trade-In Valuation)' : 'Trade-In Device Valuation'}
              </h2>
              <p className="text-xs text-slate-400">
                {isAr ? 'فحص حالة الجهاز واحتساب قيمة الشراء وخصمها من الفاتورة الحالية' : 'Appraise device and apply instant credit to invoice'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto text-xs">
          {/* Valuation Summary Card */}
          <div className="p-4 bg-gradient-to-r from-amber-950/40 via-slate-900 to-emerald-950/40 border border-slate-800 rounded-xl flex items-center justify-between">
            <div>
              <span className="text-slate-400 block mb-0.5">{isAr ? 'القيمة المقدرة للاستبدال' : 'Assessed Trade-In Credit'}</span>
              <div className="text-2xl font-bold font-mono text-emerald-400 flex items-baseline gap-1">
                <span>{assessedValue.toLocaleString()}</span>
                <span className="text-xs font-normal text-slate-400">ج.م (EGP)</span>
              </div>
            </div>

            <div className="text-right text-xs">
              <span className="text-slate-400 block mb-0.5">{isAr ? 'الفاتورة بعد الخصم' : 'Invoice after Credit'}</span>
              <span className="font-mono font-bold text-indigo-300 text-base">
                {Math.max(0, currentTotal - assessedValue).toLocaleString()} ج.م
              </span>
            </div>
          </div>

          {/* Device Model & IMEI */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-300 font-medium mb-1.5">{isAr ? 'موديل الجهاز وسعته' : 'Device Model & Storage'}</label>
              <input
                type="text"
                value={deviceModel}
                onChange={e => setDeviceModel(e.target.value)}
                placeholder="مثال: iPhone 13 128GB"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white text-xs focus:border-amber-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-slate-300 font-medium mb-1.5">{isAr ? 'الرقم التسلسلي / IMEI (15 رقم)' : 'IMEI (15 digits)'}</label>
              <input
                type="text"
                maxLength={15}
                value={imei}
                onChange={e => setImei(e.target.value)}
                placeholder="35xxxxxxxxxxxxx"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono text-xs focus:border-amber-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Condition Grading */}
          <div className="space-y-2">
            <label className="block text-slate-300 font-medium">{isAr ? 'درجة حالة الجهاز العامة (Condition Grade)' : 'Overall Condition Grade'}</label>
            <div className="grid grid-cols-4 gap-2">
              {[
                { id: 'GRADE_A', label: 'فرز أول (A+)', desc: 'ممتاز - بدون خدوش' },
                { id: 'GRADE_B', label: 'فرز ثاني (B)', desc: 'جيد جداً - خدوش طفيفة' },
                { id: 'GRADE_C', label: 'فرز ثالث (C)', desc: 'مقبول - آثار استخدام' },
                { id: 'GRADE_D', label: 'فرز رابع (D)', desc: 'معيب / كسر خارجي' }
              ].map(g => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setConditionGrade(g.id as any)}
                  className={`p-2.5 rounded-xl border text-center transition cursor-pointer ${
                    conditionGrade === g.id
                      ? 'bg-amber-600/20 border-amber-500 text-amber-200'
                      : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <span className="block font-bold text-xs">{g.label}</span>
                  <span className="block text-[10px] opacity-75 mt-0.5">{g.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Battery Health & Screen Condition */}
          <div className="grid grid-cols-2 gap-4 p-4 bg-slate-950/40 border border-slate-800 rounded-xl">
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-slate-300 font-medium">{isAr ? 'صحة البطارية (Battery Health)' : 'Battery Health'}</label>
                <span className="font-mono font-bold text-amber-400">{batteryHealth}%</span>
              </div>
              <input
                type="range"
                min="50"
                max="100"
                value={batteryHealth}
                onChange={e => setBatteryHealth(parseInt(e.target.value, 10))}
                className="w-full accent-amber-500 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                <span>50%</span>
                <span>80% (موصى بالاستبدال)</span>
                <span>100%</span>
              </div>
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1.5">{isAr ? 'حالة الشاشة والزجاج' : 'Screen Condition'}</label>
              <select
                value={screenCondition}
                onChange={e => setScreenCondition(e.target.value as any)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-xs focus:border-amber-500 focus:outline-none"
              >
                <option value="INTACT">{isAr ? 'سليمة تماماً وبدون خدوش' : 'Intact / Like New'}</option>
                <option value="SCRATCHED">{isAr ? 'مخدوشة سطحياً' : 'Minor Scratches'}</option>
                <option value="CRACKED">{isAr ? 'مكسورة أو بها بقع حبر/شروخ (-25%)' : 'Cracked Screen (-25%)'}</option>
              </select>
            </div>
          </div>

          {/* Functional Defects */}
          <div className="space-y-2">
            <label className="block text-slate-300 font-medium">{isAr ? 'العيوب الوظيفية المكتشفة' : 'Functional Defects'}</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                'FaceID / TouchID تالف',
                'الكاميرا الخلفية بها عطل',
                'منفذ الشحن متذبذب',
                'الميكروفون أو السماعة ضعيفة',
                'واي فاي / بلوتوث غير مستقر',
                'الجهاز تم فتحه من قبل'
              ].map(defect => (
                <button
                  key={defect}
                  type="button"
                  onClick={() => toggleDefect(defect)}
                  className={`px-3 py-2 rounded-lg border text-start transition cursor-pointer text-xs flex items-center justify-between ${
                    defects.includes(defect)
                      ? 'bg-rose-950/40 border-rose-600/70 text-rose-300'
                      : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <span>{defect}</span>
                  {defects.includes(defect) && <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />}
                </button>
              ))}
            </div>
          </div>

          {/* Deductions Breakdown */}
          {deductions.length > 0 && (
            <div className="p-3 bg-rose-950/20 border border-rose-900/40 rounded-xl space-y-1">
              <span className="font-semibold text-rose-300 text-xs block">{isAr ? 'الخصومات المطبقة على السعر الأساسي:' : 'Deductions applied:'}</span>
              {deductions.map((d, idx) => (
                <div key={idx} className="flex justify-between text-[11px] text-slate-300">
                  <span>• {d.reason}</span>
                  <span className="font-mono text-rose-400">-{d.amount.toLocaleString()} ج.م</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 px-6 border-t border-slate-800 flex items-center justify-between bg-slate-950/80">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleEvaluate}
              disabled={isEvaluating}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium border border-slate-700 transition flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isEvaluating ? 'animate-spin text-amber-400' : ''}`} />
              {isAr ? 'إعادة التقييم' : 'Re-calculate'}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              type="button"
              disabled={isSubmitting || assessedValue <= 0}
              onClick={handleApply}
              className="px-5 py-2 text-xs font-semibold rounded-lg bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-600/30 transition cursor-pointer flex items-center gap-1.5"
            >
              <ArrowDownRight className="w-4 h-4" />
              {isAr ? `تطبيق رصيد ${assessedValue.toLocaleString()} ج.م على الفاتورة` : `Apply ${assessedValue} EGP Credit`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
