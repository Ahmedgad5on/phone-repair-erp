import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useLanguage } from '../i18n/LanguageContext';
import { useToast } from '../context/ToastContext';
import { MicroLocatorModal } from '../components/warehouse/MicroLocatorModal';
import {
  Boxes,
  Warehouse,
  ArrowRightLeft,
  DollarSign,
  ClipboardList,
  Plus,
  RefreshCw,
  CheckCircle2,
  MapPin,
  Check,
  X,
  Award,
  ShieldAlert,
  TrendingUp,
  Layers,
  Sliders,
  AlertCircle
} from 'lucide-react';
import { inventoryApi, FifoValuationResponse, SupplierScore } from '../components/inventory/inventoryApi';

export const WarehouseView: React.FC = () => {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'warehouses' | 'transfers' | 'valuation' | 'counts' | 'supplier_scores'>('warehouses');
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [transfers, setTransfers] = useState<any[]>([]);
  const [valuation, setValuation] = useState<any>(null);
  const [cycleCounts, setCycleCounts] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);

  // Valuation Method toggle (R3.7 / R3.9 FIFO & WAC)
  const [valuationMethod, setValuationMethod] = useState<'WAC' | 'FIFO'>('WAC');
  const [fifoValuation, setFifoValuation] = useState<FifoValuationResponse | null>(null);

  // Supplier Scorecards (R3.4)
  const [supplierScores, setSupplierScores] = useState<SupplierScore[]>([]);

  // Modals
  const [showWhModal, setShowWhModal] = useState(false);
  const [whForm, setWhForm] = useState({ name: '', code: '', location: '' });

  const [showTransferModal, setShowTransferModal] = useState(false);
  const [isTransferRequest, setIsTransferRequest] = useState(false);
  const [transferForm, setTransferForm] = useState({
    from_warehouse_id: '',
    to_warehouse_id: '',
    notes: '',
    items: [{ item_id: '', quantity: 1 }]
  });

  // 70 Proposals 2.5D Micro-Locator & Pick-to-Light State
  const [showMicroLocator, setShowMicroLocator] = useState(false);
  const [selectedItemForLocator, setSelectedItemForLocator] = useState<any | null>(null);

  const loadData = async () => {
    try {
      const whs = await api.getWarehouses();
      setWarehouses(whs);
      const trs = await api.getStockTransfers();
      setTransfers(trs);
      const val = await api.getInventoryValuation();
      setValuation(val);
      const ccs = await api.getCycleCounts();
      setCycleCounts(ccs);
      const itms = await api.getProducts();
      setItems(itms);

      // Load FIFO and supplier scores in parallel
      inventoryApi.getFifoValuation().then(setFifoValuation).catch(console.error);
      inventoryApi.getSupplierScorecards().then(setSupplierScores).catch(console.error);
    } catch (e: any) {
      console.error(e);
      showToast(e.message || 'فشل تحميل بيانات المستودعات', 'error');
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateWarehouse = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createWarehouse(whForm);
      showToast(isAr ? 'تم إضافة المستودع بنجاح' : 'Warehouse created', 'success');
      setShowWhModal(false);
      setWhForm({ name: '', code: '', location: '' });
      loadData();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleCreateTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferForm.from_warehouse_id || !transferForm.to_warehouse_id) {
      showToast('يرجى تحديد مستودع المصدر ومستودع الوجهة', 'warning');
      return;
    }
    if (transferForm.from_warehouse_id === transferForm.to_warehouse_id) {
      showToast('لا يمكن التحويل لنفس المستودع', 'warning');
      return;
    }

    try {
      if (isTransferRequest) {
        await inventoryApi.createTransferRequest({
          from_branch_id: transferForm.from_warehouse_id,
          to_branch_id: transferForm.to_warehouse_id,
          item_id: transferForm.items[0]?.item_id,
          quantity: Number(transferForm.items[0]?.quantity) || 1,
          notes: transferForm.notes
        });
        showToast(isAr ? 'تم رفع طلب التحويل بنجاح، بانتظار اعتماد المدير' : 'Transfer request submitted for approval', 'success');
      } else {
        await api.createStockTransfer(transferForm);
        showToast(isAr ? 'تم تنفيذ التحويل المخزني ونقل الأصناف بنجاح' : 'Transfer completed', 'success');
      }
      setShowTransferModal(false);
      setIsTransferRequest(false);
      setTransferForm({
        from_warehouse_id: '',
        to_warehouse_id: '',
        notes: '',
        items: [{ item_id: '', quantity: 1 }]
      });
      loadData();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleApproveTransfer = async (transferId: string) => {
    try {
      await inventoryApi.approveTransfer(transferId);
      showToast(isAr ? 'تم اعتماد التحويل المخزني وخصم الرصيد بنجاح' : 'Transfer approved and stock moved', 'success');
      loadData();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleRejectTransfer = async (transferId: string) => {
    try {
      await inventoryApi.rejectTransfer(transferId);
      showToast(isAr ? 'تم رفض أمر التحويل المخزني' : 'Transfer rejected', 'info');
      loadData();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 select-text">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-wide flex items-center gap-2.5">
            <Boxes className="w-6 h-6 text-sky-400" />
            {isAr ? 'إدارة المستودعات المتعددة وتقييم المخزون (Multi-Warehouse)' : 'Advanced Multi-Warehouse Management'}
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            {isAr ? 'التحويلات بين الفروع والمستودعات، تقييم المخزون بالمتوسط المرجح (WAC)، وجرد الـ Cycle Counting.' : 'Inter-warehouse transfers, WAC valuation & cycle counting.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-1 flex items-center">
            <button
              onClick={() => setActiveTab('warehouses')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                activeTab === 'warehouses' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              {isAr ? 'المستودعات والفروع' : 'Warehouses'}
            </button>
            <button
              onClick={() => setActiveTab('transfers')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                activeTab === 'transfers' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              {isAr ? 'التحويلات المخزنية' : 'Stock Transfers'}
            </button>
            <button
              onClick={() => setActiveTab('valuation')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                activeTab === 'valuation' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              {isAr ? 'تقييم المخزون (WAC / FIFO)' : 'Inventory Valuation'}
            </button>
            <button
              onClick={() => setActiveTab('counts')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                activeTab === 'counts' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              {isAr ? 'الجرد الدوري' : 'Cycle Counts'}
            </button>
            <button
              onClick={() => setActiveTab('supplier_scores')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition flex items-center gap-1 ${
                activeTab === 'supplier_scores' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Award className="w-3.5 h-3.5 text-amber-400" />
              {isAr ? 'أداء الموردين' : 'Supplier Scorecards'}
            </button>
          </div>
          <button
            onClick={() => {
              setSelectedItemForLocator(null);
              setShowMicroLocator(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 rounded-lg text-xs font-medium transition cursor-pointer"
            title="محدد الأدراج الدقيق والإشارة الضوئية 2.5D Pick-to-Light"
          >
            <MapPin className="w-4 h-4 text-indigo-400" />
            <span>{isAr ? 'محدد الأدراج والإشارة 2.5D' : '2.5D Micro-Locator'}</span>
          </button>
          <button onClick={loadData} className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs cursor-pointer">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 1. Warehouses List Tab */}
      {activeTab === 'warehouses' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div>
              <h3 className="font-bold text-white text-sm">قائمة المستودعات ونقاط التخزين المعتمدة</h3>
              <p className="text-xs text-slate-400">إدارة المخازن الرئيسية، مستودعات قطع الغيار، ومخازن السكراب والتخريد.</p>
            </div>
            <button
              onClick={() => setShowWhModal(true)}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-lg shadow-sky-600/30 transition"
            >
              <Plus className="w-4 h-4" />
              {isAr ? 'إضافة مستودع جديد' : 'Add Warehouse'}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {warehouses.map(w => (
              <div key={w.id} className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-bold text-white text-sm">{w.name}</h4>
                    <span className="font-mono text-sky-400 text-xs font-bold">{w.code}</span>
                  </div>
                  {w.is_default === 1 && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                      المستودع الرئيسي
                    </span>
                  )}
                </div>

                <p className="text-xs text-slate-400">{w.location || 'الفرع الرئيسي'}</p>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800 text-xs">
                  <div className="p-2 bg-slate-950 rounded-lg border border-slate-800">
                    <span className="text-slate-500 text-[11px] block">الأصناف</span>
                    <strong className="text-white font-mono text-sm">{w.items_count}</strong>
                  </div>
                  <div className="p-2 bg-slate-950 rounded-lg border border-slate-800">
                    <span className="text-slate-500 text-[11px] block">إجمالي القطع</span>
                    <strong className="text-emerald-400 font-mono text-sm">{w.total_units}</strong>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2. Stock Transfers Tab */}
      {activeTab === 'transfers' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div>
              <h3 className="font-bold text-white text-sm">أوامر التحويل المخزني التبادلي (Stock Transfers)</h3>
              <p className="text-xs text-slate-400">نقل شاشات وقطع غيار وهواتف بين المخازن والفروع مع حفظ التوثيق.</p>
            </div>
            <button
              onClick={() => setShowTransferModal(true)}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-lg shadow-sky-600/30 transition"
            >
              <ArrowRightLeft className="w-4 h-4" />
              {isAr ? 'إنشاء أمر تحويل جديد' : 'New Transfer'}
            </button>
          </div>

          <div className="space-y-3">
            {transfers.map(t => (
              <div key={t.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl space-y-3 text-xs">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-sky-400 text-sm">#{t.transfer_number}</span>
                    <span className="text-white font-semibold flex items-center gap-1.5">
                      {t.from_warehouse_name} <ArrowRightLeft className="w-3.5 h-3.5 text-slate-500" /> {t.to_warehouse_name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400 font-mono">{new Date(t.created_at).toLocaleString('ar-EG')}</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                        t.status === 'APPROVED' || t.status === 'COMPLETED'
                          ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                          : t.status === 'REJECTED'
                          ? 'bg-rose-950 text-rose-300 border-rose-800'
                          : 'bg-amber-950 text-amber-300 border-amber-800'
                      }`}
                    >
                      {t.status === 'PENDING' ? (isAr ? 'قيد موافقة المدير' : 'Pending Approval') : t.status === 'APPROVED' ? (isAr ? 'معتمد' : 'Approved') : t.status === 'REJECTED' ? (isAr ? 'مرفوض' : 'Rejected') : t.status}
                    </span>
                    {t.status === 'PENDING' && (
                      <div className="flex items-center gap-1.5 ms-2">
                        <button
                          onClick={() => handleApproveTransfer(t.id)}
                          className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[11px] font-semibold flex items-center gap-1 transition"
                          title="اعتماد ونقل الأرصدة"
                        >
                          <Check className="w-3 h-3" />
                          <span>{isAr ? 'اعتماد' : 'Approve'}</span>
                        </button>
                        <button
                          onClick={() => handleRejectTransfer(t.id)}
                          className="px-2 py-0.5 bg-rose-700 hover:bg-rose-600 text-white rounded text-[11px] font-semibold flex items-center gap-1 transition"
                          title="رفض الطلب"
                        >
                          <X className="w-3 h-3" />
                          <span>{isAr ? 'رفض' : 'Reject'}</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-1">
                  {t.items?.map((item: any) => (
                    <div key={item.id} className="flex justify-between py-1 bg-slate-950/60 px-2 rounded">
                      <span className="text-slate-300">{item.item_name} ({item.sku})</span>
                      <strong className="font-mono text-sky-300">{item.quantity} قطع</strong>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {transfers.length === 0 && (
              <div className="py-12 text-center text-slate-500 bg-slate-900 border border-slate-800 rounded-xl">
                لا توجد تحويلات مخزنية مسجلة.
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. Valuation Tab (R3.7 & R3.9 FIFO vs WAC) */}
      {activeTab === 'valuation' && (
        <div className="space-y-4">
          {/* Header Toggle */}
          <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div>
              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-emerald-400" />
                {valuationMethod === 'WAC'
                  ? (isAr ? 'تقييم المخزون بطريقة المتوسط المرجح التراكمي (WAC)' : 'Weighted Average Cost Valuation (WAC)')
                  : (isAr ? 'تقييم المخزون بطريقة الوارد أولاً يصرف أولاً (FIFO)' : 'First-In First-Out Valuation (FIFO)')}
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                {valuationMethod === 'WAC'
                  ? 'حساب تكلفة المخزون بناءً على متوسط أسعار الشراء التراكمية لكل صنف.'
                  : 'تتبع تاريخ تكلفة كل دفعة شراء بالترتيب الزمني وتفريغ الدفعات الأقدم أولاً مع حساب الأرباح غير المحققة.'}
              </p>
            </div>

            <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800">
              <button
                onClick={() => setValuationMethod('WAC')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                  valuationMethod === 'WAC' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                WAC (المتوسط المرجح)
              </button>
              <button
                onClick={() => setValuationMethod('FIFO')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                  valuationMethod === 'FIFO' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                FIFO (الوارد أولاً يصرف أولاً)
              </button>
            </div>
          </div>

          {/* WAC View */}
          {valuationMethod === 'WAC' && valuation && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl">
                  <span className="text-slate-400 text-xs">إجمالي تكلفة المخزون (Asset Cost):</span>
                  <div className="text-xl font-extrabold text-white font-mono mt-1">
                    {Number(valuation.totalCostValue || 0).toLocaleString()} ج.م
                  </div>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl">
                  <span className="text-slate-400 text-xs">القيمة السوقية للبيع (Retail Value):</span>
                  <div className="text-xl font-extrabold text-emerald-400 font-mono mt-1">
                    {Number(valuation.totalRetailValue || 0).toLocaleString()} ج.م
                  </div>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl">
                  <span className="text-slate-400 text-xs">الأرباح التقديرية المتوقعة:</span>
                  <div className="text-xl font-extrabold text-sky-400 font-mono mt-1">
                    +{Number(valuation.potentialProfit || 0).toLocaleString()} ج.م
                  </div>
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl text-xs">
                <table className="w-full text-start text-xs text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 uppercase font-semibold border-b border-slate-800 text-[11px]">
                    <tr>
                      <th className="px-4 py-3">الصنف</th>
                      <th className="px-4 py-3">التصنيف</th>
                      <th className="px-4 py-3">المتاح</th>
                      <th className="px-4 py-3">سعر الشراء (التكلفة)</th>
                      <th className="px-4 py-3">سعر البيع قطاعي</th>
                      <th className="px-4 py-3">إجمالي قيمة التكلفة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {valuation.items?.map((i: any) => (
                      <tr key={i.id} className="hover:bg-slate-800/40">
                        <td className="px-4 py-2 font-medium text-white">{i.name}</td>
                        <td className="px-4 py-2 text-slate-400">{i.category}</td>
                        <td className="px-4 py-2 font-mono font-bold">{i.stock_quantity}</td>
                        <td className="px-4 py-2 font-mono">{Number(i.purchase_price).toLocaleString()} ج.م</td>
                        <td className="px-4 py-2 font-mono text-emerald-400">{Number(i.retail_price).toLocaleString()} ج.م</td>
                        <td className="px-4 py-2 font-mono font-bold text-white">{Number(i.total_cost_value).toLocaleString()} ج.م</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* FIFO View (R3.9) */}
          {valuationMethod === 'FIFO' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl">
                  <span className="text-slate-400 text-xs">إجمالي القطع المخزنة:</span>
                  <div className="text-xl font-extrabold text-white font-mono mt-1">
                    {fifoValuation?.total_units ?? 0}
                  </div>
                  <span className="text-[10px] text-slate-500">حسب دفعات التوريد</span>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl">
                  <span className="text-slate-400 text-xs">إجمالي قيمة الأصل FIFO:</span>
                  <div className="text-xl font-extrabold text-purple-400 font-mono mt-1">
                    {Number(fifoValuation?.total_fifo_value || 0).toLocaleString()} ج.م
                  </div>
                  <span className="text-[10px] text-slate-500">بتكلفة أحدث الشحنات</span>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl">
                  <span className="text-slate-400 text-xs">القيمة السوقية للبيع:</span>
                  <div className="text-xl font-extrabold text-emerald-400 font-mono mt-1">
                    {Number(fifoValuation?.total_retail_value || 0).toLocaleString()} ج.م
                  </div>
                  <span className="text-[10px] text-slate-500">بسعر بيع القطاعي</span>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl">
                  <span className="text-slate-400 text-xs">الأرباح غير المحققة (FIFO):</span>
                  <div className="text-xl font-extrabold text-sky-400 font-mono mt-1">
                    +{Number(fifoValuation?.unrealized_gain_loss || 0).toLocaleString()} ج.م
                  </div>
                  <span className="text-[10px] text-slate-500">هامش الربح المتوقع</span>
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl text-xs">
                <table className="w-full text-start text-xs text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 uppercase font-semibold border-b border-slate-800 text-[11px]">
                    <tr>
                      <th className="px-4 py-3">الصنف والكود</th>
                      <th className="px-4 py-3">التصنيف</th>
                      <th className="px-4 py-3">المتاح</th>
                      <th className="px-4 py-3">تكلفة الوحدة (FIFO)</th>
                      <th className="px-4 py-3">سعر البيع قطاعي</th>
                      <th className="px-4 py-3">إجمالي تكلفة FIFO</th>
                      <th className="px-4 py-3">الربح غير المحقق</th>
                      <th className="px-4 py-3 text-end">الدفعات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {!fifoValuation?.items || fifoValuation.items.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                          لا توجد بيانات تقييم FIFO متاحة حالياً.
                        </td>
                      </tr>
                    ) : (
                      fifoValuation.items.map(item => (
                        <tr key={item.id} className="hover:bg-slate-800/40">
                          <td className="px-4 py-2 font-medium text-white">
                            <div>{item.name}</div>
                            <span className="font-mono text-[10px] text-slate-500">{item.sku}</span>
                          </td>
                          <td className="px-4 py-2 text-slate-400">{item.category}</td>
                          <td className="px-4 py-2 font-mono font-bold">{item.stock_quantity}</td>
                          <td className="px-4 py-2 font-mono text-purple-300 font-semibold">
                            {Number(item.cost_per_unit || 0).toLocaleString()} ج.م
                          </td>
                          <td className="px-4 py-2 font-mono text-emerald-400">
                            {Number(item.retail_price || 0).toLocaleString()} ج.م
                          </td>
                          <td className="px-4 py-2 font-mono font-bold text-white">
                            {Number(item.total_fifo_value || 0).toLocaleString()} ج.م
                          </td>
                          <td className="px-4 py-2 font-mono text-sky-400 font-semibold">
                            +{Number(item.unrealized_gain_loss || 0).toLocaleString()} ج.م
                          </td>
                          <td className="px-4 py-2 text-end font-mono text-[11px] text-slate-400">
                            <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800">
                              {item.lots_breakdown?.length || 1} دفعة
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4. Cycle Counts Tab */}
      {activeTab === 'counts' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl text-xs">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <h3 className="font-bold text-white text-sm">سجل جلسات الجرد الدوري المستمر (Cycle Counting)</h3>
          </div>
          <table className="w-full text-start text-xs text-slate-300">
            <thead className="bg-slate-950 text-slate-400 uppercase font-semibold border-b border-slate-800 text-[11px]">
              <tr>
                <th className="px-4 py-3">المستودع</th>
                <th className="px-4 py-3">تاريخ الجرد</th>
                <th className="px-4 py-3">المسؤول عن الجرد</th>
                <th className="px-4 py-3">الملاحظات</th>
                <th className="px-4 py-3">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {cycleCounts.map((c: any) => (
                <tr key={c.id} className="hover:bg-slate-800/40">
                  <td className="px-4 py-3 font-semibold text-white">{c.warehouse_name}</td>
                  <td className="px-4 py-3 font-mono">{new Date(c.count_date).toLocaleString('ar-EG')}</td>
                  <td className="px-4 py-3">{c.counter_name || 'مدير الفرع'}</td>
                  <td className="px-4 py-3 text-slate-400">{c.notes}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                      {c.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 5. Supplier Scorecard Tab (R3.4) */}
      {activeTab === 'supplier_scores' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div>
              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-400" />
                بطاقات تقييم أداء الموردين (Supplier Scorecards)
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                تقييم آلي متجدد لكل مورد بناءً على معدلات التوريد في الموعد، جودة القطع المقبولة، ونسبة المرتجعات RMA، مع تصنيف الفئات (Tier A, B, C).
              </p>
            </div>
            <button
              onClick={() => {
                inventoryApi.getSupplierScorecards().then(setSupplierScores).catch(console.error);
                showToast('تم تحديث بطاقات تقييم الموردين', 'info');
              }}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>تحديث التقييمات</span>
            </button>
          </div>

          {/* KPI Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-400">فئة A (المفضلون)</p>
                  <p className="text-2xl font-bold font-mono text-emerald-400 mt-1">
                    {supplierScores.filter(s => s.tier?.includes('Tier A')).length}
                  </p>
                  <span className="text-[10px] text-slate-500">جودة وتوريد &gt; 90%</span>
                </div>
                <div className="w-10 h-10 rounded-lg bg-emerald-950/60 border border-emerald-800/40 flex items-center justify-center text-emerald-400">
                  <Award className="w-5 h-5" />
                </div>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-400">فئة B (المعتمدون)</p>
                  <p className="text-2xl font-bold font-mono text-sky-400 mt-1">
                    {supplierScores.filter(s => s.tier?.includes('Tier B')).length}
                  </p>
                  <span className="text-[10px] text-slate-500">أداء قياسي معتمد</span>
                </div>
                <div className="w-10 h-10 rounded-lg bg-sky-950/60 border border-sky-800/40 flex items-center justify-center text-sky-400">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-400">فئة C (تحت الاختبار)</p>
                  <p className="text-2xl font-bold font-mono text-rose-400 mt-1">
                    {supplierScores.filter(s => s.tier?.includes('Tier C')).length}
                  </p>
                  <span className="text-[10px] text-slate-500">عيوب أو تأخير متكرر</span>
                </div>
                <div className="w-10 h-10 rounded-lg bg-rose-950/60 border border-rose-800/40 flex items-center justify-center text-rose-400">
                  <ShieldAlert className="w-5 h-5" />
                </div>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-400">إجمالي الموردين المقيمين</p>
                  <p className="text-2xl font-bold font-mono text-white mt-1">
                    {supplierScores.length}
                  </p>
                  <span className="text-[10px] text-slate-500">مسجلين بقاعدة البيانات</span>
                </div>
                <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center text-slate-300">
                  <Warehouse className="w-5 h-5" />
                </div>
              </div>
            </div>
          </div>

          {/* Supplier Scores Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl text-xs">
            <table className="w-full text-start text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 uppercase font-semibold border-b border-slate-800 text-[11px]">
                <tr>
                  <th className="px-4 py-3">اسم المورد / الشركة</th>
                  <th className="px-4 py-3">تصنيف الفئة (Tier)</th>
                  <th className="px-4 py-3">الالتزام بالمواعيد</th>
                  <th className="px-4 py-3">قبول الجودة</th>
                  <th className="px-4 py-3">معدل العيوب والمرتجعات RMA</th>
                  <th className="px-4 py-3">إجمالي أوامر الشراء</th>
                  <th className="px-4 py-3">آخر تقييم</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {supplierScores.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                      لا توجد سجلات تقييم موردين حالياً.
                    </td>
                  </tr>
                ) : (
                  supplierScores.map(s => {
                    const isTierA = s.tier?.includes('Tier A');
                    const isTierB = s.tier?.includes('Tier B');
                    return (
                      <tr key={s.id || s.supplier_id} className="hover:bg-slate-800/40 transition">
                        <td className="px-4 py-3 font-semibold text-white">
                          <div>{s.supplier_name || s.supplier_display_name}</div>
                          <span className="font-mono text-[10px] text-slate-500">{s.supplier_id}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                              isTierA
                                ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                                : isTierB
                                ? 'bg-sky-950 text-sky-300 border-sky-800'
                                : 'bg-rose-950 text-rose-300 border-rose-800'
                            }`}
                          >
                            {s.tier || 'Tier B Approved'}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono">
                          <div className="flex items-center gap-2">
                            <div className="w-16 bg-slate-950 rounded-full h-1.5 overflow-hidden">
                              <div
                                className={`h-full ${
                                  s.on_time_rate >= 90 ? 'bg-emerald-500' : s.on_time_rate >= 70 ? 'bg-amber-500' : 'bg-rose-500'
                                }`}
                                style={{ width: `${Math.min(100, Math.max(0, s.on_time_rate))}%` }}
                              />
                            </div>
                            <span className="font-bold text-white">{s.on_time_rate}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono">
                          <div className="flex items-center gap-2">
                            <div className="w-16 bg-slate-950 rounded-full h-1.5 overflow-hidden">
                              <div
                                className={`h-full ${
                                  s.quality_rate >= 90 ? 'bg-emerald-500' : s.quality_rate >= 70 ? 'bg-amber-500' : 'bg-rose-500'
                                }`}
                                style={{ width: `${Math.min(100, Math.max(0, s.quality_rate))}%` }}
                              />
                            </div>
                            <span className="font-bold text-white">{s.quality_rate}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono">
                          <span
                            className={`font-semibold ${
                              s.return_rate <= 3 ? 'text-emerald-400' : s.return_rate <= 7 ? 'text-amber-400' : 'text-rose-400'
                            }`}
                          >
                            {s.return_rate}%
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono font-bold text-slate-200">
                          {s.total_orders}
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-400 text-[11px]">
                          {s.last_updated ? new Date(s.last_updated).toLocaleDateString('ar-EG') : 'حديثاً'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Warehouse Modal */}
      {showWhModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
          <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-xl p-6 text-xs space-y-4">
            <h3 className="font-bold text-white text-base">إضافة مستودع / فرع جديد</h3>
            <form onSubmit={handleCreateWarehouse} className="space-y-3">
              <div>
                <label className="block text-slate-300 mb-1">اسم المستودع أو الفرع *</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: مستودع المعادي لقطع الغيار"
                  value={whForm.name}
                  onChange={e => setWhForm({ ...whForm, name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-white"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1">كود المستودع *</label>
                <input
                  type="text"
                  required
                  placeholder="مثال: WH-MAADI"
                  value={whForm.code}
                  onChange={e => setWhForm({ ...whForm, code: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1">الموقع أو العنوان</label>
                <input
                  type="text"
                  placeholder="مثال: شارع النصر، المعادي"
                  value={whForm.location}
                  onChange={e => setWhForm({ ...whForm, location: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowWhModal(false)} className="px-3 py-2 text-slate-400">
                  إلغاء
                </button>
                <button type="submit" className="px-4 py-2 bg-sky-600 text-white rounded font-semibold">
                  حفظ المستودع
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stock Transfer Modal */}
      {showTransferModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
          <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-xl p-6 text-xs space-y-4">
            <h3 className="font-bold text-white text-base">إنشاء أمر تحويل مخزني بين المستودعات</h3>
            <form onSubmit={handleCreateTransfer} className="space-y-3">
              <div>
                <label className="block text-slate-300 mb-1">من مستودع المصدر *</label>
                <select
                  required
                  value={transferForm.from_warehouse_id}
                  onChange={e => setTransferForm({ ...transferForm, from_warehouse_id: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-white"
                >
                  <option value="">-- اختر مستودع المصدر --</option>
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-300 mb-1">إلى مستودع الوجهة *</label>
                <select
                  required
                  value={transferForm.to_warehouse_id}
                  onChange={e => setTransferForm({ ...transferForm, to_warehouse_id: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-white"
                >
                  <option value="">-- اختر مستودع الوجهة --</option>
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>{w.name} ({w.code})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-300 mb-1">الصنف المراد تحويله *</label>
                <select
                  required
                  value={transferForm.items[0]?.item_id}
                  onChange={e => setTransferForm({
                    ...transferForm,
                    items: [{ ...transferForm.items[0], item_id: e.target.value }]
                  })}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-white"
                >
                  <option value="">-- اختر الصنف --</option>
                  {items.map(i => (
                    <option key={i.id} value={i.id}>{i.name} (المتاح: {i.stock_quantity})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-300 mb-1">الكمية المحولة *</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={transferForm.items[0]?.quantity}
                  onChange={e => setTransferForm({
                    ...transferForm,
                    items: [{ ...transferForm.items[0], quantity: parseInt(e.target.value) || 1 }]
                  })}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-white font-mono"
                />
              </div>

              <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 space-y-1">
                <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                  <input
                    type="checkbox"
                    checked={isTransferRequest}
                    onChange={e => setIsTransferRequest(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-900 text-sky-600 focus:ring-0"
                  />
                  <span className="font-semibold text-xs text-white">
                    طلب تحويل يتطلب اعتماد المدير (Two-Phase Transfer Request)
                  </span>
                </label>
                <p className="text-[11px] text-slate-400 ps-5">
                  {isTransferRequest
                    ? 'سيتم تسجيل الطلب بحالة (معلق / PENDING) حتى يراجعه المدير ويعتمده مع فحص الرصيد السالب.'
                    : 'تحويل مباشر وفوري: يتم نقل الرصيد فوراً وحفظ الحركة.'}
                </p>
              </div>

              <div>
                <label className="block text-slate-300 mb-1">ملاحظات التحويل</label>
                <input
                  type="text"
                  placeholder="سبب التحويل أو تعليمات خاصة..."
                  value={transferForm.notes}
                  onChange={e => setTransferForm({ ...transferForm, notes: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-white text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowTransferModal(false)} className="px-3 py-2 text-slate-400">
                  إلغاء
                </button>
                <button type="submit" className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded font-semibold transition">
                  {isTransferRequest ? 'إرسال طلب التحويل للمدير' : 'تنفيذ التحويل الفوري'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 70 Proposals 2.5D Micro-Locator & Pick-to-Light Modal */}
      {showMicroLocator && (
        <MicroLocatorModal
          isOpen={showMicroLocator}
          onClose={() => {
            setShowMicroLocator(false);
            setSelectedItemForLocator(null);
          }}
          selectedItem={selectedItemForLocator}
        />
      )}
    </div>
  );
};
