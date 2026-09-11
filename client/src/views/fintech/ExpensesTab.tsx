import React, { useState, useEffect } from 'react';
import { Expense, fetchFintechApi } from './types';
import { useToast } from '../../context/ToastContext';
import {
  FileSpreadsheet,
  Plus,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Image as ImageIcon,
  ExternalLink,
  Trash2,
  Check,
  X,
  Upload,
  Layers
} from 'lucide-react';

export const ExpensesTab: React.FC = () => {
  const { showToast } = useToast();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // New Expense Modal
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    category: 'OPERATIONAL',
    amount: '',
    tax_amount: '0',
    payment_method: 'CASH',
    description: '',
    branch_id: 'WH-MAIN',
    receipt_url: ''
  });

  // Receipt image preview modal
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const loadExpenses = async () => {
    setLoading(true);
    try {
      let query = '';
      const params = new URLSearchParams();
      if (filterCategory) params.append('category', filterCategory);
      if (filterStatus) params.append('status', filterStatus);
      if (params.toString()) query = `?${params.toString()}`;

      const res = await fetchFintechApi<Expense[]>(`/fintech/expenses${query}`);
      setExpenses(res);
    } catch (err: any) {
      showToast(err.message || 'فشل تحميل المصروفات', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadExpenses();
  }, [filterCategory, filterStatus]);

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(form.amount) || 0;
    if (numAmount <= 0) {
      showToast('يرجى إدخال مبلغ صحيح للمصروف', 'error');
      return;
    }

    try {
      await fetchFintechApi<any>('/fintech/expenses', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          amount: numAmount,
          tax_amount: parseFloat(form.tax_amount) || 0
        })
      });

      showToast('تم تسجيل سند المصروف بنجاح وهو بانتظار اعتماد الإدارة المالية', 'success');
      setShowModal(false);
      setForm({
        category: 'OPERATIONAL',
        amount: '',
        tax_amount: '0',
        payment_method: 'CASH',
        description: '',
        branch_id: 'WH-MAIN',
        receipt_url: ''
      });
      loadExpenses();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleApproveExpense = async (id: string) => {
    try {
      const res = await fetchFintechApi<any>(`/fintech/expenses/${id}/approve`, {
        method: 'PATCH',
        body: JSON.stringify({ approved_by: 'usr-manager' })
      });

      showToast(`تم اعتماد المصروف وترحيل قيد اليومية تلقائياً برقم #${res.journalEntryNumber}`, 'success');
      loadExpenses();
    } catch (err: any) {
      showToast(err.message || 'فشل اعتماد المصروف', 'error');
    }
  };

  const handleDeleteExpense = async (id: string) => {
    if (!window.confirm('هل أنت متأكد من حذف سند المصروف هذا؟')) return;
    try {
      await fetchFintechApi<any>(`/fintech/expenses/${id}`, { method: 'DELETE' });
      showToast('تم حذف سند المصروف بنجاح', 'success');
      loadExpenses();
    } catch (err: any) {
      showToast(err.message || 'فشل حذف المصروف', 'error');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setForm({ ...form, receipt_url: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  const totalExpenseVolume = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const pendingCount = expenses.filter(e => e.status === 'PENDING').length;
  const approvedCount = expenses.filter(e => e.status === 'APPROVED').length;

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-amber-400" />
            إدارة المصروفات التشغيلية والعهدة النقدية (Expense Management)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            تسجيل المصروفات وإرفاق الإيصالات والفواتير الضريبية، مع ترحيل تلقائي للقيود المحاسبية بدفتر اليومية فور الاعتماد.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowModal(true)}
            className="px-3.5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-lg transition"
          >
            <Plus className="w-4 h-4" />
            <span>تسجيل سند صرف جديد</span>
          </button>
          <button
            onClick={loadExpenses}
            disabled={loading}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl">
          <p className="text-xs text-slate-400">إجمالي حجم المصروفات المسجلة</p>
          <p className="text-2xl font-black text-white font-mono mt-1">
            {totalExpenseVolume.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            <span className="text-xs text-amber-400 mr-1 font-normal">ج.م</span>
          </p>
          <span className="text-[10px] text-slate-500 mt-2 block">{expenses.length} سند صرف</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl">
          <p className="text-xs text-slate-400">سندات بانتظار الاعتماد المالي</p>
          <p className="text-2xl font-black text-amber-400 font-mono mt-1">
            {pendingCount}
          </p>
          <span className="text-[10px] text-amber-400/80 mt-2 block">تتطلب مراجعة المشرف واعتماد الصرف</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl">
          <p className="text-xs text-slate-400">سندات معتمدة ومرحّلة دفترياً</p>
          <p className="text-2xl font-black text-emerald-400 font-mono mt-1">
            {approvedCount}
          </p>
          <span className="text-[10px] text-emerald-400/80 mt-2 block">تم توليد قيود اليومية العامة لها</span>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3 bg-slate-900/60 p-3 rounded-xl border border-slate-800 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-slate-400">التصنيف:</span>
          <select
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-2.5 py-1.5"
          >
            <option value="">جميع التصنيفات</option>
            <option value="OPERATIONAL">مصروفات تشغيلية عامة</option>
            <option value="RENT">إيجار المقر / الفروع</option>
            <option value="UTILITIES">كهرباء وإنترنت ومياه</option>
            <option value="SALARIES">رواتب ومكافآت</option>
            <option value="MAINTENANCE">صيانة معدات وتجهيزات</option>
            <option value="MARKETING">تسويق وإعلانات</option>
            <option value="HOSPITALITY">ضيافة ونظافة</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-slate-400">الحالة:</span>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-2.5 py-1.5"
          >
            <option value="">جميع الحالات</option>
            <option value="PENDING">بانتظار الاعتماد (PENDING)</option>
            <option value="APPROVED">معتمد ومرحّل (APPROVED)</option>
            <option value="REJECTED">مرفوض (REJECTED)</option>
          </select>
        </div>
      </div>

      {/* Expenses Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-right text-slate-300">
            <thead className="bg-slate-800/90 text-slate-400 font-semibold border-b border-slate-700">
              <tr>
                <th className="p-3">رقم السند</th>
                <th className="p-3">التصنيف</th>
                <th className="p-3">البيان والتفاصيل</th>
                <th className="p-3 text-left">المبلغ</th>
                <th className="p-3">طريقة الصرف</th>
                <th className="p-3 text-center">الإيصال</th>
                <th className="p-3 text-center">الحالة</th>
                <th className="p-3 text-center">قيد اليومية</th>
                <th className="p-3 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {expenses.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-500">
                    لا توجد سندات مصروفات مسجلة تطابق محددات البحث.
                  </td>
                </tr>
              ) : (
                expenses.map(e => (
                  <tr key={e.id} className="hover:bg-slate-800/40 transition">
                    <td className="p-3 font-mono font-bold text-amber-400">{e.expense_number}</td>
                    <td className="p-3">
                      <span className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded text-[11px] font-mono">
                        {e.category}
                      </span>
                    </td>
                    <td className="p-3">
                      <p className="font-semibold text-white">{e.description}</p>
                      <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                        {new Date(e.created_at).toLocaleDateString('ar-EG')} | فرع: {e.branch_id}
                      </p>
                    </td>
                    <td className="p-3 text-left font-mono font-black text-white text-sm">
                      {e.amount.toLocaleString()} ج.م
                    </td>
                    <td className="p-3 font-mono text-slate-300">{e.payment_method}</td>
                    <td className="p-3 text-center">
                      {e.receipt_url ? (
                        <button
                          onClick={() => setPreviewImage(e.receipt_url || null)}
                          className="p-1 text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-1"
                          title="عرض إيصال السداد المرفق"
                        >
                          <ImageIcon className="w-4 h-4" />
                          <span className="text-[10px] underline">عرض</span>
                        </button>
                      ) : (
                        <span className="text-slate-600 text-[10px]">لا يوجد</span>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      {e.status === 'APPROVED' ? (
                        <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-950/60 text-emerald-300 border border-emerald-700/80 px-2 py-0.5 rounded-full font-bold">
                          <CheckCircle2 className="w-3 h-3" /> معتمد
                        </span>
                      ) : e.status === 'REJECTED' ? (
                        <span className="inline-flex items-center gap-1 text-[10px] bg-rose-950/60 text-rose-300 border border-rose-700/80 px-2 py-0.5 rounded-full font-bold">
                          <X className="w-3 h-3" /> مرفوض
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] bg-amber-950/60 text-amber-300 border border-amber-700/80 px-2 py-0.5 rounded-full font-bold">
                          <AlertCircle className="w-3 h-3" /> بانتظار الاعتماد
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-center font-mono text-[10px]">
                      {e.journal_entry_id ? (
                        <span className="text-indigo-400 font-bold bg-indigo-950/40 px-2 py-0.5 rounded border border-indigo-800/60">
                          {e.journal_entry_id}
                        </span>
                      ) : (
                        <span className="text-slate-600">غير مرحل</span>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        {e.status === 'PENDING' && (
                          <>
                            <button
                              onClick={() => handleApproveExpense(e.id)}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[11px] font-bold flex items-center gap-1 shadow transition"
                              title="اعتماد وترحيل للقيد المحاسبي فوراً"
                            >
                              <Check className="w-3 h-3" />
                              <span>اعتماد وترحيل</span>
                            </button>
                            <button
                              onClick={() => handleDeleteExpense(e.id)}
                              className="p-1 text-slate-500 hover:text-rose-400 rounded transition"
                              title="حذف السند"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Expense Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-amber-400" />
                تسجيل سند صرف جديد (Expense Voucher)
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateExpense} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">تصنيف المصروف *</label>
                  <select
                    value={form.category}
                    onChange={e => setForm({ ...form, category: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white text-xs"
                  >
                    <option value="OPERATIONAL">مصروفات تشغيلية عامة</option>
                    <option value="RENT">إيجار المقر / الفروع</option>
                    <option value="UTILITIES">كهرباء وإنترنت ومياه</option>
                    <option value="SALARIES">رواتب ومكافآت</option>
                    <option value="MAINTENANCE">صيانة معدات وتجهيزات</option>
                    <option value="MARKETING">تسويق وإعلانات</option>
                    <option value="HOSPITALITY">ضيافة ونظافة</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">طريقة السداد *</label>
                  <select
                    value={form.payment_method}
                    onChange={e => setForm({ ...form, payment_method: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white text-xs"
                  >
                    <option value="CASH">نقداً من الخزينة الرئيسية</option>
                    <option value="VODAFONE_CASH">فودافون كاش</option>
                    <option value="INSTAPAY">إنستاباي</option>
                    <option value="BANK_TRANSFER">تحويل بنكي</option>
                    <option value="CARD">بطاقة بنكية / فيزا</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">المبلغ الصافي (ج.م) *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    step="0.01"
                    value={form.amount}
                    onChange={e => setForm({ ...form, amount: e.target.value })}
                    placeholder="مثال: 750"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white font-mono text-xs text-left"
                    dir="ltr"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">الضريبة المضافة (إن وجدت)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.tax_amount}
                    onChange={e => setForm({ ...form, tax_amount: e.target.value })}
                    placeholder="0"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white font-mono text-xs text-left"
                    dir="ltr"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">بيان وتفاصيل المصروف *</label>
                <textarea
                  required
                  rows={2}
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  placeholder="مثال: شراء أدوات لحام وقصدير لمعمل الصيانة"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white text-xs"
                />
              </div>

              {/* Receipt Attachment Upload */}
              <div className="space-y-2">
                <label className="block text-xs font-medium text-slate-400">إرفاق صورة الإيصال أو الفاتورة الضريبية</label>
                <div className="border border-dashed border-slate-700 rounded-xl p-4 text-center bg-slate-850 hover:bg-slate-800/60 transition cursor-pointer relative">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  />
                  <div className="flex flex-col items-center justify-center gap-1.5 text-slate-400">
                    <Upload className="w-6 h-6 text-amber-400" />
                    <span className="text-xs font-medium">اضغط لاختيار صورة الإيصال أو اسحبها هنا</span>
                    <span className="text-[10px] text-slate-500">PNG, JPG, JPEG حتى 5 ميجابايت</span>
                  </div>
                </div>

                {form.receipt_url && (
                  <div className="flex items-center gap-2 p-2 bg-slate-800 rounded-lg border border-slate-700">
                    <img src={form.receipt_url} alt="Receipt preview" className="w-12 h-12 object-cover rounded" />
                    <span className="text-[11px] text-emerald-400 font-medium">تم إرفاق صورة الإيصال بنجاح</span>
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, receipt_url: '' })}
                      className="mr-auto text-xs text-rose-400 hover:text-rose-300"
                    >
                      إزالة
                    </button>
                  </div>
                )}
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
                  حفظ سند الصرف
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Image Preview Modal */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 backdrop-blur-xs"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-xl max-h-[85vh] bg-slate-900 rounded-2xl overflow-hidden shadow-2xl p-2 border border-slate-800">
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute top-3 left-3 bg-slate-950/80 text-white p-1.5 rounded-full z-10 hover:bg-rose-900"
            >
              ✕
            </button>
            <img src={previewImage} alt="Receipt Full Preview" className="max-w-full max-h-[80vh] object-contain rounded-xl mx-auto" />
          </div>
        </div>
      )}
    </div>
  );
};

export default ExpensesTab;
