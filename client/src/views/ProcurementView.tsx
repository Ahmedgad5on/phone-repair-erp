import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useLanguage } from '../i18n/LanguageContext';
import { useToast } from '../context/ToastContext';
import {
  ShoppingCart,
  Plus,
  Truck,
  CheckCircle2,
  Clock,
  DollarSign,
  TrendingDown,
  RefreshCw,
  FileCheck
} from 'lucide-react';
import { TableSkeleton } from '../components/common/SkeletonLoader';
import { EmptyState } from '../components/common/EmptyState';

export const ProcurementView: React.FC = () => {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'requisitions' | 'grn' | 'comparisons'>('requisitions');
  const [loading, setLoading] = useState(false);

  // Data states
  const [requisitions, setRequisitions] = useState<any[]>([]);
  const [grns, setGrns] = useState<any[]>([]);
  const [comparisons, setComparisons] = useState<any[]>([]);

  // Modals
  const [showReqModal, setShowReqModal] = useState(false);
  const [reqForm, setReqForm] = useState({
    title: '',
    requested_by: 'Engineer Team',
    items: [{ item_name: '', quantity: 1, estimated_unit_cost: 0, notes: '' }]
  });

  const [showGrnModal, setShowGrnModal] = useState(false);
  const [grnForm, setGrnForm] = useState({
    po_number: '',
    supplier_name: '',
    items: [{ item_id: '', received_quantity: 1, unit_cost: 0, notes: '' }]
  });

  const [showCompModal, setShowCompModal] = useState(false);
  const [compForm, setCompForm] = useState({
    item_name: '',
    supplier_name: '',
    unit_price: 0,
    lead_time_days: 1,
    notes: ''
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [reqs, gList, cList] = await Promise.all([
        api.getPurchaseRequisitions(),
        api.getGrns(),
        api.getPriceComparisons()
      ]);
      setRequisitions(reqs || []);
      setGrns(gList || []);
      setComparisons(cList || []);
    } catch (e: any) {
      console.error(e);
      showToast(isAr ? 'فشل تحميل بيانات المشتريات' : 'Failed to load procurement data', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateRequisition = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createPurchaseRequisition(reqForm);
      showToast(isAr ? 'تم إنشاء طلب الشراء بنجاح' : 'Requisition created successfully', 'success');
      setShowReqModal(false);
      setReqForm({
        title: '',
        requested_by: 'Engineer Team',
        items: [{ item_name: '', quantity: 1, estimated_unit_cost: 0, notes: '' }]
      });
      loadData();
    } catch (e: any) {
      showToast(e.message || (isAr ? 'فشل الحفظ' : 'Failed to save'), 'error');
    }
  };

  const handleCreateGrn = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createGrn(grnForm);
      showToast(isAr ? 'تم استلام البضائع بنجاح (GRN)' : 'Goods received recorded successfully', 'success');
      setShowGrnModal(false);
      setGrnForm({
        po_number: '',
        supplier_name: '',
        items: [{ item_id: '', received_quantity: 1, unit_cost: 0, notes: '' }]
      });
      loadData();
    } catch (e: any) {
      showToast(e.message || (isAr ? 'فشل الحفظ' : 'Failed to save'), 'error');
    }
  };

  const handleCreateComparison = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.addPriceComparison({
        ...compForm,
        unit_price: Number(compForm.unit_price),
        lead_time_days: Number(compForm.lead_time_days)
      });
      showToast(isAr ? 'تم إضافة عرض السعر بنجاح' : 'Price quotation added', 'success');
      setShowCompModal(false);
      setCompForm({
        item_name: '',
        supplier_name: '',
        unit_price: 0,
        lead_time_days: 1,
        notes: ''
      });
      loadData();
    } catch (e: any) {
      showToast(e.message || (isAr ? 'فشل الحفظ' : 'Failed to save'), 'error');
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <ShoppingCart className="w-7 h-7 text-indigo-600 dark:text-indigo-400" />
            {isAr ? 'إدارة المشتريات والتوريدات' : 'Procurement & Supply Chain'}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {isAr
              ? 'طلبات الشراء، مذكرات استلام البضائع (GRN)، ومقارنة أسعار الموردين للحصول على أفضل تكلفة'
              : 'Purchase requisitions, goods received notes (GRN), and supplier price quotes comparison'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
            title={isAr ? 'تحديث' : 'Refresh'}
          >
            <RefreshCw className="w-5 h-5" />
          </button>

          {activeTab === 'requisitions' && (
            <button
              onClick={() => setShowReqModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl shadow-sm transition-all"
            >
              <Plus className="w-5 h-5" />
              <span>{isAr ? 'طلب شراء جديد' : 'New Requisition'}</span>
            </button>
          )}

          {activeTab === 'grn' && (
            <button
              onClick={() => setShowGrnModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl shadow-sm transition-all"
            >
              <FileCheck className="w-5 h-5" />
              <span>{isAr ? 'تسجيل إذن استلام (GRN)' : 'Record GRN'}</span>
            </button>
          )}

          {activeTab === 'comparisons' && (
            <button
              onClick={() => setShowCompModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl shadow-sm transition-all"
            >
              <Plus className="w-5 h-5" />
              <span>{isAr ? 'إضافة عرض سعر' : 'Add Price Quote'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800">
        <button
          onClick={() => setActiveTab('requisitions')}
          className={`px-4 py-3 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'requisitions'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <ShoppingCart className="w-4 h-4" />
          {isAr ? 'طلبات الشراء' : 'Purchase Requisitions'}
          <span className="px-2 py-0.5 text-xs rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
            {requisitions.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('grn')}
          className={`px-4 py-3 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'grn'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <Truck className="w-4 h-4" />
          {isAr ? 'استلام البضائع (GRN)' : 'Goods Received (GRN)'}
          <span className="px-2 py-0.5 text-xs rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
            {grns.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('comparisons')}
          className={`px-4 py-3 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'comparisons'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <TrendingDown className="w-4 h-4" />
          {isAr ? 'مقارنة أسعار الموردين' : 'Supplier Price Comparison'}
          <span className="px-2 py-0.5 text-xs rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
            {comparisons.length}
          </span>
        </button>
      </div>

      {/* Tab Contents */}
      {loading ? (
        <TableSkeleton rows={5} cols={4} />
      ) : (
        <>
          {/* Requisitions Tab */}
          {activeTab === 'requisitions' && (
            <div className="space-y-4">
              {requisitions.length === 0 ? (
                <EmptyState
                  icon={ShoppingCart}
                  title={isAr ? 'لا توجد طلبات شراء مسجلة' : 'No purchase requisitions yet'}
                  description={isAr ? 'أنشئ أول طلب شراء لقطع الغيار أو الهواتف لتنظيم التوريدات' : 'Create your first requisition to manage procurement requests efficiently.'}
                  actionLabel={isAr ? 'طلب شراء جديد' : 'New Requisition'}
                  onAction={() => setShowReqModal(true)}
                />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {requisitions.map((req) => (
                    <div
                      key={req.id}
                      className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between hover:border-indigo-500 dark:hover:border-indigo-500 transition-all"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400">
                            #{req.id.slice(0, 8)}
                          </span>
                          <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                            <Clock className="w-3 h-3" />
                            {req.status || 'PENDING'}
                          </span>
                        </div>
                        <h3 className="font-bold text-slate-900 dark:text-white text-base">
                          {req.title}
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {isAr ? 'طالب الشراء:' : 'Requested by:'} <span className="font-medium text-slate-700 dark:text-slate-300">{req.requested_by}</span>
                        </p>
                      </div>

                      <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-400 flex items-center justify-between">
                        <span>{new Date(req.created_at).toLocaleDateString()}</span>
                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                          {isAr ? 'قيد المعالجة' : 'In Review'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* GRN Tab */}
          {activeTab === 'grn' && (
            <div className="space-y-4">
              {grns.length === 0 ? (
                <EmptyState
                  icon={Truck}
                  title={isAr ? 'لا توجد أذون استلام مخزنية (GRN)' : 'No goods received notes found'}
                  description={isAr ? 'سجل توريد البضائع وقطع الغيار التي وصلت المخزن من الموردين' : 'Record shipments received at your warehouses to match purchase orders.'}
                  actionLabel={isAr ? 'تسجيل إذن استلام' : 'Record GRN'}
                  onAction={() => setShowGrnModal(true)}
                />
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                  <table className="w-full text-sm text-left rtl:text-right">
                    <thead className="text-xs uppercase bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="px-6 py-3">{isAr ? 'رقم الإذن' : 'GRN Number'}</th>
                        <th className="px-6 py-3">{isAr ? 'المورد' : 'Supplier'}</th>
                        <th className="px-6 py-3">{isAr ? 'أمر الشراء المرتبط' : 'PO Reference'}</th>
                        <th className="px-6 py-3">{isAr ? 'تاريخ الاستلام' : 'Received Date'}</th>
                        <th className="px-6 py-3">{isAr ? 'الحالة' : 'Status'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {grns.map((grn) => (
                        <tr key={grn.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                          <td className="px-6 py-4 font-mono font-medium text-indigo-600 dark:text-indigo-400">
                            {grn.grn_number || grn.id.slice(0, 8)}
                          </td>
                          <td className="px-6 py-4 font-semibold text-slate-900 dark:text-white">
                            {grn.supplier_name || '-'}
                          </td>
                          <td className="px-6 py-4 text-slate-600 dark:text-slate-400">
                            {grn.po_number || '-'}
                          </td>
                          <td className="px-6 py-4 text-slate-500 dark:text-slate-400">
                            {new Date(grn.received_date || grn.created_at).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4">
                            <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              {isAr ? 'مستلم ومكتمل' : 'Received & Verified'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Price Comparisons Tab */}
          {activeTab === 'comparisons' && (
            <div className="space-y-4">
              {comparisons.length === 0 ? (
                <EmptyState
                  icon={TrendingDown}
                  title={isAr ? 'لا توجد مقارنات أسعار موردين' : 'No price quotes yet'}
                  description={isAr ? 'سجل أسعار الموردين لنفس القطعة للمقارنة واختيار الأقل سعراً والأسرع توريداً' : 'Add competitor quotes for items to choose the best supplier prices.'}
                  actionLabel={isAr ? 'إضافة عرض سعر' : 'Add Price Quote'}
                  onAction={() => setShowCompModal(true)}
                />
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                  <table className="w-full text-sm text-left rtl:text-right">
                    <thead className="text-xs uppercase bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="px-6 py-3">{isAr ? 'اسم الصنف / القطعة' : 'Item / Part'}</th>
                        <th className="px-6 py-3">{isAr ? 'المورد' : 'Supplier'}</th>
                        <th className="px-6 py-3">{isAr ? 'سعر الوحدة' : 'Unit Price'}</th>
                        <th className="px-6 py-3">{isAr ? 'فترة التوريد' : 'Lead Time'}</th>
                        <th className="px-6 py-3">{isAr ? 'ملاحظات' : 'Notes'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {comparisons.map((c) => (
                        <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                          <td className="px-6 py-4 font-bold text-slate-900 dark:text-white">
                            {c.item_name}
                          </td>
                          <td className="px-6 py-4 font-medium text-slate-700 dark:text-slate-300">
                            {c.supplier_name}
                          </td>
                          <td className="px-6 py-4 font-black text-emerald-600 dark:text-emerald-400">
                            {c.unit_price} ج.م
                          </td>
                          <td className="px-6 py-4 text-slate-600 dark:text-slate-400">
                            {c.lead_time_days} {isAr ? 'يوم' : 'days'}
                          </td>
                          <td className="px-6 py-4 text-slate-500 dark:text-slate-400 text-xs">
                            {c.notes || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Modal: New Requisition */}
      {showReqModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl p-6 space-y-4">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <ShoppingCart className="w-5 h-5 text-indigo-600" />
              {isAr ? 'طلب شراء جديد' : 'New Purchase Requisition'}
            </h2>
            <form onSubmit={handleCreateRequisition} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? 'عنوان الطلب' : 'Requisition Title'}
                </label>
                <input
                  type="text"
                  required
                  value={reqForm.title}
                  onChange={(e) => setReqForm({ ...reqForm, title: e.target.value })}
                  placeholder={isAr ? 'مثال: طلب شاشات آيفون 13 وقطع غيار سامسونج' : 'e.g. iPhone 13 screens and tools'}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? 'الجهة الطالبة' : 'Requested By'}
                </label>
                <input
                  type="text"
                  required
                  value={reqForm.requested_by}
                  onChange={(e) => setReqForm({ ...reqForm, requested_by: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {isAr ? 'اسم الصنف المطلوب' : 'Item Name'}
                </label>
                <input
                  type="text"
                  required
                  placeholder={isAr ? 'مثال: شاشة ايفون 13 برو أصلية' : 'Item details'}
                  value={reqForm.items[0]?.item_name || ''}
                  onChange={(e) =>
                    setReqForm({
                      ...reqForm,
                      items: [{ ...reqForm.items[0], item_name: e.target.value }]
                    })
                  }
                  className="w-full px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    min="1"
                    required
                    placeholder={isAr ? 'الكمية' : 'Quantity'}
                    value={reqForm.items[0]?.quantity || 1}
                    onChange={(e) =>
                      setReqForm({
                        ...reqForm,
                        items: [{ ...reqForm.items[0], quantity: Number(e.target.value) }]
                      })
                    }
                    className="w-full px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
                  />
                  <input
                    type="number"
                    min="0"
                    placeholder={isAr ? 'التكلفة التقديرية' : 'Est. Cost'}
                    value={reqForm.items[0]?.estimated_unit_cost || 0}
                    onChange={(e) =>
                      setReqForm({
                        ...reqForm,
                        items: [{ ...reqForm.items[0], estimated_unit_cost: Number(e.target.value) }]
                      })
                    }
                    className="w-full px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowReqModal(false)}
                  className="px-4 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
                >
                  {isAr ? 'حفظ الطلب' : 'Submit Requisition'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Record GRN */}
      {showGrnModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl p-6 space-y-4">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <FileCheck className="w-5 h-5 text-indigo-600" />
              {isAr ? 'تسجيل إذن استلام بضائع (GRN)' : 'Record Goods Received Note'}
            </h2>
            <form onSubmit={handleCreateGrn} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? 'رقم أمر الشراء المرتبط' : 'PO Reference Number'}
                </label>
                <input
                  type="text"
                  required
                  value={grnForm.po_number}
                  onChange={(e) => setGrnForm({ ...grnForm, po_number: e.target.value })}
                  placeholder="PO-2026-001"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? 'اسم المورد' : 'Supplier Name'}
                </label>
                <input
                  type="text"
                  required
                  value={grnForm.supplier_name}
                  onChange={(e) => setGrnForm({ ...grnForm, supplier_name: e.target.value })}
                  placeholder={isAr ? 'شركة الشروق للتوزيع' : 'Supplier Co.'}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {isAr ? 'الكمية المستلمة' : 'Received Qty'}
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={grnForm.items[0]?.received_quantity || 1}
                    onChange={(e) =>
                      setGrnForm({
                        ...grnForm,
                        items: [{ ...grnForm.items[0], received_quantity: Number(e.target.value) }]
                      })
                    }
                    className="w-full px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {isAr ? 'سعر الوحدة' : 'Unit Cost'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={grnForm.items[0]?.unit_cost || 0}
                    onChange={(e) =>
                      setGrnForm({
                        ...grnForm,
                        items: [{ ...grnForm.items[0], unit_cost: Number(e.target.value) }]
                      })
                    }
                    className="w-full px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowGrnModal(false)}
                  className="px-4 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
                >
                  {isAr ? 'تأكيد الاستلام' : 'Confirm Receipt'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: New Price Comparison */}
      {showCompModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl p-6 space-y-4">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-indigo-600" />
              {isAr ? 'إضافة عرض سعر مورد' : 'Add Supplier Quote'}
            </h2>
            <form onSubmit={handleCreateComparison} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? 'اسم الصنف' : 'Item / Part Name'}
                </label>
                <input
                  type="text"
                  required
                  value={compForm.item_name}
                  onChange={(e) => setCompForm({ ...compForm, item_name: e.target.value })}
                  placeholder={isAr ? 'مثال: بطارية آيفون 12 برو ماكس' : 'e.g. Battery iPhone 12 Pro Max'}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? 'اسم المورد' : 'Supplier'}
                </label>
                <input
                  type="text"
                  required
                  value={compForm.supplier_name}
                  onChange={(e) => setCompForm({ ...compForm, supplier_name: e.target.value })}
                  placeholder={isAr ? 'المورد المصري' : 'Supplier ABC'}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {isAr ? 'سعر الوحدة (ج.م)' : 'Unit Price (EGP)'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    required
                    value={compForm.unit_price}
                    onChange={(e) => setCompForm({ ...compForm, unit_price: Number(e.target.value) })}
                    className="w-full px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {isAr ? 'مدة التوريد (أيام)' : 'Lead Time (days)'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={compForm.lead_time_days}
                    onChange={(e) => setCompForm({ ...compForm, lead_time_days: Number(e.target.value) })}
                    className="w-full px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCompModal(false)}
                  className="px-4 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
                >
                  {isAr ? 'حفظ العرض' : 'Save Quote'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
