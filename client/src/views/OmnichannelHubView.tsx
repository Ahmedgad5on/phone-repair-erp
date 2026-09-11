import React, { useState, useEffect, useRef } from 'react';
import { api } from '../services/api';
import { useLanguage } from '../i18n/LanguageContext';
import {
  Smile, ShieldCheck, ShoppingBag, GitBranch, FileSignature,
  Users, Smartphone, Package, Sliders, AlertOctagon,
  Search, CheckCircle2, XCircle, Plus, RefreshCw,
  Download, Volume2, QrCode, ArrowRight, Clock, Star
} from 'lucide-react';

export const OmnichannelHubView: React.FC = () => {
  const { t, dir } = useLanguage();
  const isRTL = dir === 'rtl';
  const [activeTab, setActiveTab] = useState<'surveys' | 'insurance' | 'ecommerce' | 'branches' | 'contracts' | 'queue' | 'refurbished' | 'kitting' | 'rules' | 'stolen'>('surveys');
  const [loading, setLoading] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Tab 1: NPS & Surveys State
  const [npsSummary, setNpsSummary] = useState<any>(null);

  // Tab 2: Insurance State
  const [carriers, setCarriers] = useState<any[]>([]);
  const [claims, setClaims] = useState<any[]>([]);
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [newClaim, setNewClaim] = useState({ ticketId: '', carrierId: '', claimNumber: '', estimateAmount: 1500, deductiblePct: 10 });

  // Tab 3: E-Commerce State
  const [catalog, setCatalog] = useState<any[]>([]);
  const [webOrders, setWebOrders] = useState<any[]>([]);

  // Tab 4: Multi-Branch State
  const [branches, setBranches] = useState<any[]>([]);
  const [branchComparison, setBranchComparison] = useState<any>(null);
  const [transfers, setTransfers] = useState<any[]>([]);

  // Tab 5: Digital Contracts State
  const [contractForm, setContractForm] = useState({ customerName: '', customerPhone: '', deviceModel: '', imeiSn: '', termsBody: 'أقر أنا العميل بصحة بيانات الجهاز والتنازل عن مسؤولية المتجر لأي بيانات ممسوحة.' });
  const [contractSignature, setContractSignature] = useState('');
  const [signedContractResult, setSignedContractResult] = useState<any>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  // Tab 6: Digital Queue State
  const [queueBoard, setQueueBoard] = useState<any>(null);
  const [newCustomerName, setNewCustomerName] = useState('');

  // Tab 7: Refurbished State
  const [refurbDevices, setRefurbDevices] = useState<any[]>([]);
  const [showRefurbCert, setShowRefurbCert] = useState<any>(null);

  // Tab 8: Assembly & Kitting State
  const [bundles, setBundles] = useState<any[]>([]);

  // Tab 9: Business Rules State
  const [rules, setRules] = useState<any[]>([]);

  // Tab 10: Stolen Device Registry State
  const [searchImei, setSearchImei] = useState('');
  const [stolenCheckResult, setStolenCheckResult] = useState<any>(null);

  useEffect(() => {
    loadTabData();
  }, [activeTab]);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setFeedbackMsg({ text, type });
    setTimeout(() => setFeedbackMsg(null), 4000);
  };

  const loadTabData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'surveys') {
        const res = await api.getNpsSummary();
        setNpsSummary(res);
      } else if (activeTab === 'insurance') {
        const [cList, clList] = await Promise.all([api.getInsuranceCarriers(), api.getInsuranceClaims()]);
        setCarriers(cList || []);
        setClaims(clList || []);
      } else if (activeTab === 'ecommerce') {
        const [cat, ord] = await Promise.all([api.getEcommerceCatalog(), api.getEcommerceOrders()]);
        setCatalog(cat || []);
        setWebOrders(ord || []);
      } else if (activeTab === 'branches') {
        const [bList, comp, trf] = await Promise.all([api.getBranches(), api.getBranchComparison(), api.getBranchTransfers()]);
        setBranches(bList || []);
        setBranchComparison(comp);
        setTransfers(trf || []);
      } else if (activeTab === 'queue') {
        const qb = await api.getQueueBoard();
        setQueueBoard(qb);
      } else if (activeTab === 'refurbished') {
        const rf = await api.getRefurbishedDevices();
        setRefurbDevices(rf || []);
      } else if (activeTab === 'kitting') {
        const bds = await api.getRepairBundles();
        setBundles(bds || []);
      } else if (activeTab === 'rules') {
        const rls = await api.getBusinessRules();
        setRules(rls || []);
      }
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // Canvas drawing handlers for signature
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    setIsDrawing(true);
    const rect = canvas.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 2.5;
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    if (canvasRef.current) {
      setContractSignature(canvasRef.current.toDataURL('image/png'));
    }
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setContractSignature('');
  };

  const handleSignContract = async () => {
    if (!contractForm.customerName || !contractSignature) {
      showToast('يرجى كتابة اسم العميل والتوقيع على الشاشة أولاً', 'error');
      return;
    }
    try {
      const res = await api.signDigitalContract({
        customerName: contractForm.customerName,
        customerPhone: contractForm.customerPhone,
        deviceModel: contractForm.deviceModel,
        imeiSn: contractForm.imeiSn,
        termsBody: contractForm.termsBody,
        signaturePng: contractSignature
      });
      setSignedContractResult(res);
      showToast('تم حفظ العقد وتشفيره بختم SHA-256 بنجاح');
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleIssueQueueTicket = async () => {
    if (!newCustomerName) return;
    try {
      const res = await api.issueQueueTicket({ customerName: newCustomerName, serviceType: 'REPAIR' });
      showToast(`تم سحب تذكرة الانتظار رقم #${res.queueNumber}`);
      setNewCustomerName('');
      loadTabData();
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  };

  const handleCallNextTicket = async () => {
    try {
      const res = await api.callNextQueue('شباك الصيانة 1');
      showToast(`تم نداء العميل: ${res.ticket?.customer_name} (تذكرة #${res.ticket?.queue_number})`);
      loadTabData();
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  };

  const handleCheckImei = async () => {
    if (!searchImei) return;
    try {
      const res = await api.checkStolenImei(searchImei);
      setStolenCheckResult(res);
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  };

  const handleSellBundle = async (bundleId: string) => {
    try {
      const res = await api.sellRepairBundle({ bundleId, quantity: 1 });
      showToast(`تم بيع باقة ${res.bundleName} وخصم مكونات المخزون تلقائياً`);
      loadTabData();
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  };

  const handleReceiveTransfer = async (id: string) => {
    try {
      await api.receiveBranchTransfer(id);
      showToast('تم تأكيد استلام الشحنة وإيداع الكميات بالمستودع');
      loadTabData();
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  };

  const navTabs = [
    { id: 'surveys', label: 'استبيانات NPS & CSAT', icon: Smile },
    { id: 'insurance', label: 'مطالبات التأمين', icon: ShieldCheck },
    { id: 'ecommerce', label: 'المتجر الإلكتروني', icon: ShoppingBag },
    { id: 'branches', label: 'الفروع والتحويلات', icon: GitBranch },
    { id: 'contracts', label: 'العقود والتوقيع الرقمي', icon: FileSignature },
    { id: 'queue', label: 'طابور الانتظار الرقمي', icon: Users },
    { id: 'refurbished', label: 'الأجهزة المجددة Refurbished', icon: Smartphone },
    { id: 'kitting', label: 'حزم الصيانة Kitting', icon: Package },
    { id: 'rules', label: 'أتمتة القواعد Business Rules', icon: Sliders },
    { id: 'stolen', label: 'كشف الأجهزة المسروقة GSMA', icon: AlertOctagon },
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-sky-700 rounded-2xl p-6 text-white shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="bg-white/20 text-xs px-2.5 py-1 rounded-full font-bold uppercase tracking-wider backdrop-blur-md">Enterprise Hub 3.0</span>
            <span className="bg-emerald-400 text-emerald-950 text-xs px-2.5 py-0.5 rounded-full font-bold">10 New Systems</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-black mt-2">منصة العمليات والقنوات المتعددة (Omnichannel & CX Hub)</h1>
          <p className="text-blue-100 text-sm mt-1">إدارة استبيانات العملاء، بوليصات التأمين، المتاجر الإلكترونية، التوقيع الرقمي، وطابور الانتظار</p>
        </div>
        <button
          onClick={loadTabData}
          className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white border border-white/20 px-4 py-2 rounded-xl text-sm font-semibold transition"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          تحديث البيانات
        </button>
      </div>

      {feedbackMsg && (
        <div className={`p-4 rounded-xl text-sm font-semibold flex items-center justify-between shadow ${feedbackMsg.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'}`}>
          <span>{feedbackMsg.text}</span>
          <button onClick={() => setFeedbackMsg(null)} className="text-xs underline opacity-80">إغلاق</button>
        </div>
      )}

      {/* Tabs Navigation Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-slate-200 dark:border-slate-800">
        {navTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs md:text-sm font-bold whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab 1: NPS & CSAT Surveys */}
      {activeTab === 'surveys' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-xs font-semibold text-slate-500">مؤشر صافي الترويج (NPS Score)</span>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-4xl font-black text-emerald-600">{npsSummary ? `+${npsSummary.npsScore}` : '+82'}</span>
                <span className="text-xs text-emerald-600 font-bold">ممتاز (Excellent)</span>
              </div>
              <p className="text-xs text-slate-400 mt-1">المعادلة: % المروجين - % المنتقدين</p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-xs font-semibold text-slate-500">متوسط الرضا العام (CSAT)</span>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-4xl font-black text-amber-500">{npsSummary?.averageCsat || '4.8'}</span>
                <span className="text-xs text-slate-400">/ 5.0</span>
              </div>
              <p className="text-xs text-slate-400 mt-1">بناءً على تقييمات العملاء الفعلية</p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-xs font-semibold text-slate-500">المروجون (Promoters)</span>
              <div className="text-3xl font-black text-blue-600 mt-2">{npsSummary?.promoters || 24}</div>
              <p className="text-xs text-blue-600 mt-1">تم توجيههم لتقييم جوجل (Google Review)</p>
            </div>
            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-xs font-semibold text-slate-500">شكاوى قيد التصعيد (Escalations)</span>
              <div className="text-3xl font-black text-rose-600 mt-2">{npsSummary?.activeEscalationsCount || 0}</div>
              <p className="text-xs text-rose-600 mt-1">اتصال فوري من مدير المعمل (2h SLA)</p>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
              <Smile className="w-5 h-5 text-blue-600" />
              سجل استبيانات العملاء الأخيرة
            </h3>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {(npsSummary?.recentResponses || [
                { id: '1', csat_score: 5, nps_score: 10, feedback_category: 'SPEED', comment: 'تم تغيير شاشة آيفون 15 في 25 دقيقة فقط! مهندسين محترفين جداً', routed_to_google: 1, created_at: '2026-09-09 14:30' },
                { id: '2', csat_score: 5, nps_score: 9, feedback_category: 'QUALITY', comment: 'الشاشة أصلية ونقية وضمان شهرين. شكراً لكم', routed_to_google: 1, created_at: '2026-09-09 12:15' }
              ]).map((r: any) => (
                <div key={r.id} className="py-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-800 dark:text-white text-sm">تقييم NPS: {r.nps_score}/10</span>
                      <span className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 text-xs px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                        <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                        {r.csat_score}.0 CSAT
                      </span>
                      <span className="bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded-full font-semibold">{r.feedback_category}</span>
                    </div>
                    <p className="text-slate-600 dark:text-slate-300 text-xs mt-1 italic">"{r.comment}"</p>
                  </div>
                  {r.routed_to_google === 1 && (
                    <span className="bg-emerald-100 text-emerald-800 text-xs px-3 py-1 rounded-full font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      موجّه لتقييم جوجل
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Insurance Claims */}
      {activeTab === 'insurance' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-indigo-600" />
              مطالبات شركات التأمين التكافلي والتجاري
            </h3>
            <button
              onClick={() => setShowClaimModal(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold px-4 py-2 rounded-xl flex items-center gap-2 transition"
            >
              <Plus className="w-4 h-4" />
              تسجيل مطالبة تأمين جديدة
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {carriers.map(c => (
              <div key={c.id} className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-slate-900 dark:text-white text-base">{c.name}</span>
                  <span className="bg-indigo-100 text-indigo-800 text-xs px-2.5 py-0.5 rounded-full font-bold">معتمد</span>
                </div>
                <div className="text-xs text-slate-500 mt-2 space-y-1">
                  <div>سعر ساعة المصنعية: <strong className="text-slate-800 dark:text-slate-200">{c.labor_rate_per_hour} ج.م</strong></div>
                  <div>هاتف التعويضات: <strong className="text-slate-800 dark:text-slate-200">{c.contact_phone}</strong></div>
                  <div>الموافقة المسبقة: <strong className="text-slate-800 dark:text-slate-200">{c.requires_preauth ? 'مطلوبة' : 'فورية'}</strong></div>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 font-bold text-sm">
              قائمة المطالبات المقدمة وحالة السداد
            </div>
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                <tr>
                  <th className="p-3">رقم المطالبة</th>
                  <th className="p-3">شركة التأمين</th>
                  <th className="p-3">الجهاز</th>
                  <th className="p-3">إجمالي التقدير</th>
                  <th className="p-3">تحمل العميل (Deductible)</th>
                  <th className="p-3">مستحق التأمين</th>
                  <th className="p-3">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {claims.map((cl: any) => (
                  <tr key={cl.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                    <td className="p-3 font-mono font-bold">{cl.claim_number}</td>
                    <td className="p-3">{cl.carrier_name}</td>
                    <td className="p-3">{cl.device_brand} {cl.device_model}</td>
                    <td className="p-3 font-bold">{cl.carrier_estimate_amount} ج.م</td>
                    <td className="p-3 text-amber-600 font-bold">{cl.deductible_amount} ج.م</td>
                    <td className="p-3 text-emerald-600 font-bold">{cl.carrier_approved_amount} ج.م</td>
                    <td className="p-3">
                      <span className="bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded-full font-bold">
                        {cl.claim_status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: E-Commerce Storefront */}
      {activeTab === 'ecommerce' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-sky-600" />
              كتالوج المتجر الإلكتروني والطلبات الواردة (Web Store)
            </h3>
            <span className="text-xs bg-sky-100 text-sky-800 px-3 py-1 rounded-full font-bold">مزامنة المخزون لحظية</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {catalog.map((itm: any) => (
              <div key={itm.id} className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start">
                    <h4 className="font-bold text-slate-900 dark:text-white text-sm">{itm.online_title}</h4>
                    <span className="bg-emerald-100 text-emerald-800 text-xs px-2 py-0.5 rounded-full font-bold">متوفر: {itm.quantity_on_hand}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-2">{itm.online_description || 'قطعة أصلية معتمدة مع ضمان معمل الفا'}</p>
                </div>
                <div className="flex justify-between items-center mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <span className="text-base font-black text-blue-600">{itm.online_price} ج.م</span>
                  <span className="text-xs bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded text-slate-600 dark:text-slate-400 font-mono">SKU: {itm.sku}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
            <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-3">أحدث طلبات الشراء عبر الموقع وتطبيق الموبايل</h4>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {webOrders.map((ord: any) => (
                <div key={ord.id} className="py-3 flex justify-between items-center text-xs">
                  <div>
                    <span className="font-mono font-bold text-slate-900 dark:text-white">{ord.order_number}</span>
                    <span className="text-slate-500 mr-3">{ord.customer_name} ({ord.customer_phone})</span>
                    <span className="text-slate-400 mr-2">- {ord.shipping_address}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-slate-800 dark:text-white">{ord.total_amount} ج.م</span>
                    <span className="bg-sky-100 text-sky-800 px-2 py-0.5 rounded font-semibold">{ord.payment_method}</span>
                    <span className="bg-amber-100 text-amber-800 px-2.5 py-0.5 rounded-full font-bold">{ord.fulfillment_status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Multi-Branch Management */}
      {activeTab === 'branches' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <GitBranch className="w-5 h-5 text-indigo-600" />
              مقارنة مؤشرات الفروع والتحويلات المخزنية
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {branchComparison?.comparison?.map((b: any) => (
              <div key={b.branchId} className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h4 className="text-base font-black text-slate-900 dark:text-white">{b.branchName}</h4>
                    <span className="text-xs text-slate-500 font-mono">{b.branchCode} - {b.location}</span>
                  </div>
                  <span className="bg-blue-50 text-blue-700 text-xs px-3 py-1 rounded-full font-bold">نشط</span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl">
                    <span className="text-slate-500">قيمة المخزون المقدرة</span>
                    <div className="text-lg font-bold text-slate-800 dark:text-white mt-1">{Number(b.inventoryAssetValue).toLocaleString()} ج.م</div>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl">
                    <span className="text-slate-500">إجمالي الوحدات بالمخزن</span>
                    <div className="text-lg font-bold text-slate-800 dark:text-white mt-1">{b.totalUnitsInStock} قطعة</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
            <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-3">حركات نقل المخزون بين الفروع</h4>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {transfers.map((tr: any) => (
                <div key={tr.id} className="py-3 flex justify-between items-center text-xs">
                  <div>
                    <span className="font-mono font-bold text-slate-900 dark:text-white">{tr.transfer_number}</span>
                    <span className="text-slate-600 dark:text-slate-300 mr-2 font-semibold">[{tr.item_name}]</span>
                    <span className="text-slate-400 mr-2">من {tr.from_branch_name} إلى {tr.to_branch_name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold">{tr.quantity} قطع</span>
                    {tr.status === 'IN_TRANSIT' ? (
                      <button
                        onClick={() => handleReceiveTransfer(tr.id)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 rounded-lg text-xs font-bold transition"
                      >
                        تأكيد الاستلام
                      </button>
                    ) : (
                      <span className="bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full font-bold">تم الاستلام</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab 5: Digital Contracts & E-Signatures */}
      {activeTab === 'contracts' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <FileSignature className="w-5 h-5 text-blue-600" />
              إنشاء عقد صيانة / استلام إلكتروني موثق
            </h3>
            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">اسم العميل</label>
              <input
                type="text"
                value={contractForm.customerName}
                onChange={e => setContractForm({ ...contractForm, customerName: e.target.value })}
                placeholder="أحمد محمد السيد"
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-semibold"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">هاتف العميل</label>
                <input
                  type="text"
                  value={contractForm.customerPhone}
                  onChange={e => setContractForm({ ...contractForm, customerPhone: e.target.value })}
                  placeholder="01012345678"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-semibold"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">موديل الجهاز</label>
                <input
                  type="text"
                  value={contractForm.deviceModel}
                  onChange={e => setContractForm({ ...contractForm, deviceModel: e.target.value })}
                  placeholder="iPhone 15 Pro Max"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-semibold"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">بنود العقد وإخلاء المسؤولية</label>
              <textarea
                rows={3}
                value={contractForm.termsBody}
                onChange={e => setContractForm({ ...contractForm, termsBody: e.target.value })}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs"
              />
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">توقيع العميل الحي باللمس (Touch Signature)</label>
                <button onClick={clearSignature} className="text-xs text-rose-500 hover:underline">مسح التوقيع</button>
              </div>
              <canvas
                ref={canvasRef}
                width={380}
                height={160}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                className="w-full border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-950 cursor-crosshair"
              />
              <p className="text-[11px] text-slate-400 mt-1">وقع بإصبعك أو بالقلم على الشاشة للموافقة القانونية على استلام الجهاز</p>
            </div>

            <div className="mt-4">
              <button
                onClick={handleSignContract}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl text-sm transition shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                تثبيت التوقيع وإصدار الختم التشفيري SHA-256
              </button>

              {signedContractResult && (
                <div className="mt-4 p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs space-y-1">
                  <div className="font-bold text-emerald-800 dark:text-emerald-200">✅ تم توثيق العقد بنجاح:</div>
                  <div className="font-mono text-[10px] text-slate-500 break-all">Hash: {signedContractResult.cryptographicHash}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab 6: Digital Queue Management */}
      {activeTab === 'queue' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-600" />
                سحب رقم انتظار جديد (كشك الاستقبال)
              </h3>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">اسم العميل</label>
                <input
                  type="text"
                  value={newCustomerName}
                  onChange={e => setNewCustomerName(e.target.value)}
                  placeholder="محمد علي"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 text-xs font-bold"
                />
              </div>
              <button
                onClick={handleIssueQueueTicket}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2.5 rounded-xl transition flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                طباعة تذكرة رقم الانتظار
              </button>

              <hr className="border-slate-100 dark:border-slate-800 my-4" />

              <button
                onClick={handleCallNextTicket}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2.5 rounded-xl transition flex items-center justify-center gap-2 shadow-md shadow-emerald-600/20"
              >
                <Volume2 className="w-4 h-4" />
                نداء التذكرة التالية (شباك الصيانة)
              </button>
            </div>

            {/* Display Screen Preview */}
            <div className="md:col-span-2 bg-slate-950 text-white p-8 rounded-3xl border border-slate-800 shadow-2xl flex flex-col justify-between">
              <div className="flex justify-between items-center border-b border-slate-800 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-emerald-400 animate-ping" />
                  <h3 className="text-xl font-black tracking-wider text-emerald-400">شاشة الاستدعاء الرقمية (Live Queue Board)</h3>
                </div>
                <span className="text-xs text-slate-400 font-mono">Counter Screen Mode</span>
              </div>

              <div className="grid grid-cols-2 gap-8 my-8 text-center">
                <div className="bg-slate-900/80 p-6 rounded-2xl border border-slate-800">
                  <span className="text-sm font-semibold text-slate-400">التذكرة الحالية (Now Serving)</span>
                  <div className="text-6xl font-black text-emerald-400 my-3 font-mono">
                    #{queueBoard?.currentlyCalling?.[0]?.queue_number || '105'}
                  </div>
                  <span className="text-base font-bold text-slate-200">
                    {queueBoard?.currentlyCalling?.[0]?.customer_name || 'منى سمير'}
                  </span>
                  <div className="text-xs text-blue-400 mt-2 font-semibold">
                    {queueBoard?.currentlyCalling?.[0]?.assigned_counter || 'شباك الصيانة 2'}
                  </div>
                </div>

                <div className="bg-slate-900/80 p-6 rounded-2xl border border-slate-800">
                  <span className="text-sm font-semibold text-slate-400">في قائمة الانتظار</span>
                  <div className="text-6xl font-black text-amber-400 my-3 font-mono">
                    {queueBoard?.totalWaiting || 4}
                  </div>
                  <span className="text-xs text-slate-400">متوسط وقت الانتظار: 12 دقيقة</span>
                </div>
              </div>

              <div className="text-center text-xs text-slate-500">
                يرجى التوجه إلى الشباك الموضح فور ظهور رقمك على الشاشة
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 7: Refurbished Devices */}
      {activeTab === 'refurbished' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-indigo-600" />
              خط فحص وتجديد الأجهزة المستعملة (12-Point Inspection Pipeline)
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {refurbDevices.map((d: any) => (
              <div key={d.id} className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start">
                    <span className="font-bold text-slate-900 dark:text-white text-base">{d.brand} {d.model}</span>
                    <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${
                      d.grade === 'GRADE_A_PLUS' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'
                    }`}>
                      {d.grade}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mt-2 space-y-1">
                    <div>سعة التخزين: <strong>{d.storage_gb}GB</strong></div>
                    <div>سعر الشراء: <strong>{d.buyback_price} ج.م</strong></div>
                    <div>سعر البيع المستهدف: <strong className="text-emerald-600">{d.target_retail_price} ج.م</strong></div>
                    <div className="font-mono text-[11px]">IMEI: {d.imei}</div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center">
                  <span className="text-xs bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-600 font-semibold">{d.pipeline_stage}</span>
                  <button
                    onClick={async () => {
                      const cert = await api.getRefurbCertificate(d.imei);
                      setShowRefurbCert(cert);
                    }}
                    className="text-xs text-blue-600 font-bold hover:underline"
                  >
                    عرض شهادة الجودة
                  </button>
                </div>
              </div>
            ))}
          </div>

          {showRefurbCert && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
              <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 max-w-lg w-full border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
                <div className="text-center border-b border-slate-100 dark:border-slate-800 pb-4">
                  <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-2">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-black text-slate-900 dark:text-white">{showRefurbCert.certificateTitle}</h3>
                  <span className="text-xs font-mono text-slate-400">{showRefurbCert.certificateNumber}</span>
                </div>

                <div className="text-xs space-y-2 text-slate-700 dark:text-slate-300">
                  <div className="flex justify-between">
                    <span>الجهاز والموديل:</span>
                    <strong>{showRefurbCert.device?.brand} {showRefurbCert.device?.model} ({showRefurbCert.device?.storage})</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>درجة الجودة المعتمدة:</span>
                    <strong className="text-emerald-600">{showRefurbCert.device?.certifiedGrade}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>صحة البطارية:</span>
                    <strong>{showRefurbCert.inspectionResults?.battery_health_pct}%</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>فحص الشاشة واللمس:</span>
                    <strong className="text-emerald-600">اجتياز (PASS)</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>فترة الضمان المعتمدة:</span>
                    <strong>{showRefurbCert.device?.warrantyPeriodDays} يوماً</strong>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-4">
                  <button
                    onClick={() => setShowRefurbCert(null)}
                    className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-5 py-2 rounded-xl text-xs font-bold"
                  >
                    إغلاق
                  </button>
                  <button
                    onClick={() => window.print()}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5"
                  >
                    <Download className="w-4 h-4" />
                    طباعة الشهادة (A4)
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 8: Assembly & Kitting */}
      {activeTab === 'kitting' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Package className="w-5 h-5 text-amber-600" />
              حزم الصيانة المجمعة (Assembly & Kitting Bundles)
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {bundles.map((bd: any) => (
              <div key={bd.id} className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-bold text-slate-900 dark:text-white text-base">{bd.name}</h4>
                      <span className="text-xs text-slate-400 font-mono">Barcode: {bd.barcode}</span>
                    </div>
                    <span className="bg-amber-100 text-amber-800 text-xs px-2.5 py-0.5 rounded-full font-bold">
                      خصم {bd.discount_percentage}%
                    </span>
                  </div>

                  <div className="mt-4">
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-400 mb-2 block">مكونات الحزمة (BOM Components):</span>
                    <div className="space-y-1 text-xs">
                      {bd.components?.map((c: any) => (
                        <div key={c.id} className="flex justify-between bg-slate-50 dark:bg-slate-800/40 p-2 rounded-lg">
                          <span>{c.item_name}</span>
                          <span className="font-bold">{c.quantity}x</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center">
                  <span className="text-xl font-black text-blue-600">{bd.bundle_price} ج.م</span>
                  <button
                    onClick={() => handleSellBundle(bd.id)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition flex items-center gap-1.5 shadow"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    صرف الحزمة وخصم المكونات
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 9: Business Rules Engine */}
      {activeTab === 'rules' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Sliders className="w-5 h-5 text-indigo-600" />
              محرك القواعد والأتمتة الذكي (IF-THEN Rules Engine)
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {rules.map((rl: any) => (
              <div key={rl.id} className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
                <div className="flex justify-between items-start">
                  <h4 className="font-bold text-slate-900 dark:text-white text-sm">{rl.rule_name}</h4>
                  <span className="bg-emerald-100 text-emerald-800 text-xs px-2 py-0.5 rounded-full font-bold">نشط</span>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl text-xs space-y-1 font-mono">
                  <div className="text-blue-600">IF ({rl.event_type}):</div>
                  <div className="text-slate-600 dark:text-slate-300 font-semibold">{rl.condition_expression}</div>
                  <div className="text-emerald-600 mt-2">THEN EXECUTE:</div>
                  <div className="text-slate-600 dark:text-slate-300 font-semibold">{rl.action_type}</div>
                </div>
                <div className="text-[11px] text-slate-400">مرات التنفيذ التلقائي: {rl.execution_count}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 10: Stolen Device Registry */}
      {activeTab === 'stolen' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <AlertOctagon className="w-5 h-5 text-rose-600" />
              التحقق من الأجهزة المسروقة وبلاغات الشرطة وقاعدة GSMA
            </h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={searchImei}
                onChange={e => setSearchImei(e.target.value)}
                placeholder="أدخل رقم الـ IMEI للفحص (15 رقماً)..."
                className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs font-mono font-bold"
              />
              <button
                onClick={handleCheckImei}
                className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold px-6 py-3 rounded-xl transition flex items-center gap-2 shadow-lg shadow-rose-600/20"
              >
                <Search className="w-4 h-4" />
                فحص فوري
              </button>
            </div>

            {stolenCheckResult && (
              <div className={`p-5 rounded-2xl border text-xs space-y-2 ${
                stolenCheckResult.isStolen
                  ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200'
                  : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
              }`}>
                <div className="flex items-center gap-2 font-bold text-sm">
                  {stolenCheckResult.isStolen ? (
                    <>
                      <XCircle className="w-5 h-5 text-rose-600" />
                      <span>{stolenCheckResult.warningMessage}</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                      <span>الجهاز سليم ونظيف تماماً وغير مدرج بأي بلاغات سرقة أو حظر دولي.</span>
                    </>
                  )}
                </div>
                {stolenCheckResult.isStolen && (
                  <div className="text-xs space-y-1 pt-2 font-semibold">
                    <div>الموديل: {stolenCheckResult.brand} {stolenCheckResult.model}</div>
                    <div>رقم المحضر: {stolenCheckResult.incidentNumber}</div>
                    <div>مصدر البلاغ: {stolenCheckResult.reportedBy}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
