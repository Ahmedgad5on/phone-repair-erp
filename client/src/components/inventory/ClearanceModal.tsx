import React, { useState } from 'react';
import { Tag, AlertTriangle, X, Check } from 'lucide-react';
import { inventoryApi } from './inventoryApi';

interface ClearanceModalProps {
  item: {
    id: string;
    name: string;
    sku: string;
    stock_quantity: number;
    purchase_price: number;
    retail_price: number;
    days_inactive: number;
  } | null;
  onClose: () => void;
  onSuccess: (message: string) => void;
  isAr?: boolean;
}

export const ClearanceModal: React.FC<ClearanceModalProps> = ({
  item,
  onClose,
  onSuccess,
  isAr = true
}) => {
  if (!item) return null;

  const [discountPercent, setDiscountPercent] = useState<number>(30);
  const [customPrice, setCustomPrice] = useState<string>(
    String(Math.round(item.retail_price * 0.7))
  );
  const [useCustomPrice, setUseCustomPrice] = useState<boolean>(false);
  const [note, setNote] = useState<string>('تصفية مخزون راكد');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handlePercentChange = (pct: number) => {
    setDiscountPercent(pct);
    setUseCustomPrice(false);
    const calculated = Math.round(item.retail_price * (1 - pct / 100));
    setCustomPrice(String(calculated));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const priceNum = Number(customPrice);
      if (isNaN(priceNum) || priceNum <= 0) {
        throw new Error(isAr ? 'يرجى إدخال سعر تصفية صحيح' : 'Please enter a valid clearance price');
      }

      const res = await inventoryApi.markForClearance(item.id, {
        discount_percent: useCustomPrice ? undefined : discountPercent,
        clearance_price: priceNum,
        note
      });

      onSuccess(res.message || (isAr ? `تم تحديث سعر التصفية إلى ${priceNum} ج.م` : `Clearance price set to ${priceNum} EGP`));
      onClose();
    } catch (err: any) {
      setError(err.message || 'فشل تطبيق سعر التصفية');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-800/40">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20">
              <Tag className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-white">
                {isAr ? 'عرض الصنف للتصفية السريعة' : 'Mark Item for Clearance'}
              </h3>
              <p className="text-xs text-slate-400">
                {item.sku}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/50 space-y-2">
            <div className="text-sm font-medium text-white line-clamp-1">{item.name}</div>
            <div className="grid grid-cols-3 gap-2 text-xs text-slate-400">
              <div>
                <span>{isAr ? 'الكمية الراكدة:' : 'Stock Qty:'}</span>
                <span className="font-semibold text-slate-200 block">{item.stock_quantity}</span>
              </div>
              <div>
                <span>{isAr ? 'سعر التكلفة:' : 'Cost Price:'}</span>
                <span className="font-semibold text-slate-200 block">{item.purchase_price} ج.م</span>
              </div>
              <div>
                <span>{isAr ? 'السعر الحالي:' : 'Current Price:'}</span>
                <span className="font-semibold text-slate-200 block line-through">{item.retail_price} ج.م</span>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-2">
              {isAr ? 'نسبة الخصم السريعة:' : 'Quick Discount:'}
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[15, 25, 35, 50].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => handlePercentChange(pct)}
                  className={`py-2 px-3 rounded-lg text-xs font-semibold transition-all border ${
                    !useCustomPrice && discountPercent === pct
                      ? 'bg-rose-500 text-white border-rose-400 shadow-md shadow-rose-500/20'
                      : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-750'
                  }`}
                >
                  {pct}%-
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              {isAr ? 'سعر البيع النهائي للتصفية (ج.م):' : 'Final Clearance Price (EGP):'}
            </label>
            <input
              type="number"
              min="1"
              value={customPrice}
              onChange={(e) => {
                setCustomPrice(e.target.value);
                setUseCustomPrice(true);
              }}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-white font-mono text-lg focus:outline-hidden focus:border-rose-500 transition-colors"
              required
            />
            {Number(customPrice) < item.purchase_price && (
              <p className="text-xs text-amber-400 mt-1 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                {isAr ? 'تنبيه: السعر المقترح أقل من سعر التكلفة' : 'Warning: Price is below cost price'}
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              {isAr ? 'ملاحظة التصفية:' : 'Clearance Note:'}
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-hidden focus:border-slate-500"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 py-2.5 rounded-xl text-sm font-medium transition-colors"
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 shadow-lg shadow-rose-600/20"
            >
              <Check className="w-4 h-4" />
              {loading ? (isAr ? 'جاري الحفظ...' : 'Saving...') : (isAr ? 'تأكيد التصفية' : 'Confirm Clearance')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
