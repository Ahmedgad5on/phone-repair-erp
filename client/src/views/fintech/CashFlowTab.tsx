import React, { useState, useEffect } from 'react';
import { CashflowProjectionData, fetchFintechApi } from './types';
import { useToast } from '../../context/ToastContext';
import {
  TrendingUp,
  ArrowDownLeft,
  ArrowUpRight,
  Calendar,
  DollarSign,
  AlertTriangle,
  RefreshCw,
  Info
} from 'lucide-react';

export const CashFlowTab: React.FC = () => {
  const { showToast } = useToast();
  const [data, setData] = useState<CashflowProjectionData | null>(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(false);
  const [hoveredDay, setHoveredDay] = useState<any | null>(null);

  const loadProjection = async () => {
    setLoading(true);
    try {
      const res = await fetchFintechApi<CashflowProjectionData>(`/fintech/cashflow/projection?days=${days}`);
      setData(res);
    } catch (err: any) {
      showToast(err.message || 'فشل حساب التوقعات النقدية', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProjection();
  }, [days]);

  // Compute SVG coordinates for the line chart
  const renderChart = () => {
    if (!data || !data.projection || data.projection.length === 0) return null;

    const width = 800;
    const height = 260;
    const padding = 45;

    const balances = data.projection.map(p => p.projectedBalance);
    const minVal = Math.min(...balances, data.currentBalance);
    const maxVal = Math.max(...balances, data.currentBalance);
    const range = (maxVal - minVal) || 1;

    const getX = (index: number) => {
      return padding + (index / (data.projection.length - 1)) * (width - 2 * padding);
    };

    const getY = (val: number) => {
      return height - padding - ((val - minVal) / range) * (height - 2 * padding);
    };

    const points = data.projection.map((p, idx) => `${getX(idx)},${getY(p.projectedBalance)}`).join(' ');

    // Area fill under line
    const areaPoints = `${getX(0)},${height - padding} ${points} ${getX(data.projection.length - 1)},${height - padding}`;

    return (
      <div className="relative w-full overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto min-w-[600px] select-none">
          <defs>
            <linearGradient id="balanceGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#10b981" />
              <stop offset="50%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#6366f1" />
            </linearGradient>
          </defs>

          {/* Grid horizontal guide lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
            const y = height - padding - ratio * (height - 2 * padding);
            const val = minVal + ratio * range;
            return (
              <g key={i}>
                <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="#334155" strokeDasharray="3 3" strokeWidth="0.8" />
                <text x={padding - 8} y={y + 3} fill="#94a3b8" fontSize="10" textAnchor="end" fontFamily="monospace">
                  {Math.round(val).toLocaleString()}
                </text>
              </g>
            );
          })}

          {/* Area Fill */}
          <polygon points={areaPoints} fill="url(#balanceGrad)" />

          {/* Continuous Projection Line */}
          <polyline
            fill="none"
            stroke="url(#lineGrad)"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={points}
          />

          {/* Interactive Day Points */}
          {data.projection.map((p, idx) => {
            const x = getX(idx);
            const y = getY(p.projectedBalance);
            const isHovered = hoveredDay?.day === p.day;

            return (
              <g key={idx} className="cursor-pointer" onMouseEnter={() => setHoveredDay(p)}>
                <circle
                  cx={x}
                  cy={y}
                  r={isHovered ? 6 : 3}
                  fill={isHovered ? '#ffffff' : '#f59e0b'}
                  stroke="#1e293b"
                  strokeWidth="2"
                  className="transition-all"
                />
                {idx % 5 === 0 && (
                  <text x={x} y={height - 15} fill="#64748b" fontSize="9" textAnchor="middle" fontFamily="monospace">
                    يوم {p.day}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {/* Hover Tooltip Box */}
        {hoveredDay && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-slate-950/90 border border-slate-700 rounded-xl p-3 text-xs shadow-2xl space-y-1 text-right pointer-events-none backdrop-blur-md">
            <p className="font-bold text-white flex items-center justify-between gap-4">
              <span>{hoveredDay.date} (اليوم {hoveredDay.day})</span>
              <span className="text-amber-400 font-mono">{hoveredDay.projectedBalance.toLocaleString()} ج.م</span>
            </p>
            <div className="flex gap-4 text-[11px]">
              <span className="text-emerald-400 font-mono">
                + تدفقات داخلة: {hoveredDay.inflows.toLocaleString()} ج.م (أقساط: {hoveredDay.installmentsInflow})
              </span>
              <span className="text-rose-400 font-mono">
                - التزامات خارجة: {hoveredDay.outflows.toLocaleString()} ج.م
              </span>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header & Options */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-amber-400" />
            محرك التوقعات النقدية والسيولة المستقبلية (30-Day Cash Flow Projection)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            تجميع واستقراء الأقساط المستحقة، مبيعات التجزئة المتوقعة، المصروفات التشغيلية الدورية، ومستحقات الموردين يوماً بيوم.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-1 flex items-center text-xs">
            <button
              onClick={() => setDays(15)}
              className={`px-3 py-1 rounded-md font-medium transition ${days === 15 ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              15 يوم
            </button>
            <button
              onClick={() => setDays(30)}
              className={`px-3 py-1 rounded-md font-medium transition ${days === 30 ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              30 يوم
            </button>
            <button
              onClick={() => setDays(60)}
              className={`px-3 py-1 rounded-md font-medium transition ${days === 60 ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              60 يوم
            </button>
          </div>

          <button
            onClick={loadProjection}
            disabled={loading}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      {data && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl">
            <p className="text-xs text-slate-400">السيولة المتاحة حالياً</p>
            <p className="text-2xl font-black text-white font-mono mt-1">
              {data.currentBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              <span className="text-xs text-amber-400 mr-1 font-normal">ج.م</span>
            </p>
            <span className="text-[10px] text-slate-500 mt-2 block">أرصدة المحافظ والخزينة العامة</span>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl">
            <p className="text-xs text-slate-400">الرصيد المتوقع بنهاية الفترة</p>
            <p className={`text-2xl font-black font-mono mt-1 ${data.projectedEndBalance >= data.currentBalance ? 'text-emerald-400' : 'text-amber-400'}`}>
              {data.projectedEndBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              <span className="text-xs text-amber-400 mr-1 font-normal">ج.م</span>
            </p>
            <span className="text-[10px] text-emerald-400/80 mt-2 block">
              {data.netCashFlow >= 0 ? `+${data.netCashFlow.toLocaleString()} ج.م نمو سيولة` : `${data.netCashFlow.toLocaleString()} ج.م سحب صافي`}
            </span>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl">
            <p className="text-xs text-slate-400">إجمالي التدفقات الواردة المتوقعة</p>
            <p className="text-2xl font-black text-emerald-400 font-mono mt-1">
              +{data.totalInflows.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              <span className="text-xs text-emerald-400 mr-1 font-normal">ج.م</span>
            </p>
            <span className="text-[10px] text-slate-500 mt-2 block">أقساط عملاء + مبيعات يومية</span>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl">
            <p className="text-xs text-slate-400">إجمالي الالتزامات والمصروفات</p>
            <p className="text-2xl font-black text-rose-400 font-mono mt-1">
              -{data.totalOutflows.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              <span className="text-xs text-rose-400 mr-1 font-normal">ج.م</span>
            </p>
            <span className="text-[10px] text-slate-500 mt-2 block">أوامر توريد + مصاريف تشغيلية</span>
          </div>
        </div>
      )}

      {/* Interactive Line Chart */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-white flex items-center gap-2">
            <Calendar className="w-4 h-4 text-amber-400" />
            منحنى رصيد السيولة المتوقع يوماً بيوم (Day-by-Day Balance Projection Curve)
          </h3>
          <span className="text-[11px] text-slate-400">
            مرر المؤشر فوق أي يوم لعرض تفاصيل التدفق اليومي
          </span>
        </div>

        {renderChart()}
      </div>

      {/* Day by Day Table */}
      {data && data.projection && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-300">جدول التدفقات التفصيلي ({data.projection.length} يوم)</span>
          </div>

          <div className="overflow-x-auto max-h-80">
            <table className="w-full text-xs text-right text-slate-300">
              <thead className="bg-slate-800/90 text-slate-400 font-semibold sticky top-0">
                <tr>
                  <th className="p-2.5">اليوم</th>
                  <th className="p-2.5">التاريخ</th>
                  <th className="p-2.5 text-left">الوارد (أقساط + مبيعات)</th>
                  <th className="p-2.5 text-left">الصادر (مصروفات + موردين)</th>
                  <th className="p-2.5 text-left">صافي التدفق اليومي</th>
                  <th className="p-2.5 text-left">الرصيد التراكمي المتوقع</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {data.projection.map((row) => (
                  <tr key={row.day} className="hover:bg-slate-800/40 transition font-mono">
                    <td className="p-2.5 text-amber-400 font-bold">يوم {row.day}</td>
                    <td className="p-2.5 text-slate-400">{row.date}</td>
                    <td className="p-2.5 text-left text-emerald-400 font-bold">
                      +{row.inflows.toLocaleString()} ج.م
                    </td>
                    <td className="p-2.5 text-left text-rose-400 font-bold">
                      -{row.outflows.toLocaleString()} ج.م
                    </td>
                    <td className={`p-2.5 text-left font-bold ${row.net >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {row.net >= 0 ? `+${row.net.toLocaleString()}` : row.net.toLocaleString()} ج.م
                    </td>
                    <td className="p-2.5 text-left font-bold text-white">
                      {row.projectedBalance.toLocaleString()} ج.م
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default CashFlowTab;
