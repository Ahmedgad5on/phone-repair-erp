import React, { useState, useEffect } from 'react';
import { Monitor, X, CheckCircle2, QrCode, ShoppingBag, ShieldCheck } from 'lucide-react';
import { api } from '../../services/api';

interface CfdModalProps {
  isOpen: boolean;
  onClose: () => void;
  cart: Array<{ item: any; quantity: number; unit_price: number }>;
  total: number;
  discount: number;
}

/**
 * Dual-Screen Customer-Facing Display (CFD) (Dev Proposal 8)
 * Real-time secondary display view with live cart, total breakdown, and dynamic QR
 */
export const CustomerFacingDisplayModal: React.FC<CfdModalProps> = ({
  isOpen,
  onClose,
  cart,
  total,
  discount
}) => {
  const [promoText] = useState('أهلاً بكم في معمل الصيانة المتقدم - ضمان معتمد 30 يوماً على كافة الشاشات وقطع الغيار الأصلية');

  useEffect(() => {
    if (isOpen) {
      // Broadcast cart state to backend CFD endpoint
      api.updateCfdCart?.({
        storeName: 'Mobile Tech Solutions & Lab',
        cashierName: 'كاشير الصالة',
        items: cart.map(c => ({
          name: c.item.name,
          quantity: c.quantity,
          unit_price: c.unit_price,
          total: c.quantity * c.unit_price
        })),
        subtotal: total + discount,
        discount,
        tax: 0,
        total,
        promotionalBanner: promoText
      }).catch(() => {});
    }
  }, [isOpen, cart, total, discount]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-950 border border-slate-700/80 rounded-3xl w-full max-w-4xl overflow-hidden shadow-2xl flex flex-col h-[85vh]">
        {/* CFD Window Header */}
        <div className="bg-gradient-to-r from-indigo-950 via-slate-900 to-indigo-950 border-b border-slate-800 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-500/20 rounded-2xl border border-indigo-500/30 text-indigo-400">
              <Monitor className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-wide">شاشة العميل الرقمية (Customer Facing Display)</h2>
              <p className="text-xs text-slate-400">Dual-Screen Secondary Monitor Live Mirror</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white bg-slate-800/60 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* CFD Body */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-6 p-6 overflow-hidden">
          {/* Left / Middle: Cart Items Stream */}
          <div className="md:col-span-2 flex flex-col bg-slate-900/60 border border-slate-800 rounded-2xl p-4 overflow-hidden">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-800 text-sm font-semibold text-slate-300">
              <ShoppingBag className="w-4 h-4 text-indigo-400" />
              <span>محتويات سلة المشتريات الحالية</span>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2.5 py-3 pr-1">
              {cart.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 text-sm">
                  <span>سلة المشتريات فارغة حالياً</span>
                  <span className="text-xs mt-1">سيتم عرض الأصناف فور قيام الكاشير بمسحها</span>
                </div>
              ) : (
                cart.map((c, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-slate-950/70 border border-slate-800 rounded-xl">
                    <div className="flex items-center gap-3">
                      <span className="w-7 h-7 bg-indigo-500/20 text-indigo-400 font-bold text-xs rounded-lg flex items-center justify-center">
                        {c.quantity}x
                      </span>
                      <div>
                        <div className="text-sm font-semibold text-white">{c.item.name}</div>
                        <div className="text-xs text-slate-400">{c.item.category}</div>
                      </div>
                    </div>
                    <div className="text-sm font-bold text-indigo-400 font-mono">
                      {(c.quantity * c.unit_price).toLocaleString()} EGP
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Promo Banner Footer */}
            <div className="bg-indigo-950/40 border border-indigo-800/40 rounded-xl p-3 text-xs text-indigo-200 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-indigo-400 shrink-0" />
              <span>{promoText}</span>
            </div>
          </div>

          {/* Right: Totals & QR Instant Pay */}
          <div className="flex flex-col justify-between bg-slate-900/80 border border-slate-800 rounded-2xl p-6">
            <div>
              <div className="text-xs text-slate-400 mb-1 font-semibold uppercase tracking-wider">الإجمالي المستحق للدفع</div>
              <div className="text-4xl font-extrabold text-emerald-400 font-mono tracking-tight tabular-nums mb-4">
                {total.toLocaleString()} <span className="text-xl text-emerald-500">ج.م</span>
              </div>

              {discount > 0 && (
                <div className="flex items-center justify-between text-xs py-2 border-t border-slate-800 text-slate-300">
                  <span>الخصم المطبق:</span>
                  <span className="text-rose-400 font-bold font-mono">-{discount.toLocaleString()} EGP</span>
                </div>
              )}
            </div>

            {/* Simulated InstaPay / Fawry QR Code */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex flex-col items-center justify-center text-center">
              <div className="w-32 h-32 bg-white rounded-xl p-2 mb-3 flex items-center justify-center shadow-lg">
                <QrCode className="w-28 h-28 text-slate-900" />
              </div>
              <span className="text-xs font-bold text-white flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                امسح للدفع عبر InstaPay
              </span>
              <span className="text-[10px] text-slate-400 mt-0.5">الدفع اللحظي الآمن معتمد لدى البنك المركزي</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
