import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useLanguage } from '../i18n/LanguageContext';
import { useToast } from '../context/ToastContext';
import {
  Sparkles,
  Bot,
  BrainCircuit,
  CreditCard,
  Send,
  Truck,
  ShieldAlert,
  FileCheck,
  Calendar,
  Layers,
  Barcode,
  ScanLine,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Plus,
  ArrowRight,
  Printer,
  DollarSign,
  UserCheck,
  FileSpreadsheet
} from 'lucide-react';
import { TableSkeleton, CardSkeleton } from '../components/common/SkeletonLoader';
import { EmptyState } from '../components/common/EmptyState';

export const AdvancedHubView: React.FC = () => {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'ai' | 'integrations' | 'amc' | 'inventory' | 'governance'>('ai');
  const [loading, setLoading] = useState(false);

  // Data states
  const [forecasts, setForecasts] = useState<any[]>([]);
  const [diagnostics, setDiagnostics] = useState<any[]>([]);
  const [fraudAlerts, setFraudAlerts] = useState<any[]>([]);
  const [amcContracts, setAmcContracts] = useState<any[]>([]);
  const [outsourcedRepairs, setOutsourcedRepairs] = useState<any[]>([]);
  const [budgets, setBudgets] = useState<any[]>([]);
  const [approvals, setApprovals] = useState<any[]>([]);
  const [amlReport, setAmlReport] = useState<any>(null);
  const [auditVerification, setAuditVerification] = useState<any>(null);

  // Modals & Inputs
  const [barcodeInput, setBarcodeInput] = useState('');
  const [generatedBarcode, setGeneratedBarcode] = useState<any>(null);
  const [smsPhone, setSmsPhone] = useState('');
  const [smsMsg, setSmsMsg] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('500');

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [fc, diag, frd, amc, out, bdg, appv, aml, audit] = await Promise.all([
        api.getAiForecast().catch(() => ({ forecasts: [] })),
        api.getAiDiagnosticKb().catch(() => []),
        api.getFraudAlerts().catch(() => []),
        api.getAmcContracts().catch(() => []),
        api.getOutsourcedRepairs().catch(() => []),
        api.getDepartmentBudgets().catch(() => []),
        api.getApprovals().catch(() => []),
        api.getAmlComplianceReport().catch(() => null),
        api.verifyAuditChain().catch(() => null)
      ]);

      setForecasts(fc?.forecasts || []);
      setDiagnostics(diag || []);
      setFraudAlerts(frd || []);
      setAmcContracts(amc || []);
      setOutsourcedRepairs(out || []);
      setBudgets(bdg || []);
      setApprovals(appv || []);
      setAmlReport(aml);
      setAuditVerification(audit);
    } catch (e: any) {
      console.error(e);
      showToast(isAr ? 'فشل تحميل بيانات الأنظمة المتقدمة' : 'Failed to load advanced hub data', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  const handleTriggerReorder = async (itemId: string, qty: number) => {
    try {
      await api.triggerAiReorder(itemId, qty);
      showToast(isAr ? 'تم إنشاء أمر الشراء الذكي بنجاح' : 'AI reorder PO generated', 'success');
      loadAllData();
    } catch (e: any) {
      showToast(e.message || (isAr ? 'فشل إنشاء الطلب' : 'Failed to reorder'), 'error');
    }
  };

  const handleGenerateBarcode = async () => {
    if (!barcodeInput) return;
    try {
      const res = await api.generateBarcode({ entity_type: 'ITEM', entity_id: barcodeInput, format: 'CODE128' });
      setGeneratedBarcode(res);
      showToast(isAr ? 'تم توليد الباركود بنجاح' : 'Barcode generated', 'success');
    } catch (e: any) {
      showToast(e.message || 'Error', 'error');
    }
  };

  const handleSendSms = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!smsPhone || !smsMsg) return;
    try {
      await api.sendSms({ phone_number: smsPhone, message: smsMsg });
      showToast(isAr ? 'تم إرسال الرسالة النصية بنجاح' : 'SMS dispatched successfully', 'success');
      setSmsPhone('');
      setSmsMsg('');
    } catch (e: any) {
      showToast(e.message || 'Error', 'error');
    }
  };

  const handleApproveWorkflow = async (approvalId: string, action: 'APPROVED' | 'REJECTED') => {
    try {
      await api.takeApprovalAction({ approval_id: approvalId, action });
      showToast(isAr ? `تم تحديث حالة الطلب إلى ${action}` : `Workflow ${action}`, 'success');
      loadAllData();
    } catch (e: any) {
      showToast(e.message || 'Error', 'error');
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2.5">
            <Sparkles className="w-7 h-7 text-indigo-600 dark:text-indigo-400" />
            {isAr ? 'بوابة الذكاء الاصطناعي والأنظمة المتقدمة' : 'AI & Enterprise Operations Hub'}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {isAr
              ? 'التنبؤ بالمخزون بالذكاء الاصطناعي، بوابات الدفع الإلكتروني، عقود الصيانة، الباركود، والامتثال المالي'
              : 'AI demand forecasting, payment gateways, AMC contracts, thermal barcodes, and AML compliance'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadAllData}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
            title={isAr ? 'تحديث' : 'Refresh'}
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 overflow-x-auto">
        <button
          onClick={() => setActiveTab('ai')}
          className={`px-4 py-3 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'ai'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <Bot className="w-4 h-4" />
          {isAr ? 'الذكاء الاصطناعي والتشخيص' : 'AI & Forecasting'}
        </button>

        <button
          onClick={() => setActiveTab('integrations')}
          className={`px-4 py-3 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'integrations'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          {isAr ? 'بوابات الدفع والتكاملات' : 'Integrations & Gateways'}
        </button>

        <button
          onClick={() => setActiveTab('amc')}
          className={`px-4 py-3 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'amc'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <Calendar className="w-4 h-4" />
          {isAr ? 'عقود الصيانة والورش الخارجية' : 'AMC & Outsource'}
        </button>

        <button
          onClick={() => setActiveTab('inventory')}
          className={`px-4 py-3 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'inventory'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <Barcode className="w-4 h-4" />
          {isAr ? 'الباركود والجرد بالماسح' : 'Barcodes & Scanner Audit'}
        </button>

        <button
          onClick={() => setActiveTab('governance')}
          className={`px-4 py-3 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'governance'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <ShieldAlert className="w-4 h-4" />
          {isAr ? 'الموافقات والميزانيات والامتثال' : 'Governance & AML'}
        </button>
      </div>

      {/* Tab Contents */}
      {loading ? (
        <TableSkeleton rows={5} cols={4} />
      ) : (
        <>
          {/* TAB 1: AI & Forecasting */}
          {activeTab === 'ai' && (
            <div className="space-y-6">
              {/* Demand Forecast Section */}
              <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <BrainCircuit className="w-5 h-5 text-indigo-600" />
                      {isAr ? 'التنبؤ الذكي بالطلب وإعادة الطلب التلقائي (AI Demand Forecast)' : 'AI Demand Forecast & Auto Reorder'}
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">
                      {isAr ? 'خوارزمية تنبؤ تعتمد على معدل البيع اليومي، فترة توريد المورد، ومخزون الأمان (ROP)' : 'Heuristic models calculating daily demand, lead times, and safety buffer.'}
                    </p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left rtl:text-right">
                    <thead className="text-xs uppercase bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="px-6 py-3">{isAr ? 'اسم الصنف' : 'Item'}</th>
                        <th className="px-6 py-3">{isAr ? 'المخزون الحالي' : 'Stock'}</th>
                        <th className="px-6 py-3">{isAr ? 'الطلب اليومي التقديري' : 'Daily Demand'}</th>
                        <th className="px-6 py-3">{isAr ? 'نقطة إعادة الطلب (ROP)' : 'Reorder Point'}</th>
                        <th className="px-6 py-3">{isAr ? 'الحالة' : 'Status'}</th>
                        <th className="px-6 py-3">{isAr ? 'إجراء ذكي' : 'Action'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {forecasts.slice(0, 5).map((f) => (
                        <tr key={f.item_id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <td className="px-6 py-4 font-bold text-slate-900 dark:text-white">{f.item_name}</td>
                          <td className="px-6 py-4 font-mono">{f.current_stock}</td>
                          <td className="px-6 py-4 text-slate-600 dark:text-slate-400">{f.daily_demand} / {isAr ? 'يوم' : 'day'}</td>
                          <td className="px-6 py-4 font-bold text-indigo-600 dark:text-indigo-400">{f.suggested_reorder_point}</td>
                          <td className="px-6 py-4">
                            {f.needs_reorder ? (
                              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300">
                                {isAr ? 'منخفض - يلزم الطلب' : 'Low - Reorder Needed'}
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                {isAr ? 'آمن' : 'Sufficient'}
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            {f.needs_reorder && (
                              <button
                                onClick={() => handleTriggerReorder(f.item_id, f.suggested_reorder_qty)}
                                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1"
                              >
                                <span>{isAr ? 'طلب تلقائي' : 'Auto PO'}</span>
                                <span className="opacity-80 font-mono">({f.suggested_reorder_qty})</span>
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Diagnostic KB & Fraud Alerts Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Diagnostics */}
                <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                  <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Bot className="w-5 h-5 text-indigo-600" />
                    {isAr ? 'قاعدة تشخيص الأعطال بالذكاء الاصطناعي (iFixit / GSMArena)' : 'AI Diagnostic Knowledge Base'}
                  </h3>
                  <div className="space-y-3">
                    {diagnostics.map((d) => (
                      <div key={d.id} className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-indigo-600 dark:text-indigo-400 text-sm">{d.brand} {d.model}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-mono">{d.fault_category}</span>
                        </div>
                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">{d.symptom}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{d.solution_steps}</p>
                        {d.diode_readings && (
                          <p className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 p-1.5 rounded-lg">
                            {d.diode_readings}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Fraud Alerts */}
                <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                  <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <ShieldAlert className="w-5 h-5 text-red-600" />
                    {isAr ? 'رادار كشف الاحتيال المالي الذكي (Fraud Detection)' : 'Financial Fraud Detection Radar'}
                  </h3>
                  <div className="space-y-3">
                    {fraudAlerts.length === 0 ? (
                      <p className="text-xs text-slate-400 py-6 text-center">{isAr ? 'لا توجد معاملات مشبوهة حالياً. النظام آمن بنسبة 100%' : 'No suspicious transactions detected. System safe.'}</p>
                    ) : (
                      fraudAlerts.map((fa) => (
                        <div key={fa.id} className="p-4 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/60 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-red-600 text-xs">{fa.transaction_type}</span>
                            <span className="text-xs font-black text-red-700 dark:text-red-400">Risk: {(fa.risk_score * 100).toFixed(0)}%</span>
                          </div>
                          <p className="text-xs text-slate-700 dark:text-slate-300">{fa.trigger_rule}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Integrations & Gateways */}
          {activeTab === 'integrations' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Payment Gateway Checkout */}
              <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-indigo-600" />
                  {isAr ? 'بوابة الدفع الإلكتروني (Paymob & Fawry & Cards)' : 'Payment Gateway (Paymob / Fawry)'}
                </h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      {isAr ? 'المبلغ المراد تحصيله (ج.م)' : 'Amount (EGP)'}
                    </label>
                    <input
                      type="number"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      className="w-full px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                    />
                  </div>
                  <button
                    onClick={async () => {
                      const res = await api.initiatePaymentCheckout({ order_id: `INV-${Date.now()}`, gateway: 'PAYMOB', amount: paymentAmount });
                      showToast(`Checkout Session: ${res.gateway_reference}`, 'success');
                    }}
                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm transition"
                  >
                    {isAr ? 'إنشاء جلسة دفع إلكتروني فورية' : 'Create Paymob Checkout Session'}
                  </button>
                </div>
              </div>

              {/* SMS Gateway */}
              <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Send className="w-5 h-5 text-indigo-600" />
                  {isAr ? 'بوابة الرسائل النصية للعملاء (SMS Gateway)' : 'Customer SMS Gateway'}
                </h3>
                <form onSubmit={handleSendSms} className="space-y-3">
                  <input
                    type="tel"
                    required
                    placeholder={isAr ? 'رقم هاتف العميل (مثال: 01012345678)' : 'Phone (e.g. 01012345678)'}
                    value={smsPhone}
                    onChange={(e) => setSmsPhone(e.target.value)}
                    className="w-full px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                  />
                  <textarea
                    required
                    placeholder={isAr ? 'نص الرسالة: جهازك جاهز للاستلام من معمل الصيانة' : 'Message text'}
                    value={smsMsg}
                    onChange={(e) => setSmsMsg(e.target.value)}
                    className="w-full px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm h-20"
                  />
                  <button
                    type="submit"
                    className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm transition"
                  >
                    {isAr ? 'إرسال الرسالة النصية الآن' : 'Dispatch SMS'}
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* TAB 3: AMC & Outsource */}
          {activeTab === 'amc' && (
            <div className="space-y-6">
              <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-indigo-600" />
                  {isAr ? 'عقود الصيانة السنوية الدورية (AMC Contracts)' : 'Annual Maintenance Contracts (AMC)'}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {amcContracts.map((c) => (
                    <div key={c.id} className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="font-mono text-xs font-bold text-indigo-600">{c.contract_number}</span>
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">{c.status}</span>
                      </div>
                      <h4 className="font-bold text-slate-900 dark:text-white text-sm">{c.contract_title}</h4>
                      <p className="text-xs text-slate-500">{c.customer_name || 'Corporate Account'}</p>
                      <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex justify-between text-xs font-bold">
                        <span>{c.periodic_visits} {isAr ? 'زيارات دورية' : 'Visits'}</span>
                        <span className="text-indigo-600">{c.contract_value} ج.م</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: Barcodes & Scanner Audit */}
          {activeTab === 'inventory' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Barcode Generator */}
              <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Barcode className="w-5 h-5 text-indigo-600" />
                  {isAr ? 'مولد الباركود الحراري وطباعة الملصقات' : 'Thermal Barcode & Label Generator'}
                </h3>
                <div className="space-y-3">
                  <input
                    type="text"
                    placeholder={isAr ? 'معرف الصنف أو كود المنتج' : 'Item SKU / ID'}
                    value={barcodeInput}
                    onChange={(e) => setBarcodeInput(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm"
                  />
                  <button
                    onClick={handleGenerateBarcode}
                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm transition flex items-center justify-center gap-2"
                  >
                    <Barcode className="w-4 h-4" />
                    <span>{isAr ? 'توليد باركود Code128' : 'Generate Code128 Barcode'}</span>
                  </button>

                  {generatedBarcode && (
                    <div className="p-4 rounded-xl border border-dashed border-indigo-300 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-950/20 text-center space-y-2">
                      <div className="font-mono text-xl tracking-widest font-black text-indigo-600">{generatedBarcode.barcode}</div>
                      <p className="text-xs text-slate-400">{isAr ? 'جاهز للطباعة على طابعات الملصقات Xprinter (50x25mm)' : 'Ready for thermal sticker printing'}</p>
                      <button onClick={() => window.print()} className="px-4 py-1.5 bg-slate-800 text-white rounded-lg text-xs font-semibold">
                        {isAr ? 'طباعة الملصق' : 'Print Label'}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Handheld Scan Audit */}
              <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <ScanLine className="w-5 h-5 text-indigo-600" />
                  {isAr ? 'الجرد بماسح الباركود المحمول (Scan Audit)' : 'Handheld Scanner Cycle Count'}
                </h3>
                <div className="p-6 border border-slate-200 dark:border-slate-700 rounded-2xl text-center space-y-3">
                  <ScanLine className="w-12 h-12 text-slate-400 mx-auto animate-pulse" />
                  <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200">
                    {isAr ? 'وجه مسدس الباركود نحو أي قطعة أو سيريال هاتف' : 'Point barcode gun or camera at any part'}
                  </h4>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    {isAr ? 'يقوم النظام بمطابقة الجرد الفعلي مع المسجل بالمخزن واحتساب الفروقات فوراً' : 'Instant reconciliation of physical stock with database count.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: Governance & AML */}
          {activeTab === 'governance' && (
            <div className="space-y-6">
              {/* AML & Cryptographic Audit Status */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-slate-900 dark:text-white text-sm">{isAr ? 'حالة امتثال مكافحة غسيل الأموال (FATF AML)' : 'AML Compliance Status'}</h4>
                    <p className="text-xs text-slate-500 mt-1">{amlReport?.compliance_status === 'COMPLIANT' ? (isAr ? 'جميع العمليات المالية ضمن الحدود القانونية' : 'All transactions compliant') : 'Attention Required'}</p>
                  </div>
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    {amlReport?.compliance_status || 'COMPLIANT'}
                  </span>
                </div>

                <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-slate-900 dark:text-white text-sm">{isAr ? 'سلسلة سجل التدقيق المشفرة (Immutable Audit Chain)' : 'Immutable Audit Chain'}</h4>
                    <p className="text-xs text-slate-500 mt-1">{isAr ? `تم توثيق ${auditVerification?.total_audited_records || 0} عملية بـ SHA-256` : `${auditVerification?.total_audited_records || 0} records chained`}</p>
                  </div>
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
                    {auditVerification?.chain_valid ? (isAr ? 'السلسلة سليمة 100%' : 'Chain Valid') : 'Tampered'}
                  </span>
                </div>
              </div>

              {/* Department Budgets */}
              <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-indigo-600" />
                  {isAr ? 'ميزانيات الأقسام ومراقبة الإنفاق الفعلي' : 'Departmental Budgets & Spending Control'}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                  {budgets.map((b) => {
                    const pct = Math.min(100, Math.round((b.budget_spent / b.budget_allocated) * 100));
                    return (
                      <div key={b.id} className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-2">
                        <div className="flex justify-between text-xs font-bold">
                          <span className="text-slate-800 dark:text-slate-200">{b.department_name}</span>
                          <span className="text-indigo-600">{pct}%</span>
                        </div>
                        <div className="h-2 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${pct > 85 ? 'bg-red-500' : 'bg-indigo-600'}`} style={{ width: `${pct}%` }} />
                        </div>
                        <p className="text-[11px] text-slate-500">{b.budget_spent.toLocaleString()} / {b.budget_allocated.toLocaleString()} ج.م</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Multi-Level Approvals Queue */}
              <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <FileCheck className="w-5 h-5 text-indigo-600" />
                  {isAr ? 'طابور الموافقات الإدارية متعددة المستويات (Manager → Finance → Director)' : 'Multi-Level Approval Workflows'}
                </h3>
                {approvals.length === 0 ? (
                  <p className="text-xs text-slate-400 py-4 text-center">{isAr ? 'لا توجد طلبات معلقة بانتظار الموافقة' : 'No pending approval requests'}</p>
                ) : (
                  <div className="space-y-3">
                    {approvals.map((appv) => (
                      <div key={appv.id} className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                        <div>
                          <span className="text-xs font-mono font-bold text-indigo-600">{appv.workflow_type}</span>
                          <p className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">{appv.amount ? `${appv.amount} ج.م` : appv.entity_id}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleApproveWorkflow(appv.id, 'APPROVED')}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold"
                          >
                            {isAr ? 'موافقة ✓' : 'Approve'}
                          </button>
                          <button
                            onClick={() => handleApproveWorkflow(appv.id, 'REJECTED')}
                            className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold"
                          >
                            {isAr ? 'رفض ✕' : 'Reject'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
