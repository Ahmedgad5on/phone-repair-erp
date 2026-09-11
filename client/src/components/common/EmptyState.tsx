import React from 'react';
import { PackageOpen } from 'lucide-react';

interface EmptyStateProps {
  icon?: React.ReactNode | React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  actionButton?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  actionButton
}) => {
  const renderIcon = () => {
    if (!icon) return <PackageOpen className="w-7 h-7" />;
    if (React.isValidElement(icon)) return icon;
    const IconComp = icon as React.ComponentType<{ className?: string }>;
    return <IconComp className="w-7 h-7" />;
  };

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-10 text-center text-slate-400 space-y-3 max-w-lg mx-auto">
      <div className="w-14 h-14 rounded-2xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center mx-auto text-indigo-400 shadow-inner">
        {renderIcon()}
      </div>
      <h3 className="font-bold text-white text-base mt-2">{title}</h3>
      <p className="text-xs text-slate-400 leading-relaxed max-w-sm mx-auto">{description}</p>
      {actionButton ? (
        <div className="pt-2">{actionButton}</div>
      ) : actionLabel && onAction ? (
        <div className="pt-2">
          <button
            onClick={onAction}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl text-xs transition"
          >
            {actionLabel}
          </button>
        </div>
      ) : null}
    </div>
  );
};
