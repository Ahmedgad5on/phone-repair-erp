import React, { useState } from 'react';
import { Printer, Copy, Check, X, MessageSquare } from 'lucide-react';
import { api } from '../../services/api';
import { useLanguage } from '../../i18n/LanguageContext';

interface ThermalReceiptModalProps {
  receiptText: string;
  customerPhone?: string;
  title?: string;
  onClose: () => void;
}

export const ThermalReceiptModal: React.FC<ThermalReceiptModalProps> = ({
  receiptText,
  customerPhone,
  title,
  onClose
}) => {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);
  const [waSent, setWaSent] = useState(false);

  const displayTitle = title || t.common.print;

  const handleCopy = () => {
    navigator.clipboard.writeText(receiptText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank', 'width=400,height=650');
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>Print Receipt</title>
          <style>
            body {
              font-family: 'Courier New', Courier, monospace;
              font-size: 12px;
              width: 78mm;
              margin: 0;
              padding: 10px;
              color: #000;
              white-space: pre-wrap;
              direction: ltr;
            }
          </style>
        </head>
        <body>${receiptText}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  const handleSendWhatsApp = async () => {
    if (!customerPhone) return;
    try {
      await api.sendWhatsApp({
        phone: customerPhone,
        type: 'SALE_INVOICE',
        content: receiptText.substring(0, 500) + '...\n(Full invoice generated at checkout)'
      });
      setWaSent(true);
      setTimeout(() => setWaSent(false), 3000);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-3.5 bg-slate-800/80 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Printer className="w-5 h-5 text-indigo-400" />
            <h3 className="font-semibold text-white text-base">{displayTitle}</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-700/60 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Receipt Simulation Viewport */}
        <div className="p-4 bg-slate-950/70 overflow-y-auto flex-1 flex justify-center">
          <div className="receipt-paper p-5 rounded-sm w-full max-w-[360px] text-xs leading-tight font-mono-code select-text">
            <pre className="whitespace-pre-wrap">{receiptText}</pre>
          </div>
        </div>

        {/* Action Controls */}
        <div className="p-4 bg-slate-800/90 border-t border-slate-700 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium text-xs shadow-md transition"
            >
              <Printer className="w-4 h-4" />
              {t.common.print}
            </button>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-xs transition"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              {copied ? t.common.copied : t.common.copy}
            </button>
          </div>

          <div className="flex items-center gap-2">
            {customerPhone && (
              <button
                onClick={handleSendWhatsApp}
                className="flex items-center gap-1.5 px-3 py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg text-xs transition"
              >
                <MessageSquare className="w-4 h-4" />
                {waSent ? t.common.sentToWa : t.common.whatsappCustomer}
              </button>
            )}
            <button
              onClick={onClose}
              className="px-3 py-2 text-xs text-slate-300 hover:bg-slate-700/50 rounded-lg transition"
            >
              {t.common.close}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
