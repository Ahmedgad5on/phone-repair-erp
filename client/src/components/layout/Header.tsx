import React from 'react';
import { Store, Shift, User } from '../../types/erp';
import { useLanguage } from '../../i18n/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import { NotificationsCenter } from '../common/NotificationsCenter';
import {
  Smartphone,
  Clock,
  Globe,
  Sun,
  Moon,
  Search,
  Keyboard,
  Printer
} from 'lucide-react';

interface HeaderProps {
  store: Store | null;
  activeShift: Shift | null;
  currentUser: User | null;
  activeTab: string;
  onTabChange: (tab: string) => void;
  onOpenSearch?: () => void;
  onOpenShortcuts?: () => void;
  onOpenPrinterConfig?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  store,
  activeShift,
  currentUser,
  onTabChange,
  onOpenSearch,
  onOpenShortcuts,
  onOpenPrinterConfig
}) => {
  const { language, toggleLanguage, t } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const isAr = language === 'ar';

  return (
    <header className="h-14 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 flex items-center justify-between text-xs select-none shadow-xs transition-colors">
      {/* Brand & Store */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
          <Smartphone className="w-4 h-4" />
        </div>
        <div>
          <div className="font-semibold text-slate-900 dark:text-white tracking-wide text-sm flex items-center gap-2">
            <span>{store?.name || t.common.appName}</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700/50 font-mono">
              v2.0 Pro
            </span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">{t.common.appSubtitle}</p>
        </div>
      </div>

      {/* Global Quick Search Button (Ctrl+K) */}
      <button
        onClick={onOpenSearch}
        className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 text-xs transition-all w-64 justify-between"
      >
        <div className="flex items-center gap-2">
          <Search className="w-3.5 h-3.5 text-slate-400" />
          <span>{isAr ? 'بحث شامل بالعملاء، الفواتير، السيريال...' : 'Search customers, IMEIs, POs...'}</span>
        </div>
        <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded border border-slate-300 dark:border-slate-700">
          Ctrl+K
        </kbd>
      </button>

      {/* Right Actions: Hotkeys, Language, Theme, Notifications, User */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Printer Config Button */}
        <button
          onClick={onOpenPrinterConfig}
          className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 transition"
          title={isAr ? 'إعدادات الطابعة الحرارية و A4' : 'Printer Configuration'}
        >
          <Printer className="w-4 h-4" />
        </button>

        {/* Shortcuts Info Button */}
        <button
          onClick={onOpenShortcuts}
          className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 transition"
          title={isAr ? 'قائمة الاختصارات السريعة' : 'Keyboard Shortcuts'}
        >
          <Keyboard className="w-4 h-4" />
        </button>

        {/* Dark / Light Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 transition"
          title={theme === 'dark' ? (isAr ? 'الوضع الفاتح' : 'Light Mode') : (isAr ? 'الوضع الداكن' : 'Dark Mode')}
        >
          {theme === 'dark' ? (
            <Sun className="w-4 h-4 text-amber-400" />
          ) : (
            <Moon className="w-4 h-4 text-indigo-600" />
          )}
        </button>

        {/* Notifications Center */}
        <NotificationsCenter />

        {/* Language Switcher */}
        <button
          onClick={toggleLanguage}
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-indigo-300 border border-slate-200 dark:border-slate-700 rounded-lg font-medium text-xs transition"
          title="Switch Language / تغيير لغة البرنامج"
        >
          <Globe className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
          <span>{t.header.switchLang}</span>
        </button>

        {/* Shift Status Indicator */}
        {activeShift ? (
          <button
            onClick={() => onTabChange('shift')}
            className="hidden sm:flex items-center gap-2 px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-medium">{t.header.shiftActive}</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-mono text-[11px]">
              ({activeShift.opening_cash.toLocaleString()} {t.common.currency})
            </span>
          </button>
        ) : (
          <button
            onClick={() => onTabChange('shift')}
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/60 transition"
          >
            <Clock className="w-3.5 h-3.5 text-amber-500" />
            <span>{t.header.shiftClosed}</span>
          </button>
        )}

        {/* User Badge */}
        <div className="flex items-center gap-2 ps-2 border-s border-slate-200 dark:border-slate-800">
          <div className="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-900/70 border border-indigo-300 dark:border-indigo-700/50 flex items-center justify-center text-indigo-700 dark:text-indigo-300 font-bold text-xs">
            {currentUser?.name?.charAt(0) || 'A'}
          </div>
          <div className="hidden lg:block text-start">
            <div className="font-semibold text-slate-800 dark:text-slate-200 leading-none">{currentUser?.name || 'Ahmed Owner'}</div>
            <span className="text-[10px] text-slate-500 dark:text-slate-400">{currentUser?.role || t.header.userRole}</span>
          </div>
        </div>
      </div>
    </header>
  );
};
