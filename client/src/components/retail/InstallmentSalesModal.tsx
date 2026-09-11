import React, { useState, useMemo } from 'react';
import { Calendar, DollarSign, ShieldAlert, CheckCircle2, User, Phone, X, Calculator } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';

interface InstallmentSalesModalProps {
  isOpen: boolean;
  total: number;
  customerName?: string;
  customerPhone?: string;
  onClose: () => void;
  onConfirm: (data: {
    down_payment: number;
    months: number;
    interest_rate: number;
    monthly_amount: number;
    financed_amount: number;
    guarantor_name?: string;
    guarantor_phone?: string;
    guarantor_national_id?: string;
  }) => void;
}

export const InstallmentSalesModal: React.FC<InstallmentSalesModalProps> = ({
  isOpen,
  total,
  customerName,
  customerPhone,
  onClose,
  onConfirm
}) => {
  const { language } = useLanguage();
  const isAr = language === 'ar';

  const [downPayment, setDownPayment] = useState<number>(() => Math.round(total * 0.2));
  const [months, setMonths] = useState<number>(12);
  const [interestRate, setInterestRate] = useState<number>(10); // 10% annual markup

  const [guarantorName, setGuarantorName] = useState('');
  const [guarantorPhone, setGuarantorPhone] = useState('');
  const [guarantorNationalId, setGuarantorNationalId] = useState('');

  const calculations = useMemo(() => {
    const dp = Math.min(total, Math.max(0, downPayment || 0));
    const principal = Math.max(0, total - dp);
    const interestAmount = Math.round((principal * (interestRate || 0)) / 100);
    const financed = principal + interestAmount;
    const monthly = months > 0 ? Math.round((financed / months) * 100) / 100 : 0;

    // Generate schedule
    const schedule = [];
    const now = new Date();
    for (let i = 1; i <= months; i++) {
      const d = new Date(now);
      d.setMonth(d.getMonth() + i);
      schedule.push({
        no: i,
        date: d.toISOString().substring(0, 10),
        amount: monthly
      });
    }

    return {
      downPayment: dp,
      principal,
      interestAmount,
      financed,
      monthly,
      schedule
    };
  }, [total, downPayment, months, interestRate]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm({
      down_payment: calculations.downPayment,
      months,
      interest_rate: interestRate,
      monthly_amount: calculations.monthly,
      financed_amount: calculations.financed,
      guarantor_name: guarantorName.trim() || undefined,
      guarantor_phone: guarantorPhone.trim() || undefined,
      guarantor_national_id: guarantorNationalId.trim() || undefined
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 select-text">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 px-6 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-lg border border-indigo-500/20">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                {isAr ? 'إنشاء خطة تقسيط للمبيعات' : 'Installment Sales Plan Engine'}
              </h2>
              <p className="text-xs text-slate-400">
                {isAr ? `الفاتورة: ${total.toLocaleString()} ج.م للعميل: ${customerName || 'عميل نقدي'}` : `Total: ${total.toLocaleString()} EGP`}
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

        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto text-xs">
            {/* KPI Cards */}
            <div className="grid grid-cols-4 gap-2.5 text-center">
              <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
                <span className="text-slate-400 block mb-1">{isAr ? 'إجمالي السلعة' : 'Total'}</span>
                <span className="font-mono font-bold text-white text-sm">
                  {total.toLocaleString()} ج.م
                </span>
              </div>
              <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
                <span className="text-slate-400 block mb-1">{isAr ? 'المقدم المدفوع' : 'Down Payment'}</span>
                <span className="font-mono font-bold text-emerald-400 text-sm">
                  {calculations.downPayment.toLocaleString()} ج.م
                </span>
              </div>
              <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
                <span className="text-slate-400 block mb-1">{isAr ? 'المبلغ الممول' : 'Financed'}</span>
                <span className="font-mono font-bold text-indigo-400 text-sm">
                  {calculations.financed.toLocaleString()} ج.م
                </span>
              </div>
              <div className="p-3 bg-indigo-950/40 border border-indigo-800/60 rounded-xl">
                <span className="text-indigo-300 block mb-1">{isAr ? 'القسط الشهري' : 'Monthly'}</span>
                <span className="font-mono font-bold text-indigo-200 text-sm">
                  {calculations.monthly.toLocaleString()} ج.م
                </span>
              </div>
            </div>

            {/* Plan Configuration */}
            <div className="grid grid-cols-3 gap-4 p-4 bg-slate-950/40 border border-slate-800 rounded-xl">
              <div>
                <label className="block text-slate-300 font-medium mb-1.5">
                  {isAr ? 'الدفعة المقدمة (ج.م)' : 'Down Payment (EGP)'}
                </label>
                <input
                  type="number"
                  min="0"
                  max={total}
                  value={downPayment}
                  onChange={e => setDownPayment(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono text-sm focus:border-indigo-500 focus:outline-none"
                />
                <div className="flex gap-1 mt-1.5">
                  {[0, 10, 20, 30, 50].map(pct => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setDownPayment(Math.round((total * pct) / 100))}
                      className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-300 rounded cursor-pointer"
                    >
                      {pct}%
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1.5">
                  {isAr ? 'مدة التقسيط (أشهر)' : 'Tenure (Months)'}
                </label>
                <select
                  value={months}
                  onChange={e => setMonths(parseInt(e.target.value, 10))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-none"
                >
                  <option value={3}>3 {isAr ? 'أشهر' : 'Months'}</option>
                  <option value={6}>6 {isAr ? 'أشهر' : 'Months'}</option>
                  <option value={12}>12 {isAr ? 'شهر (سنة)' : 'Months (1 Year)'}</option>
                  <option value={18}>18 {isAr ? 'شهر' : 'Months'}</option>
                  <option value={24}>24 {isAr ? 'شهر (سنتان)' : 'Months (2 Years)'}</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1.5">
                  {isAr ? 'نسبة الفائدة / الهامش (%)' : 'Interest / Markup (%)'}
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={interestRate}
                  onChange={e => setInterestRate(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono text-sm focus:border-indigo-500 focus:outline-none"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  {isAr ? `إجمالي الفائدة: ${calculations.interestAmount.toLocaleString()} ج.م` : `Interest: ${calculations.interestAmount} EGP`}
                </span>
              </div>
            </div>

            {/* Guarantor Details */}
            <div className="p-4 bg-slate-950/40 border border-slate-800 rounded-xl space-y-3">
              <h4 className="font-semibold text-white flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-amber-400" />
                {isAr ? 'بيانات الضامن والكفيل (اختياري / إلزامي للتقسيط الممتد)' : 'Guarantor Details'}
              </h4>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-400 text-[11px] mb-1">{isAr ? 'اسم الضامن' : 'Guarantor Name'}</label>
                  <input
                    type="text"
                    value={guarantorName}
                    onChange={e => setGuarantorName(e.target.value)}
                    placeholder={isAr ? 'الاسم بالكامل' : 'Full Name'}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 text-[11px] mb-1">{isAr ? 'هاتف الضامن' : 'Guarantor Phone'}</label>
                  <input
                    type="text"
                    value={guarantorPhone}
                    onChange={e => setGuarantorPhone(e.target.value)}
                    placeholder="010xxxxxxxx"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 text-[11px] mb-1">{isAr ? 'الرقم القومي للضامن' : 'National ID'}</label>
                  <input
                    type="text"
                    maxLength={14}
                    value={guarantorNationalId}
                    onChange={e => setGuarantorNationalId(e.target.value)}
                    placeholder="14 أرقام"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Schedule Amortization Preview */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white text-xs flex items-center gap-1.5">
                  <Calculator className="w-4 h-4 text-emerald-400" />
                  {isAr ? `جدول الأقساط الشهرية (${months} قسط)` : `Amortization Schedule (${months} payments)`}
                </span>
                <span className="text-[11px] text-slate-400">
                  {isAr ? 'تذكير تلقائي عبر واتساب قبل الاستحقاق بيومين' : 'Auto WhatsApp reminder 2 days before due date'}
                </span>
              </div>

              <div className="border border-slate-800 rounded-xl overflow-hidden max-h-44 overflow-y-auto">
                <table className="w-full text-start text-xs">
                  <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 text-[11px]">
                    <tr>
                      <th className="px-3 py-2 text-start">#</th>
                      <th className="px-3 py-2 text-start">{isAr ? 'تاريخ الاستحقاق' : 'Due Date'}</th>
                      <th className="px-3 py-2 text-end">{isAr ? 'قيمة القسط' : 'Installment'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 font-mono">
                    {calculations.schedule.map(item => (
                      <tr key={item.no} className="hover:bg-slate-800/30">
                        <td className="px-3 py-1.5 text-slate-400">القسط {item.no}</td>
                        <td className="px-3 py-1.5 text-slate-300">{item.date}</td>
                        <td className="px-3 py-1.5 text-end font-bold text-emerald-400">
                          {item.amount.toLocaleString()} ج.م
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 px-6 border-t border-slate-800 flex items-center justify-between bg-slate-950/80">
            <span className="text-xs text-slate-400">
              {isAr ? `سيتم تحصيل مقدم ${calculations.downPayment.toLocaleString()} ج.م نقداً الآن.` : `Down payment: ${calculations.downPayment} EGP`}
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="submit"
                className="px-5 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30 transition cursor-pointer flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                {isAr ? 'اعتماد خطة التقسيط للبيع' : 'Approve Installment Plan'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
