import React, { useState, useEffect } from 'react';
import { BankStatementEntry, fetchFintechApi } from './types';
import { useToast } from '../../context/ToastContext';
import {
  FileSpreadsheet,
  Upload,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Scale,
  DollarSign,
  ArrowDownUp,
  FileCheck,
  Search
} from 'lucide-react';

export const BankReconciliationTab: React.FC = () => {
  const { showToast } = useToast();
  const [activeSubTab, setActiveSubTab] = useState<'bankCsv' | 'dailyDrawer'>('bankCsv');

  // Bank CSV State
  const [csvContent, setCsvContent] = useState(
    `Date,Description,Amount,Reference\n2026-09-10,Vodafone Cash Bulk Settlement,2500,TX-VF-001\n2026-09-10,InstaPay P2P Inward Transfer,500,IP-99201\n2026-09-09,POS Terminal Settlement,1800,POS-8812\n2026-09-08,Unrecorded Bank Maintenance Fee,45,FEE-001`
  );
  const [entries, setEntries] = useState<BankStatementEntry[]>([]);
  const [reconSummary, setReconSummary] = useState<any>(null);
  const [importing, setImporting] = useState(false);

  // Daily Drawer Reconciliation State
  const [physicalCashCount, setPhysicalCashCount] = useState('');
  const [drawerNotes, setDrawerNotes] = useState('');
  const [dailyReconReport, setDailyReconReport] = useState<any>(null);
  const [reconcilingDrawer, setReconcilingDrawer] = useState(false);

  const loadStatus = async () => {
    try {
      const res = await fetchFintechApi<any>('/fintech/bank/reconciliation-status');
      setReconSummary(res);
      if (res.entries) setEntries(res.entries);
    } catch (err: any) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const handleImportCsv = async () => {
    if (!csvContent.trim()) {
      showToast('يرجى لصق أو رفع بيانات ملف CSV', 'warning');
      return;
    }

    setImporting(true);
    try {
      const res = await fetchFintechApi<any>('/fintech/bank/import-csv', {
        method: 'POST',
        body: JSON.stringify({ csv_content: csvContent })
      });

      showToast(`تم استيراد ومطابقة ${res.totalImported} حركة بنكية بنسبة تطابق ${res.matchPercentage}%`, 'success');
      loadStatus();
    } catch (err: any) {
      showToast(err.message || 'فشل استيراد ومطابقة كشف الحساب', 'error');
    } finally {
      setImporting(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        setCsvContent(text);
      };
      reader.readAsText(file);
    }
  };

  const handleDailyDrawerReconcile = async (e: React.FormEvent) => {
    e.preventDefault();
    setReconcilingDrawer(true);
    try {
      const res = await fetchFintechApi<any>('/fintech/reconcile-daily', {
        method: 'POST',
        body: JSON.stringify({
          physical_cash_count: parseFloat(physicalCashCount) || 0,
          notes: drawerNotes
        })
      });
      setDailyReconReport(res);
      showToast('تمت مطابقة رصيد الدرج مع سجل العمليات بنجاح', 'success');
    } catch (err: any) {
      showToast(err.message || 'فشل تنفيذ المطابقة اليومية', 'error');
    } finally {
      setReconcilingDrawer(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Sub-tabs header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
            <Scale className="w-4 h-4 text-amber-400" />
            التسويات والمطابقات المصرفية (Bank & Drawer Reconciliation)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            مطابقة كشوف الحسابات البنكية ومحافظ الهاتف آلياً بهامش سماحية (±1 يوم)، ومطابقة رصيد الدرج الفعلي.
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-1 flex items-center text-xs">
          <button
            onClick={() => setActiveSubTab('bankCsv')}
            className={`px-3 py-1.5 rounded-md font-medium transition flex items-center gap-1.5 ${
              activeSubTab === 'bankCsv' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>مطابقة كشف الحساب البنكي (CSV)</span>
          </button>
          <button
            onClick={() => setActiveSubTab('dailyDrawer')}
            className={`px-3 py-1.5 rounded-md font-medium transition flex items-center gap-1.5 ${
              activeSubTab === 'dailyDrawer' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            <DollarSign className="w-3.5 h-3.5" />
            <span>مطابقة الخزينة والدرج اليومي</span>
          </button>
        </div>
      </div>

      {activeSubTab === 'bankCsv' ? (
        <div className="space-y-6">
          {/* Summary KPI Cards */}
          {reconSummary && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl">
                <p className="text-xs text-slate-400">إجمالي الحركات المستوردة</p>
                <p className="text-2xl font-black text-white font-mono mt-1">
                  {reconSummary.totalEntries}
                </p>
                <span className="text-[10px] text-slate-500 mt-2 block">سجلات كشوف الحسابات</span>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl">
                <p className="text-xs text-slate-400">حركات مطابقة بنجاح (Matched)</p>
                <p className="text-2xl font-black text-emerald-400 font-mono mt-1">
                  {reconSummary.matchedCount}
                </p>
                <span className="text-[10px] text-emerald-400/80 mt-2 block font-mono">
                  بقيمة: {reconSummary.matchedVolume?.toLocaleString()} ج.م
                </span>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl">
                <p className="text-xs text-slate-400">حركات غير مطابقة (Unmatched)</p>
                <p className="text-2xl font-black text-amber-400 font-mono mt-1">
                  {reconSummary.unmatchedCount}
                </p>
                <span className="text-[10px] text-amber-400/80 mt-2 block font-mono">
                  بقيمة: {reconSummary.unmatchedVolume?.toLocaleString()} ج.م
                </span>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl">
                <p className="text-xs text-slate-400">نسبة التطابق الإجمالية</p>
                <p className="text-2xl font-black text-indigo-400 font-mono mt-1">
                  {reconSummary.matchRate || 0}%
                </p>
                <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden mt-3">
                  <div
                    className="h-full bg-indigo-500 transition-all duration-300"
                    style={{ width: `${Math.min(reconSummary.matchRate || 0, 100)}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Import CSV Form & Paste */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-white flex items-center gap-2">
                <Upload className="w-4 h-4 text-amber-400" />
                استيراد وتدقيق كشف الحساب المصرفي (Bank Statement CSV)
              </h3>
              <label className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium cursor-pointer flex items-center gap-1.5 transition">
                <Upload className="w-3.5 h-3.5" />
                <span>اختيار ملف .csv</span>
                <input type="file" accept=".csv,text/csv" onChange={handleFileUpload} className="hidden" />
              </label>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              يقوم المحرك بمطابقة العمليات تلقائياً بمقارنة مبالغ التحويلات وتاريخ التنفيذ بهامش سماحية (±1 يوم) لاستيعاب فترات التسوية المصرفية وعطلات البنوك.
            </p>

            <textarea
              rows={4}
              value={csvContent}
              onChange={e => setCsvContent(e.target.value)}
              placeholder="Date,Description,Amount,Reference..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs font-mono text-emerald-400 leading-relaxed outline-hidden focus:border-amber-500"
              dir="ltr"
            />

            <div className="flex justify-end">
              <button
                onClick={handleImportCsv}
                disabled={importing}
                className="px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold flex items-center gap-2 shadow-lg transition"
              >
                <FileCheck className="w-4 h-4" />
                <span>{importing ? 'جاري الفحص والمطابقة...' : 'استيراد ومطابقة كشف الحساب'}</span>
              </button>
            </div>
          </div>

          {/* Reconciled Entries Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300">سجل حركات كشف الحساب وتطابقها ({entries.length})</span>
              <button
                onClick={loadStatus}
                className="text-xs text-slate-400 hover:text-white flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" /> تحديث السجل
              </button>
            </div>

            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-xs text-right text-slate-300">
                <thead className="bg-slate-800/90 text-slate-400 font-semibold sticky top-0">
                  <tr>
                    <th className="p-3">تاريخ الحركة</th>
                    <th className="p-3">البيان في كشف البنك</th>
                    <th className="p-3 text-left">المبلغ</th>
                    <th className="p-3 font-mono">المرجع</th>
                    <th className="p-3 text-center">حالة المطابقة</th>
                    <th className="p-3 font-mono text-[10px]">كود معاملة النظام المرتبطة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {entries.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-500">
                        لم يتم استيراد حركات بنكية بعد.
                      </td>
                    </tr>
                  ) : (
                    entries.map(e => (
                      <tr key={e.id} className="hover:bg-slate-800/40 transition font-mono">
                        <td className="p-3 text-slate-300">{e.statement_date}</td>
                        <td className="p-3 font-sans font-medium text-white">{e.description}</td>
                        <td className="p-3 text-left font-black text-white">{e.amount.toLocaleString()} ج.م</td>
                        <td className="p-3 text-slate-400 text-[11px]">{e.reference || '-'}</td>
                        <td className="p-3 text-center">
                          {e.match_status === 'MATCHED' ? (
                            <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-950/60 text-emerald-300 border border-emerald-700/80 px-2 py-0.5 rounded-full font-bold">
                              <CheckCircle2 className="w-3 h-3" /> متطابقة
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] bg-amber-950/60 text-amber-300 border border-amber-700/80 px-2 py-0.5 rounded-full font-bold">
                              <AlertCircle className="w-3 h-3" /> غير مسجلة بالنظام
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-slate-400 text-[10px]">
                          {e.matched_transaction_id || '-'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* Daily Drawer Reconciliation SubTab */
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-6">
          <form onSubmit={handleDailyDrawerReconcile} className="space-y-4 max-w-xl">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                العد الفعلي للنقدية في الدرج والخزينة (ج.م) *
              </label>
              <input
                type="number"
                required
                step="0.01"
                value={physicalCashCount}
                onChange={e => setPhysicalCashCount(e.target.value)}
                placeholder="أدخل إجمالي النقدية المحسوبة في الدرج..."
                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-white font-mono text-base focus:border-amber-500 outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">ملاحظات الجرد والتسوية</label>
              <textarea
                rows={3}
                value={drawerNotes}
                onChange={e => setDrawerNotes(e.target.value)}
                placeholder="أي ملاحظات حول الفروقات أو العجز أو الفائض..."
                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white text-xs"
              />
            </div>

            <button
              type="submit"
              disabled={reconcilingDrawer}
              className="px-6 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold shadow-lg transition"
            >
              {reconcilingDrawer ? 'جاري الحساب...' : 'حساب ومطابقة رصيد الدرج'}
            </button>
          </form>

          {dailyReconReport && (
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-4 text-xs">
              <h3 className="font-bold text-white text-sm flex items-center justify-between border-b border-slate-800 pb-3">
                <span>تقرير مطابقة الخزينة والوردية اليومية</span>
                <span className={`px-2.5 py-1 rounded-full text-xs font-mono font-bold ${
                  dailyReconReport.drawer?.status === 'BALANCED'
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                    : 'bg-rose-950 text-rose-300 border border-rose-700'
                }`}>
                  {dailyReconReport.drawer?.status}
                </span>
              </h3>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 font-mono">
                <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                  <span className="text-slate-500 block text-[10px]">الرصيد الافتتاحي:</span>
                  <span className="text-white font-bold">{dailyReconReport.drawer?.openingCash?.toLocaleString()} ج.م</span>
                </div>
                <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                  <span className="text-slate-500 block text-[10px]">مبيعات الكاش:</span>
                  <span className="text-emerald-400 font-bold">+{dailyReconReport.drawer?.salesCash?.toLocaleString()} ج.م</span>
                </div>
                <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                  <span className="text-slate-500 block text-[10px]">الرصيد الدفتري المتوقع:</span>
                  <span className="text-amber-400 font-bold">{dailyReconReport.drawer?.expectedDrawerCash?.toLocaleString()} ج.م</span>
                </div>
                <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                  <span className="text-slate-500 block text-[10px]">فرق المطابقة (عجز/فائض):</span>
                  <span className={`font-black ${dailyReconReport.drawer?.cashDifference === 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {dailyReconReport.drawer?.cashDifference?.toLocaleString()} ج.م
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default BankReconciliationTab;
