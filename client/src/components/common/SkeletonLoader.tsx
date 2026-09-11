import React from 'react';

export const TableSkeleton: React.FC<{ rows?: number; cols?: number }> = ({ rows = 5, cols = 5 }) => {
  return (
    <div className="w-full bg-slate-900 border border-slate-800 rounded-xl overflow-hidden animate-pulse">
      <div className="h-10 bg-slate-950/80 border-b border-slate-800 flex items-center px-4 gap-4">
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className="h-3.5 bg-slate-800 rounded flex-1" />
        ))}
      </div>
      <div className="divide-y divide-slate-800/60 p-2 space-y-2">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="h-9 bg-slate-950/40 rounded-lg flex items-center px-3 gap-4">
            {Array.from({ length: cols }).map((_, c) => (
              <div key={c} className="h-3 bg-slate-800/60 rounded flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

export const CardSkeleton: React.FC<{ count?: number }> = ({ count = 4 }) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
          <div className="h-4 bg-slate-800 rounded w-1/2" />
          <div className="h-8 bg-slate-800/80 rounded w-3/4" />
          <div className="h-3 bg-slate-800/50 rounded w-full" />
        </div>
      ))}
    </div>
  );
};

export const SkeletonLoader: React.FC = () => {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between animate-pulse">
        <div className="h-8 w-48 bg-slate-200 dark:bg-slate-800 rounded-lg" />
        <div className="h-8 w-32 bg-slate-200 dark:bg-slate-800 rounded-lg" />
      </div>
      <CardSkeleton count={4} />
      <TableSkeleton rows={6} cols={5} />
    </div>
  );
};

