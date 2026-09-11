import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useLanguage } from '../i18n/LanguageContext';
import { useToast } from '../context/ToastContext';
import {
  DollarSign, Wrench, AlertTriangle, Package, Wallet,
  ShieldCheck, Download, RefreshCw, HardDrive, ArrowUpRight
} from 'lucide-react';

export const DashboardView: React.FC = () => {
  const { language } = useLanguage();
  const { showToast } = useToast();
  const isAr = language === 'ar';

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [backups, setBackups] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [isBackingUp, setIsBackingUp] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [dash, bList, logs] = await Promise.all([
        api.getDashboard(),
        api.getBackups().catch(() => []),
        api.getAuditLogs(10).catch(() => [])
      ]);
      setData(dash);
      setBackups(bList);
      setAuditLogs(logs);
    } catch (err: any) {
      showToast(err.message || 'Error loading dashboard', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateBackup = async () => {
    setIsBackingUp(true);
    try {
      const res = await api.createBackup('Dashboard UI');
      showToast(
        isAr ? `تم إنشاء النسخة الاحتياطية بنجاح (${res.backup.filename})` : `Backup created: ${res.backup.filename}`,
        'success'
      );
      loadData();
    } catch (err: any) {
      showToast(err.message || 'Backup failed', 'error');
    } finally {
      setIsBackingUp(false);
    }
  };

  if (loading || !data) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="flex items-center gap-3 text-slate-400 animate-pulse">
          <RefreshCw className="w-6 h-6 animate-spin" />
          <span>{isAr ? 'جاري تحميل مؤشرات الأداء...' : 'Loading KPIs...'}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight">
            {isAr ? 'لوحة القيادة والتحليلات الحية' : 'Executive Operations Dashboard'}
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {isAr ? 'مؤشرات الأداء اللحظية، سلامة البيانات وسجل تدقيق العمليات' : 'Live KPIs, database integrity & operation audit log'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 transition-colors"
            title={isAr ? 'تحديث البيانات' : 'Refresh Data'}
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={handleCreateBackup}
            disabled={isBackingUp}
            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 text-white text-xs font-semibold rounded-xl flex items-center gap-2 shadow-lg shadow-indigo-600/30 transition-all cursor-pointer"
          >
            <HardDrive className="w-4 h-4" />
            {isBackingUp
              ? (isAr ? 'جاري النسخ...' : 'Backing up...')
              : (isAr ? 'نسخ احتياطي فوري' : 'Instant Backup')}
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Today's Sales */}
        <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-900/90 border border-slate-800 shadow-xl relative overflow-hidden group">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-xs font-semibold text-slate-400 block mb-1">
                {isAr ? 'مبيعات اليوم' : "Today's Revenue"}
              </span>
              <h2 className="text-2xl font-black text-white font-mono">
                {data.todaySales.revenue.toLocaleString()} <span className="text-xs font-normal text-emerald-400">EGP</span>
              </h2>
              <span className="text-[11px] text-slate-500 mt-1 block">
                {data.todaySales.count} {isAr ? 'عملية بيع مكتملة' : 'completed orders'}
              </span>
            </div>
            <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Repair Lab Workload */}
        <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-900/90 border border-slate-800 shadow-xl relative overflow-hidden group">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-xs font-semibold text-slate-400 block mb-1">
                {isAr ? 'أجهزة في الصيانة' : 'Active Repairs'}
              </span>
              <h2 className="text-2xl font-black text-white font-mono">
                {data.ticketsByStatus.reduce((acc: number, cur: any) => cur.status !== 'DELIVERED' ? acc + cur.count : acc, 0)}
              </h2>
              {data.slaBreaches > 0 ? (
                <span className="text-[11px] text-rose-400 font-semibold mt-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  {data.slaBreaches} {isAr ? 'تذكرة تجاوزت وقت الـ SLA!' : 'SLA Breaches!'}
                </span>
              ) : (
                <span className="text-[11px] text-emerald-400 mt-1 block">
                  {isAr ? 'جميع التذاكر ضمن موعد الـ SLA' : 'All tickets on track'}
                </span>
              )}
            </div>
            <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20">
              <Wrench className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Low Stock & Missing Demand */}
        <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-900/90 border border-slate-800 shadow-xl relative overflow-hidden group">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-xs font-semibold text-slate-400 block mb-1">
                {isAr ? 'نواقص المخزن' : 'Stock Shortages'}
              </span>
              <h2 className="text-2xl font-black text-amber-400 font-mono">
                {data.lowStockCount} <span className="text-xs text-slate-400">{isAr ? 'أصناف تحت الحد' : 'low stock'}</span>
              </h2>
              <span className="text-[11px] text-slate-500 mt-1 block">
                {data.missingDemandCount} {isAr ? 'طلب بخزانة النواقص' : 'missing demand requests'}
              </span>
            </div>
            <div className="p-3 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
              <Package className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* E-Wallets Cash Liquidity */}
        <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-900/90 border border-slate-800 shadow-xl relative overflow-hidden group">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-xs font-semibold text-slate-400 block mb-1">
                {isAr ? 'سيولة المحافظ الإلكترونية' : 'E-Wallets Float'}
              </span>
              <h2 className="text-2xl font-black text-white font-mono">
                {data.walletsSummary.total_balance.toLocaleString()} <span className="text-xs font-normal text-sky-400">EGP</span>
              </h2>
              {data.walletsSummary.locked_count > 0 ? (
                <span className="text-[11px] text-amber-400 font-bold mt-1 block">
                  ⚠️ {data.walletsSummary.locked_count} {isAr ? 'محفظة مغلقة للحد اليومي' : 'wallets cap locked'}
                </span>
              ) : (
                <span className="text-[11px] text-slate-500 mt-1 block">
                  {data.walletsSummary.total_wallets} {isAr ? 'محافظ نشطة' : 'active wallets'}
                </span>
              )}
            </div>
            <div className="p-3 bg-sky-500/10 text-sky-400 rounded-xl border border-sky-500/20">
              <Wallet className="w-5 h-5" />
            </div>
          </div>
        </div>
      </div>

      {/* Two Columns: Data Export / Backups & Live Audit Log */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Data Export & System Security */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Download className="w-4 h-4 text-indigo-400" />
            {isAr ? 'تصدير التقارير (Excel / CSV)' : 'Data Export (CSV / Excel)'}
          </h3>
          <p className="text-xs text-slate-400">
            {isAr ? 'تصدير فوري لكامل الجداول مع حماية الخصوصية وتوافق مع أنظمة المحاسبة' : 'Export full tabular ledgers for external accounting.'}
          </p>

          <div className="grid grid-cols-2 gap-2">
            <a
              href={api.getExportUrl('sales')}
              download
              className="p-3 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 flex items-center justify-between transition-colors"
            >
              <span>{isAr ? 'المبيعات' : 'Sales'}</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
            </a>
            <a
              href={api.getExportUrl('items')}
              download
              className="p-3 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 flex items-center justify-between transition-colors"
            >
              <span>{isAr ? 'المخزون والقطع' : 'Inventory'}</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
            </a>
            <a
              href={api.getExportUrl('tickets')}
              download
              className="p-3 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 flex items-center justify-between transition-colors"
            >
              <span>{isAr ? 'تذاكر الصيانة' : 'Repair Tickets'}</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
            </a>
            <a
              href={api.getExportUrl('customers')}
              download
              className="p-3 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 flex items-center justify-between transition-colors"
            >
              <span>{isAr ? 'سجل العملاء' : 'Customers'}</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
            </a>
          </div>

          <div className="pt-3 border-t border-slate-800">
            <h4 className="text-xs font-bold text-slate-300 mb-2 flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
              {isAr ? 'سجل النسخ الاحتياطية المتاحة' : 'Available Backups'}
            </h4>
            <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
              {backups.map((b, idx) => (
                <div key={idx} className="flex justify-between items-center text-[11px] p-2 rounded-lg bg-slate-950/60 border border-slate-800/60">
                  <span className="font-mono text-slate-300 truncate max-w-[170px]">{b.filename}</span>
                  <span className="text-slate-500 font-mono">{(b.sizeBytes / 1024).toFixed(0)} KB</span>
                </div>
              ))}
              {backups.length === 0 && (
                <p className="text-[11px] text-slate-500 text-center py-2">
                  {isAr ? 'لا توجد نسخ احتياطية مسجلة' : 'No backups recorded yet'}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Live Audit Logs */}
        <div className="lg:col-span-2 p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              {isAr ? 'سجل العمليات والتدقيق الأمني (Audit Log)' : 'Audit Trail & Operations Log'}
            </h3>
            <span className="text-[11px] text-slate-400">
              {isAr ? 'آخر 10 حركات حساسة' : 'Last 10 security actions'}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-semibold text-[11px]">
                  <th className="pb-2">{isAr ? 'الوقت' : 'Timestamp'}</th>
                  <th className="pb-2">{isAr ? 'العملية' : 'Action'}</th>
                  <th className="pb-2">{isAr ? 'نوع السجل' : 'Entity'}</th>
                  <th className="pb-2">{isAr ? 'المعرف' : 'Entity ID'}</th>
                  <th className="pb-2">{isAr ? 'المستخدم / IP' : 'User / IP'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {auditLogs.map((log, idx) => (
                  <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-2.5 font-mono text-[11px] text-slate-400">
                      {new Date(log.created_at).toLocaleTimeString()}
                    </td>
                    <td className="py-2.5">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        log.action === 'CREATE' ? 'bg-emerald-500/20 text-emerald-400' :
                        log.action === 'UPDATE' ? 'bg-sky-500/20 text-sky-400' :
                        log.action === 'DELETE' ? 'bg-rose-500/20 text-rose-400' :
                        log.action === 'LOGIN' ? 'bg-indigo-500/20 text-indigo-400' :
                        'bg-slate-700 text-slate-300'
                      }`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="py-2.5 font-medium text-slate-200 text-[11px]">
                      {log.entity_type}
                    </td>
                    <td className="py-2.5 font-mono text-slate-400 text-[10px]">
                      {log.entity_id || '-'}
                    </td>
                    <td className="py-2.5 text-slate-400 text-[11px]">
                      {log.username || log.ip_address || 'System'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
