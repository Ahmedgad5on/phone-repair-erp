import React, { useState, useEffect } from 'react';
import { CreditCard, Banknote, Smartphone, QrCode, AlertCircle, CheckCircle2, X } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';

export interface SplitPaymentLine {
  method: string;
  amount: number;
  reference_id?: string;
}

interface SplitPaymentModalProps {
  isOpen: boolean;
  total: number;
  onClose: () => void;
  onConfirm: (payments: SplitPaymentLine[]) => void;
}

export const SplitPaymentModal: React.FC<SplitPaymentModalProps> = ({
  isOpen,
  total,
  onClose,
  onConfirm
}) => {
  const { language } = useLanguage();
  const isAr = language === 'ar';

  const [cash, setCash] = useState<number>(0);
  const [card, setCard] = useState<number>(0);
  const [wallet, setWallet] = useState<number>(0);
  const [instapay, setInstapay] = useState<number>(0);

  const [cardRef, setCardRef] = useState('');
  const [walletRef, setWalletRef] = useState('');
  const [instapayRef, setInstapayRef] = useState('');

  // When modal opens, initialize with cash = total
  useEffect(() => {
    if (isOpen) {
      setCash(total);
      setCard(0);
      setWallet(0);
      setInstapay(0);
      setCardRef('');
      setWalletRef('');
      setInstapayRef('');
    }
  }, [isOpen, total]);

  if (!isOpen) return null;

  const allocated = Math.round((cash + card + wallet + instapay) * 100) / 100;
  const remaining = Math.round((total - allocated) * 100) / 100;
  const isBalanced = Math.abs(remaining) < 0.01;

  const handleFillRemaining = (method: 'cash' | 'card' | 'wallet' | 'instapay') => {
    const currentWithoutMethod = {
      cash: card + wallet + instapay,
      card: cash + wallet + instapay,
      wallet: cash + card + instapay,
      instapay: cash + card + wallet
    }[method];

    const fillAmount = Math.max(0, Math.round((total - currentWithoutMethod) * 100) / 100);

    if (method === 'cash') setCash(fillAmount);
    if (method === 'card') setCard(fillAmount);
    if (method === 'wallet') setWallet(fillAmount);
    if (method === 'instapay') setInstapay(fillAmount);
  };

  const handleConfirm = () => {
    if (!isBalanced) return;

    const payments: SplitPaymentLine[] = [];
    if (cash > 0) payments.push({ method: 'CASH', amount: cash });
    if (card > 0) payments.push({ method: 'CARD', amount: card, reference_id: cardRef.trim() || undefined });
    if (wallet > 0) payments.push({ method: 'WALLET', amount: wallet, reference_id: walletRef.trim() || undefined });
    if (instapay > 0) payments.push({ method: 'INSTAPAY', amount: instapay, reference_id: instapayRef.trim() || undefined });

    onConfirm(payments);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 select-text">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 px-6 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                {isAr ? 'الدفع المتعدد (Split Payment)' : 'Split Multi-Method Payment'}
              </h2>
              <p className="text-xs text-slate-400">
                {isAr ? 'توزيع قيمة الفاتورة على أكثر من طريقة دفع' : 'Allocate invoice total across payment methods'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Balance Status Banner */}
        <div className="p-4 grid grid-cols-3 gap-3 bg-slate-950/40 border-b border-slate-800 text-center text-xs">
          <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
            <span className="text-slate-400 block mb-1">{isAr ? 'إجمالي الفاتورة' : 'Invoice Total'}</span>
            <span className="font-mono font-bold text-white text-sm">
              {total.toLocaleString()} ج.م
            </span>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
            <span className="text-slate-400 block mb-1">{isAr ? 'الموزّع حالياً' : 'Allocated'}</span>
            <span className="font-mono font-bold text-indigo-400 text-sm">
              {allocated.toLocaleString()} ج.م
            </span>
          </div>

          <div className={`p-2.5 rounded-xl border ${
            isBalanced
              ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
              : remaining > 0
              ? 'bg-amber-950/40 border-amber-800/60 text-amber-300'
              : 'bg-rose-950/40 border-rose-800/60 text-rose-300'
          }`}>
            <span className="block mb-1 opacity-80">{isAr ? 'المتبقي' : 'Remaining'}</span>
            <span className="font-mono font-bold text-sm">
              {remaining.toLocaleString()} ج.م
            </span>
          </div>
        </div>

        {/* Payment Methods Input Rows */}
        <div className="p-5 space-y-3.5 max-h-[55vh] overflow-y-auto">
          {/* Cash */}
          <div className="p-3 bg-slate-950/50 border border-slate-800 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-white">
                <Banknote className="w-4 h-4 text-emerald-400" />
                <span>{isAr ? 'نقداً (Cash)' : 'Cash'}</span>
              </div>
              <button
                type="button"
                onClick={() => handleFillRemaining('cash')}
                className="text-[11px] text-emerald-400 hover:text-emerald-300 hover:underline cursor-pointer"
              >
                {isAr ? 'المتبقي بالكامل' : 'Fill Remaining'}
              </button>
            </div>
            <div className="relative">
              <input
                type="number"
                min="0"
                step="0.01"
                value={cash === 0 ? '' : cash}
                placeholder="0.00"
                onChange={e => setCash(Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono text-sm focus:border-emerald-500 focus:outline-none"
              />
              <span className="absolute inset-y-0 right-3 flex items-center text-xs text-slate-500 pointer-events-none">ج.م</span>
            </div>
          </div>

          {/* Bank Card / POS Visa */}
          <div className="p-3 bg-slate-950/50 border border-slate-800 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-white">
                <CreditCard className="w-4 h-4 text-indigo-400" />
                <span>{isAr ? 'بطاقة بنكية / فيزا (Card)' : 'Card / POS'}</span>
              </div>
              <button
                type="button"
                onClick={() => handleFillRemaining('card')}
                className="text-[11px] text-indigo-400 hover:text-indigo-300 hover:underline cursor-pointer"
              >
                {isAr ? 'المتبقي بالكامل' : 'Fill Remaining'}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={card === 0 ? '' : card}
                  placeholder="0.00"
                  onChange={e => setCard(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono text-sm focus:border-indigo-500 focus:outline-none"
                />
                <span className="absolute inset-y-0 right-3 flex items-center text-xs text-slate-500 pointer-events-none">ج.م</span>
              </div>
              <input
                type="text"
                value={cardRef}
                placeholder={isAr ? 'رقم الإيصال / تفويض (Auth Code)' : 'Receipt / Auth Code'}
                onChange={e => setCardRef(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 text-xs focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Vodafone Cash / Mobile Wallet */}
          <div className="p-3 bg-slate-950/50 border border-slate-800 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-white">
                <Smartphone className="w-4 h-4 text-rose-400" />
                <span>{isAr ? 'محفظة إلكترونية (فودافون كاش / اتصالات)' : 'Mobile Wallet'}</span>
              </div>
              <button
                type="button"
                onClick={() => handleFillRemaining('wallet')}
                className="text-[11px] text-rose-400 hover:text-rose-300 hover:underline cursor-pointer"
              >
                {isAr ? 'المتبقي بالكامل' : 'Fill Remaining'}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={wallet === 0 ? '' : wallet}
                  placeholder="0.00"
                  onChange={e => setWallet(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono text-sm focus:border-rose-500 focus:outline-none"
                />
                <span className="absolute inset-y-0 right-3 flex items-center text-xs text-slate-500 pointer-events-none">ج.م</span>
              </div>
              <input
                type="text"
                value={walletRef}
                placeholder={isAr ? 'رقم العملية (TxID)' : 'TxID Reference'}
                onChange={e => setWalletRef(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 text-xs focus:border-rose-500 focus:outline-none"
              />
            </div>
          </div>

          {/* InstaPay */}
          <div className="p-3 bg-slate-950/50 border border-slate-800 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-white">
                <QrCode className="w-4 h-4 text-amber-400" />
                <span>{isAr ? 'إنستاباي (InstaPay IPN)' : 'InstaPay'}</span>
              </div>
              <button
                type="button"
                onClick={() => handleFillRemaining('instapay')}
                className="text-[11px] text-amber-400 hover:text-amber-300 hover:underline cursor-pointer"
              >
                {isAr ? 'المتبقي بالكامل' : 'Fill Remaining'}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={instapay === 0 ? '' : instapay}
                  placeholder="0.00"
                  onChange={e => setInstapay(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono text-sm focus:border-amber-500 focus:outline-none"
                />
                <span className="absolute inset-y-0 right-3 flex items-center text-xs text-slate-500 pointer-events-none">ج.م</span>
              </div>
              <input
                type="text"
                value={instapayRef}
                placeholder={isAr ? 'المرجع أو IPA الحساب' : 'InstaPay Reference'}
                onChange={e => setInstapayRef(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 text-xs focus:border-amber-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 px-6 border-t border-slate-800 flex items-center justify-between bg-slate-950/80">
          <div className="flex items-center gap-1.5 text-xs">
            {isBalanced ? (
              <span className="flex items-center gap-1 text-emerald-400 font-medium">
                <CheckCircle2 className="w-4 h-4" />
                {isAr ? 'المبالغ متطابقة وجاهزة للسداد' : 'Amounts balanced'}
              </span>
            ) : (
              <span className="flex items-center gap-1 text-amber-400 font-medium">
                <AlertCircle className="w-4 h-4" />
                {remaining > 0
                  ? isAr ? `متبقي ${remaining.toLocaleString()} ج.م غير مخصصة` : `${remaining} EGP unallocated`
                  : isAr ? `المبلغ الموزع يتجاوز الفاتورة بـ ${Math.abs(remaining).toLocaleString()} ج.م` : `Over-allocated by ${Math.abs(remaining)} EGP`}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              type="button"
              disabled={!isBalanced || allocated <= 0}
              onClick={handleConfirm}
              className={`px-5 py-2 text-xs font-semibold rounded-lg shadow-lg transition cursor-pointer ${
                isBalanced && allocated > 0
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
              }`}
            >
              {isAr ? 'تأكيد السداد المتعدد' : 'Confirm Split Payment'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
