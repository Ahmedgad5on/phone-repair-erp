import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useLanguage } from '../i18n/LanguageContext';
import { useToast } from '../context/ToastContext';
import {
  BarChart3,
  TrendingUp,
  DollarSign,
  Wrench,
  Smartphone,
  Mail,
  Download,
  Printer,
  RefreshCw,
  Award,
  PieChart
} from 'lucide-react';
import { CardSkeleton } from '../components/common/SkeletonLoader';

export const ReportsView: React.FC = () => {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const { showToast } = useToast();

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);

  // Email scheduling modal
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);

  const loadReports = async () => {
    setLoading(true);
    try {
      const [overview, sum] = await Promise.all([
        api.getReportsOverview(),
        api.getReportExportSummary()
      ]);
      setData(overview);
      setSummary(sum);
    } catch (e: any) {
      console.error(e);
      showToast(isAr ? 'فشل تحميل التقارير والتحليلات' : 'Failed to load analytics', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, []);

  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput) return;
    setSendingEmail(true);
    try {
      await api.scheduleReportEmail(emailInput);
      showToast(isAr ? 'تم إرسال التقرير بالبريد الإلكتروني بنجاح' : 'Report scheduled and sent via email', 'success');
      setShowEmailModal(false);
      setEmailInput('');
    } catch (e: any) {
      showToast(e.message || (isAr ? 'فشل الإرسال' : 'Failed to send email'), 'error');
    } finally {
      setSendingEmail(false);
    }
  };

  const handlePrintReport = () => {
    window.print();
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto print:p-0 print:m-0">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4 print:hidden">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <BarChart3 className="w-7 h-7 text-indigo-600 dark:text-indigo-400" />
            {isAr ? 'التقارير التحليلية والذكاء التجاري' : 'Analytics & Business Intelligence'}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {isAr
              ? 'مخططات الإيرادات اليومية، توزيع المبيعات حسب الأقسام، وأداء مهندسي الصيانة'
              : 'Daily sales trends, category distribution, repair turnaround times, and engineer stats'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadReports}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
            title={isAr ? 'تحديث' : 'Refresh'}
          >
            <RefreshCw className="w-5 h-5" />
          </button>

          <button
            onClick={() => setShowEmailModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-white font-medium rounded-xl transition-all"
          >
            <Mail className="w-4 h-4" />
            <span>{isAr ? 'جدولة بالبريد' : 'Email Report'}</span>
          </button>

          <button
            onClick={handlePrintReport}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl shadow-sm transition-all"
          >
            <Printer className="w-4 h-4" />
            <span>{isAr ? 'طباعة تقرير PDF' : 'Print / Export PDF'}</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : (
        <>
          {/* Top KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {isAr ? 'إجمالي الإيرادات' : 'Total Revenue'}
                </p>
                <h3 className="text-2xl font-black text-slate-900 dark:text-white mt-1">
                  {(summary?.totalRevenue || 0).toLocaleString()} <span className="text-sm font-normal text-slate-400">ج.م</span>
                </h3>
              </div>
              <div className="p-3 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-xl">
                <DollarSign className="w-6 h-6" />
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {isAr ? 'الأجهزة التي تم تسليمها' : 'Delivered Repairs'}
                </p>
                <h3 className="text-2xl font-black text-slate-900 dark:text-white mt-1">
                  {summary?.totalRepairs || 0}
                </h3>
              </div>
              <div className="p-3 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-xl">
                <Wrench className="w-6 h-6" />
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {isAr ? 'قيمة بضاعة المخزون' : 'Inventory Value'}
                </p>
                <h3 className="text-2xl font-black text-slate-900 dark:text-white mt-1">
                  {(summary?.totalInventoryValue || 0).toLocaleString()} <span className="text-sm font-normal text-slate-400">ج.م</span>
                </h3>
              </div>
              <div className="p-3 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-xl">
                <TrendingUp className="w-6 h-6" />
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {isAr ? 'الفرع الرئيسي' : 'Store'}
                </p>
                <h3 className="text-lg font-black text-slate-900 dark:text-white mt-1 truncate">
                  {summary?.storeName || 'Main Lab'}
                </h3>
              </div>
              <div className="p-3 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-xl">
                <Award className="w-6 h-6" />
              </div>
            </div>
          </div>

          {/* Daily Sales Chart & Category Distribution */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Sales Trend (2 Cols) */}
            <div className="lg:col-span-2 p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-indigo-600" />
                {isAr ? 'حركة المبيعات اليومية (آخر 7 أيام)' : 'Daily Sales Trend (Last 7 Days)'}
              </h3>

              <div className="h-64 flex items-end justify-between gap-3 pt-8 pb-4">
                {data?.dailySales && data.dailySales.length > 0 ? (
                  data.dailySales.map((item: any, idx: number) => {
                    const maxRevenue = Math.max(...data.dailySales.map((d: any) => d.revenue || 1), 1);
                    const heightPercent = Math.max(15, Math.round((item.revenue / maxRevenue) * 100));
                    return (
                      <div key={idx} className="flex-1 flex flex-col items-center gap-2 h-full justify-end group">
                        <div className="text-[10px] text-slate-400 font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                          {item.revenue} ج.م
                        </div>
                        <div
                          style={{ height: `${heightPercent}%` }}
                          className="w-full bg-gradient-to-t from-indigo-600 to-indigo-400 rounded-xl transition-all group-hover:from-indigo-500 group-hover:to-indigo-300"
                        />
                        <span className="text-[11px] font-mono text-slate-500 whitespace-nowrap">
                          {item.day?.slice(5) || `Day ${idx + 1}`}
                        </span>
                      </div>
                    );
                  })
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-400 text-sm">
                    {isAr ? 'لا توجد مبيعات مسجلة في آخر 7 أيام' : 'No sales recorded in the past 7 days'}
                  </div>
                )}
              </div>
            </div>

            {/* Category Share (1 Col) */}
            <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
                <PieChart className="w-5 h-5 text-indigo-600" />
                {isAr ? 'توزيع المبيعات حسب التصنيف' : 'Sales by Category'}
              </h3>

              <div className="space-y-4 pt-2">
                {data?.categorySales && data.categorySales.length > 0 ? (
                  data.categorySales.map((cat: any, idx: number) => (
                    <div key={idx} className="space-y-1.5">
                      <div className="flex justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                        <span>{cat.category || 'General'}</span>
                        <span className="text-slate-500 font-normal">{cat.revenue} ج.م ({cat.units_sold} {isAr ? 'قطعة' : 'pcs'})</span>
                      </div>
                      <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-indigo-600 rounded-full"
                          style={{ width: `${Math.min(100, Math.max(10, (cat.units_sold * 15)))}%` }}
                        />
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-12 text-center text-slate-400 text-sm">
                    {isAr ? 'لا توجد بيانات أصناف بعد' : 'No categories data yet'}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Most Repaired Models & Tech Performance */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Models */}
            <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-indigo-600" />
                {isAr ? 'أكثر موديلات الهواتف صيانة' : 'Top Repaired Phone Models'}
              </h3>

              <div className="space-y-2">
                {data?.topModels && data.topModels.length > 0 ? (
                  data.topModels.map((m: any, idx: number) => (
                    <div
                      key={idx}
                      className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between text-sm"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 font-bold text-xs flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <span className="font-bold text-slate-900 dark:text-white">{m.model}</span>
                      </div>
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                        {m.repair_count} {isAr ? 'تذكرة' : 'repairs'}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="py-8 text-center text-slate-400 text-sm">
                    {isAr ? 'لا توجد تذاكر صيانة كافية بعد' : 'Not enough repair data yet'}
                  </div>
                )}
              </div>
            </div>

            {/* Engineer Stats */}
            <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
                <Award className="w-5 h-5 text-indigo-600" />
                {isAr ? 'أداء مهندسي الصيانة والفنيين' : 'Engineer & Tech Performance'}
              </h3>

              <div className="space-y-2">
                {data?.techStats && data.techStats.length > 0 ? (
                  data.techStats.map((t: any, idx: number) => (
                    <div
                      key={idx}
                      className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between text-sm"
                    >
                      <div>
                        <h4 className="font-bold text-slate-900 dark:text-white">{t.name}</h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {t.completed_tickets} {isAr ? 'أجهزة مكتملة' : 'completed devices'}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="font-black text-emerald-600 dark:text-emerald-400 text-sm">
                          {t.labor_revenue} ج.م
                        </span>
                        <p className="text-[10px] text-slate-400">{isAr ? 'مصنعيات محققة' : 'Labor Generated'}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-8 text-center text-slate-400 text-sm">
                    {isAr ? 'لا توجد إحصائيات فنيين مسجلة' : 'No engineer records available'}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Modal: Schedule Email */}
      {showEmailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl p-6 space-y-4">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Mail className="w-5 h-5 text-indigo-600" />
              {isAr ? 'إرسال التقرير الدوري بالبريد' : 'Email Analytical Report'}
            </h2>
            <form onSubmit={handleSendEmail} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? 'البريد الإلكتروني للمستلم' : 'Recipient Email'}
                </label>
                <input
                  type="email"
                  required
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="manager@store.com"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowEmailModal(false)}
                  className="px-4 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={sendingEmail}
                  className="px-4 py-2 text-sm rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold disabled:opacity-50"
                >
                  {sendingEmail ? (isAr ? 'جاري الإرسال...' : 'Sending...') : (isAr ? 'إرسال الآن' : 'Send Now')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
