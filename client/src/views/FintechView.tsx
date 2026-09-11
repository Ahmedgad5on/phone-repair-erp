import React, { useState, useEffect, Suspense, lazy } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import { fetchFintechApi } from './fintech/types';
import {
  Wallet,
  BookOpen,
  TrendingUp,
  FileSpreadsheet,
  ShieldCheck,
  Scale,
  Calculator,
  CreditCard,
  MessageSquare
} from 'lucide-react';

// Lazy-loaded focused sub-tab components for high-impact bundle code splitting (R4.8)
const WalletsTab = lazy(() => import('./fintech/WalletsTab'));
const LedgerTab = lazy(() => import('./fintech/LedgerTab'));
const CashFlowTab = lazy(() => import('./fintech/CashFlowTab'));
const ExpensesTab = lazy(() => import('./fintech/ExpensesTab'));
const ApprovalsTab = lazy(() => import('./fintech/ApprovalsTab'));
const BankReconciliationTab = lazy(() => import('./fintech/BankReconciliationTab'));
const TaxWithholdingTab = lazy(() => import('./fintech/TaxWithholdingTab'));
const CustomerCreditPanel = lazy(() => import('./fintech/CustomerCreditPanel'));
const SmsMatcherTab = lazy(() => import('./fintech/SmsMatcherTab'));

const TabLoadingFallback: React.FC = () => (
  <div className="flex flex-col items-center justify-center py-24 space-y-3">
    <div className="w-8 h-8 border-3 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" />
    <span className="text-xs text-slate-400 font-medium">جاري تحميل الوحدة المالية...</span>
  </div>
);

export const FintechView: React.FC = () => {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<
    'wallets' | 'ledger' | 'cashflow' | 'expenses' | 'approvals' | 'reconcile' | 'tax' | 'credit' | 'smsMatch'
  >('wallets');

  const [pendingApprovalsCount, setPendingApprovalsCount] = useState<number>(0);

  const fetchPendingApprovals = async () => {
    try {
      const res = await fetchFintechApi<{ count: number }>('/fintech/approval-requests/pending');
      if (res && typeof res.count === 'number') {
        setPendingApprovalsCount(res.count);
      }
    } catch (e) {
      // ignore silently if endpoint not yet loaded
    }
  };

  useEffect(() => {
    fetchPendingApprovals();
    const interval = setInterval(fetchPendingApprovals, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 select-text">
      {/* View Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-wide flex items-center gap-2.5">
            <Wallet className="w-6 h-6 text-amber-400" />
            {t.fintech?.title || 'الإدارة المالية والفنتك'}
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            {t.fintech?.subtitle || 'إدارة المحافظ الإلكترونية، دفتر اليومية العامة، التدفقات النقدية والاعتمادات المالية'}
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-1 flex flex-wrap items-center gap-1 shadow-lg">
          <button
            onClick={() => setActiveTab('wallets')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 ${
              activeTab === 'wallets' ? 'bg-amber-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Wallet className="w-3.5 h-3.5" />
            <span>المحافظ</span>
          </button>

          <button
            onClick={() => setActiveTab('ledger')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 ${
              activeTab === 'ledger' ? 'bg-amber-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>دفتر اليومية</span>
          </button>

          <button
            onClick={() => setActiveTab('cashflow')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 ${
              activeTab === 'cashflow' ? 'bg-amber-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>توقعات السيولة (30 يوم)</span>
          </button>

          <button
            onClick={() => setActiveTab('expenses')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 ${
              activeTab === 'expenses' ? 'bg-amber-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>المصروفات والعهد</span>
          </button>

          <button
            onClick={() => setActiveTab('approvals')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 relative ${
              activeTab === 'approvals' ? 'bg-amber-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>الاعتمادات (&gt; 5000)</span>
            {pendingApprovalsCount > 0 && (
              <span className="bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full shadow-sm animate-pulse">
                {pendingApprovalsCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('reconcile')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 ${
              activeTab === 'reconcile' ? 'bg-amber-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Scale className="w-3.5 h-3.5" />
            <span>التسويات البنكية</span>
          </button>

          <button
            onClick={() => setActiveTab('tax')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 ${
              activeTab === 'tax' ? 'bg-amber-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Calculator className="w-3.5 h-3.5" />
            <span>ضريبة الخصم</span>
          </button>

          <button
            onClick={() => setActiveTab('credit')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 ${
              activeTab === 'credit' ? 'bg-amber-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>ائتمان العملاء</span>
          </button>

          <button
            onClick={() => setActiveTab('smsMatch')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 ${
              activeTab === 'smsMatch' ? 'bg-amber-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>مطابقة SMS</span>
          </button>
        </div>
      </div>

      {/* Lazily loaded sub-component with Suspense fallback */}
      <Suspense fallback={<TabLoadingFallback />}>
        {activeTab === 'wallets' && <WalletsTab />}
        {activeTab === 'ledger' && <LedgerTab />}
        {activeTab === 'cashflow' && <CashFlowTab />}
        {activeTab === 'expenses' && <ExpensesTab />}
        {activeTab === 'approvals' && <ApprovalsTab />}
        {activeTab === 'reconcile' && <BankReconciliationTab />}
        {activeTab === 'tax' && <TaxWithholdingTab />}
        {activeTab === 'credit' && <CustomerCreditPanel />}
        {activeTab === 'smsMatch' && <SmsMatcherTab />}
      </Suspense>
    </div>
  );
};

export default FintechView;
