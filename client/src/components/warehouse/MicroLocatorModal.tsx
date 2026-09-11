import React, { useState, useEffect } from 'react';
import { Layers, Lightbulb, CheckCircle2, Search, X, MapPin, Sparkles } from 'lucide-react';
import { api } from '../../services/api';
import { useToast } from '../../context/ToastContext';

interface MicroLocatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedItem?: any;
}

/**
 * 2.5D Bin/Drawer Micro-Locator & Pick-to-Light Component (Proposals 15 & 16)
 * Visual rack-shelf-bin micro-locator grid with hardware Pick-to-Light trigger
 */
export const MicroLocatorModal: React.FC<MicroLocatorModalProps> = ({ isOpen, onClose, selectedItem }) => {
  const { showToast } = useToast();
  const [locations, setLocations] = useState<any[]>([]);
  const [activeLocation, setActiveLocation] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [pulsingDrawer, setPulsingDrawer] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadLocations();
    }
  }, [isOpen]);

  const loadLocations = async () => {
    setLoading(true);
    try {
      const data = await api.getWarehouseLocations?.() || [];
      setLocations(data);
      if (data.length > 0) {
        setActiveLocation(data[0]);
      }
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleTriggerPickToLight = async (loc: any) => {
    try {
      setPulsingDrawer(loc.drawer_code);
      await api.triggerPickToLight?.(loc.id, selectedItem?.name || 'قطعة غيار مختارة', 1, 'GREEN');
      showToast(`تم تشغيل إشارة Pick-to-Light الضوئية للدرج ${loc.drawer_code}`, 'success');

      setTimeout(() => {
        setPulsingDrawer(null);
      }, 10000);
    } catch (err: any) {
      showToast(err.message || 'فشل إرسال إشارة الضوء', 'error');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700/80 rounded-3xl w-full max-w-4xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-slate-950/80 border-b border-slate-800 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-2xl border border-emerald-500/30">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">نظام التحديد الدقيق ومساعد الالتقاط الضوئي (2.5D Micro-Locator & Pick-to-Light)</h2>
              <p className="text-xs text-slate-400">Warehouse Rack-Shelf-Bin Visual Matrix</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white bg-slate-800 rounded-xl">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6 overflow-y-auto">
          {/* Drawer Grid Matrix */}
          <div className="md:col-span-2 bg-slate-950/60 border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-indigo-400" />
                مصفوفة الأدراج والأرفف الحية (Rack R01 / R02)
              </span>
              <span className="text-[11px] text-emerald-400 font-medium">الأدراج المضاءة تعني إشارة نشطة</span>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {locations.map((loc) => {
                const isPulsing = pulsingDrawer === loc.drawer_code;
                const isSelected = activeLocation?.id === loc.id;
                return (
                  <div
                    key={loc.id}
                    onClick={() => setActiveLocation(loc)}
                    className={`relative p-3.5 rounded-xl border flex flex-col items-center justify-center cursor-pointer transition-all ${
                      isPulsing
                        ? 'bg-emerald-500/30 border-emerald-400 text-emerald-200 animate-pulse shadow-lg shadow-emerald-500/30 scale-105'
                        : isSelected
                        ? 'bg-indigo-600/30 border-indigo-400 text-white shadow-md'
                        : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    {isPulsing && (
                      <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                    )}
                    <span className="text-xs font-mono font-bold">{loc.drawer_code}</span>
                    <span className="text-[10px] text-slate-400 mt-1">{loc.full_code}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Drawer Details & Pick Trigger */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between">
            <div>
              <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                بيانات الدرج والموقع
              </h3>

              {activeLocation ? (
                <div className="space-y-2.5 text-xs text-slate-300">
                  <div className="p-2.5 bg-slate-900 rounded-xl">
                    <div className="text-slate-500 text-[10px]">كود الموقع الكامل</div>
                    <div className="font-mono font-bold text-white text-sm mt-0.5">{activeLocation.full_code}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2 bg-slate-900 rounded-xl">
                      <div className="text-slate-500 text-[10px]">المنطقة / الرف</div>
                      <div className="font-semibold text-white">{activeLocation.zone} - {activeLocation.rack}</div>
                    </div>
                    <div className="p-2 bg-slate-900 rounded-xl">
                      <div className="text-slate-500 text-[10px]">الصندوق (Bin)</div>
                      <div className="font-semibold text-white">{activeLocation.bin}</div>
                    </div>
                  </div>
                  <div className="p-2.5 bg-slate-900 rounded-xl">
                    <div className="text-slate-500 text-[10px]">السعة القصوى</div>
                    <div className="font-semibold text-emerald-400">{activeLocation.capacity || 100} قطعة</div>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-slate-500 text-center py-8">اختر درجاً من المصفوفة لعرض التفاصيل</div>
              )}
            </div>

            {activeLocation && (
              <button
                onClick={() => handleTriggerPickToLight(activeLocation)}
                className="w-full mt-4 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/40 transition-all"
              >
                <Lightbulb className="w-4 h-4" />
                إضاءة الدرج الآن (Pick-to-Light)
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
