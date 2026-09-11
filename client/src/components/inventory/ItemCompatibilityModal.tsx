import React, { useState, useEffect } from 'react';
import { Layers, Plus, Trash2, X, Check, Smartphone, AlertCircle } from 'lucide-react';
import { inventoryApi, ItemCompatibility } from './inventoryApi';

interface ItemCompatibilityModalProps {
  item: {
    id: string;
    name: string;
    sku: string;
    quality_grade?: string;
  } | null;
  onClose: () => void;
  isAr?: boolean;
}

export const ItemCompatibilityModal: React.FC<ItemCompatibilityModalProps> = ({
  item,
  onClose,
  isAr = true
}) => {
  if (!item) return null;

  const [compatList, setCompatList] = useState<ItemCompatibility[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // New compatibility form
  const [brand, setBrand] = useState<string>('Apple');
  const [model, setModel] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  const loadCompatibilities = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await inventoryApi.getItemCompatibility(item.id);
      setCompatList(data || []);
    } catch (err: any) {
      setError(err.message || 'فشل تحميل سجلات التوافق');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCompatibilities();
  }, [item.id]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!brand.trim() || !model.trim()) return;

    setSubmitting(true);
    setError(null);
    try {
      await inventoryApi.addItemCompatibility(item.id, {
        device_brand: brand.trim(),
        device_model: model.trim(),
        notes: notes.trim() || undefined
      });
      setModel('');
      setNotes('');
      await loadCompatibilities();
    } catch (err: any) {
      setError(err.message || 'فشل إضافة التوافق');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (compatId: string) => {
    try {
      await inventoryApi.deleteItemCompatibility(item.id, compatId);
      setCompatList(prev => prev.filter(c => c.id !== compatId));
    } catch (err: any) {
      setError(err.message || 'فشل حذف سجل التوافق');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-800/40 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-white">
                {isAr ? 'خريطة توافق الموديلات والأجهزة' : 'Cross-Model Compatibility Map'}
              </h3>
              <p className="text-xs text-slate-400">
                {item.sku} • {item.name}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Add New Compatibility Form */}
          <form onSubmit={handleAdd} className="bg-slate-800/60 p-4 rounded-xl border border-slate-700 space-y-3">
            <h4 className="text-xs font-semibold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5 text-indigo-400" />
              {isAr ? 'إضافة موديل متوافق جديد' : 'Add New Compatible Model'}
            </h4>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">{isAr ? 'الماركة:' : 'Brand:'}</label>
                <select
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-hidden focus:border-indigo-500"
                >
                  <option value="Apple">Apple</option>
                  <option value="Samsung">Samsung</option>
                  <option value="Xiaomi">Xiaomi</option>
                  <option value="Oppo">Oppo</option>
                  <option value="Vivo">Vivo</option>
                  <option value="Realme">Realme</option>
                  <option value="Huawei">Huawei</option>
                  <option value="Infinix">Infinix</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">{isAr ? 'الموديل:' : 'Model:'}</label>
                <input
                  type="text"
                  placeholder={isAr ? 'مثال: iPhone 13 Pro' : 'e.g. iPhone 13 Pro'}
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-hidden focus:border-indigo-500"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">{isAr ? 'ملاحظات التوافق (اختياري):' : 'Compatibility Notes (optional):'}</label>
              <input
                type="text"
                placeholder={isAr ? 'مثال: يتطلب نقل فلكس السماعة' : 'e.g. Pinout matches perfectly'}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-hidden focus:border-indigo-500"
              />
            </div>

            <button
              type="submit"
              disabled={submitting || !model.trim()}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white py-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 shadow-md shadow-indigo-600/20"
            >
              <Plus className="w-4 h-4" />
              {submitting ? (isAr ? 'جاري الإضافة...' : 'Adding...') : (isAr ? 'حفظ التوافق' : 'Save Compatibility')}
            </button>
          </form>

          {/* Current Compatibility List */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                {isAr ? `الموديلات المتوافقة المعرفة (${compatList.length})` : `Compatible Devices (${compatList.length})`}
              </h4>
            </div>

            {loading ? (
              <div className="py-8 text-center text-slate-500 text-sm">
                {isAr ? 'جاري تحميل التوافق...' : 'Loading compatibilities...'}
              </div>
            ) : compatList.length === 0 ? (
              <div className="py-8 text-center bg-slate-950/40 rounded-xl border border-slate-800/80 p-4">
                <Smartphone className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                <p className="text-sm text-slate-400">
                  {isAr ? 'لا توجد موديلات متوافقة مسجلة لهذا الصنف بعد' : 'No compatible models recorded for this item yet'}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {isAr ? 'استخدم النموذج أعلاه لإضافة موديل متوافق' : 'Use the form above to add a compatible model'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {compatList.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-slate-800/40 border border-slate-700/60 hover:border-slate-600 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold text-xs">
                        {c.device_brand.substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-white flex items-center gap-2">
                          <span>{c.device_brand} {c.device_model}</span>
                        </div>
                        {c.notes && (
                          <div className="text-xs text-slate-400 mt-0.5">
                            {c.notes}
                          </div>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDelete(c.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                      title={isAr ? 'حذف التوافق' : 'Delete'}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-800/40 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-5 py-2 rounded-xl text-xs font-semibold transition-colors"
          >
            {isAr ? 'إغلاق' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};
