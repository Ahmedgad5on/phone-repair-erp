import React, { useState, useEffect } from 'react';
import { Layers, X, Search, ZoomIn, ZoomOut, AlertCircle, Sparkles } from 'lucide-react';
import { api } from '../../services/api';

interface BoardviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  deviceModel: string;
}

/**
 * Interactive PCB Boardview & Schematic Viewer (Dev Proposal 33)
 * Motherboard test points, power rails, and component layout inspection
 */
export const BoardviewModal: React.FC<BoardviewModalProps> = ({ isOpen, onClose, deviceModel }) => {
  const [boardData, setBoardData] = useState<any | null>(null);
  const [searchNet, setSearchNet] = useState('');
  const [selectedPoint, setSelectedPoint] = useState<any | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadBoardview();
    }
  }, [isOpen, deviceModel]);

  const loadBoardview = async () => {
    try {
      const data = await api.getBoardview?.(deviceModel || 'iPhone 15 Pro') || null;
      setBoardData(data);
    } catch (e) {
      console.error(e);
    }
  };

  if (!isOpen) return null;

  const filteredPoints = boardData?.testPoints?.filter((tp: any) =>
    tp.net.toLowerCase().includes(searchNet.toLowerCase()) || tp.id.toLowerCase().includes(searchNet.toLowerCase())
  ) || [];

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700/80 rounded-3xl w-full max-w-5xl overflow-hidden shadow-2xl flex flex-col h-[85vh]">
        {/* Header */}
        <div className="bg-slate-950 p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">مستعرض المخططات الإلكترونية ونقاط الفحص (Boardview & Schematic Viewer)</h2>
              <p className="text-[11px] text-slate-400">{deviceModel} - High Density PCB Layer 1/10 Telemetry</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white bg-slate-800 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4 p-4 overflow-hidden">
          {/* PCB Interactive Canvas Blueprint */}
          <div className="md:col-span-2 bg-slate-950 border border-slate-800 rounded-2xl relative overflow-hidden flex items-center justify-center">
            {/* PCB Board Outline */}
            <div className="relative w-[340px] h-[340px] bg-emerald-950/60 border-2 border-emerald-600/60 rounded-3xl p-4 shadow-2xl flex flex-col justify-between">
              {/* Ground ring traces */}
              <div className="absolute inset-2 border border-emerald-500/30 rounded-2xl pointer-events-none"></div>

              {/* Major IC Packages */}
              {boardData?.hotspots?.map((ic: any, idx: number) => (
                <div
                  key={idx}
                  style={{ left: `${ic.x}px`, top: `${ic.y}px` }}
                  className="absolute -translate-x-1/2 -translate-y-1/2 bg-slate-900/90 border border-slate-600 rounded-xl p-2 text-center text-[10px] text-white shadow-xl cursor-pointer hover:border-emerald-400 hover:scale-105 transition-all"
                  onClick={() => setSelectedPoint({ id: ic.component, net: ic.name, nominalVoltage: 'IC Package', diodeMode: 'N/A' })}
                >
                  <div className="font-bold text-emerald-400">{ic.component}</div>
                  <div className="text-[9px] text-slate-400 truncate max-w-[80px]">{ic.name}</div>
                </div>
              ))}

              {/* Test Points Plotted */}
              {boardData?.testPoints?.map((tp: any) => {
                const isSelected = selectedPoint?.id === tp.id;
                return (
                  <div
                    key={tp.id}
                    onClick={() => setSelectedPoint(tp)}
                    style={{ left: `${tp.x}px`, top: `${tp.y}px` }}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full flex items-center justify-center cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-amber-400 text-black scale-125 ring-4 ring-amber-400/30 font-bold text-[8px]'
                        : 'bg-amber-500/30 border border-amber-400 text-amber-300 text-[8px] hover:scale-110'
                    }`}
                  >
                    {tp.id.replace('TP', '')}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Test Points Netlist & Inspector */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 flex flex-col overflow-hidden">
            <div className="relative mb-3">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-3" />
              <input
                type="text"
                value={searchNet}
                onChange={(e) => setSearchNet(e.target.value)}
                placeholder="بحث عن خط طاقة أو نقطة اختبار (PP_...)"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl pr-8 pl-3 py-2 text-xs text-white outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {filteredPoints.map((tp: any) => (
                <div
                  key={tp.id}
                  onClick={() => setSelectedPoint(tp)}
                  className={`p-2.5 rounded-xl border text-xs cursor-pointer transition-colors ${
                    selectedPoint?.id === tp.id
                      ? 'bg-indigo-600/30 border-indigo-400 text-white'
                      : 'bg-slate-900 border-slate-800/80 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="flex justify-between font-mono">
                    <span className="font-bold text-amber-400">{tp.id}</span>
                    <span>{tp.nominalVoltage}V</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5 truncate">{tp.net}</div>
                  <div className="text-[10px] text-emerald-400 font-mono mt-1">Diode Mode: {tp.diodeMode}V</div>
                </div>
              ))}
            </div>

            {selectedPoint && (
              <div className="mt-3 p-3 bg-indigo-950/40 border border-indigo-800/50 rounded-xl text-xs">
                <div className="font-bold text-white mb-1 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  {selectedPoint.id} - {selectedPoint.net}
                </div>
                <div className="text-[11px] text-slate-300">
                  الجهد الاسمي: <strong className="text-white font-mono">{selectedPoint.nominalVoltage}V</strong>
                </div>
                <div className="text-[11px] text-slate-300">
                  الممانعة المتوقعة: <strong className="text-emerald-400 font-mono">{selectedPoint.diodeMode}V</strong>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
