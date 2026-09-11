import React, { useState } from 'react';
import { RepairTicket } from '../../types/erp';
import { ShieldCheck, CheckSquare, Square, X, AlertTriangle, Sparkles, CheckCircle2 } from 'lucide-react';

interface QAChecklistModalProps {
  ticket: RepairTicket & { qa_checklist?: any };
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (checklist: Record<string, any>) => Promise<void>;
  isAr?: boolean;
}

const DEFAULT_QA_ITEMS = [
  { id: 'power_charging', labelAr: 'التشغيل السليم واستهلاك التيار الطبيعي', labelEn: 'Power ON & Stable Amperage Draw' },
  { id: 'screen_touch', labelAr: 'سطوع الشاشة واختبار اللمس المتعدد بالأركان', labelEn: 'Display Brightness & Multi-touch Test' },
  { id: 'cameras_flash', labelAr: 'الكاميرات الأمامية والخلفية والتركيز والفلاش', labelEn: 'Front/Rear Cameras, Autofocus & Flash' },
  { id: 'biometrics', labelAr: 'بصمة الوجه / بصمة الإصبع (FaceID / TouchID)', labelEn: 'Biometric Authentication (FaceID / TouchID)' },
  { id: 'audio_speakers', labelAr: 'سماعة المكالمات ومكبر الصوت والميكروفونات', labelEn: 'Earpiece, Loudspeaker & Microphones' },
  { id: 'connectivity', labelAr: 'الاتصال الخلوي وشبكات Wi-Fi والبلوتوث', labelEn: 'Cellular Baseband, Wi-Fi & Bluetooth' },
  { id: 'charging_port', labelAr: 'منفذ الشحن وسرعة الشحن واكتشاف الكابل', labelEn: 'Charging Port & Fast-Charge Handshake' },
  { id: 'sensors', labelAr: 'حساس التقارب وحساس الإضاءة التلقائي', labelEn: 'Proximity & Ambient Light Sensors' },
  { id: 'structural_seal', labelAr: 'إحكام المسامير الداخلية ومطاط عزل الرطوبة', labelEn: 'Internal Fasteners & Perimeter Adhesive Seal' },
  { id: 'cosmetic_cleaning', labelAr: 'التنظيف الشامل للجهاز والتعقيم الخارجي', labelEn: 'Exterior Cleaning & UV Sanitization' }
];

export const QAChecklistModal: React.FC<QAChecklistModalProps> = ({
  ticket,
  isOpen,
  onClose,
  onSubmit,
  isAr = true
}) => {
  const [checklist, setChecklist] = useState<Record<string, boolean>>(() => {
    try {
      if (ticket.qa_checklist) {
        const parsed = typeof ticket.qa_checklist === 'string' ? JSON.parse(ticket.qa_checklist) : ticket.qa_checklist;
        if (parsed && typeof parsed === 'object') {
          return parsed;
        }
      }
    } catch {}
    // Default initial empty checklist
    const initial: Record<string, boolean> = {};
    DEFAULT_QA_ITEMS.forEach(item => { initial[item.id] = false; });
    return initial;
  });

  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  if (!isOpen) return null;

  const passedCount = Object.values(checklist).filter(Boolean).length;
  const totalCount = DEFAULT_QA_ITEMS.length;
  const allPassed = passedCount === totalCount;

  const toggleItem = (id: string) => {
    setChecklist(prev => ({ ...prev, [id]: !prev[id] }));
    setValidationError(null);
  };

  const handleToggleAll = () => {
    const nextState = !allPassed;
    const updated: Record<string, boolean> = {};
    DEFAULT_QA_ITEMS.forEach(item => { updated[item.id] = nextState; });
    setChecklist(updated);
    setValidationError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passedCount === 0) {
      setValidationError(isAr ? 'يجب اجتياز فحص جودة واحد على الأقل للمتابعة' : 'At least one QA checkpoint must be verified');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        ...checklist,
        passed_count: passedCount,
        total_count: totalCount,
        qa_notes: notes,
        verified_at: new Date().toISOString()
      };
      await onSubmit(payload);
      onClose();
    } catch (err: any) {
      setValidationError(err.message || 'Failed to submit QA checklist');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                {isAr ? 'فحص الجودة ما بعد الصيانة (QA Verification)' : 'Post-Repair Quality Assurance (QA)'}
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-sky-400 border border-slate-700 font-mono">
                  #{ticket.ticket_number}
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {ticket.device_brand} {ticket.device_model} — {isAr ? 'الفحص الإلزامي قبل تسليم الجهاز' : 'Mandatory verification before marking READY'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Progress Banner */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-300">
                  {isAr ? 'معدل اجتياز الاختبارات:' : 'Checklist Completion:'}
                </span>
                <span className={`text-sm font-bold font-mono ${passedCount === totalCount ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {passedCount} / {totalCount} ({Math.round((passedCount / totalCount) * 100)}%)
                </span>
              </div>
              <div className="w-64 h-2 bg-slate-800 rounded-full mt-2 overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    passedCount === totalCount ? 'bg-emerald-500' : 'bg-amber-500'
                  }`}
                  style={{ width: `${(passedCount / totalCount) * 100}%` }}
                />
              </div>
            </div>

            <button
              type="button"
              onClick={handleToggleAll}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 font-medium rounded-lg border border-slate-700 transition"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              {allPassed ? (isAr ? 'إلغاء تحديد الكل' : 'Deselect All') : (isAr ? 'تحديد الكل ناجح' : 'Mark All Passed')}
            </button>
          </div>

          {validationError && (
            <div className="flex items-center gap-2 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{validationError}</span>
            </div>
          )}

          {/* 10-Point Checklist Items */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {DEFAULT_QA_ITEMS.map((item, idx) => {
              const checked = Boolean(checklist[item.id]);
              return (
                <div
                  key={item.id}
                  onClick={() => toggleItem(item.id)}
                  className={`p-3 rounded-xl border cursor-pointer transition flex items-start gap-3 select-none ${
                    checked
                      ? 'bg-emerald-950/20 border-emerald-500/40 text-white'
                      : 'bg-slate-950/60 border-slate-800/80 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="mt-0.5">
                    {checked ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border border-slate-600" />
                    )}
                  </div>
                  <div className="flex-1">
                    <span className="text-[11px] font-mono text-slate-500 me-1.5">
                      #{idx + 1}
                    </span>
                    <span className="text-xs font-medium">
                      {isAr ? item.labelAr : item.labelEn}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* QA Technician Remarks */}
          <div className="space-y-1.5 pt-2">
            <label className="text-xs font-medium text-slate-300">
              {isAr ? 'ملاحظات فني الجودة (اختياري):' : 'QA Technician Observations (Optional):'}
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder={isAr ? 'تم فحص جميع الوظائف الحيوية بنجاح والشاشة تعمل بكفاءة...' : 'All core hardware components verified working properly...'}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-sky-500 resize-none h-20"
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium transition cursor-pointer"
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold text-white shadow-lg transition cursor-pointer ${
                passedCount > 0
                  ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/20'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
              }`}
            >
              <CheckSquare className="w-4 h-4" />
              {submitting
                ? (isAr ? 'جاري الاعتماد...' : 'Verifying...')
                : (isAr ? 'اعتماد فحص الجودة وتجهيز التسليم (READY)' : 'Approve QA & Mark Ready')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
export default QAChecklistModal;
