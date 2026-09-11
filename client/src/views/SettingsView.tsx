import React, { useState } from 'react';
import { Store, User } from '../types/erp';
import { api } from '../services/api';
import { useLanguage } from '../i18n/LanguageContext';
import { useToast } from '../context/ToastContext';
import {
  Layers,
  Wrench,
  ShoppingCart,
  Cpu,
  Wallet,
  Building2,
  Users,
  CheckCircle2,
  Save,
  Globe
} from 'lucide-react';

interface SettingsViewProps {
  store: Store | null;
  users: User[];
  onStoreUpdate: (updatedStore: Store) => void;
  onRefreshUsers: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  store,
  users,
  onStoreUpdate,
  onRefreshUsers
}) => {
  const { language, setLanguage, t } = useLanguage();
  const { showToast } = useToast();

  const [storeInfo, setStoreInfo] = useState({
    name: store?.name || '',
    phone: store?.phone || '',
    address: store?.address || '',
    receipt_header: store?.receipt_header || '',
    receipt_footer: store?.receipt_footer || '',
    google_maps_url: store?.google_maps_url || ''
  });

  const [loadingFlag, setLoadingFlag] = useState<string | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUser, setNewUser] = useState({
    username: '',
    name: '',
    role: 'MaintenanceEngineer',
    commission_rate: 0.35
  });

  const handleToggleModule = async (flagName: 'enable_repair' | 'enable_retail' | 'enable_spare_parts' | 'enable_fintech', currentVal: number) => {
    setLoadingFlag(flagName);
    try {
      const res = await api.updateModules({ [flagName]: !currentVal });
      onStoreUpdate(res.store);
      showToast('تم تحديث حالة الموديول بنجاح', 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setLoadingFlag(null);
    }
  };

  const handleSaveStoreInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.updateStoreInfo(storeInfo);
      onStoreUpdate(res);
      setSavedSuccess(true);
      showToast('تم حفظ إعدادات المتجر وبيانات الفاتورة بنجاح', 'success');
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createUser(newUser);
      setShowAddUser(false);
      setNewUser({ username: '', name: '', role: 'MaintenanceEngineer', commission_rate: 0.35 });
      showToast('تم إنشاء الموظف بنجاح وحفظ الصلاحيات', 'success');
      onRefreshUsers();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8 select-text">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white tracking-wide flex items-center gap-2.5">
            <Layers className="w-6 h-6 text-indigo-400" />
            {t.settings.title}
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            {t.settings.subtitle}
          </p>
        </div>
      </div>

      {/* Language Switcher Setting Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <Globe className="w-5 h-5 text-indigo-400" />
            <h2 className="text-base font-semibold text-white">
              {language === 'ar' ? 'لغة النظام واتجاه الواجهة (RTL / LTR)' : 'Interface Language & Direction (RTL / LTR)'}
            </h2>
          </div>
          <span className="text-xs font-mono text-indigo-400 bg-indigo-950/70 border border-indigo-800 px-2.5 py-1 rounded-md">
            {language === 'ar' ? 'العربية (RTL متطابق تماماً)' : 'English (LTR)'}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            type="button"
            onClick={() => setLanguage('ar')}
            className={`p-4 rounded-xl border text-start flex items-center justify-between transition ${
              language === 'ar'
                ? 'bg-indigo-950/60 border-indigo-500 shadow-lg shadow-indigo-600/20 text-white'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
            }`}
          >
            <div>
              <div className="font-bold text-sm text-white">اللغة العربية (Arabic)</div>
              <div className="text-xs text-slate-400 mt-1">اتجاه الواجهة من اليمين إلى اليسار (RTL) مع مصطلحات الهواتف الدقيقة</div>
            </div>
            {language === 'ar' && <CheckCircle2 className="w-5 h-5 text-indigo-400" />}
          </button>

          <button
            type="button"
            onClick={() => setLanguage('en')}
            className={`p-4 rounded-xl border text-start flex items-center justify-between transition ${
              language === 'en'
                ? 'bg-indigo-950/60 border-indigo-500 shadow-lg shadow-indigo-600/20 text-white'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
            }`}
          >
            <div>
              <div className="font-bold text-sm text-white">English (LTR)</div>
              <div className="text-xs text-slate-400 mt-1">Left-to-Right layout with standard international ERP terminology</div>
            </div>
            {language === 'en' && <CheckCircle2 className="w-5 h-5 text-indigo-400" />}
          </button>
        </div>
      </div>

      {/* Module Feature-Flag Engine Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-6">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div>
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-500"></span>
              {t.settings.featureFlagsTitle}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {t.settings.featureFlagsDesc}
            </p>
          </div>
          <span className="text-xs font-mono text-indigo-400 bg-indigo-950/70 border border-indigo-800 px-2.5 py-1 rounded-md">
            {t.settings.apiGuarded}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Repair Lab Toggle */}
          <div className="p-4 rounded-lg bg-slate-950/80 border border-slate-800 flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-sky-950 text-sky-400 border border-sky-800/60 mt-0.5">
                <Wrench className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-white text-sm">{t.settings.repairTitle}</h3>
                <p className="text-xs text-slate-400 mt-1">
                  {t.settings.repairDesc}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                    Route: /api/repair/*
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={() => handleToggleModule('enable_repair', store?.enable_repair || 0)}
              disabled={loadingFlag === 'enable_repair'}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition shrink-0 ${
                store?.enable_repair
                  ? 'bg-sky-600 hover:bg-sky-500 text-white shadow-md shadow-sky-600/30'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
              }`}
            >
              {store?.enable_repair ? t.common.enabled : t.common.disabled}
            </button>
          </div>

          {/* Retail POS Toggle */}
          <div className="p-4 rounded-lg bg-slate-950/80 border border-slate-800 flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-emerald-950 text-emerald-400 border border-emerald-800/60 mt-0.5">
                <ShoppingCart className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-white text-sm">{t.settings.retailTitle}</h3>
                <p className="text-xs text-slate-400 mt-1">
                  {t.settings.retailDesc}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                    Route: /api/retail/*
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={() => handleToggleModule('enable_retail', store?.enable_retail || 0)}
              disabled={loadingFlag === 'enable_retail'}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition shrink-0 ${
                store?.enable_retail
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/30'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
              }`}
            >
              {store?.enable_retail ? t.common.enabled : t.common.disabled}
            </button>
          </div>

          {/* Spare Parts Wholesale Toggle */}
          <div className="p-4 rounded-lg bg-slate-950/80 border border-slate-800 flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-purple-950 text-purple-400 border border-purple-800/60 mt-0.5">
                <Cpu className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-white text-sm">{t.settings.sparesTitle}</h3>
                <p className="text-xs text-slate-400 mt-1">
                  {t.settings.sparesDesc}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                    Route: /api/spare-parts/*
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={() => handleToggleModule('enable_spare_parts', store?.enable_spare_parts || 0)}
              disabled={loadingFlag === 'enable_spare_parts'}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition shrink-0 ${
                store?.enable_spare_parts
                  ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-md shadow-purple-600/30'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
              }`}
            >
              {store?.enable_spare_parts ? t.common.enabled : t.common.disabled}
            </button>
          </div>

          {/* Fintech & E-Wallets Toggle */}
          <div className="p-4 rounded-lg bg-slate-950/80 border border-slate-800 flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-amber-950 text-amber-400 border border-amber-800/60 mt-0.5">
                <Wallet className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-white text-sm">{t.settings.fintechTitle}</h3>
                <p className="text-xs text-slate-400 mt-1">
                  {t.settings.fintechDesc}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                    Route: /api/fintech/*
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={() => handleToggleModule('enable_fintech', store?.enable_fintech || 0)}
              disabled={loadingFlag === 'enable_fintech'}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition shrink-0 ${
                store?.enable_fintech
                  ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-md shadow-amber-600/30'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
              }`}
            >
              {store?.enable_fintech ? t.common.enabled : t.common.disabled}
            </button>
          </div>
        </div>
      </div>

      {/* Store Identity & ESC/POS Receipt Customizer */}
      <form onSubmit={handleSaveStoreInfo} className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-6">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <Building2 className="w-5 h-5 text-indigo-400" />
            <h2 className="text-base font-semibold text-white">{t.settings.storeProfileTitle}</h2>
          </div>
          <button
            type="submit"
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium shadow-md transition"
          >
            {savedSuccess ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Save className="w-4 h-4" />}
            {savedSuccess ? t.common.saved : t.common.save}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="block text-slate-300 font-medium mb-1">{t.settings.storeName}</label>
            <input
              type="text"
              value={storeInfo.name}
              onChange={e => setStoreInfo({ ...storeInfo, name: e.target.value })}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-hidden focus:border-indigo-500"
              required
            />
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">{t.settings.storePhone}</label>
            <input
              type="text"
              value={storeInfo.phone}
              onChange={e => setStoreInfo({ ...storeInfo, phone: e.target.value })}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-hidden focus:border-indigo-500"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-slate-300 font-medium mb-1">{t.settings.storeAddress}</label>
            <input
              type="text"
              value={storeInfo.address}
              onChange={e => setStoreInfo({ ...storeInfo, address: e.target.value })}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-hidden focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">{t.settings.receiptHeader}</label>
            <textarea
              rows={3}
              value={storeInfo.receipt_header}
              onChange={e => setStoreInfo({ ...storeInfo, receipt_header: e.target.value })}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono-code focus:outline-hidden focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">{t.settings.receiptFooter}</label>
            <textarea
              rows={3}
              value={storeInfo.receipt_footer}
              onChange={e => setStoreInfo({ ...storeInfo, receipt_footer: e.target.value })}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono-code focus:outline-hidden focus:border-indigo-500"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-slate-300 font-medium mb-1">{t.settings.googleReviewUrl}</label>
            <input
              type="url"
              value={storeInfo.google_maps_url}
              onChange={e => setStoreInfo({ ...storeInfo, google_maps_url: e.target.value })}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-hidden focus:border-indigo-500"
            />
          </div>
        </div>
      </form>

      {/* Staff & RBAC Permissions Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <Users className="w-5 h-5 text-indigo-400" />
            <div>
              <h2 className="text-base font-semibold text-white">{t.settings.staffTitle}</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {t.settings.staffSubtitle}
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowAddUser(true)}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-medium border border-slate-700 transition"
          >
            {t.settings.addStaff}
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-start text-xs text-slate-300">
            <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
              <tr>
                <th className="px-4 py-2.5">{t.settings.fullName}</th>
                <th className="px-4 py-2.5">{t.settings.username}</th>
                <th className="px-4 py-2.5">{t.settings.role}</th>
                <th className="px-4 py-2.5">{t.settings.commissionRate}</th>
                <th className="px-4 py-2.5">{t.common.status}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-slate-800/40 transition">
                  <td className="px-4 py-3 font-medium text-white">{u.name}</td>
                  <td className="px-4 py-3 font-mono text-slate-400">@{u.username}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-800 text-indigo-300 border border-slate-700">
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-emerald-400">
                    {u.commission_rate > 0 ? `${(u.commission_rate * 100).toFixed(0)}% ${t.settings.profitShare}` : t.settings.salaried}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 text-emerald-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                      {t.settings.activeStatus}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add User Modal */}
      {showAddUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-md w-full space-y-4">
            <h3 className="font-semibold text-white text-base">{t.settings.addStaff}</h3>
            <form onSubmit={handleCreateUser} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 mb-1">{t.settings.fullName}</label>
                <input
                  type="text"
                  required
                  value={newUser.name}
                  onChange={e => setNewUser({ ...newUser, name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="block text-slate-300 mb-1">{t.settings.username}</label>
                <input
                  type="text"
                  required
                  value={newUser.username}
                  onChange={e => setNewUser({ ...newUser, username: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="block text-slate-300 mb-1">{t.settings.role}</label>
                <select
                  value={newUser.role}
                  onChange={e => setNewUser({ ...newUser, role: e.target.value as any })}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-white"
                >
                  <option value="SuperAdmin">SuperAdmin (المدير العام)</option>
                  <option value="Manager">Manager (مدير فرع)</option>
                  <option value="MaintenanceEngineer">MaintenanceEngineer (مهندس صيانة)</option>
                  <option value="Cashier">Cashier (كاشير)</option>
                  <option value="Salesperson">Salesperson (مبيعات)</option>
                  <option value="Receptionist">Receptionist (استقبال)</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-300 mb-1">{t.settings.commissionRate} (e.g. 0.35)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  value={newUser.commission_rate}
                  onChange={e => setNewUser({ ...newUser, commission_rate: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-white"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddUser(false)}
                  className="px-3 py-2 text-slate-400 hover:text-white"
                >
                  {t.common.cancel}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-medium"
                >
                  {t.common.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
