import React, { useState, useEffect, useRef } from 'react';
import { api } from '../../services/api';
import { useLanguage } from '../../i18n/LanguageContext';
import { Search, Wrench, ShoppingBag, User, Smartphone, X, ArrowRight } from 'lucide-react';

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate?: (view: string, id?: string) => void;
}

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({ isOpen, onClose, onNavigate }) => {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
      setResults(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!query.trim() || query.length < 2) {
      setResults(null);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.globalSearch(query);
        setResults(res);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [query]);

  // Global hotkey Ctrl+K / Cmd+K listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const totalHits = results
    ? (results.customers?.length || 0) +
      (results.items?.length || 0) +
      (results.tickets?.length || 0) +
      (results.imeis?.length || 0)
    : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden text-slate-100 relative">
        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3.5 border-b border-slate-800 gap-3">
          <Search className="w-5 h-5 text-indigo-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={isAr ? 'بحث شامل في كل شيء (عملاء، هواتف، قطع غيار، تذاكر صيانة، سيريال IMEI)...' : 'Global search (customers, items, repairs, IMEIs)...'}
            className="w-full bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none"
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-slate-400 hover:text-white p-1">
              <X className="w-4 h-4" />
            </button>
          )}
          <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded border border-slate-700 font-mono">
            ESC
          </span>
        </div>

        {/* Results Area */}
        <div className="max-h-[60vh] overflow-y-auto p-4 space-y-4 text-xs">
          {loading && (
            <div className="py-8 text-center text-slate-400 animate-pulse">
              {isAr ? 'جاري البحث في قاعدة البيانات...' : 'Searching...'}
            </div>
          )}

          {!loading && results && totalHits === 0 && (
            <div className="py-8 text-center text-slate-500">
              {isAr ? 'لا توجد نتائج مطابقة لبحثك' : 'No matching results found'}
            </div>
          )}

          {!loading && results && (
            <>
              {/* Customers */}
              {results.customers?.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[11px] uppercase tracking-wider font-semibold text-indigo-400 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5" />
                    {isAr ? 'العملاء' : 'Customers'}
                  </span>
                  <div className="grid gap-1.5">
                    {results.customers.map((c: any) => (
                      <div
                        key={c.id}
                        onClick={() => {
                          if (onNavigate) onNavigate('crm', c.id);
                          onClose();
                        }}
                        className="p-2.5 bg-slate-950/60 hover:bg-indigo-950/40 rounded-xl border border-slate-800 hover:border-indigo-700/60 flex items-center justify-between cursor-pointer transition"
                      >
                        <div>
                          <strong className="text-white block font-medium">{c.name}</strong>
                          <span className="font-mono text-slate-400 text-[11px]">{c.phone}</span>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[10px] bg-indigo-950 text-indigo-300 border border-indigo-800">
                          {c.tag || 'REGULAR'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Repair Tickets */}
              {results.tickets?.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[11px] uppercase tracking-wider font-semibold text-emerald-400 flex items-center gap-1.5">
                    <Wrench className="w-3.5 h-3.5" />
                    {isAr ? 'تذاكر الصيانة' : 'Repair Tickets'}
                  </span>
                  <div className="grid gap-1.5">
                    {results.tickets.map((t: any) => (
                      <div
                        key={t.id}
                        onClick={() => {
                          if (onNavigate) onNavigate('repair', t.id);
                          onClose();
                        }}
                        className="p-2.5 bg-slate-950/60 hover:bg-emerald-950/40 rounded-xl border border-slate-800 hover:border-emerald-700/60 flex items-center justify-between cursor-pointer transition"
                      >
                        <div>
                          <span className="font-mono text-emerald-400 font-bold">#{t.ticket_number}</span> - <span className="text-white">{t.device_brand} {t.device_model}</span>
                          <div className="text-[11px] text-slate-400">{t.customer_name}</div>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300">
                          {t.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Products & Stock */}
              {results.items?.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[11px] uppercase tracking-wider font-semibold text-purple-400 flex items-center gap-1.5">
                    <ShoppingBag className="w-3.5 h-3.5" />
                    {isAr ? 'الأصناف والمخزون' : 'Products & Parts'}
                  </span>
                  <div className="grid gap-1.5">
                    {results.items.map((i: any) => (
                      <div
                        key={i.id}
                        onClick={() => {
                          if (onNavigate) onNavigate('pos', i.id);
                          onClose();
                        }}
                        className="p-2.5 bg-slate-950/60 hover:bg-purple-950/40 rounded-xl border border-slate-800 hover:border-purple-700/60 flex items-center justify-between cursor-pointer transition"
                      >
                        <div>
                          <strong className="text-white block font-medium">{i.name}</strong>
                          <span className="font-mono text-[10px] text-slate-500">SKU: {i.sku} | Barcode: {i.barcode || '-'}</span>
                        </div>
                        <div className="text-end">
                          <span className="font-mono text-emerald-400 font-bold">{i.retail_price} ج.م</span>
                          <div className="text-[10px] text-slate-400">المتاح: {i.stock_quantity}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* IMEIs */}
              {results.imeis?.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[11px] uppercase tracking-wider font-semibold text-amber-400 flex items-center gap-1.5">
                    <Smartphone className="w-3.5 h-3.5" />
                    {isAr ? 'سيريال الأجهزة (IMEI)' : 'Phone IMEIs'}
                  </span>
                  <div className="grid gap-1.5">
                    {results.imeis.map((im: any) => (
                      <div
                        key={im.id}
                        className="p-2.5 bg-slate-950/60 rounded-xl border border-slate-800 flex items-center justify-between"
                      >
                        <div>
                          <strong className="text-white font-mono">{im.imei}</strong>
                          <div className="text-[11px] text-slate-400">{im.item_name}</div>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-800">
                          {im.status} ({im.battery_health}%)
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {!results && (
            <div className="py-10 text-center text-slate-500 space-y-2">
              <Search className="w-8 h-8 text-slate-600 mx-auto" />
              <p className="text-xs">{isAr ? 'اكتب كلمة البحث للوصول الفوري لأي عميل أو تذكرة أو منتج...' : 'Type to search anything instantly...'}</p>
              <div className="flex justify-center gap-2 pt-2 text-[11px] text-slate-400">
                <span className="bg-slate-800 px-2 py-0.5 rounded border border-slate-700">Ctrl + K</span>
                <span>{isAr ? 'لفتح البحث في أي وقت' : 'to open anytime'}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
