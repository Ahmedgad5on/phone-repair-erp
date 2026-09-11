import React, { useState } from 'react';
import { RotateCcw, AlertTriangle, ShieldCheck, Tag } from 'lucide-react';

export interface DamagePoint {
  id: string;
  side: 'FRONT' | 'BACK';
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  type: 'SCRATCH' | 'CRACK' | 'DENT' | 'WATER';
}

interface DeviceDamageCanvasProps {
  value?: DamagePoint[];
  onChange?: (points: DamagePoint[]) => void;
  readOnly?: boolean;
}

/**
 * Interactive 2D Device Damage Canvas (UI/UX Proposal 37)
 * Front & Back smartphone blueprints with interactive damage point plotting
 */
export const DeviceDamageCanvas: React.FC<DeviceDamageCanvasProps> = ({ value = [], onChange, readOnly = false }) => {
  const [points, setPoints] = useState<DamagePoint[]>(value);
  const [selectedType, setSelectedType] = useState<'SCRATCH' | 'CRACK' | 'DENT' | 'WATER'>('CRACK');

  const damageTypes = [
    { type: 'CRACK', label: 'كسر / شرخ (Crack)', color: 'bg-rose-500 text-white', dotColor: '#f43f5e', code: 'C' },
    { type: 'SCRATCH', label: 'خدش سطحي (Scratch)', color: 'bg-amber-500 text-white', dotColor: '#f59e0b', code: 'S' },
    { type: 'DENT', label: 'صدمة / انبعاج (Dent)', color: 'bg-orange-500 text-white', dotColor: '#f97316', code: 'D' },
    { type: 'WATER', label: 'أثر رطوبة / ماء (Water)', color: 'bg-blue-500 text-white', dotColor: '#3b82f6', code: 'W' }
  ];

  const handleCanvasClick = (side: 'FRONT' | 'BACK', e: React.MouseEvent<HTMLDivElement>) => {
    if (readOnly) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 100);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 100);

    const newPoint: DamagePoint = {
      id: `dp-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
      side,
      x,
      y,
      type: selectedType
    };

    const updated = [...points, newPoint];
    setPoints(updated);
    onChange?.(updated);
  };

  const handleRemovePoint = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (readOnly) return;
    const updated = points.filter(p => p.id !== id);
    setPoints(updated);
    onChange?.(updated);
  };

  const handleClear = () => {
    if (readOnly) return;
    setPoints([]);
    onChange?.([]);
  };

  return (
    <div className="bg-slate-900/90 border border-slate-700/80 rounded-2xl p-4 shadow-xl select-none">
      <div className="flex items-center justify-between mb-3 text-xs font-semibold text-slate-300">
        <span className="flex items-center gap-1.5">
          <AlertTriangle className="w-4 h-4 text-amber-400" />
          مخطط توثيق أضرار وحالة الجهاز (2D Damage Canvas)
        </span>
        {!readOnly && (
          <button
            type="button"
            onClick={handleClear}
            className="flex items-center gap-1 text-rose-400 hover:text-rose-300 text-xs"
          >
            <RotateCcw className="w-3 h-3" />
            مسح المخطط
          </button>
        )}
      </div>

      {/* Damage Type Selector */}
      {!readOnly && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {damageTypes.map(t => (
            <button
              key={t.type}
              type="button"
              onClick={() => setSelectedType(t.type as any)}
              className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-all ${
                selectedType === t.type
                  ? `${t.color} shadow-md scale-105`
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Smartphone Dual Silhouettes: Front & Back */}
      <div className="grid grid-cols-2 gap-4">
        {/* Front Screen Silhouette */}
        <div className="flex flex-col items-center">
          <span className="text-[11px] text-slate-400 mb-1 font-semibold">الوجه الأمامي (الشاشة)</span>
          <div
            onClick={(e) => handleCanvasClick('FRONT', e)}
            className="relative w-32 h-64 bg-slate-950 border-4 border-slate-700 rounded-[28px] overflow-hidden shadow-inner cursor-crosshair hover:border-indigo-500 transition-colors"
          >
            {/* Dynamic Island / Earpiece */}
            <div className="absolute top-2 left-1/2 -translate-x-1/2 w-10 h-3 bg-slate-800 rounded-full"></div>
            {/* Home indicator bar */}
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-12 h-1 bg-slate-800 rounded-full"></div>

            {/* Damage points rendered */}
            {points.filter(p => p.side === 'FRONT').map(p => {
              const def = damageTypes.find(d => d.type === p.type);
              return (
                <div
                  key={p.id}
                  onClick={(e) => handleRemovePoint(p.id, e)}
                  title="انقر للحذف"
                  style={{ left: `${p.x}%`, top: `${p.y}%` }}
                  className="absolute -translate-x-1/2 -translate-y-1/2 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shadow-lg cursor-pointer hover:scale-125 transition-transform"
                >
                  <span style={{ backgroundColor: def?.dotColor || '#f43f5e' }} className="w-4 h-4 rounded-full text-white flex items-center justify-center">
                    {def?.code || 'X'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Back Housing Silhouette */}
        <div className="flex flex-col items-center">
          <span className="text-[11px] text-slate-400 mb-1 font-semibold">الظهر والإطار (الكاميرات)</span>
          <div
            onClick={(e) => handleCanvasClick('BACK', e)}
            className="relative w-32 h-64 bg-slate-950 border-4 border-slate-700 rounded-[28px] overflow-hidden shadow-inner cursor-crosshair hover:border-indigo-500 transition-colors"
          >
            {/* Camera bump top-left */}
            <div className="absolute top-2 left-2 w-12 h-12 bg-slate-800 rounded-xl p-1 grid grid-cols-2 gap-1">
              <div className="w-4 h-4 bg-slate-900 rounded-full border border-slate-700"></div>
              <div className="w-4 h-4 bg-slate-900 rounded-full border border-slate-700"></div>
              <div className="w-4 h-4 bg-slate-900 rounded-full border border-slate-700"></div>
            </div>

            {/* Apple / Brand logo mock */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-5 border border-slate-800 rounded-full opacity-30"></div>

            {/* Damage points rendered */}
            {points.filter(p => p.side === 'BACK').map(p => {
              const def = damageTypes.find(d => d.type === p.type);
              return (
                <div
                  key={p.id}
                  onClick={(e) => handleRemovePoint(p.id, e)}
                  title="انقر للحذف"
                  style={{ left: `${p.x}%`, top: `${p.y}%` }}
                  className="absolute -translate-x-1/2 -translate-y-1/2 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shadow-lg cursor-pointer hover:scale-125 transition-transform"
                >
                  <span style={{ backgroundColor: def?.dotColor || '#f43f5e' }} className="w-4 h-4 rounded-full text-white flex items-center justify-center">
                    {def?.code || 'X'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-3 text-[11px] text-slate-400 text-center">
        {points.length > 0 ? (
          <span className="text-amber-300 font-medium">تم تسجيل {points.length} علامة ضرر على هيكل الجهاز</span>
        ) : (
          <span>انقر فوق أي مكان بالهاتف لتحديد الخدوش أو الكسور بدقة</span>
        )}
      </div>
    </div>
  );
};
