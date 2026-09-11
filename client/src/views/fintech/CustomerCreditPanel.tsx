import React, { useState, useEffect } from 'react';
import { CustomerCreditInfo, fetchFintechApi } from './types';
import { useToast } from '../../context/ToastContext';
import {
  CreditCard,
  Search,
  UserCheck,
  AlertTriangle,
  CheckCircle2,
  Lock,
  Edit2,
  RefreshCw,
  TrendingUp,
  ShieldAlert
} from 'lucide-react';

export const CustomerCreditPanel: React.FC = () => {
  const { showToast } = useToast();
  const [customers, setCustomers] = useState<any[]>([]);
  const [selectedCustId, setSelectedCustId] = useState<string>('');
  const [creditInfo, setCreditInfo] = useState<CustomerCreditInfo | null>(null);
  const [loading, setLoading] = useState(false);

  // Credit Limit Edit
  const [editLimit, setEditLimit] = useState('');
  const [updatingLimit, setUpdatingLimit] = useState(false);

  // Pre-sale Credit Check Simulation
  const [simulationAmount, setSimulationAmount] = useState('1200');
  const [simulationResult, setSimulationResult] = useState<any | null>(null);
  const [checkingSimulation, setCheckingSimulation] = useState(false);

  const loadCustomers = async () => {
    try {
      const res = await fetchFintechApi<any[]>('/crm/customers').catch(() => []);
      setCustomers(res);
      if (res.length > 0 && !selectedCustId) {
        setSelectedCustId(res[0].id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadCustomerCredit = async (id: string) => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await fetchFintechApi<CustomerCreditInfo>(`/fintech/customers/${id}/credit`);
      setCreditInfo(res);
      setEditLimit(String(res.credit_limit));
      setSimulationResult(null);
    } catch (err: any) {
      showToast(err.message || 'فشل جلب بيانات الائتمان للعميل', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers();
  }, []);

  useEffect(() => {
    if (selectedCustId) {
      loadCustomerCredit(selectedCustId);
    }
  }, [selectedCustId]);

  const handleUpdateLimit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustId) return;

    const numLimit = parseFloat(editLimit);
    if (isNaN(numLimit) || numLimit < 0) {
      showToast('يرجى إدخال حد ائتماني صالح', 'error');
      return;
    }

    setUpdatingLimit(true);
    try {
      await fetchFintechApi<any>(`/fintech/customers/${selectedCustId}/credit-limit`, {
        method: 'PATCH',
        body: JSON.stringify({ credit_limit: numLimit })
      });
      showToast('تم تحديث الحد الائتماني للعميل بنجاح', 'success');
      loadCustomerCredit(selectedCustId);
    } catch (err: any) {
      showToast(err.message || 'فشل تعديل الحد الائتماني', 'error');
    } finally {
      setUpdatingLimit(false);
    }
  };

  const handleRunSimulation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustId) return;

    const numSale = parseFloat(simulationAmount);
    if (isNaN(numSale) || numSale <= 0) {
      showToast('يرجى إدخال مبلغ صالح للفاتورة', 'error');
      return;
    }

    setCheckingSimulation(true);
    try {
      const res = await fetchFintechApi<any>(`/fintech/customers/${selectedCustId}/check-credit`, {
        method: 'POST',
        body: JSON.stringify({ new_sale_amount: numSale })
      });
      setSimulationResult(res);
    } catch (err: any) {
      setSimulationResult({
        allowed: false,
        error: err.message
      });
    } finally {
      setCheckingSimulation(false);
    }
  };

  const usagePercent = creditInfo ? creditInfo.usage_percentage : 0;
  const isDanger = usagePercent >= 90;
  const isWarning = usagePercent >= 70 && usagePercent < 90;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-amber-400" />
            إدارة الحدود الائتمانية للعملاء (Customer Credit Limit Engine)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            مراقبة الائتمان المستخدم وحجب البيع الآجل تلقائياً فور تجاوز السقف المالي المحدد (credit_used + new_sale &gt; credit_limit).
          </p>
        </div>

        {/* Customer Selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">اختر العميل:</span>
          <select
            value={selectedCustId}
            onChange={e => setSelectedCustId(e.target.value)}
            className="bg-slate-900 border border-slate-700 text-white rounded-lg p-2 text-xs font-medium"
          >
            {customers.map(c => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.phone || c.id})
              </option>
            ))}
          </select>
          <button
            onClick={() => selectedCustId && loadCustomerCredit(selectedCustId)}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {creditInfo ? (
        <div className="space-y-6">
          {/* Main Visual Progress Meter Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <UserCheck className="w-5 h-5 text-amber-400" />
                  {creditInfo.customerName}
                </h3>
                <p className="text-xs text-slate-400 font-mono mt-0.5" dir="ltr">{creditInfo.phone}</p>
              </div>

              <div className="flex items-center gap-4 text-left font-mono">
                <div>
                  <span className="text-[10px] text-slate-500 block">الحد الائتماني الإجمالي</span>
                  <span className="text-lg font-black text-white">{creditInfo.credit_limit.toLocaleString()} ج.م</span>
                </div>
                <div className="border-r border-slate-800 pr-4">
                  <span className="text-[10px] text-slate-500 block">الائتمان المستغل</span>
                  <span className={`text-lg font-black ${isDanger ? 'text-rose-400' : isWarning ? 'text-amber-400' : 'text-slate-300'}`}>
                    {creditInfo.credit_used.toLocaleString()} ج.م
                  </span>
                </div>
                <div className="border-r border-slate-800 pr-4">
                  <span className="text-[10px] text-slate-500 block">الائتمان المتاح حالياً</span>
                  <span className="text-lg font-black text-emerald-400">{creditInfo.available_credit.toLocaleString()} ج.م</span>
                </div>
              </div>
            </div>

            {/* Credit Usage Progress Bar (Green < 70%, Amber 70-90%, Red > 90%) */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-slate-400">نسبة استهلاك السقف الائتماني:</span>
                <span className={`font-bold ${isDanger ? 'text-rose-400' : isWarning ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {usagePercent}% {isDanger ? '(حرج / مغلق)' : isWarning ? '(تحذير اقتراب من الحد)' : '(آمن)'}
                </span>
              </div>

              <div className="w-full bg-slate-800 h-3 rounded-full overflow-hidden p-0.5 border border-slate-700">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    isDanger ? 'bg-rose-500 shadow-rose-500/50' : isWarning ? 'bg-amber-500 shadow-amber-500/50' : 'bg-emerald-500 shadow-emerald-500/50'
                  }`}
                  style={{ width: `${Math.min(usagePercent, 100)}%` }}
                />
              </div>

              <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                <span>0 ج.م</span>
                <span>70% (تنبيه أولي)</span>
                <span>90% (سقف الحظر)</span>
                <span>{creditInfo.credit_limit.toLocaleString()} ج.م</span>
              </div>
            </div>
          </div>

          {/* Two Columns: Edit Limit & Sale Pre-Check Guard */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Column 1: Update Credit Limit */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
              <h4 className="text-xs font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
                <Edit2 className="w-4 h-4 text-amber-400" />
                تعديل السقف الائتماني المعتمد للعميل
              </h4>

              <form onSubmit={handleUpdateLimit} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    الحد الائتماني الجديد (ج.م) *
                  </label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="100"
                    value={editLimit}
                    onChange={e => setEditLimit(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white font-mono text-sm focus:border-amber-500 outline-hidden"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">حدد 0 لمنع البيع الآجل تماماً لهذا العميل.</p>
                </div>

                <button
                  type="submit"
                  disabled={updatingLimit}
                  className="px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold shadow-lg transition"
                >
                  {updatingLimit ? 'جاري الحفظ...' : 'اعتماد الحد الائتماني الجديد'}
                </button>
              </form>
            </div>

            {/* Column 2: Guard & Sale Credit Check Tool */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
              <h4 className="text-xs font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
                <ShieldAlert className="w-4 h-4 text-indigo-400" />
                محاكاة فحص المعاملة الآجلة بنقطة البيع (POS Credit Guard)
              </h4>

              <form onSubmit={handleRunSimulation} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    قيمة الفاتورة الآجلة المقترحة (ج.م) *
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={simulationAmount}
                    onChange={e => setSimulationAmount(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white font-mono text-sm focus:border-amber-500 outline-hidden"
                  />
                </div>

                <button
                  type="submit"
                  disabled={checkingSimulation}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold shadow-lg transition"
                >
                  {checkingSimulation ? 'جاري الفحص...' : 'فحص إمكانية تمرير البيع الآجل'}
                </button>
              </form>

              {/* Simulation Result */}
              {simulationResult && (
                <div className={`p-4 rounded-xl border text-xs space-y-1 font-mono ${
                  simulationResult.allowed
                    ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
                    : 'bg-rose-950/40 border-rose-800 text-rose-300'
                }`}>
                  <p className="font-bold flex items-center gap-1.5 text-sm">
                    {simulationResult.allowed ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span>مسموح: المعاملة ضمن الحد المتاح</span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="w-4 h-4 text-rose-400" />
                        <span>محظور: حجب البيع لتجاوز السقف الائتماني (HTTP 403)</span>
                      </>
                    )}
                  </p>
                  <p className="text-[11px] opacity-80 pt-1">
                    {simulationResult.allowed
                      ? `الائتمان المتبقي بعد العملية: ${simulationResult.remaining_credit?.toLocaleString()} ج.م`
                      : simulationResult.error}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="p-12 text-center text-xs text-slate-500">
          اختر عميلاً من القائمة لعرض ومراقبة السقف الائتماني.
        </div>
      )}
    </div>
  );
};

export default CustomerCreditPanel;
