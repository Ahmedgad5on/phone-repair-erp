import React, { useEffect, useRef, useState } from 'react';
// @ts-ignore
import bwipjs from 'bwip-js';
import { RepairTicket } from '../../types/erp';
import { QrCode, Copy, Check, ExternalLink, Printer, X, ShieldCheck } from 'lucide-react';

interface QrTrackingModalProps {
  ticket: RepairTicket;
  isOpen: boolean;
  onClose: () => void;
  isAr?: boolean;
}

export const QrTrackingModal: React.FC<QrTrackingModalProps> = ({
  ticket,
  isOpen,
  onClose,
  isAr = true
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [copied, setCopied] = useState(false);
  const [qrGenerated, setQrGenerated] = useState(false);

  const trackingUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/portal/track?ticket=${ticket.ticket_number}`
    : `https://erp.local/portal/track?ticket=${ticket.ticket_number}`;

  useEffect(() => {
    if (isOpen && canvasRef.current) {
      try {
        bwipjs.toCanvas(canvasRef.current, {
          bcid: 'qrcode',
          text: trackingUrl,
          scale: 4,
          height: 25,
          width: 25,
          includetext: false
        });
        setQrGenerated(true);
      } catch (err) {
        console.error('Failed to render QR Code via bwip-js:', err);
      }
    }
  }, [isOpen, trackingUrl]);

  if (!isOpen) return null;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(trackingUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-sky-500/10 text-sky-400 rounded-xl border border-sky-500/20">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">
                {isAr ? 'باركود تتبع الصيانة الذكي للعميل' : 'Customer QR Tracking Portal'}
              </h3>
              <p className="text-[11px] text-slate-400">
                Ticket #{ticket.ticket_number} — {ticket.device_brand} {ticket.device_model}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* QR Code Container */}
        <div className="flex flex-col items-center justify-center p-6 bg-white rounded-2xl shadow-inner border border-slate-200">
          <canvas ref={canvasRef} className="max-w-[220px] max-h-[220px]" />
          <div className="mt-3 text-center">
            <p className="text-slate-900 font-bold font-mono text-sm tracking-wider">
              #{ticket.ticket_number}
            </p>
            <p className="text-slate-600 text-[11px]">
              {ticket.customer_name} ({ticket.device_brand} {ticket.device_model})
            </p>
          </div>
        </div>

        {/* Tracking Link URL Bar */}
        <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between gap-2">
          <span className="text-[11px] font-mono text-slate-300 truncate select-all">
            {trackingUrl}
          </span>
          <button
            onClick={handleCopyLink}
            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1 shrink-0 transition"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            <span>{copied ? (isAr ? 'تم النسخ' : 'Copied') : (isAr ? 'نسخ' : 'Copy')}</span>
          </button>
        </div>

        {/* Actions */}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <a
            href={trackingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="py-2.5 px-3 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-md shadow-sky-600/20"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>{isAr ? 'فتح بوابة العميل' : 'Open Portal'}</span>
          </a>
          <button
            onClick={handlePrint}
            className="py-2.5 px-3 bg-slate-800 hover:bg-slate-750 text-slate-200 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 border border-slate-700"
          >
            <Printer className="w-3.5 h-3.5 text-slate-400" />
            <span>{isAr ? 'طباعة الملصق' : 'Print Label'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
export default QrTrackingModal;
