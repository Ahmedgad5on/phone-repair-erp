import React, { useState } from 'react';
import { RefreshCw, X, Battery, Smartphone, CheckCircle2, ShieldCheck } from 'lucide-react';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';

interface SerializerSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  ticketId: string;
  deviceModel?: string;
  deviceSerial?: string;
}

/**
 * TrueTone & BMS Serializer Sync Tool (Dev Proposal 3)
 * JCID / QianLi / iCopy programmer data transfer logger
 */
export const SerializerSyncModal: React.FC<SerializerSyncModalProps> = ({
  isOpen,
  onClose,
  ticketId,
  deviceModel
}) => {
  const { showToast } = useToast();
  const [form, setForm] = useState({
    device_serial: 'F2LLM092PK12',
    screen_mt_sn: 'DTH4912093847MT',
    cover_code: 'C02849201948CC',
    bms_sn: 'BATT-F2-984712',
    cycle_count: 0,
    battery_health_pct: 100,
    programmer_model: 'JCID-V1SE Pro'
  });

  const handleSync = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.logSerializerSync?.({
        ticket_id: ticketId,
        ...form
      });
      showToast('تمت مزامنة وتسجيل بيانات TrueTone و BMS بنجاح', 'success');
      onClose();
    } catch (err: any) {
      showToast(err.message || 'فشل مزامنة المبرمجة', 'error');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700/80 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="bg-slate-950 p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-xl border border-indigo-500/30">
              <RefreshCw className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">مزامنة كود الشاشة والبطارية (TrueTone & BMS Serializer)</h2>
              <p className="text-[11px] text-slate-400">JCID / QianLi / iCopy Hardware Bridge</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white bg-slate-800 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSync} className="p-5 space-y-3.5 text-xs text-slate-300">
          <div>
            <label className="block text-slate-400 mb-1 font-semibold">طراز المبرمجة المستخدمة</label>
            <select
              value={form.programmer_model}
              onChange={(e) => setForm({ ...form, programmer_model: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-mono outline-none"
            >
              <option value="JCID-V1SE Pro">JCID V1SE Pro Programmer</option>
              <option value="QianLi iCopy Plus 2.2">QianLi iCopy Plus 2.2</option>
              <option value="Ayi A108 Box">Ayi A108 Programmer Box</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 mb-1 font-semibold">سيريال الجهاز الأصلي</label>
              <input
                type="text"
                value={form.device_serial}
                onChange={(e) => setForm({ ...form, device_serial: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-mono outline-none"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1 font-semibold">سيريال الشاشة MT SN</label>
              <input
                type="text"
                value={form.screen_mt_sn}
                onChange={(e) => setForm({ ...form, screen_mt_sn: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-mono outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 mb-1 font-semibold">كود الغطاء Cover Code</label>
              <input
                type="text"
                value={form.cover_code}
                onChange={(e) => setForm({ ...form, cover_code: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-mono outline-none"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1 font-semibold">سيريال لوحة البطارية BMS</label>
              <input
                type="text"
                value={form.bms_sn}
                onChange={(e) => setForm({ ...form, bms_sn: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-mono outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 mb-1 font-semibold">نسبة صحة البطارية المستهدفة</label>
              <input
                type="number"
                value={form.battery_health_pct}
                onChange={(e) => setForm({ ...form, battery_health_pct: Number(e.target.value) })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-mono outline-none"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1 font-semibold">عدد دورات الشحن الجديدة</label>
              <input
                type="number"
                value={form.cycle_count}
                onChange={(e) => setForm({ ...form, cycle_count: Number(e.target.value) })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-mono outline-none"
              />
            </div>
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl hover:bg-slate-700"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-900/40"
            >
              حفظ وتأكيد المزامنة
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
