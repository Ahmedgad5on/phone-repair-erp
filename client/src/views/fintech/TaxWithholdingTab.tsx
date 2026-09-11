import React, { useState, useEffect } from 'react';
import { WithholdingTaxRule, fetchFintechApi } from './types';
import { useToast } from '../../context/ToastContext';
import {
  Calculator,
  Receipt,
  FileCheck2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Printer,
  Shield,
  Percent
} from 'lucide-react';

export const TaxWithholdingTab: React.FC = () => {
  const { showToast } = useToast();
  const [rules, setRules] = useState<WithholdingTaxRule[]>([]);
  const [loading, setLoading] = useState(false);

  // Calculator Form
  const [supplierType, setSupplierType] = useState('SUPPLIER_SERVICES');
  const [grossAmount, setGrossAmount] = useState('15000');
  const [paymentMethod, setPaymentMethod] = useState('BANK_TRANSFER');
  const [supplierName, setSupplierName] = useState('شركة دلتا للتوريدات الإلكترونية');
  const [invoiceRef, setInvoiceRef] = useState('INV-SUPP-9921');

  // Deduction & Voucher Result
  const [voucherResult, setVoucherResult] = useState<any | null>(null);
  const [processing, setProcessing] = useState(false);

  const loadRules = async () => {
    setLoading(true);
    try {
      const res = await fetchFintechApi<WithholdingTaxRule[]>('/accounting/withholding-tax/rules');
      setRules(res);
    } catch (err: any) {
      showToast(err.message || 'فشل تحميل قواعد ضريبة الخصم والتحصيل', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRules();
  }, []);

  const selectedRule = rules.find(r => r.supplier_type === supplierType);
  const rate = selectedRule ? Number(selectedRule.rate) : 0.01;
  const numGross = parseFloat(grossAmount) || 0;
  const withholdingTax = Number((numGross * rate).toFixed(2));
  const netPayable = Number((numGross - withholdingTax).toFixed(2));

  const handleExecuteDeduction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (numGross <= 0) {
      showToast('يرجى إدخال مبلغ صحيح للفاتورة', 'error');
      return;
    }

    setProcessing(true);
    try {
      const res = await fetchFintechApi<any>('/accounting/withholding-tax/deduct', {
        method: 'POST',
        body: JSON.stringify({
          supplier_type: supplierType,
          gross_amount: numGross,
          payment_method: paymentMethod,
          invoice_reference: invoiceRef,
          description: `سداد فاتورة توريد لصالح ${supplierName}`
        })
      });

      setVoucherResult(res);
      showToast(`تم استقطاع ضريبة الخصم (${res.withholdingTax} ج.م) وترحيلها لحساب أمانات الضرائب 2050`, 'success');
    } catch (err: any) {
      showToast(err.message || 'فشل استقطاع وترحيل الضريبة', 'error');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
            <Calculator className="w-4 h-4 text-amber-400" />
            حاسبة واستقطاع ضريبة الخصم والتحصيل (Withholding Tax - WHT Form 41)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            تطبيق النسب الرسمية للخصم تحت حساب الضريبة طبقاً لأحكام القانون المصري، وترحيلها آلياً لحساب التزامات الضرائب (2050).
          </p>
        </div>

        <button
          onClick={loadRules}
          disabled={loading}
          className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Rules Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {rules.map(r => (
          <div
            key={r.id}
            onClick={() => setSupplierType(r.supplier_type)}
            className={`p-4 rounded-xl border transition cursor-pointer shadow-lg ${
              supplierType === r.supplier_type
                ? 'bg-amber-950/20 border-amber-500 shadow-amber-950/20'
                : 'bg-slate-900 border-slate-800 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-2xl font-black font-mono text-amber-400">
                {(Number(r.rate) * 100).toFixed(0)}%
              </span>
              <Percent className="w-4 h-4 text-slate-500" />
            </div>
            <p className="font-bold text-xs text-white mt-2">{r.supplier_type}</p>
            <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">{r.description}</p>
          </div>
        ))}
      </div>

      {/* Calculator & Voucher Generator Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input Form */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
          <h3 className="font-bold text-white text-xs flex items-center gap-2 border-b border-slate-800 pb-3">
            <Receipt className="w-4 h-4 text-amber-400" />
            بيانات الفاتورة ومستحقات المورد
          </h3>

          <form onSubmit={handleExecuteDeduction} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">نوع نشاط المورد والنسبة القانونية</label>
              <select
                value={supplierType}
                onChange={e => setSupplierType(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white text-xs"
              >
                {rules.map(r => (
                  <option key={r.id} value={r.supplier_type}>
                    {r.description}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">المبلغ الإجمالي للفاتورة (Gross) *</label>
                <input
                  type="number"
                  required
                  min="1"
                  step="0.01"
                  value={grossAmount}
                  onChange={e => setGrossAmount(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white font-mono text-sm focus:border-amber-500 outline-hidden text-left"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">طريقة سداد الصافي للمورد</label>
                <select
                  value={paymentMethod}
                  onChange={e => setPaymentMethod(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white text-xs"
                >
                  <option value="BANK_TRANSFER">تحويل بنكي</option>
                  <option value="CHECK">شيك مصرفي</option>
                  <option value="CASH">نقداً من الخزينة</option>
                  <option value="INSTAPAY">إنستاباي</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">اسم المورد أو الجهة المستفيدة</label>
              <input
                type="text"
                value={supplierName}
                onChange={e => setSupplierName(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">رقم الفاتورة المرجعية للمورد</label>
              <input
                type="text"
                value={invoiceRef}
                onChange={e => setInvoiceRef(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white text-xs font-mono"
              />
            </div>

            {/* Instant Calculation Preview */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2 font-mono text-xs">
              <div className="flex justify-between text-slate-400">
                <span>إجمالي الفاتورة:</span>
                <span className="text-white font-bold">{numGross.toLocaleString()} ج.م</span>
              </div>
              <div className="flex justify-between text-rose-400">
                <span>استقطاع ضريبة الخصم ({(rate * 100).toFixed(1)}%):</span>
                <span className="font-bold">-{withholdingTax.toLocaleString()} ج.م</span>
              </div>
              <div className="flex justify-between text-emerald-400 font-bold border-t border-slate-800 pt-2 text-sm">
                <span>صافي المستحق للمورد (Net Payout):</span>
                <span>{netPayable.toLocaleString()} ج.م</span>
              </div>
            </div>

            <button
              type="submit"
              disabled={processing}
              className="w-full py-3 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold shadow-lg transition flex items-center justify-center gap-2"
            >
              <FileCheck2 className="w-4 h-4" />
              <span>{processing ? 'جاري الاستقطاع والترحيل...' : 'استقطاع الضريبة وتوليد إشعار الخصم والتحصيل (Form 41)'}</span>
            </button>
          </form>
        </div>

        {/* Generated Printable Tax Voucher View */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-xs flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-400" />
                معاينة إشعار الخصم والتحصيل الضريبي الرسمي
              </h3>
              {voucherResult && (
                <button
                  onClick={() => window.print()}
                  className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs flex items-center gap-1"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>طباعة الإشعار</span>
                </button>
              )}
            </div>

            {voucherResult ? (
              <div className="mt-4 p-5 bg-white text-slate-900 rounded-xl border border-slate-300 shadow-inner space-y-4 text-xs font-sans">
                <div className="text-center border-b pb-3 space-y-1">
                  <h4 className="font-black text-sm text-slate-900">مصلحة الضرائب المصرية</h4>
                  <p className="font-bold text-xs text-slate-700">إشعار إضافة وخصم تحت حساب الضريبة (نموذج 41 ضرائب)</p>
                  <p className="text-[10px] text-slate-500 font-mono">رقم الإشعار: {voucherResult.voucherNumber}</p>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <p><strong>اسم المستفيد:</strong> {supplierName}</p>
                  <p><strong>تاريخ الإشعار:</strong> {voucherResult.pdfVoucher?.date}</p>
                  <p><strong>طبيعة التعامل:</strong> {voucherResult.supplierType}</p>
                  <p><strong>رقم الفاتورة:</strong> {invoiceRef}</p>
                </div>

                <table className="w-full text-[11px] text-right border-collapse border border-slate-300 mt-2">
                  <thead className="bg-slate-100 font-bold">
                    <tr>
                      <th className="border border-slate-300 p-1.5">إجمالي المبلغ</th>
                      <th className="border border-slate-300 p-1.5">نسبة الخصم</th>
                      <th className="border border-slate-300 p-1.5">الضريبة المستقطعة</th>
                      <th className="border border-slate-300 p-1.5">الصافي المنصرف</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono">
                    <tr>
                      <td className="border border-slate-300 p-1.5">{voucherResult.grossAmount.toLocaleString()} ج.م</td>
                      <td className="border border-slate-300 p-1.5">{voucherResult.pdfVoucher?.whtRate}</td>
                      <td className="border border-slate-300 p-1.5 font-bold text-rose-700">{voucherResult.withholdingTax.toLocaleString()} ج.م</td>
                      <td className="border border-slate-300 p-1.5 font-bold text-emerald-800">{voucherResult.netPayable.toLocaleString()} ج.م</td>
                    </tr>
                  </tbody>
                </table>

                <p className="text-[9px] text-slate-500 italic mt-3 leading-relaxed">
                  {voucherResult.pdfVoucher?.taxAuthorityNotice}
                </p>

                <div className="pt-4 border-t flex justify-between text-[10px] font-bold text-slate-700">
                  <span>توقيع المدير المالي: ......................</span>
                  <span>خاتم المنشأة المعتمد</span>
                </div>
              </div>
            ) : (
              <div className="py-16 text-center text-slate-500 text-xs space-y-2">
                <Receipt className="w-10 h-10 mx-auto text-slate-700" />
                <p>قم بحساب واستقطاع الضريبة من النموذج المقابل لتوليد الإشعار الرسمي المعتمد.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TaxWithholdingTab;
