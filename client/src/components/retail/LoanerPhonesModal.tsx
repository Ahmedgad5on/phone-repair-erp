import React, { useState, useEffect } from 'react';
import { Smartphone, X, Plus, CheckCircle2, ArrowRightLeft, ShieldAlert } from 'lucide-react';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';

interface LoanerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Loaner Phones Fleet Management Modal (Dev Proposal 13)
 */
export const LoanerPhonesModal: React.FC<LoanerModalProps> = ({ isOpen, onClose }) => {
  const { showToast } = useToast();
  const [loaners, setLoaners] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadLoaners();
    }
  }, [isOpen]);

  const loadLoaners = async () => {
    setLoading(true);
    try {
      const data = await api.getLoanerPhones?.() || [];
      setLoaners(data);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleReturnLoaner = async (loanerId: string) => {
    try {
      await api.checkinLoaner?.(loanerId, 'EXCELLENT', true);
      showToast('تم استلام الجهاز البديل واسترداد مبلغ التأمين بنجاح', 'success');
      loadLoaners();
    } catch (err: any) {
      showToast(err.message || 'فشل استرجاع الجهاز', 'error');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700/80 rounded-3xl w-full max-w-4xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="bg-slate-950 p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-xl border border-indigo-500/30">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">أسطول الأجهزة البديلة للعملاء (Loaner Phones Fleet)</h2>
              <p className="text-xs text-slate-400">Temporary Replacement Devices with Deposit Ledger</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white bg-slate-800 rounded-xl">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {loaners.map(loaner => {
              const isLoaned = loaner.status === 'LOANED';
              return (
                <div
                  key={loaner.id}
                  className={`p-4 rounded-2xl border flex flex-col justify-between ${
                    isLoaned
                      ? 'bg-amber-950/20 border-amber-800/60 text-amber-200'
                      : 'bg-slate-950 border-slate-800 text-slate-300'
                  }`}
                >
                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        isLoaned ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'
                      }`}>
                        {isLoaned ? 'مُعار لعميل حالياً' : 'متاح بالفرع (Available)'}
                      </span>
                      <span className="text-xs font-mono font-bold text-white">{loaner.deposit_amount} ج.م تأمين</span>
                    </div>
                    <div className="font-bold text-white text-sm">{loaner.brand} {loaner.model}</div>
                    <div className="text-[11px] font-mono text-slate-500 mt-0.5">{loaner.imei}</div>

                    {isLoaned && (
                      <div className="mt-3 p-2.5 bg-black/40 rounded-xl border border-amber-800/30 text-[11px] space-y-1">
                        <div>العميل: <strong className="text-white">{loaner.customer_name}</strong></div>
                        <div>الهاتف: <span className="font-mono text-slate-300">{loaner.customer_phone}</span></div>
                        <div>رقم تذكرة الصيانة: <span className="font-mono text-indigo-400">#{loaner.ticket_number}</span></div>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-800/80">
                    {isLoaned ? (
                      <button
                        onClick={() => handleReturnLoaner(loaner.id)}
                        className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-md transition-all"
                      >
                        استلام واسترداد التأمين
                      </button>
                    ) : (
                      <div className="text-center text-[11px] text-slate-500 font-medium">جاهز للتسليم الفوري لأي عميل VIP</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
