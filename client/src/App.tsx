import React, { useState, useEffect } from 'react';
import { Store, User, Shift } from './types/erp';
import { api } from './services/api';
import { LanguageProvider, useLanguage } from './i18n/LanguageContext';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { ToastContainer } from './components/common/ToastContainer';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { NetworkStatus } from './components/common/NetworkStatus';
import { LoginModal } from './components/auth/LoginModal';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { GlobalSearchModal } from './components/common/GlobalSearchModal';
import { KeyboardShortcutsModal } from './components/settings/KeyboardShortcutsModal';
import { PrinterConfigModal } from './components/settings/PrinterConfigModal';

import { SkeletonLoader } from './components/common/SkeletonLoader';

// Core Operations Views (Dynamic Lazy Loading)
const DashboardView = React.lazy(() => import('./views/DashboardView').then(m => ({ default: m.DashboardView })));
const PosView = React.lazy(() => import('./views/PosView').then(m => ({ default: m.PosView })));
const RepairLabView = React.lazy(() => import('./views/RepairLabView').then(m => ({ default: m.RepairLabView })));
const SparePartsView = React.lazy(() => import('./views/SparePartsView').then(m => ({ default: m.SparePartsView })));
const FintechView = React.lazy(() => import('./views/FintechView').then(m => ({ default: m.FintechView })));
const ShiftView = React.lazy(() => import('./views/ShiftView').then(m => ({ default: m.ShiftView })));
const CrmView = React.lazy(() => import('./views/CrmView').then(m => ({ default: m.CrmView })));
const SettingsView = React.lazy(() => import('./views/SettingsView').then(m => ({ default: m.SettingsView })));

// Vite Dynamic Imports with React.lazy for heavy enterprise bundles (Proposal 45)
const AccountingView = React.lazy(() => import('./views/AccountingView').then(m => ({ default: m.AccountingView })));
const WarehouseView = React.lazy(() => import('./views/WarehouseView').then(m => ({ default: m.WarehouseView })));
const ProcurementView = React.lazy(() => import('./views/ProcurementView').then(m => ({ default: m.ProcurementView })));
const HrView = React.lazy(() => import('./views/HrView').then(m => ({ default: m.HrView })));
const ProjectsView = React.lazy(() => import('./views/ProjectsView').then(m => ({ default: m.ProjectsView })));
const AppointmentsView = React.lazy(() => import('./views/AppointmentsView').then(m => ({ default: m.AppointmentsView })));
const ReportsView = React.lazy(() => import('./views/ReportsView').then(m => ({ default: m.ReportsView })));
const AdvancedHubView = React.lazy(() => import('./views/AdvancedHubView').then(m => ({ default: m.AdvancedHubView })));
const OmnichannelHubView = React.lazy(() => import('./views/OmnichannelHubView').then(m => ({ default: m.OmnichannelHubView })));
const CustomerTrackingPortal = React.lazy(() => import('./views/CustomerTrackingPortal').then(m => ({ default: m.CustomerTrackingPortal })));

import { ErpStoreProvider } from './context/ErpStore';

const MainApp: React.FC = () => {
  const { dir, t } = useLanguage();
  const { user: authUser } = useAuth();

  const [store, setStore] = useState<Store | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeShift, setActiveShift] = useState<Shift | null>(null);
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [loading, setLoading] = useState(true);

  // Modals state
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [showPrinterModal, setShowPrinterModal] = useState(false);

  const loadInitialData = async () => {
    try {
      const storeData = await api.getStore();
      setStore(storeData);

      const usersData = await api.getUsers();
      setUsers(usersData);
      if (usersData.length > 0) {
        setCurrentUser(usersData[0]);
      }

      const shiftData = await api.getCurrentShift();
      setActiveShift(shiftData.activeShift);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  // Sync currentUser with authUser if logged in
  useEffect(() => {
    if (authUser) {
      const matched = users.find(u => u.username === authUser.username);
      if (matched) {
        setCurrentUser(matched);
      }
    }
  }, [authUser, users]);

  // Global hotkeys handler (F-keys + Ctrl+K for search)
  useEffect(() => {
    const handleGlobalHotkeys = (e: KeyboardEvent) => {
      // Ctrl+K or Cmd+K opens Universal Search
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowSearchModal(prev => !prev);
        return;
      }

      const tag = (e.target as HTMLElement).tagName;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) && !e.key.startsWith('F')) {
        return;
      }

      if (e.key === 'F1' && store?.enable_retail) {
        e.preventDefault();
        setActiveTab('pos');
      } else if (e.key === 'F2' && store?.enable_repair) {
        e.preventDefault();
        setActiveTab('repair');
      } else if (e.key === 'F3' && store?.enable_spare_parts) {
        e.preventDefault();
        setActiveTab('spare-parts');
      } else if (e.key === 'F4' && store?.enable_fintech) {
        e.preventDefault();
        setActiveTab('fintech');
      } else if (e.key === 'F7') {
        e.preventDefault();
        setActiveTab('dashboard');
      } else if (e.key === 'F8') {
        e.preventDefault();
        setActiveTab('crm');
      } else if (e.key === 'F9') {
        e.preventDefault();
        setActiveTab('shift');
      } else if (e.key === 'F10') {
        e.preventDefault();
        setActiveTab('settings');
      }
    };

    window.addEventListener('keydown', handleGlobalHotkeys);
    return () => window.removeEventListener('keydown', handleGlobalHotkeys);
  }, [store]);

  const handleRefreshUsers = async () => {
    const u = await api.getUsers();
    setUsers(u);
  };

  const handleShiftUpdated = async () => {
    const data = await api.getCurrentShift();
    setActiveShift(data.activeShift);
  };

  const handleSearchNavigate = (view: string, _id?: string) => {
    if (view) {
      setActiveTab(view);
      setShowSearchModal(false);
    }
  };

  const isPortalRoute = typeof window !== 'undefined' && (
    window.location.pathname.startsWith('/portal') ||
    new URLSearchParams(window.location.search).has('ticket')
  );

  if (isPortalRoute) {
    return (
      <React.Suspense fallback={<SkeletonLoader />}>
        <CustomerTrackingPortal />
      </React.Suspense>
    );
  }

  if (loading) {
    return (
      <div className="h-screen w-screen bg-slate-950 flex flex-col items-center justify-center text-white space-y-4" dir={dir}>
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
        <div className="text-sm font-semibold tracking-wide">{t.common.loading}</div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden font-sans transition-colors" dir={dir}>
      {/* Top Header with Live Shift, Active Store, Language & Theme Switchers, Search, and Shortcuts */}
      <Header
        store={store}
        activeShift={activeShift}
        currentUser={currentUser}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onOpenSearch={() => setShowSearchModal(true)}
        onOpenShortcuts={() => setShowShortcutsModal(true)}
        onOpenPrinterConfig={() => setShowPrinterModal(true)}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Dynamic Sidebar */}
        <Sidebar
          store={store}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto bg-slate-100/60 dark:bg-slate-950/90 relative transition-colors">
          <React.Suspense fallback={<SkeletonLoader />}>
            {activeTab === 'dashboard' && <DashboardView />}
            {activeTab === 'pos' && Boolean(store?.enable_retail) && <PosView />}
            {activeTab === 'repair' && Boolean(store?.enable_repair) && <RepairLabView users={users} />}
            {activeTab === 'spare-parts' && Boolean(store?.enable_spare_parts) && <SparePartsView />}
            {activeTab === 'fintech' && Boolean(store?.enable_fintech) && <FintechView />}
            {activeTab === 'crm' && <CrmView />}
            {activeTab === 'shift' && (
              <ShiftView
                currentUser={currentUser}
                users={users}
                onShiftUpdated={handleShiftUpdated}
              />
            )}
            {activeTab === 'settings' && (
              <SettingsView
                store={store}
                users={users}
                onStoreUpdate={setStore}
                onRefreshUsers={handleRefreshUsers}
              />
            )}

            {/* Enterprise ERP Modules */}
            {activeTab === 'accounting' && <AccountingView />}
            {activeTab === 'warehouses' && <WarehouseView />}
            {activeTab === 'procurement' && <ProcurementView />}
            {activeTab === 'hr' && <HrView />}
            {activeTab === 'projects' && <ProjectsView />}
            {activeTab === 'appointments' && <AppointmentsView />}
            {activeTab === 'reports' && <ReportsView />}
            {activeTab === 'advanced-hub' && <AdvancedHubView />}
            {activeTab === 'omnichannel-hub' && <OmnichannelHubView />}
          </React.Suspense>
        </main>
      </div>

      {/* Global Modals & System Banners */}
      <ToastContainer />
      <NetworkStatus />
      <LoginModal isOpen={showLoginModal} onClose={() => setShowLoginModal(false)} />
      <GlobalSearchModal
        isOpen={showSearchModal}
        onClose={() => setShowSearchModal(false)}
        onNavigate={handleSearchNavigate}
      />
      <KeyboardShortcutsModal
        isOpen={showShortcutsModal}
        onClose={() => setShowShortcutsModal(false)}
      />
      <PrinterConfigModal
        isOpen={showPrinterModal}
        onClose={() => setShowPrinterModal(false)}
      />
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <LanguageProvider>
        <ThemeProvider>
          <AuthProvider>
            <ErpStoreProvider>
              <ToastProvider>
                <MainApp />
              </ToastProvider>
            </ErpStoreProvider>
          </AuthProvider>
        </ThemeProvider>
      </LanguageProvider>
    </ErrorBoundary>
  );
};

export default App;
