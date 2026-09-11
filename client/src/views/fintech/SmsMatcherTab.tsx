import React, { useState } from 'react';
import { fetchFintechApi } from './types';
import { useToast } from '../../context/ToastContext';
import { MessageSquare, CheckCircle2, AlertTriangle, RefreshCw, Send } from 'lucide-react';

export const SmsMatcherTab: React.FC = () => {
  const { showToast } = useToast();
  const [smsRawText, setSmsRawText] = useState(
    'تم استلام مبلغ 750.00 جنيه من 01012345678 بنجاح. رقم المعاملة: VF894120'
  );
  const [smsExpectedRef, setSmsExpectedRef] = useState('');
  const [smsMatchResult, setSmsMatchResult] = useState<any | null>(null);
  const [matchingSms, setMatchingSms] = useState(false);

  const handleMatchSms = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!smsRawText.trim()) {
      showToast('يرجى إدخال نص رسالة التحويل SMS', 'warning');
      return;
    }

    setMatchingSms(true);
    try {
      const res = await fetchFintechApi<any>('/fintech/sms-match', {
        method: 'POST',
        body: JSON.stringify({
          sms_body: smsRawText,
          invoice_or_ticket_id: smsExpectedRef || undefined
        })
      });

      setSmsMatchResult(res);
      if (res.matched) {
        showToast(`تم التعرف على التحويل: ${res.amount} ج.م (${res.provider})`, 'success');
      } else if (res.error) {
        showToast(res.error, 'error');
      } else {
        showToast('لم يتم استخراج كود معاملة أو مبلغ صالح من الرسالة', 'warning');
      }
    } catch (err: any) {
      showToast(err.message || 'فشل فحص ومطابقة الرسالة', 'error');
    } finally {
      setMatchingSms(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-amber-400" />
            مطابقة وتدقيق رسائل التحويلات النصية (Automated Carrier SMS Parser)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            استخراج تلقائي لمبالغ التحويلات، أكواد المعاملات (TxID)، وأرقام الهواتف من رسائل فودافون كاش وإنستاباي مع منع التكرار.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <form onSubmit={handleMatchSms} className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              نص رسالة التحويل SMS المستلمة *
            </label>
            <textarea
              rows={4}
              required
              value={smsRawText}
              onChange={e => setSmsRawText(e.target.value)}
              placeholder="الصق نص الرسالة هنا..."
              className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white text-xs leading-relaxed outline-hidden focus:border-amber-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              رقم الفاتورة أو تذكرة الصيانة المتوقعة (اختياري للمطابقة التلقائية)
            </label>
            <input
              type="text"
              value={smsExpectedRef}
              onChange={e => setSmsExpectedRef(e.target.value)}
              placeholder="مثال: 1001 أو INV-2026-001"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-white text-xs"
            />
          </div>

          <button
            type="submit"
            disabled={matchingSms}
            className="w-full py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold shadow-lg transition flex items-center justify-center gap-2"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{matchingSms ? 'جاري الفحص واستخراج المعاملة...' : 'فحص ومطابقة الرسالة آلياً'}</span>
          </button>
        </form>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
          <h3 className="text-xs font-bold text-white border-b border-slate-800 pb-3">
            نتيجة الفحص والاستخراج الآلي
          </h3>

          {smsMatchResult ? (
            <div className={`p-4 rounded-xl border text-xs space-y-2 font-mono ${
              smsMatchResult.matched
                ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
                : 'bg-rose-950/40 border-rose-800 text-rose-300'
            }`}>
              <div className="flex items-center gap-2 font-bold text-sm">
                {smsMatchResult.matched ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>تم التعرف والمطابقة بنجاح</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-4 h-4 text-rose-400" />
                    <span>فشل التحقق من الرسالة</span>
                  </>
                )}
              </div>

              {smsMatchResult.error && (
                <p className="text-rose-400 text-xs font-sans">{smsMatchResult.error}</p>
              )}

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800">
                <div>
                  <span className="text-slate-400 text-[10px] block">المزود:</span>
                  <span className="font-bold text-white">{smsMatchResult.provider || '-'}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">المبلغ المستخرج:</span>
                  <span className="font-bold text-amber-400">{smsMatchResult.amount ? `${smsMatchResult.amount} ج.م` : '-'}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">كود العملية (TxID):</span>
                  <span className="font-bold text-white">{smsMatchResult.txId || '-'}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">رقم المرسل:</span>
                  <span className="font-bold text-white" dir="ltr">{smsMatchResult.senderPhone || '-'}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-12 text-center text-xs text-slate-500">
              أدخل نص رسالة التحويل واضغط على زر الفحص لعرض تفاصيل المعاملة المستخرجة.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SmsMatcherTab;
