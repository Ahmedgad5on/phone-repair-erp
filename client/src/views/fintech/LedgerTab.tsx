import React, { useState, useEffect } from 'react';
import { fetchFintechApi } from './types';
import { useToast } from '../../context/ToastContext';
import {
  BookOpen,
  Lock,
  RotateCcw,
  RefreshCw,
  Plus,
  Scale,
  CheckCircle2,
  AlertCircle,
  FileText
} from 'lucide-react';

export const LedgerTab: React.FC = () => {
  const { showToast } = useToast();
  const [entries, setEntries] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // New Journal Entry Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newEntryForm, setNewEntryForm] = useState({
    description: '',
    reference_type: 'MANUAL',
    lines: [
      { account_id: '', debit: '', credit: '', memo: '' },
      { account_id: '', debit: '', credit: '', memo: '' }
    ]
  });

  // Reversal Entry Modal
  const [reversalTarget, setReversalTarget] = useState<any | null>(null);
  const [reversalReason, setReversalReason] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [jes, accs] = await Promise.all([
        fetchFintechApi<any[]>('/accounting/journal-entries'),
        fetchFintechApi<any[]>('/accounting/accounts')
      ]);
      setEntries(jes);
      setAccounts(accs);
    } catch (err: any) {
      showToast(err.message || 'فشل تحميل قيود اليومية', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAddLine = () => {
    setNewEntryForm({
      ...newEntryForm,
      lines: [...newEntryForm.lines, { account_id: '', debit: '', credit: '', memo: '' }]
    });
  };

  const handleLineChange = (index: number, field: string, val: any) => {
    const updated = [...newEntryForm.lines];
    updated[index] = { ...updated[index], [field]: val };
    setNewEntryForm({ ...newEntryForm, lines: updated });
  };

  const calculateTotals = () => {
    const totalDebit = newEntryForm.lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
    const totalCredit = newEntryForm.lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
    const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;
    return { totalDebit, totalCredit, isBalanced };
  };

  const handlePostEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    const { totalDebit, totalCredit, isBalanced } = calculateTotals();

    if (!isBalanced) {
      showToast(`القيد غير متوازن! إجمالي المدين (${totalDebit.toFixed(2)}) لا يساوي إجمالي الدائن (${totalCredit.toFixed(2)})`, 'error');
      return;
    }

    try {
      await fetchFintechApi<any>('/accounting/journal-entries', {
        method: 'POST',
        body: JSON.stringify({
          description: newEntryForm.description,
          reference_type: newEntryForm.reference_type,
          lines: newEntryForm.lines.map(l => ({
            account_id: l.account_id,
            debit: Number(l.debit) || 0,
            credit: Number(l.credit) || 0,
            memo: l.memo
          }))
        })
      });

      showToast('تم ترحيل قيد اليومية وتحديث أرصدة دفتر الأستاذ بنجاح', 'success');
      setShowCreateModal(false);
      setNewEntryForm({
        description: '',
        reference_type: 'MANUAL',
        lines: [
          { account_id: '', debit: '', credit: '', memo: '' },
          { account_id: '', debit: '', credit: '', memo: '' }
        ]
      });
      loadData();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleExecuteReversal = async () => {
    if (!reversalTarget) return;

    try {
      const res = await fetchFintechApi<any>(`/accounting/journal-entries/${reversalTarget.id}/reverse`, {
        method: 'POST',
        body: JSON.stringify({
          reason: reversalReason || 'عكس تصحيحي لقيد مرحل مسبقاً',
          user_role: 'SuperAdmin'
        })
      });

      showToast(`تم إنشاء قيد العكس المحاسبي بنجاح (#${res.reversalEntryNumber})`, 'success');
      setReversalTarget(null);
      setReversalReason('');
      loadData();
    } catch (err: any) {
      showToast(err.message || 'فشل عكس القيد', 'error');
    }
  };

  const { totalDebit, totalCredit, isBalanced } = calculateTotals();

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-amber-400" />
            دفتر اليومية العامة والقيود المرحّلة (General Ledger)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            تطبيق مبدأ القيد المزدوج الإلزامي مع إغلاق أمني صارم يمنع تعديل أو حذف القيود المرحّلة (POSTED) إلا عبر قيود العكس.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-3.5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-lg transition"
          >
            <Plus className="w-4 h-4" />
            <span>إنشاء قيد يومية جديد</span>
          </button>
          <button
            onClick={loadData}
            disabled={loading}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Entries Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <span className="text-xs font-bold text-slate-300">القيود المسجلة ({entries.length})</span>
          <span className="text-[11px] text-emerald-400 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            التوازن المحاسبي مفعل بنسبة 100% (SUM Debits === SUM Credits)
          </span>
        </div>

        <div className="divide-y divide-slate-800/80">
          {entries.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">لا توجد قيود مسجلة بعد.</div>
          ) : (
            entries.map(entry => (
              <div key={entry.id} className="p-4 hover:bg-slate-800/30 transition space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs font-bold text-amber-400 bg-amber-950/60 border border-amber-800/80 px-2.5 py-1 rounded-md">
                      #{entry.entry_number}
                    </span>
                    <div>
                      <h4 className="text-xs font-bold text-white">{entry.description}</h4>
                      <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                        النوع: {entry.reference_type} {entry.reference_id ? `| مرجع: ${entry.reference_id}` : ''} | أنشئ بواسطة: {entry.creator_name || 'Admin'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {entry.status === 'POSTED' ? (
                      <span className="inline-flex items-center gap-1 text-[10px] bg-indigo-950/60 text-indigo-300 border border-indigo-700/80 px-2.5 py-1 rounded-full font-bold" title="قيد محصن ضد التعديل أو الحذف">
                        <Lock className="w-3 h-3 text-indigo-400" />
                        <span>مرحّل نهائي (POSTED)</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] bg-slate-800 text-slate-300 px-2.5 py-1 rounded-full">
                        مسودة
                      </span>
                    )}

                    {entry.status === 'POSTED' && entry.reference_type !== 'REVERSAL' && (
                      <button
                        onClick={() => setReversalTarget(entry)}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-rose-900/60 text-slate-300 hover:text-rose-200 border border-slate-700 hover:border-rose-700 rounded-lg text-[11px] font-medium flex items-center gap-1 transition"
                        title="عكس القيد المحاسبي بأمر المدير المالي"
                      >
                        <RotateCcw className="w-3 h-3 text-rose-400" />
                        <span>عكس القيد</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Ledger Lines Sub-table */}
                {entry.lines && entry.lines.length > 0 && (
                  <div className="bg-slate-950/60 rounded-lg p-2.5 border border-slate-800/60 overflow-x-auto">
                    <table className="w-full text-[11px] text-right">
                      <thead>
                        <tr className="text-slate-500 border-b border-slate-800 pb-1">
                          <th className="p-1">كود الحساب</th>
                          <th className="p-1">اسم الحساب</th>
                          <th className="p-1">البيان / Memo</th>
                          <th className="p-1 text-left">مدين (Debit)</th>
                          <th className="p-1 text-left">دائن (Credit)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-850">
                        {entry.lines.map((line: any) => (
                          <tr key={line.id} className="text-slate-300">
                            <td className="p-1 font-mono text-amber-400">{line.account_code}</td>
                            <td className="p-1">{line.account_name}</td>
                            <td className="p-1 text-slate-400">{line.memo || '-'}</td>
                            <td className="p-1 text-left font-mono font-bold text-emerald-400">
                              {Number(line.debit) > 0 ? Number(line.debit).toLocaleString() : '-'}
                            </td>
                            <td className="p-1 text-left font-mono font-bold text-rose-400">
                              {Number(line.credit) > 0 ? Number(line.credit).toLocaleString() : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Create Journal Entry Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-amber-400" />
                إنشاء قيد يومية متوازن (Double-Entry Journal)
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handlePostEntry} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">بيان القيد *</label>
                <input
                  type="text"
                  required
                  value={newEntryForm.description}
                  onChange={e => setNewEntryForm({ ...newEntryForm, description: e.target.value })}
                  placeholder="مثال: إثبات سداد مصروفات نقدية من الخزينة الرئيسية"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white text-xs"
                />
              </div>

              {/* Lines Input */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300">أطراف القيد (المدين والدائن)</span>
                  <button
                    type="button"
                    onClick={handleAddLine}
                    className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>إضافة طرف</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {newEntryForm.lines.map((line, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 bg-slate-850 p-2 rounded-lg border border-slate-800">
                      <div className="col-span-5">
                        <select
                          required
                          value={line.account_id}
                          onChange={e => handleLineChange(idx, 'account_id', e.target.value)}
                          className="w-full bg-slate-800 border border-slate-700 rounded-md p-1.5 text-xs text-white"
                        >
                          <option value="">-- اختر الحساب --</option>
                          {accounts.map(a => (
                            <option key={a.id} value={a.id}>
                              {a.code} - {a.name} ({a.account_type})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="col-span-2">
                        <input
                          type="number"
                          step="0.01"
                          placeholder="مدين"
                          value={line.debit}
                          onChange={e => handleLineChange(idx, 'debit', e.target.value)}
                          className="w-full bg-slate-800 border border-slate-700 rounded-md p-1.5 text-xs text-emerald-400 font-mono text-left"
                          dir="ltr"
                        />
                      </div>

                      <div className="col-span-2">
                        <input
                          type="number"
                          step="0.01"
                          placeholder="دائن"
                          value={line.credit}
                          onChange={e => handleLineChange(idx, 'credit', e.target.value)}
                          className="w-full bg-slate-800 border border-slate-700 rounded-md p-1.5 text-xs text-rose-400 font-mono text-left"
                          dir="ltr"
                        />
                      </div>

                      <div className="col-span-3">
                        <input
                          type="text"
                          placeholder="ملاحظات"
                          value={line.memo}
                          onChange={e => handleLineChange(idx, 'memo', e.target.value)}
                          className="w-full bg-slate-800 border border-slate-700 rounded-md p-1.5 text-xs text-slate-300"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Balance Audit Footer */}
              <div className={`p-3 rounded-xl border flex items-center justify-between text-xs font-mono ${
                isBalanced ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300' : 'bg-rose-950/40 border-rose-800 text-rose-300'
              }`}>
                <div className="flex items-center gap-2">
                  <Scale className="w-4 h-4" />
                  <span>إجمالي المدين: {totalDebit.toFixed(2)} ج.م</span>
                  <span>|</span>
                  <span>إجمالي الدائن: {totalCredit.toFixed(2)} ج.م</span>
                </div>
                <div>
                  {isBalanced ? (
                    <span className="font-bold">✅ القيد متوازن تماماً</span>
                  ) : (
                    <span className="font-bold">❌ فرق عدم توازن: {Math.abs(totalDebit - totalCredit).toFixed(2)} ج.م</span>
                  )}
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={!isBalanced}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold shadow-lg"
                >
                  ترحيل القيد رسمياً
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reversal Confirmation Modal */}
      {reversalTarget && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-rose-800/80 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <RotateCcw className="w-5 h-5 text-rose-400" />
                عكس قيد محاسبي #{reversalTarget.entry_number}
              </h3>
              <button
                onClick={() => setReversalTarget(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              وفقاً للقواعد المحاسبية الصارمة، لا يمكن حذف القيد المرحّل رقم <strong className="text-white">#{reversalTarget.entry_number}</strong>.
              سيقوم النظام بإنشاء قيد عكسي تلقائي تنعكس فيه حسابات المدين والدائن لاستعادة الأرصدة الأصلية بدقة.
            </p>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">سبب العكس المحاسبي *</label>
              <textarea
                required
                rows={3}
                value={reversalReason}
                onChange={e => setReversalReason(e.target.value)}
                placeholder="مثال: إلغاء فاتورة مرتجعة / خطأ في تسجيل الطرف الدائن"
                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white text-xs"
              />
            </div>

            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setReversalTarget(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs"
              >
                تراجع
              </button>
              <button
                onClick={handleExecuteReversal}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold shadow-lg"
              >
                تأكيد إنشاء قيد العكس
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LedgerTab;
