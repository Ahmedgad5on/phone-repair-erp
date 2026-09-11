import React, { useState, useEffect } from 'react';
import { ApprovalRequest, fetchFintechApi } from './types';
import { useToast } from '../../context/ToastContext';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Plus,
  ArrowRight,
  UserCheck,
  Building,
  Check,
  X,
  FileCheck
} from 'lucide-react';

export const ApprovalsTab: React.FC = () => {
  const { showToast } = useToast();
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('');

  // Create Request Modal
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    request_type: 'LARGE_PAYMENT',
    amount: '',
    reference_id: '',
    reason: ''
  });

  const loadRequests = async () => {
    setLoading(true);
    try {
      const query = filterStatus ? `?status=${filterStatus}` : '';
      const res = await fetchFintechApi<ApprovalRequest[]>(`/fintech/approval-requests${query}`);
      setRequests(res);
    } catch (err: any) {
      showToast(err.message || 'فشل تحميل طلبات الاعتماد المالي', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, [filterStatus]);

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(form.amount) || 0;
    if (numAmount <= 0) {
      showToast('يرجى إدخال مبلغ صحيح', 'error');
      return;
    }

    try {
      await fetchFintechApi<any>('/fintech/approval-requests', {
        method: 'POST',
        body: JSON.stringify({
          request_type: form.request_type,
          amount: numAmount,
          reference_id: form.reference_id || undefined,
          reason: form.reason,
          requested_by: 'usr-cashier'
        })
      });

      showToast('تم رفع طلب الاعتماد المالي بنجاح للمراجعة المتسلسلة', 'success');
      setShowModal(false);
      setForm({ request_type: 'LARGE_PAYMENT', amount: '', reference_id: '', reason: '' });
      loadRequests();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleApprove = async (id: string, role: string) => {
    try {
      const res = await fetchFintechApi<any>(`/fintech/approval-requests/${id}/approve`, {
        method: 'PATCH',
        body: JSON.stringify({ role, approved_by: 'usr-manager' })
      });

      showToast(res.message || 'تم اعتماد مرحلة الصرف بنجاح', 'success');
      loadRequests();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleReject = async (id: string) => {
    const reason = window.prompt('سبب رفض طلب الصرف:');
    if (!reason) return;

    try {
      await fetchFintechApi<any>(`/fintech/approval-requests/${id}/reject`, {
        method: 'PATCH',
        body: JSON.stringify({ reason })
      });

      showToast('تم رفض طلب الصرف', 'info');
      loadRequests();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const pendingCount = requests.filter(r => r.status === 'PENDING').length;
  const approvedCount = requests.filter(r => r.status === 'APPROVED').length;

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-amber-400" />
            التسلسل الهرمي للاعتمادات المالية للمدفوعات الكبرى (&gt; 5,000 ج.م)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            تطبيق دورة الاعتماد الإلزامية متعددة المستويات: الكاشير (CASHIER) ← مدير الفرع (MANAGER) ← المدير المالي (CFO).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowModal(true)}
            className="px-3.5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-lg transition"
          >
            <Plus className="w-4 h-4" />
            <span>طلب اعتماد مالي جديد</span>
          </button>
          <button
            onClick={loadRequests}
            disabled={loading}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Multi-Step Pipeline Visualizer */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl">
        <h3 className="text-xs font-bold text-white mb-4">مسار التدقيق المالي الإلزامي للمبالغ التي تتجاوز 5,000 ج.م</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-850 border border-slate-800 p-4 rounded-xl flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-950/80 border border-amber-700/80 flex items-center justify-center text-amber-400 font-bold shrink-0">
              1
            </div>
            <div>
              <p className="text-xs font-bold text-white">المرحلة الأولى: الكاشير</p>
              <p className="text-[11px] text-slate-400 mt-0.5">رفع الطلب وتدقيق المستندات والرقم القومي</p>
            </div>
          </div>

          <div className="bg-slate-850 border border-slate-800 p-4 rounded-xl flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-indigo-950/80 border border-indigo-700/80 flex items-center justify-center text-indigo-400 font-bold shrink-0">
              2
            </div>
            <div>
              <p className="text-xs font-bold text-white">المرحلة الثانية: مدير الفرع (Manager)</p>
              <p className="text-[11px] text-slate-400 mt-0.5">التحقق من سقف الخزينة وسيولة الفرع</p>
            </div>
          </div>

          <div className="bg-slate-850 border border-slate-800 p-4 rounded-xl flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-950/80 border border-emerald-700/80 flex items-center justify-center text-emerald-400 font-bold shrink-0">
              3
            </div>
            <div>
              <p className="text-xs font-bold text-white">المرحلة الثالثة: الإدارة المالية (CFO)</p>
              <p className="text-[11px] text-slate-400 mt-0.5">المصادقة النهائية وتوليد رمز الإفراج المالي</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3 text-xs">
        <button
          onClick={() => setFilterStatus('')}
          className={`px-3 py-1.5 rounded-lg font-medium transition ${!filterStatus ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'}`}
        >
          جميع الطلبات ({requests.length})
        </button>
        <button
          onClick={() => setFilterStatus('PENDING')}
          className={`px-3 py-1.5 rounded-lg font-medium transition ${filterStatus === 'PENDING' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'}`}
        >
          بانتظار الاعتماد ({pendingCount})
        </button>
        <button
          onClick={() => setFilterStatus('APPROVED')}
          className={`px-3 py-1.5 rounded-lg font-medium transition ${filterStatus === 'APPROVED' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'}`}
        >
          المعتمدة ({approvedCount})
        </button>
      </div>

      {/* Requests Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-right text-slate-300">
            <thead className="bg-slate-800/90 text-slate-400 font-semibold border-b border-slate-700">
              <tr>
                <th className="p-3">كود الطلب</th>
                <th className="p-3">النوع</th>
                <th className="p-3 text-left">المبلغ</th>
                <th className="p-3">المرحلة الحالية</th>
                <th className="p-3">السبب / المرجع</th>
                <th className="p-3">مقدم الطلب</th>
                <th className="p-3 text-center">الحالة</th>
                <th className="p-3 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {requests.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-500">
                    لا توجد طلبات اعتماد مسجلة حالياً.
                  </td>
                </tr>
              ) : (
                requests.map(r => (
                  <tr key={r.id} className="hover:bg-slate-800/40 transition">
                    <td className="p-3 font-mono font-bold text-amber-400">{r.id}</td>
                    <td className="p-3 font-medium text-white">{r.request_type}</td>
                    <td className="p-3 text-left font-mono font-black text-white text-sm">
                      {r.amount.toLocaleString()} ج.م
                    </td>
                    <td className="p-3">
                      <span className="inline-flex items-center gap-1.5 bg-slate-800 border border-slate-700 px-2.5 py-1 rounded-md text-[11px] font-bold text-indigo-300">
                        {r.current_level}
                      </span>
                    </td>
                    <td className="p-3">
                      <p className="text-white font-medium">{r.reason || 'سحب كاش عالي القيمة'}</p>
                      {r.reference_id && <p className="text-[10px] text-slate-500 font-mono">مرجع: {r.reference_id}</p>}
                    </td>
                    <td className="p-3 text-slate-400 font-mono">{r.requested_by}</td>
                    <td className="p-3 text-center">
                      {r.status === 'APPROVED' ? (
                        <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-950/60 text-emerald-300 border border-emerald-700/80 px-2.5 py-1 rounded-full font-bold">
                          <CheckCircle2 className="w-3 h-3" /> معتمد نهائياً
                        </span>
                      ) : r.status === 'REJECTED' ? (
                        <span className="inline-flex items-center gap-1 text-[10px] bg-rose-950/60 text-rose-300 border border-rose-700/80 px-2.5 py-1 rounded-full font-bold">
                          <XCircle className="w-3 h-3" /> مرفوض
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] bg-amber-950/60 text-amber-300 border border-amber-700/80 px-2.5 py-1 rounded-full font-bold">
                          <AlertTriangle className="w-3 h-3" /> قيد المراجعة ({r.current_level})
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      {r.status === 'PENDING' && (
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => handleApprove(r.id, r.current_level === 'CASHIER' ? 'Manager' : 'CFO')}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[11px] font-bold flex items-center gap-1 shadow transition"
                            title="الموافقة على المرحلة الحالية"
                          >
                            <Check className="w-3 h-3" />
                            <span>موافقة</span>
                          </button>
                          <button
                            onClick={() => handleReject(r.id)}
                            className="px-2 py-1 bg-rose-900/60 hover:bg-rose-800 text-rose-200 border border-rose-700 rounded text-[11px] font-medium flex items-center gap-1 transition"
                            title="رفض الطلب"
                          >
                            <X className="w-3 h-3" />
                            <span>رفض</span>
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: New Approval Request */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-amber-400" />
                طلب اعتماد مالي لمعاملة &gt; 5000 ج.م
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateRequest} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">نوع المعاملة *</label>
                <select
                  value={form.request_type}
                  onChange={e => setForm({ ...form, request_type: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white text-xs"
                >
                  <option value="LARGE_PAYMENT">سحب كاش عالي القيمة للمحفظة</option>
                  <option value="SUPPLIER_PAYOUT">صرف مستحقات مورد</option>
                  <option value="CAPITAL_EXPENSE">شراء أصول ومعدات</option>
                  <option value="CUSTOMER_REFUND">استرداد مرتجع عالي القيمة</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">المبلغ المطلوب اعتماده (ج.م) *</label>
                <input
                  type="number"
                  required
                  min="5001"
                  step="0.01"
                  value={form.amount}
                  onChange={e => setForm({ ...form, amount: e.target.value })}
                  placeholder="مثال: 8000"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white font-mono text-xs text-left"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">الرقم المرجعي (فاتورة / عميل / محفظة)</label>
                <input
                  type="text"
                  value={form.reference_id}
                  onChange={e => setForm({ ...form, reference_id: e.target.value })}
                  placeholder="مثال: INV-2026-0901"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">المبرر المالي لطلب الصرف *</label>
                <textarea
                  required
                  rows={3}
                  value={form.reason}
                  onChange={e => setForm({ ...form, reason: e.target.value })}
                  placeholder="بيان سبب تجاوز حد الصرف المعتاد وتفاصيل المستفيد..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white text-xs"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold shadow-lg"
                >
                  رفع الطلب للاعتماد
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ApprovalsTab;
