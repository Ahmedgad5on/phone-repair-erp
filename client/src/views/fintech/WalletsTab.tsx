import React, { useState, useEffect } from 'react';
import { FintechWallet, FintechTransaction, ApprovalRequest, fetchFintechApi } from './types';
import { useLanguage } from '../../i18n/LanguageContext';
import { useToast } from '../../context/ToastContext';
import {
  Wallet,
  Lock,
  Unlock,
  ShieldAlert,
  RefreshCw,
  Plus,
  ArrowDownLeft,
  ArrowUpRight,
  Search,
  CheckCircle2,
  AlertTriangle,
  History,
  ShieldCheck
} from 'lucide-react';

export const WalletsTab: React.FC = () => {
  const { t } = useLanguage();
  const { showToast } = useToast();
  const [wallets, setWallets] = useState<FintechWallet[]>([]);
  const [transactions, setTransactions] = useState<FintechTransaction[]>([]);
  const [amlTopNumbers, setAmlTopNumbers] = useState<any[]>([]);
  const [ceilingAlerts, setCeilingAlerts] = useState<any[]>([]);
  const [approvedRequests, setApprovedRequests] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(false);

  // New Transaction Form Modal
  const [showTxModal, setShowTxModal] = useState(false);
  const [selectedWallet, setSelectedWallet] = useState<FintechWallet | null>(null);
  const [txForm, setTxForm] = useState({
    trans_type: 'CASH_OUT' as 'CASH_IN' | 'CASH_OUT',
    amount: '',
    commission: '15',
    sender_receiver_phone: '',
    reference_tx_id: '',
    national_id: '',
    approval_request_id: ''
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [w, tx, aml, ceilings, apr] = await Promise.all([
        fetchFintechApi<FintechWallet[]>('/fintech/wallets'),
        fetchFintechApi<FintechTransaction[]>('/fintech/transactions?limit=50'),
        fetchFintechApi<any[]>('/fintech/aml-top').catch(() => []),
        fetchFintechApi<any[]>('/fintech/ceiling-alerts').catch(() => []),
        fetchFintechApi<ApprovalRequest[]>('/fintech/approval-requests?status=APPROVED').catch(() => [])
      ]);
      setWallets(w);
      setTransactions(tx);
      setAmlTopNumbers(aml);
      setCeilingAlerts(ceilings);
      setApprovedRequests(apr);
    } catch (err: any) {
      showToast(err.message || 'فشل تحميل بيانات المحافظ الإلكترونية', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleUnlock = async (walletId: string) => {
    try {
      const res = await fetchFintechApi<any>(`/fintech/wallets/${walletId}/unlock`, { method: 'POST' });
      showToast(res.message || 'تم إلغاء قفل المحفظة بنجاح', 'success');
      loadData();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleProcessTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWallet) return;

    const numAmount = parseFloat(txForm.amount) || 0;
    if (numAmount > 5000 && !txForm.approval_request_id) {
      showToast('المعاملات التي تتجاوز 5000 ج.م تتطلب رقم موافقة معتمد مسبقاً (Approval ID)', 'error');
      return;
    }

    try {
      const res = await fetchFintechApi<any>('/fintech/transactions', {
        method: 'POST',
        body: JSON.stringify({
          wallet_id: selectedWallet.id,
          trans_type: txForm.trans_type,
          amount: numAmount,
          commission: parseFloat(txForm.commission) || 0,
          sender_receiver_phone: txForm.sender_receiver_phone,
          reference_tx_id: txForm.reference_tx_id,
          national_id: txForm.national_id,
          expected_version: selectedWallet.version || 1,
          approval_request_id: txForm.approval_request_id || undefined,
          created_by_user_id: 'usr-cashier'
        })
      });

      if (res.suspiciousAlert) {
        showToast(`تنبيه AML: ${res.suspiciousAlert}`, 'warning');
      }
      if (res.autoLocked) {
        showToast('تنبيه: وصلت المحفظة إلى حد 95% وتم قفلها تنظيمياً تلقائياً.', 'warning');
      }
      showToast('تم تنفيذ المعاملة بنجاح وتحديث رصيد المحفظة بتأمين الذرية المتزامنة (Atomic Lock).', 'success');

      setShowTxModal(false);
      setTxForm({
        trans_type: 'CASH_OUT',
        amount: '',
        commission: '15',
        sender_receiver_phone: '',
        reference_tx_id: '',
        national_id: '',
        approval_request_id: ''
      });
      loadData();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Ceiling Alerts Banner */}
      {ceilingAlerts.some(c => c.isLocked) && (
        <div className="bg-rose-950/40 border border-rose-800/80 rounded-xl p-4 flex items-center justify-between text-rose-300">
          <div className="flex items-center gap-3">
            <ShieldAlert className="w-6 h-6 text-rose-400 shrink-0" />
            <div>
              <p className="font-bold text-sm">تنبيه تنظيمي: محافظ مقفلة لتجاوز حد السحب/الإيداع اليومي أو الشهري (95%)</p>
              <p className="text-xs text-rose-300/80">المحافظ المقفلة تمنع العمليات الجديدة لحين انتهاء دورة التسوية أو إلغاء القفل بتفويض المشرف.</p>
            </div>
          </div>
          <button
            onClick={loadData}
            className="px-3 py-1.5 bg-rose-800 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold"
          >
            تحديث الحالة
          </button>
        </div>
      )}

      {/* Wallets Grid */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
          <Wallet className="w-4 h-4 text-amber-400" />
          المحافظ الإلكترونية المعتمدة والأرصدة اللحظية
        </h2>
        <button
          onClick={loadData}
          disabled={loading}
          className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs flex items-center gap-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>تحديث الأرصدة</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {wallets.map(w => {
          const isLocked = Boolean(w.is_locked);
          const dailyRatio = w.dailyPercentage || (w.daily_usage / (w.daily_limit || 1)) * 100;
          const monthlyRatio = w.monthlyPercentage || (w.monthly_usage / (w.monthly_limit || 1)) * 100;
          const nearLimit = w.nearLimit || isLocked;

          return (
            <div
              key={w.id}
              className={`bg-slate-900 border rounded-xl p-5 shadow-xl flex flex-col justify-between space-y-4 transition ${
                isLocked
                  ? 'border-rose-700/80 bg-rose-950/20'
                  : nearLimit
                  ? 'border-amber-700/80 bg-amber-950/10'
                  : 'border-slate-800'
              }`}
            >
              <div>
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-bold text-white text-base flex items-center gap-2">
                      {w.provider_name}
                      {isLocked ? (
                        <span className="flex items-center gap-1 text-[10px] bg-rose-900/60 text-rose-300 border border-rose-700 px-2 py-0.5 rounded-full">
                          <Lock className="w-3 h-3" /> مقفل
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[10px] bg-emerald-900/40 text-emerald-300 border border-emerald-700/60 px-2 py-0.5 rounded-full">
                          <CheckCircle2 className="w-3 h-3" /> نشط v{w.version || 1}
                        </span>
                      )}
                    </h3>
                    <p className="text-xs text-slate-400 font-mono mt-0.5" dir="ltr">{w.wallet_number}</p>
                  </div>
                  <div className="p-2 bg-slate-800 rounded-lg text-amber-400">
                    <Wallet className="w-5 h-5" />
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800/80">
                  <p className="text-xs text-slate-400">الرصيد المتاح الحالي</p>
                  <p className="text-2xl font-black text-white mt-1">
                    {w.current_balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    <span className="text-xs text-amber-400 mr-1.5 font-normal">ج.م</span>
                  </p>
                </div>

                {/* Progress Gauges */}
                <div className="mt-4 space-y-2 text-xs">
                  <div>
                    <div className="flex justify-between text-slate-400 mb-1">
                      <span>الاستخدام اليومي:</span>
                      <span className="font-mono">{dailyRatio.toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${
                          dailyRatio >= 95 ? 'bg-rose-500' : dailyRatio >= 80 ? 'bg-amber-500' : 'bg-emerald-500'
                        }`}
                        style={{ width: `${Math.min(dailyRatio, 100)}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-500 mt-0.5">
                      <span>{w.daily_usage.toLocaleString()} ج.م</span>
                      <span>سقف: {w.daily_limit.toLocaleString()} ج.م</span>
                    </div>
                  </div>

                  <div className="pt-1">
                    <div className="flex justify-between text-slate-400 mb-1">
                      <span>الاستخدام الشهري:</span>
                      <span className="font-mono">{monthlyRatio.toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${
                          monthlyRatio >= 95 ? 'bg-rose-500' : monthlyRatio >= 80 ? 'bg-amber-500' : 'bg-indigo-500'
                        }`}
                        style={{ width: `${Math.min(monthlyRatio, 100)}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-500 mt-0.5">
                      <span>{w.monthly_usage.toLocaleString()} ج.م</span>
                      <span>سقف: {w.monthly_limit.toLocaleString()} ج.م</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="pt-2 flex items-center gap-2">
                {isLocked ? (
                  <button
                    onClick={() => handleUnlock(w.id)}
                    className="w-full py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition"
                  >
                    <Unlock className="w-3.5 h-3.5" />
                    <span>إلغاء القفل الرقابي</span>
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setSelectedWallet(w);
                      setShowTxModal(true);
                    }}
                    className="w-full py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>تنفيذ معاملة كاش</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Transactions History & AML Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Transactions Table */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-white text-sm flex items-center gap-2">
              <History className="w-4 h-4 text-amber-400" />
              سجل المعاملات المالية الموثقة (Atomic Ledger)
            </h3>
            <span className="text-xs text-slate-400">آخر {transactions.length} عملية</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-right text-slate-300">
              <thead className="bg-slate-800/80 text-slate-400 font-semibold border-b border-slate-700">
                <tr>
                  <th className="p-2.5">المحفظة</th>
                  <th className="p-2.5">النوع</th>
                  <th className="p-2.5">المبلغ</th>
                  <th className="p-2.5">العمولة</th>
                  <th className="p-2.5">الرقم / العميل</th>
                  <th className="p-2.5">كود المعاملة</th>
                  <th className="p-2.5">الوقت</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {transactions.slice(0, 10).map(t => (
                  <tr key={t.id} className="hover:bg-slate-800/50 transition">
                    <td className="p-2.5 font-medium text-white">{t.wallet_provider}</td>
                    <td className="p-2.5">
                      {t.trans_type === 'CASH_IN' ? (
                        <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                          <ArrowDownLeft className="w-3 h-3" /> إيداع كاش
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-amber-400 font-medium">
                          <ArrowUpRight className="w-3 h-3" /> سحب كاش
                        </span>
                      )}
                    </td>
                    <td className="p-2.5 font-bold text-white font-mono">{t.amount.toLocaleString()} ج.م</td>
                    <td className="p-2.5 text-slate-400 font-mono">{t.commission} ج.م</td>
                    <td className="p-2.5 font-mono text-slate-300" dir="ltr">{t.sender_receiver_phone || '-'}</td>
                    <td className="p-2.5 font-mono text-slate-400 text-[10px]">{t.reference_tx_id || '-'}</td>
                    <td className="p-2.5 text-slate-500 font-mono text-[10px]">
                      {new Date(t.created_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* AML Suspicious Heuristics & Top Phone Numbers */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="font-bold text-white text-sm flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-indigo-400" />
              مراقبة الامتثال ومكافحة غسيل الأموال (AML)
            </h3>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            التحليل التكراري التلقائي لأعلى أرقام الهواتف تداولاً لحجم السيولة النقدية لمنع التلاعب بالقوانين المصرفية:
          </p>

          <div className="space-y-2">
            {amlTopNumbers.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-4">لا توجد أرقام تتجاوز نمط التكرار المشبوه حالياً.</p>
            ) : (
              amlTopNumbers.map((a, idx) => (
                <div key={idx} className="bg-slate-800/60 border border-slate-700/60 rounded-lg p-2.5 flex items-center justify-between">
                  <div>
                    <p className="font-mono text-xs font-bold text-white" dir="ltr">{a.sender_receiver_phone}</p>
                    <p className="text-[10px] text-slate-400">{a.tx_count} عمليات تحويل منفذة</p>
                  </div>
                  <div className="text-left">
                    <p className="font-mono text-xs font-bold text-amber-400">{Number(a.total_volume).toLocaleString()} ج.م</p>
                    <span className="text-[9px] bg-amber-950/60 text-amber-300 border border-amber-800/80 px-1.5 py-0.5 rounded">
                      متابعة AML
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Process Transaction Modal */}
      {showTxModal && selectedWallet && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Wallet className="w-5 h-5 text-amber-400" />
                معاملة كاش: {selectedWallet.provider_name}
              </h3>
              <button
                onClick={() => setShowTxModal(false)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleProcessTransaction} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">نوع المعاملة</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setTxForm({ ...txForm, trans_type: 'CASH_OUT' })}
                    className={`py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                      txForm.trans_type === 'CASH_OUT'
                        ? 'bg-amber-600 text-white'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    <ArrowUpRight className="w-3.5 h-3.5" />
                    <span>سحب كاش للعميل</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTxForm({ ...txForm, trans_type: 'CASH_IN' })}
                    className={`py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                      txForm.trans_type === 'CASH_IN'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    <ArrowDownLeft className="w-3.5 h-3.5" />
                    <span>إيداع كاش بالمحفظة</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">المبلغ (ج.م) *</label>
                <input
                  type="number"
                  required
                  min="1"
                  step="0.01"
                  value={txForm.amount}
                  onChange={e => setTxForm({ ...txForm, amount: e.target.value })}
                  placeholder="مثال: 500"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white font-mono text-sm focus:border-amber-500 outline-hidden"
                />
              </div>

              {/* Multi-step Approval Alert if > 5000 EGP */}
              {parseFloat(txForm.amount) > 5000 && (
                <div className="bg-amber-950/40 border border-amber-700/80 rounded-lg p-3 text-xs text-amber-300 space-y-2">
                  <p className="font-bold flex items-center gap-1">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    المعاملة تتجاوز 5,000 ج.م — يلزم اعتماد مالي مسبق
                  </p>
                  <div>
                    <label className="block text-[11px] text-slate-300 mb-1">حدد كود الموافقة المعتمدة (Approval Request):</label>
                    <select
                      value={txForm.approval_request_id}
                      onChange={e => setTxForm({ ...txForm, approval_request_id: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white"
                    >
                      <option value="">-- اختر موافقة معتمدة من الإدارة المالية --</option>
                      {approvedRequests.map(r => (
                        <option key={r.id} value={r.id}>
                          {r.id} — {r.amount} ج.م ({r.reason || r.request_type})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">العمولة (ج.م)</label>
                <input
                  type="number"
                  value={txForm.commission}
                  onChange={e => setTxForm({ ...txForm, commission: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white font-mono text-sm focus:border-amber-500 outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  رقم هاتف العميل {txForm.trans_type === 'CASH_OUT' ? '*' : '(اختياري)'}
                </label>
                <input
                  type="text"
                  required={txForm.trans_type === 'CASH_OUT'}
                  value={txForm.sender_receiver_phone}
                  onChange={e => setTxForm({ ...txForm, sender_receiver_phone: e.target.value })}
                  placeholder="010XXXXXXXX"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white font-mono text-sm focus:border-amber-500 outline-hidden text-left"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  كود العملية في رسالة الشبكة (TxID) {txForm.trans_type === 'CASH_OUT' ? '*' : '(اختياري)'}
                </label>
                <input
                  type="text"
                  required={txForm.trans_type === 'CASH_OUT'}
                  value={txForm.reference_tx_id}
                  onChange={e => setTxForm({ ...txForm, reference_tx_id: e.target.value })}
                  placeholder="مثال: VF-98124501"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white font-mono text-sm focus:border-amber-500 outline-hidden text-left"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">الرقم القومي (اختياري)</label>
                <input
                  type="text"
                  maxLength={14}
                  value={txForm.national_id}
                  onChange={e => setTxForm({ ...txForm, national_id: e.target.value })}
                  placeholder="14 رقم"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white font-mono text-sm focus:border-amber-500 outline-hidden text-left"
                  dir="ltr"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowTxModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold shadow-lg"
                >
                  تأكيد وتنفيذ المعاملة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default WalletsTab;
