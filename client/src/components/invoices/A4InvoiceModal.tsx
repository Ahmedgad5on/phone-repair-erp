import React, { useRef } from 'react';
import { X, Printer } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';

interface A4InvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoiceData: {
    store: any;
    sale: any;
    items: any[];
    qrData?: string;
  } | null;
}

export const A4InvoiceModal: React.FC<A4InvoiceModalProps> = ({ isOpen, onClose, invoiceData }) => {
  const { language } = useLanguage();
  const printRef = useRef<HTMLDivElement>(null);

  if (!isOpen || !invoiceData) return null;

  const isAr = language === 'ar';
  const { store, sale, items } = invoiceData;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-3xl bg-slate-900 border border-slate-700/60 rounded-2xl shadow-2xl overflow-hidden my-8">
        {/* Modal Toolbar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-800/50 print:hidden">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-white">
              {isAr ? 'فاتورة ضريبية قياسية A4' : 'A4 Standard Tax Invoice'}
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-mono">
              #{sale.invoice_number}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl flex items-center gap-2 transition-colors cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              {isAr ? 'طباعة الفاتورة' : 'Print Invoice'}
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* A4 Printable Sheet */}
        <div ref={printRef} className="p-8 bg-white text-slate-900 font-sans print:p-0">
          {/* Header */}
          <div className="flex justify-between items-start border-b-2 border-slate-900 pb-6 mb-6">
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-950 mb-1">
                {store.name}
              </h1>
              <p className="text-xs text-slate-600">{store.address}</p>
              <p className="text-xs text-slate-600">📞 {store.phone}</p>
              <p className="text-xs text-slate-600 font-mono mt-1">Tax ID / البطاقة الضريبية: 492-819-204</p>
            </div>
            <div className="text-right">
              <div className="inline-block px-3 py-1 bg-slate-950 text-white font-bold text-xs rounded mb-2">
                {isAr ? 'فاتورة ضريبية مبسطة' : 'TAX INVOICE'}
              </div>
              <p className="text-sm font-bold text-slate-950 font-mono">#{sale.invoice_number}</p>
              <p className="text-xs text-slate-500">{new Date(sale.created_at).toLocaleString()}</p>
              <p className="text-xs text-slate-500 font-mono">INV-CODE: {sale.id.slice(0, 12)}</p>
            </div>
          </div>

          {/* Customer & Payment Info */}
          <div className="grid grid-cols-2 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs mb-6">
            <div>
              <span className="text-slate-500 block">{isAr ? 'بيانات العميل:' : 'Customer Details:'}</span>
              <p className="font-bold text-slate-900 text-sm">{sale.customer_name || (isAr ? 'عميل نقدي' : 'Cash Customer')}</p>
              <p className="text-slate-600">{sale.customer_phone || '-'}</p>
            </div>
            <div className="text-right">
              <span className="text-slate-500 block">{isAr ? 'طريقة السداد والكاشير:' : 'Payment & Cashier:'}</span>
              <p className="font-bold text-slate-900">{sale.payment_method} - {sale.status}</p>
              <p className="text-slate-600">{isAr ? 'الكاشير المسؤول: ' : 'Cashier: '}{sale.cashier_name || 'Main Cashier'}</p>
            </div>
          </div>

          {/* Items Table */}
          <table className="w-full text-xs text-left mb-6">
            <thead>
              <tr className="border-b-2 border-slate-900 text-slate-900 uppercase font-bold text-[11px]">
                <th className="py-2">{isAr ? 'الصنف والمواصفات' : 'Item Description'}</th>
                <th className="py-2 text-center">{isAr ? 'الكمية' : 'Qty'}</th>
                <th className="py-2 text-right">{isAr ? 'سعر الوحدة' : 'Unit Price'}</th>
                <th className="py-2 text-right">{isAr ? 'الإجمالي' : 'Total'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {items.map((item, idx) => (
                <tr key={idx} className="py-2">
                  <td className="py-3">
                    <span className="font-bold text-slate-950 block">{item.item_name}</span>
                    {item.imei && (
                      <span className="font-mono text-[10px] text-slate-600 block">
                        IMEI / Serial: {item.imei}
                      </span>
                    )}
                  </td>
                  <td className="py-3 text-center font-bold">{item.quantity}</td>
                  <td className="py-3 text-right font-mono">{item.unit_price.toFixed(2)} EGP</td>
                  <td className="py-3 text-right font-bold font-mono">{item.total_price.toFixed(2)} EGP</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div className="flex justify-end mb-8">
            <div className="w-64 space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>{isAr ? 'المجموع الفرعي:' : 'Subtotal:'}</span>
                <span className="font-mono">{sale.subtotal.toFixed(2)} EGP</span>
              </div>
              {sale.discount > 0 && (
                <div className="flex justify-between text-emerald-600 font-semibold">
                  <span>{isAr ? 'الخصم المطبق:' : 'Discount:'}</span>
                  <span className="font-mono">-{sale.discount.toFixed(2)} EGP</span>
                </div>
              )}
              {sale.tax > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>{isAr ? 'ضريبة القيمة المضافة:' : 'VAT:'}</span>
                  <span className="font-mono">+{sale.tax.toFixed(2)} EGP</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-black text-slate-950 border-t-2 border-slate-900 pt-2">
                <span>{isAr ? 'صافي القيمة المطلوبة:' : 'Total Amount:'}</span>
                <span className="font-mono text-base">{sale.total.toFixed(2)} EGP</span>
              </div>
            </div>
          </div>

          {/* Footer & Warranty Terms */}
          <div className="border-t border-slate-200 pt-4 text-[11px] text-slate-500 leading-relaxed">
            <p className="font-bold text-slate-700 mb-1">{isAr ? 'شروط الضمان والاسترجاع:' : 'Warranty & Return Terms:'}</p>
            <p>
              {isAr
                ? '• البضاعة المباعة ترد وتستبدل خلال 14 يوماً مع إحضار أصل الفاتورة وأن تكون بحالتها الأصلية.'
                : '• Goods can be returned or exchanged within 14 days with original invoice.'}
            </p>
            <p>
              {isAr
                ? '• الأجهزة الإلكترونية والهواتف تخضع لفحص السيريال / IMEI ولا يشمل الضمان عيوب سوء الاستخدام أو الكسر أو السوائل.'
                : '• Strict IMEI matching applies. Liquid and accidental drop damage void warranty.'}
            </p>
            <div className="mt-4 text-center text-slate-400 font-mono text-[10px]">
              {store.receipt_footer || 'Thank you for your business!'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
