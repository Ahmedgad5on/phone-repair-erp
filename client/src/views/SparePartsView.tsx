import React, { useState, useEffect } from 'react';
import { Item, CompatibilityMapping, RmaTicket } from '../types/erp';
import { api } from '../services/api';
import { useLanguage } from '../i18n/LanguageContext';
import { useToast } from '../context/ToastContext';
import {
  Cpu,
  Search,
  Layers,
  ShieldCheck,
  TrendingDown,
  FileText,
  Plus,
  PackageCheck,
  Building2,
  Phone,
  Trash2,
  Tag,
  AlertTriangle,
  ArrowUpDown,
  Clock
} from 'lucide-react';
import { ClearanceModal } from '../components/inventory/ClearanceModal';
import { ItemCompatibilityModal } from '../components/inventory/ItemCompatibilityModal';
import { inventoryApi, DeadStockResponse } from '../components/inventory/inventoryApi';

export const SparePartsView: React.FC = () => {
  const { t } = useLanguage();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<'catalog' | 'compatibility' | 'rma' | 'po' | 'dead_stock'>('catalog');
  const [parts, setParts] = useState<Item[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [gradeFilter, setGradeFilter] = useState('');

  // Dead Stock state (R3.2)
  const [deadStockDays, setDeadStockDays] = useState<number>(90);
  const [deadStockData, setDeadStockData] = useState<DeadStockResponse | null>(null);
  const [deadStockLoading, setDeadStockLoading] = useState<boolean>(false);
  const [deadStockSortBy, setDeadStockSortBy] = useState<'name' | 'stock_quantity' | 'total_tied_capital' | 'days_inactive'>('days_inactive');
  const [deadStockSortOrder, setDeadStockSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedItemForClearance, setSelectedItemForClearance] = useState<any | null>(null);
  const [showClearanceModal, setShowClearanceModal] = useState<boolean>(false);

  // Item compatibility modal state (R3.10)
  const [selectedPartForCompatibility, setSelectedPartForCompatibility] = useState<any | null>(null);
  const [showCompatibilityModal, setShowCompatibilityModal] = useState<boolean>(false);

  // Compatibility matrix
  const [compatibilityList, setCompatibilityList] = useState<CompatibilityMapping[]>([]);
  const [compatSearch, setCompatSearch] = useState('');

  // RMA tickets & defect rates
  const [rmas, setRmas] = useState<RmaTicket[]>([]);
  const [defectAnalytics, setDefectAnalytics] = useState<any[]>([]);
  const [showNewRmaModal, setShowNewRmaModal] = useState(false);
  const [rmaForm, setRmaForm] = useState({
    item_id: '',
    vendor_name: 'Shenzhen Apex Wholesale',
    security_sticker_intact: true,
    soldering_trace_detected: false,
    defect_reason: 'خطوط بيضاء في الشاشة فور أول تشغيل',
    vendor_batch_code: 'BATCH-2026-AUG-B12'
  });

  // Purchase Orders (PO) state
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [showNewPoModal, setShowNewPoModal] = useState(false);
  const [poForm, setPoForm] = useState({
    supplier_name: '',
    supplier_phone: '',
    notes: '',
    items: [
      { item_name: 'iPhone 13 Pro Screen OLED Hard', quantity: 5, estimated_unit_cost: 2100 }
    ]
  });

  const loadParts = async () => {
    try {
      const data = await api.getPartsCatalog({ q: searchQuery, grade: gradeFilter || undefined });
      setParts(data);
    } catch (e: any) {
      console.error(e);
      showToast(e.message || 'فشل تحميل كتالوج قطع الغيار', 'error');
    }
  };

  const loadCompatibility = async () => {
    try {
      const data = await api.getCompatibility(compatSearch);
      setCompatibilityList(data);
    } catch (e: any) {
      console.error(e);
      showToast(e.message || 'فشل تحميل مصفوفة التوافق', 'error');
    }
  };

  const loadRma = async () => {
    try {
      const rmaData = await api.getRmaTickets();
      setRmas(rmaData);
      const rates = await api.getRmaAnalytics();
      setDefectAnalytics(rates);
    } catch (e: any) {
      console.error(e);
      showToast(e.message || 'فشل تحميل سجل المرتجعات', 'error');
    }
  };

  const loadPurchaseOrders = async () => {
    try {
      const pos = await api.getPurchaseOrders();
      setPurchaseOrders(pos);
    } catch (e: any) {
      console.error(e);
      showToast(e.message || 'فشل تحميل أوامر الشراء', 'error');
    }
  };

  const loadDeadStock = async (days: number = deadStockDays) => {
    setDeadStockLoading(true);
    try {
      const data = await inventoryApi.getDeadStock(days);
      setDeadStockData(data);
    } catch (e: any) {
      console.error(e);
      showToast(e.message || 'فشل تحميل تقرير المخزون الراكد', 'error');
    } finally {
      setDeadStockLoading(false);
    }
  };

  useEffect(() => {
    loadParts();
  }, [searchQuery, gradeFilter]);

  useEffect(() => {
    if (activeTab === 'compatibility') loadCompatibility();
    if (activeTab === 'rma') loadRma();
    if (activeTab === 'po') loadPurchaseOrders();
    if (activeTab === 'dead_stock') loadDeadStock(deadStockDays);
  }, [activeTab, compatSearch, deadStockDays]);

  const handleCreateRma = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.createRmaTicket(rmaForm);
      if (res.rma?.status === 'REJECTED') {
        showToast(`تم رفض المرتجع: ${res.policyAlert}`, 'warning');
      } else {
        showToast('تم تسجيل مطالبة المرتجع بنجاح وحفظها للمورد.', 'success');
      }
      setShowNewRmaModal(false);
      loadRma();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleUpdateRmaStatus = async (id: string, status: string) => {
    try {
      await api.updateRmaStatus(id, status);
      showToast(status === 'APPROVED' ? 'تمت الموافقة على تعويض المرتجع' : 'تم رفض المرتجع لعدم استيفاء الشروط', 'info');
      loadRma();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleCreatePo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!poForm.supplier_name.trim()) {
      showToast('يرجى كتابة اسم المورد', 'error');
      return;
    }
    try {
      await api.createPurchaseOrder(poForm);
      showToast('تم إنشاء أمر الشراء والتوريد بنجاح', 'success');
      setShowNewPoModal(false);
      setPoForm({
        supplier_name: '',
        supplier_phone: '',
        notes: '',
        items: [{ item_name: '', quantity: 1, estimated_unit_cost: 0 }]
      });
      loadPurchaseOrders();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleReceivePo = async (poId: string) => {
    try {
      await api.receivePurchaseOrder(poId);
      showToast('تم استلام بضاعة التوريد بنجاح وإيداعها في مخزن قطع الغيار!', 'success');
      loadPurchaseOrders();
      loadParts();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const addPoItemRow = () => {
    setPoForm({
      ...poForm,
      items: [...poForm.items, { item_name: '', quantity: 1, estimated_unit_cost: 0 }]
    });
  };

  const removePoItemRow = (index: number) => {
    setPoForm({
      ...poForm,
      items: poForm.items.filter((_, i) => i !== index)
    });
  };

  const updatePoItem = (index: number, field: string, value: any) => {
    const updated = [...poForm.items];
    updated[index] = { ...updated[index], [field]: value };
    setPoForm({ ...poForm, items: updated });
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 select-text">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-wide flex items-center gap-2.5">
            <Cpu className="w-6 h-6 text-purple-400" />
            {t.spareParts.title}
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            {t.spareParts.subtitle}
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-1 flex items-center">
          <button
            onClick={() => setActiveTab('catalog')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
              activeTab === 'catalog' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            {t.spareParts.catalogTab}
          </button>
          <button
            onClick={() => setActiveTab('compatibility')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
              activeTab === 'compatibility' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            {t.spareParts.compatTab}
          </button>
          <button
            onClick={() => setActiveTab('rma')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
              activeTab === 'rma' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            {t.spareParts.rmaTab}
          </button>
          <button
            onClick={() => setActiveTab('po')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
              activeTab === 'po' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            أوامر التوريد (PO)
          </button>
          <button
            onClick={() => setActiveTab('dead_stock')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition flex items-center gap-1 ${
              activeTab === 'dead_stock' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Clock className="w-3.5 h-3.5 text-rose-400" />
            المخزون الراكد (Dead Stock)
          </button>
        </div>
      </div>

      {/* Catalog & 3-Tier Pricing Tab */}
      {activeTab === 'catalog' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 p-3 rounded-xl border border-slate-800">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="w-4 h-4 text-slate-500 absolute start-3 top-2.5" />
              <input
                type="text"
                placeholder={t.spareParts.searchPlaceholder}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg ps-9 pe-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-purple-500"
              />
            </div>

            <select
              value={gradeFilter}
              onChange={e => setGradeFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 text-xs text-slate-300 rounded-lg px-3 py-2 focus:outline-hidden"
            >
              <option value="">{t.spareParts.allGrades}</option>
              <option value="SERVICE_PACK">{t.spareParts.gradeServicePack}</option>
              <option value="ORIGINAL_PULL">{t.spareParts.gradeOriginalPull}</option>
              <option value="OLED">{t.spareParts.gradeOled}</option>
              <option value="INCELL">{t.spareParts.gradeIncell}</option>
              <option value="REFURBISHED">{t.spareParts.gradeRefurbished}</option>
            </select>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
            <table className="w-full text-start text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 uppercase font-semibold border-b border-slate-800 text-[11px]">
                <tr>
                  <th className="px-4 py-3">الصنف والموديل</th>
                  <th className="px-4 py-3">فئة الجودة</th>
                  <th className="px-4 py-3">{t.spareParts.tier1Wholesale}</th>
                  <th className="px-4 py-3">{t.spareParts.tier2Retail}</th>
                  <th className="px-4 py-3">{t.spareParts.tier3Bulk}</th>
                  <th className="px-4 py-3">المخزون</th>
                  <th className="px-4 py-3">{t.spareParts.compatCol}</th>
                  <th className="px-4 py-3 text-end">التوافق</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {parts.map(p => (
                  <tr key={p.id} className="hover:bg-slate-800/40 transition">
                    <td className="px-4 py-3 font-semibold text-white">
                      <div>{p.name}</div>
                      <span className="font-mono text-[10px] text-slate-500">{p.sku}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold border ${
                          p.quality_grade === 'SERVICE_PACK'
                            ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                            : p.quality_grade === 'ORIGINAL_PULL'
                            ? 'bg-sky-950 text-sky-300 border-sky-800'
                            : p.quality_grade === 'INCELL'
                            ? 'bg-amber-950 text-amber-300 border-amber-800'
                            : 'bg-purple-950 text-purple-300 border-purple-800'
                        }`}
                      >
                        {p.quality_grade}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono font-bold text-emerald-400">
                      {p.wholesale_price} {t.common.currency}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-300">
                      {p.retail_price} {t.common.currency}
                    </td>
                    <td className="px-4 py-3 font-mono text-indigo-400 font-semibold">
                      {p.bulk_price || '-'} {p.bulk_price ? t.common.currency : ''}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`font-mono font-bold ${
                          p.stock_quantity <= (p.min_limit || 2)
                            ? 'text-rose-400'
                            : 'text-slate-200'
                        }`}
                      >
                        {p.stock_quantity}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-slate-400 text-[11px] max-w-xs truncate">
                      {p.compatible_models || '-'}
                    </td>
                    <td className="px-4 py-3 text-end">
                      <button
                        onClick={() => {
                          setSelectedPartForCompatibility(p);
                          setShowCompatibilityModal(true);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-purple-900/50 text-purple-300 border border-purple-800/40 text-[11px] font-medium transition"
                        title="إدارة توافق الموديلات"
                      >
                        <Layers className="w-3 h-3" />
                        إدارة التوافق
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Cross-Model Compatibility Matrix */}
      {activeTab === 'compatibility' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 bg-slate-900 p-3 rounded-xl border border-slate-800">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-500 absolute start-3 top-2.5" />
              <input
                type="text"
                placeholder="ابحث بموديل الهاتف المستهدف أو كود الشاشة..."
                value={compatSearch}
                onChange={e => setCompatSearch(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg ps-9 pe-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-purple-500"
              />
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
            <div className="p-4 border-b border-slate-800">
              <h3 className="font-semibold text-white text-sm flex items-center gap-2">
                <Layers className="w-4 h-4 text-purple-400" />
                {t.spareParts.compatMatrixTitle}
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                {t.spareParts.compatMatrixDesc}
              </p>
            </div>

            <table className="w-full text-start text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 uppercase font-semibold border-b border-slate-800 text-[11px]">
                <tr>
                  <th className="px-4 py-3">القطعة الأساسية</th>
                  <th className="px-4 py-3">{t.spareParts.targetModelCol}</th>
                  <th className="px-4 py-3">فئة الجودة</th>
                  <th className="px-4 py-3">{t.spareParts.compatNotesCol}</th>
                  <th className="px-4 py-3">مخزون القطعة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {compatibilityList.map(c => (
                  <tr key={c.id} className="hover:bg-slate-800/40">
                    <td className="px-4 py-3 font-semibold text-white">
                      {c.part_name}
                      <div className="font-mono text-[10px] text-slate-500">{c.sku}</div>
                    </td>
                    <td className="px-4 py-3 font-bold text-indigo-300">
                      {c.target_brand} {c.target_model}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-950 border border-slate-800">
                        {c.quality_grade}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400">{c.notes || 'متوافق تماماً بدون أي تعديلات'}</td>
                    <td className="px-4 py-3 font-mono font-bold text-white">{c.stock_quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* RMA & Defect Rates Tab */}
      {activeTab === 'rma' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-3">
              <h3 className="font-semibold text-white text-sm flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-rose-400" />
                {t.spareParts.vendorDefectRates}
              </h3>
              <p className="text-xs text-slate-400">
                إحصائيات عيوب الصناعة الفعلية المكتشفة بالمعمل لكل مورد لفرز واستبعاد الموردين الرديئين:
              </p>

              <div className="space-y-2">
                {defectAnalytics.map((d, i) => {
                  const defectRate = d.total_rma > 0 ? Math.round((d.rejected_rma / d.total_rma) * 100) : 0;
                  return (
                    <div
                      key={i}
                      className="flex items-center justify-between p-3 bg-slate-950 rounded-lg border border-slate-800 text-xs"
                    >
                      <div>
                        <div className="font-bold text-white">{d.vendor_name}</div>
                        <span className="text-[11px] text-slate-400">
                          إجمالي المطالبات: {d.total_rma} | مقبولة: {d.accepted_rma} | مرفوضة: {d.rejected_rma}
                        </span>
                      </div>
                      <span
                        className={`font-mono font-bold text-xs px-2.5 py-1 rounded border ${
                          defectRate > 25
                            ? 'bg-rose-950 text-rose-300 border-rose-800'
                            : 'bg-emerald-950 text-emerald-300 border-emerald-800'
                        }`}
                      >
                        {defectRate}% نسبة الرفض
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-3 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-white text-sm flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-sky-400" />
                    {t.spareParts.rmaTitle}
                  </h3>
                  <button
                    onClick={() => setShowNewRmaModal(true)}
                    className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded text-xs font-semibold shadow-md shadow-purple-600/30 transition"
                  >
                    {t.spareParts.logRmaBtn}
                  </button>
                </div>
                <p className="text-xs text-slate-400">
                  الشروط الصارمة: يجب أن يكون الستيكر الهولوجرامي الأمني للمورد غير ممزق، وخلو الفلاتات من أي آثار لحام أو كاوية أو حرارة زائدة.
                </p>
              </div>
              <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 text-xs text-slate-400">
                ⚡ النظام يرفض تلقائياً أي مطالبة يثبت فيها لحام على الفلاتة أو خدش ختومات الضمان لمنع الخسائر غير المستردة من الموردين.
              </div>
            </div>
          </div>

          {/* RMA Claims Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
            <div className="p-4 border-b border-slate-800">
              <h3 className="font-semibold text-white text-sm">سجل مطالبات المرتجعات RMA وحالة الفحص الفني</h3>
            </div>
            <table className="w-full text-start text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 uppercase font-semibold border-b border-slate-800 text-[11px]">
                <tr>
                  <th className="px-4 py-3">اسم القطعة</th>
                  <th className="px-4 py-3">المورد</th>
                  <th className="px-4 py-3">{t.spareParts.securitySealCol}</th>
                  <th className="px-4 py-3">{t.spareParts.solderTraceCol}</th>
                  <th className="px-4 py-3">{t.spareParts.defectReasonCol}</th>
                  <th className="px-4 py-3">{t.common.status}</th>
                  <th className="px-4 py-3 text-end">{t.common.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {rmas.map(r => (
                  <tr key={r.id} className="hover:bg-slate-800/40">
                    <td className="px-4 py-3 font-semibold text-white">{r.item_name}</td>
                    <td className="px-4 py-3 font-mono text-purple-300">{r.vendor_name}</td>
                    <td className="px-4 py-3">
                      <span className={r.security_sticker_intact ? 'text-emerald-400' : 'text-rose-400 font-bold'}>
                        {r.security_sticker_intact ? t.spareParts.intactSeal : t.spareParts.voidSeal}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={r.soldering_trace_detected ? 'text-rose-400 font-bold' : 'text-emerald-400'}>
                        {r.soldering_trace_detected ? t.spareParts.solderDetected : t.spareParts.solderClean}
                      </span>
                    </td>
                    <td className="px-4 py-3 max-w-xs truncate text-slate-300">{r.defect_reason}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                          r.status === 'APPROVED'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            : r.status === 'REJECTED'
                            ? 'bg-rose-950 text-rose-400 border border-rose-800'
                            : 'bg-amber-950 text-amber-400 border border-amber-800'
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-end space-x-1">
                      {r.status === 'PENDING' && (
                        <>
                          <button
                            onClick={() => handleUpdateRmaStatus(r.id, 'APPROVED')}
                            className="px-2 py-1 bg-emerald-700 hover:bg-emerald-600 text-white rounded text-[11px] transition"
                          >
                            {t.spareParts.approveRma}
                          </button>
                          <button
                            onClick={() => handleUpdateRmaStatus(r.id, 'REJECTED')}
                            className="px-2 py-1 bg-rose-800 hover:bg-rose-700 text-white rounded text-[11px] transition"
                          >
                            {t.spareParts.rejectRma}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Purchase Orders (PO) Tab */}
      {activeTab === 'po' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div>
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <FileText className="w-5 h-5 text-purple-400" />
                أوامر الشراء والتوريد للموردين (Purchase Orders)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                إدارة طلبيات قطع الغيار والشاشات من المستوردين ومتابعة استلامها إلى المخزن وتحديث الأرصدة تلقائياً.
              </p>
            </div>
            <button
              onClick={() => setShowNewPoModal(true)}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-lg shadow-purple-600/30 transition"
            >
              <Plus className="w-4 h-4" />
              إنشاء أمر شراء جديد (PO)
            </button>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
            <table className="w-full text-start text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 uppercase font-semibold border-b border-slate-800 text-[11px]">
                <tr>
                  <th className="px-4 py-3">رقم الأمر</th>
                  <th className="px-4 py-3">المورد</th>
                  <th className="px-4 py-3">هاتف المورد</th>
                  <th className="px-4 py-3">عدد الأصناف</th>
                  <th className="px-4 py-3">إجمالي التكلفة المتوقعة</th>
                  <th className="px-4 py-3">تاريخ الطلب</th>
                  <th className="px-4 py-3">{t.common.status}</th>
                  <th className="px-4 py-3 text-end">{t.common.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {purchaseOrders.map(po => (
                  <tr key={po.id} className="hover:bg-slate-800/40 transition">
                    <td className="px-4 py-3 font-mono font-bold text-purple-300">
                      #{po.po_number}
                    </td>
                    <td className="px-4 py-3 font-semibold text-white flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-slate-500" />
                      {po.supplier_name}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-400">
                      {po.supplier_phone || '-'}
                    </td>
                    <td className="px-4 py-3 font-mono">
                      {po.item_count || 1} أصناف
                    </td>
                    <td className="px-4 py-3 font-mono font-bold text-emerald-400">
                      {Number(po.total_amount).toLocaleString()} {t.common.currency}
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-400 text-[11px]">
                      {new Date(po.created_at).toLocaleDateString('ar-EG')}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
                          po.status === 'RECEIVED'
                            ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                            : po.status === 'CANCELLED'
                            ? 'bg-rose-950 text-rose-300 border-rose-800'
                            : 'bg-amber-950 text-amber-300 border-amber-800'
                        }`}
                      >
                        {po.status === 'RECEIVED' ? 'تم الاستلام بالمخزن' : po.status === 'CANCELLED' ? 'ملغي' : 'قيد التوريد'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-end">
                      {po.status === 'ORDERED' && (
                        <button
                          onClick={() => handleReceivePo(po.id)}
                          className="px-3 py-1 bg-emerald-700 hover:bg-emerald-600 text-white rounded text-[11px] font-semibold flex items-center gap-1 ms-auto transition"
                        >
                          <PackageCheck className="w-3.5 h-3.5" />
                          استلام وإيداع بالمخزن
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {purchaseOrders.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                      لا توجد أوامر شراء حالياً. اضغط على زر &quot;إنشاء أمر شراء جديد&quot; لبدء طلب توريد.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Dead Stock & Tied Capital Report Tab (R3.2) */}
      {activeTab === 'dead_stock' && (
        <div className="space-y-4">
          {/* Header Controls */}
          <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900 p-4 rounded-xl border border-slate-800">
            <div>
              <h3 className="font-semibold text-white text-sm flex items-center gap-2">
                <Clock className="w-4 h-4 text-rose-400" />
                تحليل المخزون الراكد ورأس المال المجمّد (Dead Stock Analytics)
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                تحديد قطع الغيار والأجهزة الراكدة التي لم تشهد أي حركة بيع أو سحب لتصفيتها وتحرير السيولة النقدية.
              </p>
            </div>

            {/* Inactivity Threshold Filter */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">فترة الركود:</span>
              <div className="bg-slate-950 border border-slate-800 rounded-lg p-1 flex items-center gap-1">
                {[30, 60, 90, 180].map(days => (
                  <button
                    key={days}
                    onClick={() => setDeadStockDays(days)}
                    className={`px-3 py-1 rounded text-xs font-semibold transition ${
                      deadStockDays === days
                        ? 'bg-rose-700 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {days} يوم
                  </button>
                ))}
              </div>
              <button
                onClick={() => loadDeadStock(deadStockDays)}
                disabled={deadStockLoading}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition"
              >
                {deadStockLoading ? 'جاري التحميل...' : 'تحديث'}
              </button>
            </div>
          </div>

          {/* KPI Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400">إجمالي الأصناف الراكدة</p>
                <p className="text-2xl font-bold font-mono text-rose-400 mt-1">
                  {deadStockData?.total_dead_items ?? 0}
                </p>
                <span className="text-[11px] text-slate-500">صنف بدون حركة &gt; {deadStockDays} يوم</span>
              </div>
              <div className="w-12 h-12 rounded-xl bg-rose-950/60 border border-rose-800/40 flex items-center justify-center text-rose-400">
                <AlertTriangle className="w-6 h-6" />
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400">إجمالي القطع الراكدة</p>
                <p className="text-2xl font-bold font-mono text-amber-400 mt-1">
                  {deadStockData?.total_dead_units ?? 0}
                </p>
                <span className="text-[11px] text-slate-500">قطعة مخزنة بالمستودع</span>
              </div>
              <div className="w-12 h-12 rounded-xl bg-amber-950/60 border border-amber-800/40 flex items-center justify-center text-amber-400">
                <Layers className="w-6 h-6" />
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400">رأس المال المجمد</p>
                <p className="text-2xl font-bold font-mono text-emerald-400 mt-1">
                  {Number(deadStockData?.total_tied_capital || 0).toLocaleString()} {t.common.currency}
                </p>
                <span className="text-[11px] text-slate-500">سيولة محبوسة في المخزون الراكد</span>
              </div>
              <div className="w-12 h-12 rounded-xl bg-emerald-950/60 border border-emerald-800/40 flex items-center justify-center text-emerald-400">
                <Tag className="w-6 h-6" />
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
            <table className="w-full text-start text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 uppercase font-semibold border-b border-slate-800 text-[11px]">
                <tr>
                  <th
                    onClick={() => {
                      if (deadStockSortBy === 'name') setDeadStockSortOrder(deadStockSortOrder === 'asc' ? 'desc' : 'asc');
                      else { setDeadStockSortBy('name'); setDeadStockSortOrder('asc'); }
                    }}
                    className="px-4 py-3 cursor-pointer hover:text-white"
                  >
                    <div className="flex items-center gap-1">
                      <span>الصنف والكود</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-500" />
                    </div>
                  </th>
                  <th className="px-4 py-3">التصنيف</th>
                  <th
                    onClick={() => {
                      if (deadStockSortBy === 'stock_quantity') setDeadStockSortOrder(deadStockSortOrder === 'asc' ? 'desc' : 'asc');
                      else { setDeadStockSortBy('stock_quantity'); setDeadStockSortOrder('desc'); }
                    }}
                    className="px-4 py-3 cursor-pointer hover:text-white"
                  >
                    <div className="flex items-center gap-1">
                      <span>الكمية المتوفرة</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-500" />
                    </div>
                  </th>
                  <th className="px-4 py-3">تكلفة الوحدة</th>
                  <th
                    onClick={() => {
                      if (deadStockSortBy === 'total_tied_capital') setDeadStockSortOrder(deadStockSortOrder === 'asc' ? 'desc' : 'asc');
                      else { setDeadStockSortBy('total_tied_capital'); setDeadStockSortOrder('desc'); }
                    }}
                    className="px-4 py-3 cursor-pointer hover:text-white"
                  >
                    <div className="flex items-center gap-1">
                      <span>رأس المال المجمد</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-500" />
                    </div>
                  </th>
                  <th
                    onClick={() => {
                      if (deadStockSortBy === 'days_inactive') setDeadStockSortOrder(deadStockSortOrder === 'asc' ? 'desc' : 'asc');
                      else { setDeadStockSortBy('days_inactive'); setDeadStockSortOrder('desc'); }
                    }}
                    className="px-4 py-3 cursor-pointer hover:text-white"
                  >
                    <div className="flex items-center gap-1">
                      <span>أيام الركود</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-500" />
                    </div>
                  </th>
                  <th className="px-4 py-3 text-end">إجراءات التصفية</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {deadStockLoading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                      جاري فحص حركات المخزون وحساب رأس المال المجمد...
                    </td>
                  </tr>
                ) : (deadStockData?.items || []).length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                      ممتاز! لا توجد قطع غيار أو أصناف راكدة لأكثر من {deadStockDays} يوماً.
                    </td>
                  </tr>
                ) : (
                  [...(deadStockData?.items || [])]
                    .sort((a, b) => {
                      const valA = a[deadStockSortBy];
                      const valB = b[deadStockSortBy];
                      if (typeof valA === 'string') {
                        return deadStockSortOrder === 'asc'
                          ? valA.localeCompare(valB as string)
                          : (valB as string).localeCompare(valA);
                      }
                      return deadStockSortOrder === 'asc'
                        ? Number(valA) - Number(valB)
                        : Number(valB) - Number(valA);
                    })
                    .map(item => (
                      <tr key={item.id} className="hover:bg-slate-800/40 transition">
                        <td className="px-4 py-3 font-semibold text-white">
                          <div>{item.name}</div>
                          <span className="font-mono text-[10px] text-slate-500">{item.sku}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded text-[10px] bg-slate-950 border border-slate-800 text-slate-300">
                            {item.category}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono font-bold text-slate-200">
                          {item.stock_quantity}
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-300">
                          {Number(item.purchase_price || 0).toLocaleString()} {t.common.currency}
                        </td>
                        <td className="px-4 py-3 font-mono font-bold text-rose-400">
                          {Number(item.total_tied_capital || 0).toLocaleString()} {t.common.currency}
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded font-mono font-semibold text-[11px] bg-rose-950 text-rose-300 border border-rose-800">
                            {item.days_inactive} يوم
                          </span>
                        </td>
                        <td className="px-4 py-3 text-end">
                          <button
                            onClick={() => {
                              setSelectedItemForClearance(item);
                              setShowClearanceModal(true);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-950/80 hover:bg-rose-900 text-rose-200 border border-rose-800 text-xs font-semibold transition"
                            title="تحديد سعر تصفية وخصم للبيع السريع"
                          >
                            <Tag className="w-3.5 h-3.5" />
                            عرض للتصفية
                          </button>
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Log RMA Modal */}
      {showNewRmaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-md w-full space-y-4 text-xs">
            <h3 className="font-semibold text-white text-base flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-purple-400" />
              {t.spareParts.logRmaBtn}
            </h3>
            <form onSubmit={handleCreateRma} className="space-y-3">
              <div>
                <label className="block text-slate-300 mb-1">اختر الصنف التالف</label>
                <select
                  required
                  value={rmaForm.item_id}
                  onChange={e => setRmaForm({ ...rmaForm, item_id: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-white focus:outline-hidden focus:border-purple-500"
                >
                  <option value="">-- اختر الصنف --</option>
                  {parts.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-300 mb-1">اسم المورد</label>
                <input
                  type="text"
                  required
                  value={rmaForm.vendor_name}
                  onChange={e => setRmaForm({ ...rmaForm, vendor_name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-white focus:outline-hidden focus:border-purple-500"
                />
              </div>

              <div className="space-y-2 p-3 bg-slate-950 rounded border border-slate-800">
                <span className="font-semibold text-slate-300 block">فحص سياسة الضمان الصارمة:</span>
                <label className="flex items-center gap-2 text-slate-300">
                  <input
                    type="checkbox"
                    checked={rmaForm.security_sticker_intact}
                    onChange={e => setRmaForm({ ...rmaForm, security_sticker_intact: e.target.checked })}
                    className="rounded border-slate-700 bg-slate-900"
                  />
                  <span>ستيكر وأختام أمان المورد سليمة تماماً وغير ممزقة</span>
                </label>
                <label className="flex items-center gap-2 text-slate-300">
                  <input
                    type="checkbox"
                    checked={rmaForm.soldering_trace_detected}
                    onChange={e => setRmaForm({ ...rmaForm, soldering_trace_detected: e.target.checked })}
                    className="rounded border-slate-700 bg-slate-900"
                  />
                  <span className="text-rose-400">يوجد آثار لحام أو حرارة على الفلاتات (يلغي الضمان فوراً)</span>
                </label>
              </div>

              <div>
                <label className="block text-slate-300 mb-1">{t.spareParts.defectReasonCol}</label>
                <textarea
                  rows={2}
                  required
                  value={rmaForm.defect_reason}
                  onChange={e => setRmaForm({ ...rmaForm, defect_reason: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-white focus:outline-hidden focus:border-purple-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewRmaModal(false)}
                  className="px-3 py-2 text-slate-400 hover:text-white"
                >
                  {t.common.cancel}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded font-semibold transition"
                >
                  تسجيل المرتجع
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Purchase Order Modal */}
      {showNewPoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-lg w-full space-y-4 text-xs">
            <h3 className="font-semibold text-white text-base flex items-center gap-2">
              <FileText className="w-5 h-5 text-purple-400" />
              إنشاء أمر توريد وشراء جديد للمورد (Purchase Order)
            </h3>
            <form onSubmit={handleCreatePo} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 mb-1">اسم شركة المورد / المستورد *</label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: Shenzhen Apex Co."
                    value={poForm.supplier_name}
                    onChange={e => setPoForm({ ...poForm, supplier_name: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-white focus:outline-hidden focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1">هاتف المورد</label>
                  <input
                    type="text"
                    placeholder="01012345678"
                    value={poForm.supplier_phone}
                    onChange={e => setPoForm({ ...poForm, supplier_phone: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-white font-mono focus:outline-hidden focus:border-purple-500"
                  />
                </div>
              </div>

              {/* Items List */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-300">أصناف أمر الشراء:</span>
                  <button
                    type="button"
                    onClick={addPoItemRow}
                    className="text-[11px] text-purple-400 hover:text-purple-300 font-semibold flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    إضافة بند آخر
                  </button>
                </div>

                <div className="space-y-2 max-h-48 overflow-y-auto pe-1">
                  {poForm.items.map((itm, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-slate-950 p-2 rounded-lg border border-slate-800">
                      <input
                        type="text"
                        required
                        placeholder="اسم الصنف / القطعة"
                        value={itm.item_name}
                        onChange={e => updatePoItem(idx, 'item_name', e.target.value)}
                        className="flex-1 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-xs"
                      />
                      <input
                        type="number"
                        min="1"
                        required
                        placeholder="الكمية"
                        value={itm.quantity}
                        onChange={e => updatePoItem(idx, 'quantity', parseInt(e.target.value) || 1)}
                        className="w-16 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white font-mono text-xs text-center"
                      />
                      <input
                        type="number"
                        min="0"
                        placeholder="سعر الوحدة"
                        value={itm.estimated_unit_cost}
                        onChange={e => updatePoItem(idx, 'estimated_unit_cost', parseFloat(e.target.value) || 0)}
                        className="w-24 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white font-mono text-xs text-end"
                      />
                      {poForm.items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removePoItemRow(idx)}
                          className="text-slate-500 hover:text-rose-400 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-slate-300 mb-1">ملاحظات التوريد والشحن</label>
                <textarea
                  rows={2}
                  placeholder="موعد الاستلام المتوقع أو أي شروط خاصة..."
                  value={poForm.notes}
                  onChange={e => setPoForm({ ...poForm, notes: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-white text-xs focus:outline-hidden focus:border-purple-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewPoModal(false)}
                  className="px-3 py-2 text-slate-400 hover:text-white"
                >
                  {t.common.cancel}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded font-semibold transition"
                >
                  حفظ وإصدار أمر الشراء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Clearance Modal (R3.2) */}
      <ClearanceModal
        item={selectedItemForClearance}
        onClose={() => {
          setShowClearanceModal(false);
          setSelectedItemForClearance(null);
        }}
        onSuccess={(msg) => {
          showToast(msg || 'تم تحديث سعر التصفية', 'success');
          setShowClearanceModal(false);
          setSelectedItemForClearance(null);
          loadDeadStock(deadStockDays);
          loadParts();
        }}
      />

      {/* Item Compatibility Modal (R3.10) */}
      <ItemCompatibilityModal
        item={selectedPartForCompatibility}
        onClose={() => {
          setShowCompatibilityModal(false);
          setSelectedPartForCompatibility(null);
          loadParts();
          loadCompatibility();
        }}
      />
    </div>
  );
};
