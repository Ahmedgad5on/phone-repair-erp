import React, { useState, useEffect } from 'react';
import { Customer } from '../types/erp';
import { api } from '../services/api';
import { useLanguage } from '../i18n/LanguageContext';
import { useToast } from '../context/ToastContext';
import {
  Users,
  Search,
  MessageSquare,
  Send,
  History
} from 'lucide-react';

export const CrmView: React.FC = () => {
  const { t } = useLanguage();
  const { showToast } = useToast();
  const [customers, setCustomers] = useState<Customer[]>([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerHistory, setCustomerHistory] = useState<any>(null);
  const [waLogs, setWaLogs] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'customers' | 'whatsapp'>('customers');

  // Direct WhatsApp send modal
  const [showSendModal, setShowSendModal] = useState(false);
  const [waForm, setWaForm] = useState({ phone: '', content: '', type: 'INTAKE_RECEIPT' });

  const loadData = async () => {
    try {
      const custs = await api.getCustomers(searchQuery);
      setCustomers(custs);
      const logs = await api.getWhatsAppLogs();
      setWaLogs(logs);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadData();
  }, [searchQuery]);

  const handleSelectCustomer = async (c: Customer) => {
    setSelectedCustomer(c);
    try {
      const hist = await api.getCustomerHistory(c.id);
      setCustomerHistory(hist);
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateTag = async (id: string, tag: string) => {
    try {
      await api.updateCustomerTag(id, { tag });
      loadData();
      if (selectedCustomer?.id === id) {
        setSelectedCustomer({ ...selectedCustomer, tag: tag as any });
      }
      showToast('تم تحديث تصنيف العميل بنجاح', 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleSendWa = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.sendWhatsApp(waForm);
      setShowSendModal(false);
      setWaForm({ phone: '', content: '', type: 'INTAKE_RECEIPT' });
      loadData();
      showToast(t.common.sentToWa, 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };


  const openSendModalFor = (cust: Customer) => {
    setWaForm({
      phone: cust.phone,
      content: `مرحباً ${cust.name}! رسالة خاصة من مركز الفا موبايل.`,
      type: 'INTAKE_RECEIPT'
    });
    setShowSendModal(true);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 select-text">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-wide flex items-center gap-2.5">
            <Users className="w-6 h-6 text-indigo-400" />
            {t.crm.title}
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            {t.crm.subtitle}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-1 flex items-center">
            <button
              onClick={() => setActiveTab('customers')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                activeTab === 'customers' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              {t.crm.profilesTab}
            </button>
            <button
              onClick={() => setActiveTab('whatsapp')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                activeTab === 'whatsapp' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              {t.crm.whatsappTab} ({waLogs.length})
            </button>
          </div>
          <button
            onClick={() => setShowSendModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-md transition"
          >
            <Send className="w-4 h-4" />
            {t.crm.directWaBtn}
          </button>
        </div>
      </div>

      {activeTab === 'customers' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Customers List & Search */}
          <div className="lg:col-span-2 space-y-4">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-500 absolute start-3 top-3" />
              <input
                type="text"
                placeholder={t.crm.searchPlaceholder}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl ps-9 pe-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-indigo-500"
              />
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
              <table className="w-full text-start text-xs text-slate-300">
                <thead className="bg-slate-950 text-slate-400 uppercase font-semibold border-b border-slate-800 text-[11px]">
                  <tr>
                    <th className="px-4 py-3">{t.crm.customerCol}</th>
                    <th className="px-4 py-3">{t.crm.phoneCol}</th>
                    <th className="px-4 py-3">{t.crm.tagCol}</th>
                    <th className="px-4 py-3">{t.crm.ltvCol}</th>
                    <th className="px-4 py-3 text-end">{t.crm.actionsCol}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {customers.map(c => (
                    <tr
                      key={c.id}
                      onClick={() => handleSelectCustomer(c)}
                      className={`cursor-pointer transition hover:bg-slate-800/50 ${
                        selectedCustomer?.id === c.id ? 'bg-indigo-950/40 border-s-2 border-indigo-500' : ''
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div className="font-semibold text-white">{c.name}</div>
                        {c.notes && <div className="text-[11px] text-slate-400 truncate max-w-xs">{c.notes}</div>}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-300">{c.phone}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide border ${
                            c.tag === 'VIP'
                              ? 'bg-amber-950/80 text-amber-300 border-amber-800'
                              : c.tag === 'HIGH_RETURN' || c.tag === 'PROBLEMATIC'
                              ? 'bg-rose-950/80 text-rose-300 border-rose-800'
                              : 'bg-slate-800 text-slate-300 border-slate-700'
                          }`}
                        >
                          {c.tag === 'VIP' ? t.crm.vipTag : c.tag === 'HIGH_RETURN' ? t.crm.highReturnTag : c.tag === 'PROBLEMATIC' ? t.crm.problematicTag : t.crm.regularTag}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-emerald-400">
                        {c.total_spent.toLocaleString()} {t.common.currency}
                      </td>
                      <td className="px-4 py-3 text-end space-x-1">
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            openSendModalFor(c);
                          }}
                          className="p-1.5 bg-emerald-950 hover:bg-emerald-900 text-emerald-400 rounded border border-emerald-800/60"
                          title={t.common.whatsappCustomer}
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Selected Customer Details & History Ledger */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-5">
            {selectedCustomer ? (
              <>
                <div className="border-b border-slate-800 pb-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-base font-bold text-white">{selectedCustomer.name}</h3>
                      <div className="text-xs text-slate-400 font-mono mt-0.5">{selectedCustomer.phone}</div>
                    </div>
                    <select
                      value={selectedCustomer.tag}
                      onChange={e => handleUpdateTag(selectedCustomer.id, e.target.value)}
                      className="bg-slate-950 border border-slate-700 text-xs text-white rounded px-2 py-1"
                    >
                      <option value="VIP">{t.crm.vipTag}</option>
                      <option value="REGULAR">{t.crm.regularTag}</option>
                      <option value="HIGH_RETURN">{t.crm.highReturnTag}</option>
                      <option value="PROBLEMATIC">{t.crm.problematicTag}</option>
                    </select>
                  </div>
                  <div className="mt-3 p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
                    <span className="text-slate-400">{t.crm.totalSpend}</span>
                    <strong className="font-mono text-emerald-400 text-sm">
                      {selectedCustomer.total_spent.toLocaleString()} {t.common.currency}
                    </strong>
                  </div>
                </div>

                {/* Repair & Sales History */}
                <div>
                  <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <History className="w-3.5 h-3.5 text-indigo-400" />
                    {t.crm.historyTitle}
                  </h4>
                  <div className="space-y-2 max-h-80 overflow-y-auto pe-1">
                    {customerHistory?.tickets?.length === 0 && customerHistory?.sales?.length === 0 && (
                      <p className="text-xs text-slate-500 italic">{t.crm.noHistory}</p>
                    )}

                    {customerHistory?.tickets?.map((ticket: any) => (
                      <div key={ticket.id} className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800 text-xs">
                        <div className="flex justify-between font-medium">
                          <span className="text-sky-300">{t.crm.ticketLabel}{ticket.ticket_number} - {ticket.device_model}</span>
                          <span className="text-slate-400 font-mono">{ticket.status}</span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1 line-clamp-1">{ticket.reported_defects}</p>
                        <div className="mt-1 text-[10px] text-slate-500 font-mono">
                          {ticket.created_at.substring(0, 10)} | {ticket.estimated_cost} {t.common.currency}
                        </div>
                      </div>
                    ))}

                    {customerHistory?.sales?.map((sale: any) => (
                      <div key={sale.id} className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800 text-xs">
                        <div className="flex justify-between font-medium">
                          <span className="text-emerald-300">{t.crm.invoiceLabel}{sale.invoice_number}</span>
                          <span className="text-slate-400 font-mono">{sale.total} {t.common.currency} ({sale.payment_method})</span>
                        </div>
                        <div className="mt-1 text-[10px] text-slate-500 font-mono">
                          {sale.created_at.substring(0, 10)} | {t.common.status}: {sale.status}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-16 text-slate-500 text-xs">
                {t.crm.searchPlaceholder}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* WhatsApp Outbox View */
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-emerald-400" />
              {t.crm.waOutboxTitle}
            </h3>
            <span className="text-xs text-slate-400">{t.crm.waOutboxDesc}</span>
          </div>

          <table className="w-full text-start text-xs text-slate-300">
            <thead className="bg-slate-950 text-slate-400 uppercase font-semibold border-b border-slate-800 text-[11px]">
              <tr>
                <th className="px-4 py-3">{t.crm.recipientCol}</th>
                <th className="px-4 py-3">{t.crm.typeCol}</th>
                <th className="px-4 py-3">{t.crm.contentCol}</th>
                <th className="px-4 py-3">{t.crm.statusCol}</th>
                <th className="px-4 py-3">{t.crm.timeCol}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {waLogs.map(log => (
                <tr key={log.id} className="hover:bg-slate-800/40 transition">
                  <td className="px-4 py-3 font-mono text-emerald-400">{log.customer_phone}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300">
                      {log.message_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 max-w-md truncate text-slate-200">{log.content}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                        log.status === 'SENT'
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                          : 'bg-amber-950 text-amber-400 border border-amber-800'
                      }`}
                    >
                      {log.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-500 text-[11px]">
                    {log.sent_at ? log.sent_at.substring(0, 16) : log.scheduled_at?.substring(0, 16)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Direct WhatsApp Modal */}
      {showSendModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-md w-full space-y-4">
            <h3 className="font-semibold text-white text-base flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-emerald-400" />
              {t.crm.directWaBtn}
            </h3>
            <form onSubmit={handleSendWa} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 mb-1">{t.crm.phoneCol} (+20...)</label>
                <input
                  type="text"
                  required
                  placeholder="+201012345678"
                  value={waForm.phone}
                  onChange={e => setWaForm({ ...waForm, phone: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1">{t.crm.typeCol}</label>
                <select
                  value={waForm.type}
                  onChange={e => setWaForm({ ...waForm, type: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
                >
                  <option value="INTAKE_RECEIPT">إيصال استلام صيانة (Intake Receipt)</option>
                  <option value="READY_FOR_PICKUP">إشعار جاهزية الاستلام (Ready for Pickup)</option>
                  <option value="SALE_INVOICE">فاتورة مبيعات رقمية (Digital Invoice)</option>
                  <option value="GOOGLE_REVIEW_FOLLOWUP">طلب تقييم خرائط جوجل (Google Review)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 mb-1">{t.crm.contentCol}</label>
                <textarea
                  rows={4}
                  required
                  value={waForm.content}
                  onChange={e => setWaForm({ ...waForm, content: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSendModal(false)}
                  className="px-3 py-2 text-slate-400 hover:text-white"
                >
                  {t.common.cancel}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium"
                >
                  {t.common.whatsappCustomer}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
