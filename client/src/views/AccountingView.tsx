import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useLanguage } from '../i18n/LanguageContext';
import { useToast } from '../context/ToastContext';
import {
  BookOpen,
  Plus,
  Scale,
  TrendingUp,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Lock,
  RotateCcw,
  Calculator,
  Receipt,
  Printer
} from 'lucide-react';
import { fetchFintechApi } from './fintech/types';
import { TaxWithholdingTab } from './fintech/TaxWithholdingTab';

export const AccountingView: React.FC = () => {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'accounts' | 'journal' | 'balanceSheet' | 'incomeStatement' | 'trialBalance' | 'withholdingTax'>('accounts');
  const [accounts, setAccounts] = useState<any[]>([]);
  const [journalEntries, setJournalEntries] = useState<any[]>([]);
  const [balanceSheet, setBalanceSheet] = useState<any>(null);
  const [incomeStatement, setIncomeStatement] = useState<any>(null);
  const [trialBalance, setTrialBalance] = useState<any>(null);

  // Reversal Entry State
  const [reversalTarget, setReversalTarget] = useState<any | null>(null);
  const [reversalReason, setReversalReason] = useState('');

  // Withholding Tax State
  const [whtRules, setWhtRules] = useState<any[]>([]);
  const [whtSupplierType, setWhtSupplierType] = useState('SUPPLIER_SERVICES');
  const [whtGrossAmount, setWhtGrossAmount] = useState('10000');
  const [whtPaymentMethod, setWhtPaymentMethod] = useState('BANK_TRANSFER');
  const [whtSupplierName, setWhtSupplierName] = useState('المورد المعتمد');
  const [whtInvoiceRef, setWhtInvoiceRef] = useState('INV-ETA-001');
  const [whtVoucherResult, setWhtVoucherResult] = useState<any | null>(null);

  // New Account Modal
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [accountForm, setAccountForm] = useState({
    code: '',
    name: '',
    account_type: 'ASSET',
    currency: 'EGP'
  });

  // New Journal Entry Modal
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [entryForm, setEntryForm] = useState({
    description: '',
    lines: [
      { account_id: '', debit: 0, credit: 0, memo: '' },
      { account_id: '', debit: 0, credit: 0, memo: '' }
    ]
  });

  const loadData = async () => {
    try {
      const accs = await api.getAccounts();
      setAccounts(accs);
      const jes = await api.getJournalEntries();
      setJournalEntries(jes);
      const bs = await api.getBalanceSheet();
      setBalanceSheet(bs);
      const is = await api.getIncomeStatement();
      setIncomeStatement(is);
      const tb = await api.getTrialBalance();
      setTrialBalance(tb);
    } catch (e: any) {
      console.error(e);
      showToast(e.message || 'فشل تحميل البيانات المحاسبية', 'error');
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createAccount(accountForm);
      showToast(isAr ? 'تم إضافة الحساب الدفتري بنجاح' : 'Account created', 'success');
      setShowAccountModal(false);
      setAccountForm({ code: '', name: '', account_type: 'ASSET', currency: 'EGP' });
      loadData();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handlePostEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    const totalDebit = entryForm.lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
    const totalCredit = entryForm.lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);

    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      showToast(
        isAr
          ? `القيد غير متوازن! إجمالي المدين (${totalDebit.toLocaleString()}) يجب أن يساوي إجمالي الدائن (${totalCredit.toLocaleString()})`
          : 'Double entry unbalanced',
        'error'
      );
      return;
    }

    try {
      await api.postJournalEntry(entryForm);
      showToast(isAr ? 'تم ترحيل قيد اليومية وتحديث أرصدة دفتر الأستاذ بنجاح' : 'Journal entry posted', 'success');
      setShowEntryModal(false);
      setEntryForm({
        description: '',
        lines: [
          { account_id: '', debit: 0, credit: 0, memo: '' },
          { account_id: '', debit: 0, credit: 0, memo: '' }
        ]
      });
      loadData();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const addEntryLine = () => {
    setEntryForm({
      ...entryForm,
      lines: [...entryForm.lines, { account_id: '', debit: 0, credit: 0, memo: '' }]
    });
  };

  const updateEntryLine = (idx: number, field: string, val: any) => {
    const updated = [...entryForm.lines];
    updated[idx] = { ...updated[idx], [field]: val };
    setEntryForm({ ...entryForm, lines: updated });
  };

  const handleReverseEntry = async () => {
    if (!reversalTarget) return;
    try {
      await fetchFintechApi(`/accounting/journal-entries/${reversalTarget.id}/reverse`, {
        method: 'POST',
        body: JSON.stringify({ reason: reversalReason })
      });
      showToast(isAr ? 'تم إنشاء القيد العكسي بنجاح وتحديث أرصدة دفتر الأستاذ' : 'Reversal entry created', 'success');
      setReversalTarget(null);
      setReversalReason('');
      loadData();
    } catch (err: any) {
      showToast(err.message || 'فشل عكس قيد اليومية', 'error');
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 select-text">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-wide flex items-center gap-2.5">
            <BookOpen className="w-6 h-6 text-emerald-400" />
            {isAr ? 'موديول المحاسبة المالية والدفتر العام (General Ledger)' : 'General Ledger & Accounting'}
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            {isAr ? 'دليل الحسابات، قيود اليومية المتوازنة، ميزان المراجعة، قائمة الدخل، والميزانية العمومية الآلية.' : 'Double-entry bookkeeping, chart of accounts, balance sheet & P&L.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-1 flex items-center">
            <button
              onClick={() => setActiveTab('accounts')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                activeTab === 'accounts' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              {isAr ? 'شجرة الحسابات' : 'Chart of Accounts'}
            </button>
            <button
              onClick={() => setActiveTab('journal')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                activeTab === 'journal' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              {isAr ? 'قيود اليومية' : 'Journal Entries'}
            </button>
            <button
              onClick={() => setActiveTab('balanceSheet')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                activeTab === 'balanceSheet' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              {isAr ? 'الميزانية العمومية' : 'Balance Sheet'}
            </button>
            <button
              onClick={() => setActiveTab('incomeStatement')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                activeTab === 'incomeStatement' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              {isAr ? 'قائمة الدخل (الأرباح)' : 'Income Statement'}
            </button>
            <button
              onClick={() => setActiveTab('trialBalance')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                activeTab === 'trialBalance' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              {isAr ? 'ميزان المراجعة' : 'Trial Balance'}
            </button>
            <button
              onClick={() => setActiveTab('withholdingTax')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                activeTab === 'withholdingTax' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              {isAr ? 'ضريبة الخصم والإضافة (نموذج 41)' : 'Withholding Tax'}
            </button>
          </div>
          <button onClick={loadData} className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 1. Chart of Accounts Tab */}
      {activeTab === 'accounts' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div>
              <h3 className="font-bold text-white text-sm">دليل الحسابات المالي الموحد (Chart of Accounts)</h3>
              <p className="text-xs text-slate-400">تتبع أرصدة الأصول، الخصوم، حقوق الملكية، الإيرادات، والمصروفات بدقة تامة.</p>
            </div>
            <button
              onClick={() => setShowAccountModal(true)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-lg shadow-emerald-600/30 transition"
            >
              <Plus className="w-4 h-4" />
              {isAr ? 'إضافة حساب جديد' : 'Add Account'}
            </button>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
            <table className="w-full text-start text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 uppercase font-semibold border-b border-slate-800 text-[11px]">
                <tr>
                  <th className="px-4 py-3">كود الحساب</th>
                  <th className="px-4 py-3">اسم الحساب الدفتري</th>
                  <th className="px-4 py-3">التصنيف المحاسبي</th>
                  <th className="px-4 py-3">الرصيد الدفتري الحالي</th>
                  <th className="px-4 py-3">العملة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {accounts.map(a => (
                  <tr key={a.id} className="hover:bg-slate-800/40 transition">
                    <td className="px-4 py-3 font-mono font-bold text-emerald-400">{a.code}</td>
                    <td className="px-4 py-3 font-semibold text-white">{a.name}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                        a.account_type === 'ASSET' ? 'bg-sky-950 text-sky-300 border-sky-800' :
                        a.account_type === 'LIABILITY' ? 'bg-rose-950 text-rose-300 border-rose-800' :
                        a.account_type === 'REVENUE' ? 'bg-emerald-950 text-emerald-300 border-emerald-800' :
                        a.account_type === 'EXPENSE' ? 'bg-amber-950 text-amber-300 border-amber-800' :
                        'bg-purple-950 text-purple-300 border-purple-800'
                      }`}>
                        {a.account_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono font-bold text-white text-sm">
                      {Number(a.balance).toLocaleString()} {a.currency}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-400">{a.currency}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 2. Journal Entries Tab */}
      {activeTab === 'journal' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div>
              <h3 className="font-bold text-white text-sm">دفتر قيود اليومية العامة (General Journal Entries)</h3>
              <p className="text-xs text-slate-400">سجل إلكتروني معتمد بنظام القيد المزدوج المتوازن (Double-Entry).</p>
            </div>
            <button
              onClick={() => setShowEntryModal(true)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-lg shadow-emerald-600/30 transition"
            >
              <Plus className="w-4 h-4" />
              {isAr ? 'تسجيل قيد يومية متوازن' : 'New Journal Entry'}
            </button>
          </div>

          <div className="space-y-3">
            {journalEntries.map(e => {
              const debitSum = e.lines?.reduce((sum: number, l: any) => sum + (Number(l.debit) || 0), 0) || 0;
              return (
                <div key={e.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl space-y-3 text-xs">
                  <div className="flex flex-wrap items-center justify-between border-b border-slate-800 pb-2.5 gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-emerald-400 text-sm">#{e.entry_number}</span>
                      <span className="font-semibold text-white">{e.description}</span>
                    </div>
                    <div className="flex items-center gap-2 font-mono text-[11px] text-slate-400">
                      <span>{new Date(e.entry_date).toLocaleString('ar-EG')}</span>
                      <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                        {e.status}
                      </span>
                      {e.status === 'POSTED' && (
                        <span className="flex items-center gap-1 text-[11px] bg-slate-800 text-amber-300 px-2 py-0.5 rounded border border-amber-800/60 font-semibold" title="قيد مرحل دفترياً لا يمكن تعديله أو حذفه">
                          <Lock className="w-3 h-3 text-amber-400" />
                          {isAr ? 'محمي من التعديل' : 'Immutable'}
                        </span>
                      )}
                      {e.status === 'POSTED' && (
                        <button
                          onClick={() => {
                            setReversalTarget(e);
                            setReversalReason('');
                          }}
                          className="flex items-center gap-1 text-[11px] bg-rose-950/60 hover:bg-rose-900 text-rose-300 px-2.5 py-1 rounded border border-rose-800 transition"
                          title="عكس القيد المحاسبي"
                        >
                          <RotateCcw className="w-3 h-3" />
                          {isAr ? 'عكس القيد' : 'Reverse'}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-start text-xs text-slate-300">
                      <thead className="text-[11px] text-slate-500 border-b border-slate-800/80">
                        <tr>
                          <th className="py-1">الحساب</th>
                          <th className="py-1">مدين (Debit)</th>
                          <th className="py-1">دائن (Credit)</th>
                          <th className="py-1">البيان</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/40">
                        {e.lines?.map((l: any) => (
                          <tr key={l.id}>
                            <td className="py-1.5 font-medium text-white">
                              {l.account_code} - {l.account_name}
                            </td>
                            <td className="py-1.5 font-mono text-emerald-400 font-semibold">
                              {l.debit > 0 ? `${Number(l.debit).toLocaleString()} ج.م` : '-'}
                            </td>
                            <td className="py-1.5 font-mono text-rose-400 font-semibold">
                              {l.credit > 0 ? `${Number(l.credit).toLocaleString()} ج.م` : '-'}
                            </td>
                            <td className="py-1.5 text-slate-400 text-[11px]">{l.memo || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
            {journalEntries.length === 0 && (
              <div className="py-12 text-center text-slate-500 bg-slate-900 border border-slate-800 rounded-xl">
                لا توجد قيود يومية مسجلة بعد.
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. Balance Sheet Tab */}
      {activeTab === 'balanceSheet' && balanceSheet && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-6 text-xs">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h3 className="font-bold text-white text-base">الميزانية العمومية المباشرة (Balance Sheet)</h3>
              <p className="text-slate-400">تطبيق معادلة المحاسبة الأساسية: الأصول = الالتزامات + حقوق الملكية</p>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-bold border flex items-center gap-1.5 ${
              balanceSheet.isBalanced
                ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                : 'bg-rose-950 text-rose-300 border-rose-800'
            }`}>
              {balanceSheet.isBalanced ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
              {balanceSheet.isBalanced ? 'الميزانية متوازنة 100%' : 'تنبيه: يوجد اختلال في الميزانية'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Assets */}
            <div className="space-y-3 bg-slate-950 p-4 rounded-xl border border-slate-800">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <h4 className="font-bold text-sky-400 text-sm">الأصول (Assets)</h4>
                <strong className="font-mono text-sky-400 text-base">{balanceSheet.assets.total.toLocaleString()} ج.م</strong>
              </div>
              <div className="space-y-2">
                {balanceSheet.assets.accounts.map((a: any) => (
                  <div key={a.id} className="flex justify-between py-1 border-b border-slate-900">
                    <span className="text-slate-300">{a.name}</span>
                    <span className="font-mono font-bold text-white">{Number(a.balance).toLocaleString()} ج.م</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Liabilities & Equity */}
            <div className="space-y-4">
              <div className="space-y-3 bg-slate-950 p-4 rounded-xl border border-slate-800">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <h4 className="font-bold text-rose-400 text-sm">الخصوم والالتزامات (Liabilities)</h4>
                  <strong className="font-mono text-rose-400 text-base">{balanceSheet.liabilities.total.toLocaleString()} ج.م</strong>
                </div>
                <div className="space-y-2">
                  {balanceSheet.liabilities.accounts.map((a: any) => (
                    <div key={a.id} className="flex justify-between py-1 border-b border-slate-900">
                      <span className="text-slate-300">{a.name}</span>
                      <span className="font-mono font-bold text-white">{Number(a.balance).toLocaleString()} ج.م</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3 bg-slate-950 p-4 rounded-xl border border-slate-800">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <h4 className="font-bold text-purple-400 text-sm">حقوق الملكية (Owner Equity)</h4>
                  <strong className="font-mono text-purple-400 text-base">{balanceSheet.equity.total.toLocaleString()} ج.م</strong>
                </div>
                <div className="space-y-2">
                  {balanceSheet.equity.accounts.map((a: any) => (
                    <div key={a.id} className="flex justify-between py-1 border-b border-slate-900">
                      <span className="text-slate-300">{a.name}</span>
                      <span className="font-mono font-bold text-white">{Number(a.balance).toLocaleString()} ج.م</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. Income Statement Tab */}
      {activeTab === 'incomeStatement' && incomeStatement && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-6 text-xs max-w-3xl mx-auto">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h3 className="font-bold text-white text-base">قائمة الدخل والأرباح (Income Statement - P&L)</h3>
              <p className="text-slate-400">صافي أرباح العمليات: الإيرادات المحققة - المصروفات التشغيلية والتكلفة</p>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-bold border ${
              incomeStatement.isProfitable
                ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                : 'bg-rose-950 text-rose-300 border-rose-800'
            }`}>
              {incomeStatement.isProfitable ? 'تحقيق ربح تشغيلي' : 'خسارة تشغيلية'}
            </span>
          </div>

          <div className="space-y-4">
            {/* Revenues */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
              <div className="flex justify-between font-bold text-emerald-400 text-sm border-b border-slate-800 pb-2">
                <span>إجمالي الإيرادات (Revenues)</span>
                <span className="font-mono">{incomeStatement.revenues.total.toLocaleString()} ج.م</span>
              </div>
              {incomeStatement.revenues.accounts.map((a: any) => (
                <div key={a.id} className="flex justify-between text-slate-300 py-1">
                  <span>{a.name}</span>
                  <span className="font-mono font-bold">{Number(a.balance).toLocaleString()} ج.م</span>
                </div>
              ))}
            </div>

            {/* Expenses */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
              <div className="flex justify-between font-bold text-rose-400 text-sm border-b border-slate-800 pb-2">
                <span>إجمالي المصروفات والتكلفة (Expenses)</span>
                <span className="font-mono">{incomeStatement.expenses.total.toLocaleString()} ج.م</span>
              </div>
              {incomeStatement.expenses.accounts.map((a: any) => (
                <div key={a.id} className="flex justify-between text-slate-300 py-1">
                  <span>{a.name}</span>
                  <span className="font-mono font-bold">{Number(a.balance).toLocaleString()} ج.م</span>
                </div>
              ))}
            </div>

            {/* Net Income */}
            <div className="bg-slate-950 p-4 rounded-xl border-2 border-emerald-500/50 flex justify-between items-center text-sm">
              <span className="font-bold text-white">صافي الربح / الخسارة النهائي:</span>
              <strong className={`font-mono text-lg font-extrabold ${
                incomeStatement.netIncome >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}>
                {incomeStatement.netIncome.toLocaleString()} ج.م
              </strong>
            </div>
          </div>
        </div>
      )}

      {/* 5. Trial Balance Tab */}
      {activeTab === 'trialBalance' && trialBalance && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl text-xs">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-white text-sm">ميزان المراجعة بالأرصدة والمجاميع (Trial Balance)</h3>
              <p className="text-[11px] text-slate-400">التحقق الرياضي النهائي من تطابق كافة الحركات الدائنة والمدينة.</p>
            </div>
            <span className="font-mono font-bold text-emerald-400 text-xs">
              {trialBalance.isBalanced ? '✅ متطابق' : '❌ غير متطابق'}
            </span>
          </div>

          <table className="w-full text-start text-xs text-slate-300">
            <thead className="bg-slate-950 text-slate-400 uppercase font-semibold border-b border-slate-800 text-[11px]">
              <tr>
                <th className="px-4 py-3">الكود</th>
                <th className="px-4 py-3">اسم الحساب</th>
                <th className="px-4 py-3">التصنيف</th>
                <th className="px-4 py-3 text-end">إجمالي المدين</th>
                <th className="px-4 py-3 text-end">إجمالي الدائن</th>
                <th className="px-4 py-3 text-end">الرصيد الدفتري</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {trialBalance.accounts.map((a: any) => (
                <tr key={a.id} className="hover:bg-slate-800/40">
                  <td className="px-4 py-2 font-mono text-emerald-400">{a.code}</td>
                  <td className="px-4 py-2 font-medium text-white">{a.name}</td>
                  <td className="px-4 py-2 text-[11px] text-slate-400">{a.account_type}</td>
                  <td className="px-4 py-2 font-mono text-end text-emerald-400">{Number(a.total_debit).toLocaleString()}</td>
                  <td className="px-4 py-2 font-mono text-end text-rose-400">{Number(a.total_credit).toLocaleString()}</td>
                  <td className="px-4 py-2 font-mono font-bold text-end text-white">{Number(a.current_balance).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-950 font-bold text-white border-t-2 border-slate-700">
              <tr>
                <td colSpan={3} className="px-4 py-3">الإجمالي العام لميزان المراجعة:</td>
                <td className="px-4 py-3 font-mono text-end text-emerald-400">{trialBalance.grandDebit.toLocaleString()} ج.م</td>
                <td className="px-4 py-3 font-mono text-end text-rose-400">{trialBalance.grandCredit.toLocaleString()} ج.م</td>
                <td className="px-4 py-3 text-end font-mono text-slate-400">-</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* 6. Withholding Tax Tab */}
      {activeTab === 'withholdingTax' && (
        <TaxWithholdingTab />
      )}

      {/* New Account Modal */}
      {showAccountModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
          <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-xl p-6 text-xs space-y-4">
            <h3 className="font-bold text-white text-base">إضافة حساب دفتري جديد إلى شجرة الحسابات</h3>
            <form onSubmit={handleCreateAccount} className="space-y-3">
              <div>
                <label className="block text-slate-300 mb-1">كود الحساب (رقمي فريد) *</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: 1050 أو 5040"
                  value={accountForm.code}
                  onChange={e => setAccountForm({ ...accountForm, code: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1">اسم الحساب الدفتري *</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: نقدية فرع العتبة"
                  value={accountForm.name}
                  onChange={e => setAccountForm({ ...accountForm, name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-white"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1">نوع الحساب *</label>
                <select
                  value={accountForm.account_type}
                  onChange={e => setAccountForm({ ...accountForm, account_type: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-white"
                >
                  <option value="ASSET">أصول (Asset)</option>
                  <option value="LIABILITY">خصوم والتزامات (Liability)</option>
                  <option value="EQUITY">حقوق ملكية ورأس مال (Equity)</option>
                  <option value="REVENUE">إيرادات ومبيعات (Revenue)</option>
                  <option value="EXPENSE">مصروفات وتكلفة (Expense)</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowAccountModal(false)} className="px-3 py-2 text-slate-400">
                  إلغاء
                </button>
                <button type="submit" className="px-4 py-2 bg-emerald-600 text-white rounded font-semibold">
                  حفظ الحساب
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Journal Entry Modal */}
      {showEntryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-xl p-6 text-xs space-y-4">
            <h3 className="font-bold text-white text-base">تسجيل قيد يومية متوازن جديد (Double-Entry)</h3>
            <form onSubmit={handlePostEntry} className="space-y-4">
              <div>
                <label className="block text-slate-300 mb-1">البيان العام للقيد *</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: سداد مصروفات تشغيل أو تحويل بين الصناديق"
                  value={entryForm.description}
                  onChange={e => setEntryForm({ ...entryForm, description: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-white"
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-slate-300">أطراف القيد المحاسبي:</span>
                  <button type="button" onClick={addEntryLine} className="text-emerald-400 font-semibold text-[11px]">
                    + إضافة طرف آخر
                  </button>
                </div>

                <div className="space-y-2 max-h-56 overflow-y-auto pe-1">
                  {entryForm.lines.map((line, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-slate-950 p-2 rounded-lg border border-slate-800">
                      <select
                        required
                        value={line.account_id}
                        onChange={e => updateEntryLine(idx, 'account_id', e.target.value)}
                        className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-xs"
                      >
                        <option value="">-- اختر الحساب --</option>
                        {accounts.map(a => (
                          <option key={a.id} value={a.id}>{a.code} - {a.name} ({a.account_type})</option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="مدين"
                        value={line.debit || ''}
                        onChange={e => updateEntryLine(idx, 'debit', parseFloat(e.target.value) || 0)}
                        className="w-24 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-emerald-400 font-mono text-xs text-end"
                      />
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="دائن"
                        value={line.credit || ''}
                        onChange={e => updateEntryLine(idx, 'credit', parseFloat(e.target.value) || 0)}
                        className="w-24 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-rose-400 font-mono text-xs text-end"
                      />
                      <input
                        type="text"
                        placeholder="شرح"
                        value={line.memo || ''}
                        onChange={e => updateEntryLine(idx, 'memo', e.target.value)}
                        className="w-28 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-300 text-xs"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-between items-center p-3 bg-slate-950 rounded border border-slate-800 text-xs">
                <span>إجمالي المدين: <strong className="text-emerald-400 font-mono">{entryForm.lines.reduce((s, l) => s + (Number(l.debit) || 0), 0).toLocaleString()} ج.م</strong></span>
                <span>إجمالي الدائن: <strong className="text-rose-400 font-mono">{entryForm.lines.reduce((s, l) => s + (Number(l.credit) || 0), 0).toLocaleString()} ج.م</strong></span>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowEntryModal(false)} className="px-3 py-2 text-slate-400">
                  إلغاء
                </button>
                <button type="submit" className="px-4 py-2 bg-emerald-600 text-white rounded font-semibold">
                  ترحيل القيد
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reversal Confirmation Modal */}
      {reversalTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
          <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-xl p-6 text-xs space-y-4 shadow-2xl">
            <div className="flex items-center gap-2 text-rose-400 font-bold text-sm">
              <RotateCcw className="w-4 h-4" />
              <span>{isAr ? `عكس قيد اليومية #${reversalTarget.entry_number}` : `Reverse Journal Entry #${reversalTarget.entry_number}`}</span>
            </div>
            <div className="p-3 bg-amber-950/40 border border-amber-800/50 rounded text-amber-200 text-xs">
              {isAr
                ? 'وفقاً لقواعد المحاسبة المالية المعتمدة، لا يمكن تعديل أو حذف القيود المرحلة (POSTED). بدلاً من ذلك، سيتم إنشاء قيد عكسي جديد يقلب المدين دائناً والدائن مديناً.'
                : 'Posted journal entries are immutable. This action will create an offsetting reversal entry swapping debits and credits.'}
            </div>
            <div>
              <label className="block text-slate-300 mb-1">{isAr ? 'سبب العكس المحاسبي *' : 'Reversal Reason *'}</label>
              <textarea
                required
                rows={3}
                placeholder={isAr ? 'مثال: تصحيح خطأ في التوجيه المحاسبي أو إلغاء المعاملة الأصلية' : 'Reason for entry reversal'}
                value={reversalReason}
                onChange={e => setReversalReason(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-white"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setReversalTarget(null)}
                className="px-3 py-2 text-slate-400 hover:text-white"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleReverseEntry}
                disabled={!reversalReason.trim()}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white rounded font-semibold flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                {isAr ? 'تأكيد إنشاء القيد العكسي' : 'Confirm Reversal'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
