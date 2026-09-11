import React, { useRef } from 'react';
import { X, Printer, ShieldCheck } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';

interface A4WarrantyCertificateModalProps {
  isOpen: boolean;
  onClose: () => void;
  certificateData: {
    ticket: any;
    certificate?: any;
    store: any;
  } | null;
}

export const A4WarrantyCertificateModal: React.FC<A4WarrantyCertificateModalProps> = ({
  isOpen,
  onClose,
  certificateData
}) => {
  const { language } = useLanguage();
  const printRef = useRef<HTMLDivElement>(null);

  if (!isOpen || !certificateData) return null;

  const isAr = language === 'ar';
  const { ticket, store } = certificateData;

  const handlePrint = () => {
    window.print();
  };

  const startDate = new Date();
  const endDate = new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-3xl bg-slate-900 border border-slate-700/60 rounded-2xl shadow-2xl overflow-hidden my-8">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-800/50 print:hidden">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <span className="text-sm font-bold text-white">
              {isAr ? 'شهادة ضمان صيانة معتمدة A4' : 'A4 Certified Repair Warranty Certificate'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl flex items-center gap-2 transition-colors cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              {isAr ? 'طباعة الشهادة' : 'Print Certificate'}
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div ref={printRef} className="p-8 bg-white text-slate-900 font-sans print:p-0">
          {/* Certificate Border Frame */}
          <div className="border-4 border-slate-900 p-6 rounded-2xl relative">
            {/* Header */}
            <div className="text-center border-b-2 border-slate-900 pb-4 mb-6">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-emerald-100 text-emerald-700 rounded-full mb-2">
                <ShieldCheck className="w-8 h-8" />
              </div>
              <h1 className="text-2xl font-black uppercase tracking-wider text-slate-950">
                {isAr ? 'شهادة ضمان صيانة أجهزة' : 'CERTIFICATE OF REPAIR WARRANTY'}
              </h1>
              <p className="text-xs text-slate-600 font-bold">{store.name} • {store.phone}</p>
              <p className="text-[11px] text-slate-500">{store.address}</p>
            </div>

            {/* Device and Customer Specs */}
            <div className="grid grid-cols-2 gap-4 mb-6 text-xs">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <span className="font-bold text-slate-400 block text-[10px] uppercase">
                  {isAr ? 'بيانات العميل' : 'Customer Info'}
                </span>
                <p className="font-bold text-sm text-slate-900">{ticket.customer_name}</p>
                <p className="text-slate-600 font-mono">{ticket.customer_phone}</p>
                <p className="text-[11px] text-slate-500 font-mono">Ticket Ref: #{ticket.ticket_number}</p>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <span className="font-bold text-slate-400 block text-[10px] uppercase">
                  {isAr ? 'مواصفات الجهاز المصان' : 'Device Under Warranty'}
                </span>
                <p className="font-bold text-sm text-slate-900">{ticket.device_brand} {ticket.device_model}</p>
                <p className="text-slate-600 font-mono">IMEI/SN: {ticket.imei_sn || 'N/A'}</p>
                <p className="text-[11px] text-emerald-700 font-bold">
                  {isAr ? 'فترة الضمان: 30 يوماً' : 'Warranty Duration: 30 Days'}
                </p>
              </div>
            </div>

            {/* Repair Details & Coverage */}
            <div className="mb-6 p-4 border border-slate-200 rounded-xl text-xs space-y-2">
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-500">{isAr ? 'الأعطال التي تمت معالجتها:' : 'Repaired Faults:'}</span>
                <span className="font-bold text-slate-900">{ticket.reported_defects}</span>
              </div>
              <div className="flex justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-500">{isAr ? 'تاريخ تسليم الصيانة:' : 'Issue Date:'}</span>
                <span className="font-mono font-bold text-slate-900">{startDate.toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{isAr ? 'تاريخ انتهاء الضمان:' : 'Expiry Date:'}</span>
                <span className="font-mono font-bold text-emerald-600">{endDate.toLocaleDateString()}</span>
              </div>
            </div>

            {/* Terms and Conditions */}
            <div className="text-[10px] text-slate-500 space-y-1 mb-8 leading-relaxed">
              <p className="font-bold text-slate-800 text-xs mb-1">{isAr ? 'شروط وأحكام الضمان:' : 'Terms & Conditions:'}</p>
              <p>{isAr ? '1. يسري هذا الضمان حصرياً على قطع الغيار المستبدلة ومصنعية الصيانة المحددة في هذا الإيصال.' : '1. Applies exclusively to replaced parts and labor documented.'}</p>
              <p>{isAr ? '2. يسقط الضمان فوراً في حالة تعرض الجهاز للسوائل، أو الكسر الداخلي والخارجي، أو الفتح خارج مركزنا.' : '2. Liquid ingress, physical impact, or external tampering voids warranty.'}</p>
              <p>{isAr ? '3. يلزم إبراز هذه الشهادة أو كود التذكرة الأصلي عند طلب أي فحص خلال فترة الضمان.' : '3. Presentation of this certificate is required for claims.'}</p>
            </div>

            {/* Signatures */}
            <div className="grid grid-cols-2 gap-8 pt-4 border-t-2 border-slate-300 text-xs">
              <div className="text-center">
                <p className="font-bold text-slate-800 mb-8">{isAr ? 'ختم وتوقيع معمل الصيانة' : 'Lab Engineer Signature'}</p>
                <div className="border-b border-slate-400 w-3/4 mx-auto"></div>
              </div>
              <div className="text-center">
                <p className="font-bold text-slate-800 mb-8">{isAr ? 'توقيع العميل المستلم' : 'Customer Acceptance'}</p>
                <div className="border-b border-slate-400 w-3/4 mx-auto"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
