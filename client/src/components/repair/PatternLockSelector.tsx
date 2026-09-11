import React, { useState, useRef, useEffect } from 'react';
import { RotateCcw, Check, Lock } from 'lucide-react';

interface PatternLockProps {
  value: string; // e.g. "0-1-2-5-8"
  onChange: (pattern: string) => void;
  readOnly?: boolean;
}

/**
 * 9-Dot Interactive Touch Pattern Lock Canvas (UI/UX Proposal 36)
 */
export const PatternLockSelector: React.FC<PatternLockProps> = ({ value, onChange, readOnly = false }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [selectedDots, setSelectedDots] = useState<number[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);

  // Parse initial value if present
  useEffect(() => {
    if (value) {
      const dots = value.split('-').map(Number).filter(n => !isNaN(n) && n >= 0 && n <= 8);
      setSelectedDots(dots);
    } else {
      setSelectedDots([]);
    }
  }, [value]);

  // Coordinates of 3x3 grid dots in 240x240 canvas
  const getDotCoord = (index: number) => {
    const row = Math.floor(index / 3);
    const col = index % 3;
    return {
      x: 40 + col * 80,
      y: 40 + row * 80
    };
  };

  const drawPattern = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw connecting lines
    if (selectedDots.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = '#6366f1'; // Indigo-500
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const first = getDotCoord(selectedDots[0]);
      ctx.moveTo(first.x, first.y);

      for (let i = 1; i < selectedDots.length; i++) {
        const pt = getDotCoord(selectedDots[i]);
        ctx.lineTo(pt.x, pt.y);
      }
      ctx.stroke();
    }

    // Draw all 9 dots
    for (let i = 0; i < 9; i++) {
      const { x, y } = getDotCoord(i);
      const isSelected = selectedDots.includes(i);
      const order = selectedDots.indexOf(i);

      ctx.beginPath();
      ctx.arc(x, y, isSelected ? 16 : 10, 0, Math.PI * 2);
      ctx.fillStyle = isSelected ? '#4f46e5' : '#475569';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(x, y, isSelected ? 6 : 4, 0, Math.PI * 2);
      ctx.fillStyle = isSelected ? '#ffffff' : '#94a3b8';
      ctx.fill();

      // Show sequence number if selected
      if (isSelected && order >= 0) {
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText((order + 1).toString(), x, y);
      }
    }
  };

  useEffect(() => {
    drawPattern();
  }, [selectedDots]);

  const findDotAtPos = (clientX: number, clientY: number): number | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    for (let i = 0; i < 9; i++) {
      const pt = getDotCoord(i);
      const dist = Math.hypot(pt.x - x, pt.y - y);
      if (dist <= 26) {
        return i;
      }
    }
    return null;
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (readOnly) return;
    setIsDrawing(true);
    const dot = findDotAtPos(e.clientX, e.clientY);
    if (dot !== null) {
      setSelectedDots([dot]);
    } else {
      setSelectedDots([]);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDrawing || readOnly) return;
    const dot = findDotAtPos(e.clientX, e.clientY);
    if (dot !== null && !selectedDots.includes(dot)) {
      setSelectedDots(prev => [...prev, dot]);
    }
  };

  const handlePointerUp = () => {
    if (readOnly) return;
    setIsDrawing(false);
    if (selectedDots.length > 0) {
      onChange(selectedDots.join('-'));
    }
  };

  const handleClear = () => {
    setSelectedDots([]);
    onChange('');
  };

  return (
    <div className="flex flex-col items-center bg-slate-900/90 border border-slate-700/80 rounded-2xl p-4 shadow-xl select-none">
      <div className="flex items-center justify-between w-full mb-3 text-xs font-semibold text-slate-300">
        <span className="flex items-center gap-1.5">
          <Lock className="w-3.5 h-3.5 text-indigo-400" />
          نمط قفل الشاشة (Touch Pattern)
        </span>
        {!readOnly && (
          <button
            type="button"
            onClick={handleClear}
            className="flex items-center gap-1 text-rose-400 hover:text-rose-300 transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            إعادة تعيين
          </button>
        )}
      </div>

      <div className="relative rounded-xl overflow-hidden bg-slate-950 border border-slate-800 p-2 cursor-crosshair">
        <canvas
          ref={canvasRef}
          width={240}
          height={240}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className="touch-none"
        />
      </div>

      <div className="mt-3 text-[11px] text-slate-400 font-mono tracking-wider">
        {selectedDots.length > 0 ? (
          <span className="text-emerald-400 font-bold">النمط المسجل: {selectedDots.join(' ➔ ')}</span>
        ) : (
          <span>المس النقاط بالترتيب لتسجيل نمط فتح الجهاز</span>
        )}
      </div>
    </div>
  );
};
