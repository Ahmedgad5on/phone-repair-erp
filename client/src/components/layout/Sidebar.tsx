import React from 'react';
import { Store } from '../../types/erp';
import { useLanguage } from '../../i18n/LanguageContext';
import {
  Wrench,
  ShoppingCart,
  Cpu,
  Wallet,
  Users,
  Clock,
  Settings,
  ChevronLeft,
  ChevronRight,
  Layers,
  LayoutDashboard,
  BookOpen,
  Warehouse,
  Truck,
  FolderKanban,
  Calendar,
  BarChart3,
  ShieldCheck,
  Sparkles
} from 'lucide-react';

interface SidebarProps {
  store: Store | null;
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ store, activeTab, onTabChange }) => {
  const { dir, language, t } = useLanguage();
  const isAr = language === 'ar';
  const ChevronIcon = dir === 'rtl' ? ChevronLeft : ChevronRight;

  return (
    <aside className="w-64 bg-slate-900 border-e border-slate-800 flex flex-col justify-between shrink-0 select-none overflow-y-auto">
      <div className="p-3 space-y-6">
        {/* Core & Global Section */}
        <div>
          <div className="px-3 mb-2 text-[11px] font-semibold tracking-wider text-slate-500 uppercase flex items-center justify-between">
            <span>{t.sidebar.coreSection}</span>
            <span className="text-[10px] text-indigo-400 font-mono">{t.sidebar.alwaysOn}</span>
          </div>

          <div className="space-y-1">
            <button
              onClick={() => onTabChange('dashboard')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition ${
                activeTab === 'dashboard'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <LayoutDashboard className="w-4 h-4 text-sky-400 shrink-0" />
                <span>{t.sidebar.dashboardNav}</span>
              </div>
              <ChevronIcon className="w-3.5 h-3.5 opacity-60 shrink-0" />
            </button>

            <button
              onClick={() => onTabChange('crm')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition ${
                activeTab === 'crm'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Users className="w-4 h-4 text-indigo-400 shrink-0" />
                <span>{t.sidebar.crmNav}</span>
              </div>
              <ChevronIcon className="w-3.5 h-3.5 opacity-60 shrink-0" />
            </button>

            <button
              onClick={() => onTabChange('shift')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition ${
                activeTab === 'shift'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                <span>{t.sidebar.shiftNav}</span>
              </div>
              <ChevronIcon className="w-3.5 h-3.5 opacity-60 shrink-0" />
            </button>
          </div>
        </div>

        {/* Dynamic Store Operations Modules Section */}
        <div>
          <div className="px-3 mb-2 text-[11px] font-semibold tracking-wider text-slate-500 uppercase flex items-center justify-between">
            <span>{t.sidebar.activeModules}</span>
            <Layers className="w-3.5 h-3.5 text-slate-500" />
          </div>

          <div className="space-y-1">
            {/* Module 1: Repair Lab */}
            {Boolean(store?.enable_repair) && (
              <button
                onClick={() => onTabChange('repair')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition ${
                  activeTab === 'repair'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                    : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Wrench className="w-4 h-4 text-sky-400 shrink-0" />
                  <span>{t.sidebar.repairNav}</span>
                </div>
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-sky-950 text-sky-300 border border-sky-800/60 font-mono shrink-0">
                  SLA
                </span>
              </button>
            )}

            {/* Module 2: Retail POS */}
            {Boolean(store?.enable_retail) && (
              <button
                onClick={() => onTabChange('pos')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition ${
                  activeTab === 'pos'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                    : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <ShoppingCart className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{t.sidebar.posNav}</span>
                </div>
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800/60 font-mono shrink-0">
                  F1
                </span>
              </button>
            )}

            {/* Module 3: Spare Parts Wholesale */}
            {Boolean(store?.enable_spare_parts) && (
              <button
                onClick={() => onTabChange('spare-parts')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition ${
                  activeTab === 'spare-parts'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                    : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Cpu className="w-4 h-4 text-purple-400 shrink-0" />
                  <span>{t.sidebar.sparesNav}</span>
                </div>
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-purple-950 text-purple-300 border border-purple-800/60 font-mono shrink-0">
                  Tiers
                </span>
              </button>
            )}

            {/* Module 4: Fintech & E-Wallets */}
            {Boolean(store?.enable_fintech) && (
              <button
                onClick={() => onTabChange('fintech')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition ${
                  activeTab === 'fintech'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                    : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Wallet className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>{t.sidebar.fintechNav}</span>
                </div>
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-950 text-amber-300 border border-amber-800/60 font-mono shrink-0">
                  95% Lock
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Enterprise Modules (Proposals 1-8) */}
        <div>
          <div className="px-3 mb-2 text-[11px] font-semibold tracking-wider text-slate-500 uppercase flex items-center justify-between">
            <span>{isAr ? 'الموديولات المتقدمة (ERP)' : 'Enterprise Modules'}</span>
            <span className="text-[10px] text-emerald-400 font-mono">PRO</span>
          </div>

          <div className="space-y-1">
            {/* Accounting */}
            <button
              onClick={() => onTabChange('accounting')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition ${
                activeTab === 'accounting'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <BookOpen className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{isAr ? 'المحاسبة والدفتر العام' : 'General Ledger'}</span>
              </div>
              <ChevronIcon className="w-3.5 h-3.5 opacity-60 shrink-0" />
            </button>

            {/* Multi-Warehouse */}
            <button
              onClick={() => onTabChange('warehouses')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition ${
                activeTab === 'warehouses'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Warehouse className="w-4 h-4 text-cyan-400 shrink-0" />
                <span>{isAr ? 'المستودعات والتحويلات' : 'Multi-Warehouse'}</span>
              </div>
              <ChevronIcon className="w-3.5 h-3.5 opacity-60 shrink-0" />
            </button>

            {/* Procurement */}
            <button
              onClick={() => onTabChange('procurement')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition ${
                activeTab === 'procurement'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Truck className="w-4 h-4 text-blue-400 shrink-0" />
                <span>{isAr ? 'المشتريات والتوريدات' : 'Procurement & GRN'}</span>
              </div>
              <ChevronIcon className="w-3.5 h-3.5 opacity-60 shrink-0" />
            </button>

            {/* HR & Payroll */}
            <button
              onClick={() => onTabChange('hr')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition ${
                activeTab === 'hr'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Users className="w-4 h-4 text-violet-400 shrink-0" />
                <span>{isAr ? 'شؤون الموظفين والرواتب' : 'HR & Payroll'}</span>
              </div>
              <ChevronIcon className="w-3.5 h-3.5 opacity-60 shrink-0" />
            </button>

            {/* Projects & Tasks */}
            <button
              onClick={() => onTabChange('projects')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition ${
                activeTab === 'projects'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <FolderKanban className="w-4 h-4 text-orange-400 shrink-0" />
                <span>{isAr ? 'المشاريع والمهام' : 'Projects & Tasks'}</span>
              </div>
              <ChevronIcon className="w-3.5 h-3.5 opacity-60 shrink-0" />
            </button>

            {/* Appointments */}
            <button
              onClick={() => onTabChange('appointments')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition ${
                activeTab === 'appointments'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Calendar className="w-4 h-4 text-pink-400 shrink-0" />
                <span>{isAr ? 'حجز مواعيد الصيانة' : 'Appointments'}</span>
              </div>
              <ChevronIcon className="w-3.5 h-3.5 opacity-60 shrink-0" />
            </button>

            {/* Reports & Analytics */}
            <button
              onClick={() => onTabChange('reports')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition ${
                activeTab === 'reports'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <BarChart3 className="w-4 h-4 text-indigo-400 shrink-0" />
                <span>{isAr ? 'التقارير والتحليلات' : 'Reports & BI'}</span>
              </div>
              <ChevronIcon className="w-3.5 h-3.5 opacity-60 shrink-0" />
            </button>

            {/* AI & Enterprise Integrations Hub */}
            <button
              onClick={() => onTabChange('advanced-hub')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition ${
                activeTab === 'advanced-hub'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                <span>{isAr ? 'الذكاء الاصطناعي والتكاملات' : 'AI & Integrations'}</span>
              </div>
              <span className="px-1.5 py-0.2 rounded text-[9px] bg-amber-950 text-amber-300 border border-amber-800/60 font-mono shrink-0">
                AI
              </span>
            </button>

            {/* Omnichannel & Operations Hub (Batch 3) */}
            <button
              onClick={() => onTabChange('omnichannel-hub')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition ${
                activeTab === 'omnichannel-hub'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Layers className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{isAr ? 'القنوات والعمليات Omnichannel' : 'Omnichannel Hub'}</span>
              </div>
              <span className="px-1.5 py-0.2 rounded text-[9px] bg-emerald-950 text-emerald-300 border border-emerald-800/60 font-mono shrink-0">
                v3
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Settings & Status */}
      <div className="p-3 border-t border-slate-800 space-y-1">
        <button
          onClick={() => onTabChange('settings')}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition ${
            activeTab === 'settings'
              ? 'bg-slate-800 text-white'
              : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <Settings className="w-4 h-4 text-slate-400 shrink-0" />
            <span>{t.sidebar.settingsNav}</span>
          </div>
          <ChevronIcon className="w-3.5 h-3.5 opacity-50 shrink-0" />
        </button>

        <div className="pt-2 px-3 flex items-center justify-between text-[11px] text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
            {t.sidebar.sqliteMode}
          </span>
          <span className="font-mono text-[10px] text-emerald-400">WAL-2</span>
        </div>
      </div>
    </aside>
  );
};
