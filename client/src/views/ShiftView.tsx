import React, { useState, useEffect } from 'react';
import { Shift, User } from '../types/erp';
import { api } from '../services/api';
import { useLanguage } from '../i18n/LanguageContext';
import { useToast } from '../context/ToastContext';
import {
  Clock,
  Lock,
  FileCheck,
  RefreshCw,
  AlertTriangle
} from 'lucide-react';

interface ShiftViewProps {
  currentUser: User | null;
  users: User[];
  onShiftUpdated: () => void;
}

export const ShiftView: React.FC<ShiftViewProps> = ({ currentUser, onShiftUpdated }) => {
  const { t } = useLanguage();
  const { showToast } = useToast();
  const [shiftData, setShiftData] = useState<any>(null);
  const [loading, setLoading] = useState(true);


  // Close shift modal state
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [closeForm, setCloseForm] = useState({
    actual_cash: '',
    device_inventory_count: '14',
    handover_notes: ''
  });

  // Open shift modal state
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [openCash, setOpenCash] = useState('5000');

  // Accept handover modal state
  const [showAcceptModal, setShowAcceptModal] = useState(false);
  const [isDisputed, setIsDisputed] = useState(false);
  const [disputeNotes, setDisputeNotes] = useState('');

  const loadShift = async () => {
    setLoading(true);
    try {
      const data = await api.getCurrentShift();
      setShiftData(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadShift();
  }, []);

  const handleOpenShift = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.openShift({
        opening_cash: parseFloat(openCash) || 0,
        user_id: currentUser?.id || 'usr-cashier'
      });
      setShowOpenModal(false);
      loadShift();
      onShiftUpdated();
      showToast('تم افتتاح الوردية بنجاح وتسجيل عهدة الدرج', 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleCloseShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shiftData?.activeShift) return;

    const actual = parseFloat(closeForm.actual_cash);
    const expected = shiftData.calculatedSummary?.calculatedExpectedCash || shiftData.activeShift.opening_cash;

    try {
      const res = await api.closeShift({
        shift_id: shiftData.activeShift.id,
        closed_by_user_id: currentUser?.id || 'usr-cashier',
        actual_cash: actual,
        expected_cash: expected,
        device_inventory_count: parseInt(closeForm.device_inventory_count) || 0,
        handover_notes: closeForm.handover_notes
      });

      showToast(res.message || 'تم إغلاق الوردية وبدء إجراءات التسليم', 'success');
      setShowCloseModal(false);
      loadShift();
      onShiftUpdated();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleAcceptHandover = async () => {
    if (!shiftData?.activeShift) return;
    try {
      await api.acceptHandover({
        shift_id: shiftData.activeShift.id,
        accepted_by_user_id: currentUser?.id || 'usr-cashier',
        is_disputed: isDisputed,
        dispute_notes: disputeNotes
      });
      showToast('تم قبول استلام الوردية والعهدة بنجاح', 'success');
      setShowAcceptModal(false);
      loadShift();
      onShiftUpdated();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };


  const activeShift: Shift | null = shiftData?.activeShift;
  const summary = shiftData?.calculatedSummary;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6 select-text">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white tracking-wide flex items-center gap-2.5">
            <Clock className="w-6 h-6 text-amber-400" />
            {t.shift.title}
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            {t.shift.subtitle}
          </p>
        </div>
        <button
          onClick={loadShift}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          {t.shift.refreshSummary}
        </button>
      </div>

      {/* Active Shift Card */}
      {activeShift ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div className="flex items-center gap-3">
              <span
                className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 ${
                  activeShift.status === 'OPEN'
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                    : activeShift.status === 'HANDED_OVER'
                    ? 'bg-amber-950 text-amber-300 border border-amber-800'
                    : 'bg-slate-800 text-slate-300'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-current animate-pulse"></span>
                {t.shift.statusLabel} {activeShift.status}
              </span>
              <span className="text-xs text-slate-400">
                {t.shift.openedBy} <strong className="text-white">{activeShift.opener_name || 'Cashier'}</strong> {t.shift.atTime}{' '}
                {activeShift.opened_at.substring(0, 16)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {activeShift.status === 'OPEN' && (
                <button
                  onClick={() => setShowCloseModal(true)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-semibold shadow-md transition"
                >
                  <Lock className="w-4 h-4" />
                  {t.shift.closeShiftBtn}
                </button>
              )}

              {activeShift.status === 'HANDED_OVER' && (
                <button
                  onClick={() => setShowAcceptModal(true)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow-md transition"
                >
                  <FileCheck className="w-4 h-4" />
                  {t.shift.acceptHandoverBtn}
                </button>
              )}
            </div>
          </div>

          {/* Live Drawer Calculation Grid */}
          {summary && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="bg-slate-950/80 p-3.5 rounded-lg border border-slate-800">
                <span className="text-[11px] text-slate-400 font-medium">{t.shift.openingCash}</span>
                <div className="text-base font-bold text-white font-mono mt-1">
                  {summary.openingCash.toLocaleString()} <span className="text-xs font-normal">{t.common.currency}</span>
                </div>
              </div>

              <div className="bg-slate-950/80 p-3.5 rounded-lg border border-slate-800">
                <span className="text-[11px] text-emerald-400 font-medium">{t.shift.cashSales}</span>
                <div className="text-base font-bold text-emerald-400 font-mono mt-1">
                  +{summary.cashSales.toLocaleString()} <span className="text-xs font-normal">{t.common.currency}</span>
                </div>
              </div>

              <div className="bg-slate-950/80 p-3.5 rounded-lg border border-slate-800">
                <span className="text-[11px] text-sky-400 font-medium">{t.shift.repairCash}</span>
                <div className="text-base font-bold text-sky-400 font-mono mt-1">
                  +{summary.repairCash.toLocaleString()} <span className="text-xs font-normal">{t.common.currency}</span>
                </div>
              </div>

              <div className="bg-slate-950/80 p-3.5 rounded-lg border border-slate-800">
                <span className="text-[11px] text-indigo-400 font-medium">{t.shift.fintechIn}</span>
                <div className="text-base font-bold text-indigo-400 font-mono mt-1">
                  +{summary.fintechCashIn.toLocaleString()} <span className="text-xs font-normal">{t.common.currency}</span>
                </div>
              </div>

              <div className="bg-slate-950/80 p-3.5 rounded-lg border border-slate-800">
                <span className="text-[11px] text-rose-400 font-medium">{t.shift.fintechOut}</span>
                <div className="text-base font-bold text-rose-400 font-mono mt-1">
                  -{summary.fintechCashOut.toLocaleString()} <span className="text-xs font-normal">{t.common.currency}</span>
                </div>
              </div>

              <div className="bg-indigo-950/50 p-3.5 rounded-lg border border-indigo-700/60">
                <span className="text-[11px] text-indigo-300 font-semibold">{t.shift.expectedCash}</span>
                <div className="text-lg font-extrabold text-indigo-200 font-mono mt-1">
                  {summary.calculatedExpectedCash.toLocaleString()} <span className="text-xs font-normal">{t.common.currency}</span>
                </div>
              </div>
            </div>
          )}

          {/* Handover & Deficit Status Banner (If Handed Over) */}
          {activeShift.status === 'HANDED_OVER' && (
            <div
              className={`p-4 rounded-xl border flex items-start gap-3 ${
                (activeShift.cash_difference || 0) < 0
                  ? 'bg-rose-950/50 border-rose-800/80 text-rose-200'
                  : 'bg-emerald-950/50 border-emerald-800/80 text-emerald-200'
              }`}
            >
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <div className="font-semibold text-sm">
                  {(activeShift.cash_difference || 0) < 0
                    ? `${t.shift.deficitAlert} ${Math.abs(activeShift.cash_difference || 0)} ${t.common.currency}!`
                    : t.shift.balancedNotice}
                </div>
                <p>
                  {t.shift.actualCounted} <span className="font-mono font-bold">{activeShift.actual_cash?.toLocaleString()} {t.common.currency}</span> | {t.shift.devicesInLab} <span className="font-mono font-bold">{activeShift.device_inventory_count}</span>
                </p>
                {activeShift.handover_notes && (
                  <p className="italic text-slate-300">{t.shift.handoverNotes} "{activeShift.handover_notes}"</p>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* No Open Shift State */
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-amber-950/80 border border-amber-800/60 text-amber-400 flex items-center justify-center mx-auto">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-semibold text-white text-base">{t.shift.noOpenShiftTitle}</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
              {t.shift.noOpenShiftDesc}
            </p>
          </div>
          <button
            onClick={() => setShowOpenModal(true)}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold shadow-lg shadow-indigo-600/30 transition"
          >
            {t.shift.openShiftBtn}
          </button>
        </div>
      )}

      {/* Close Shift Modal */}
      {showCloseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-md w-full space-y-4">
            <h3 className="font-semibold text-white text-base flex items-center gap-2">
              <Lock className="w-5 h-5 text-amber-400" />
              {t.shift.closeModalTitle}
            </h3>
            <form onSubmit={handleCloseShift} className="space-y-4 text-xs">
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-slate-300">
                <div className="flex justify-between">
                  <span>{t.shift.expectedCash}:</span>
                  <strong className="font-mono text-white">
                    {summary?.calculatedExpectedCash.toLocaleString()} {t.common.currency}
                  </strong>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  {t.shift.mandatoryActualCash}
                </label>
                <input
                  type="number"
                  step="1"
                  required
                  placeholder="e.g. 5200"
                  value={closeForm.actual_cash}
                  onChange={e => setCloseForm({ ...closeForm, actual_cash: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono text-sm focus:outline-hidden focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  {t.shift.mandatoryDevices}
                </label>
                <input
                  type="number"
                  required
                  value={closeForm.device_inventory_count}
                  onChange={e => setCloseForm({ ...closeForm, device_inventory_count: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">{t.shift.handoverNotes}</label>
                <textarea
                  rows={2}
                  value={closeForm.handover_notes}
                  onChange={e => setCloseForm({ ...closeForm, handover_notes: e.target.value })}
                  placeholder={t.shift.handoverPlaceholder}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCloseModal(false)}
                  className="px-3 py-2 text-slate-400 hover:text-white"
                >
                  {t.common.cancel}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-medium"
                >
                  {t.shift.submitHandover}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Open Shift Modal */}
      {showOpenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-sm w-full space-y-4">
            <h3 className="font-semibold text-white text-base">{t.shift.openModalTitle}</h3>
            <form onSubmit={handleOpenShift} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">{t.shift.openingFloatLabel}</label>
                <input
                  type="number"
                  required
                  value={openCash}
                  onChange={e => setOpenCash(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono text-sm"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowOpenModal(false)}
                  className="px-3 py-2 text-slate-400 hover:text-white"
                >
                  {t.common.cancel}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium"
                >
                  {t.shift.startShift}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Accept Handover Modal */}
      {showAcceptModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-md w-full space-y-4">
            <h3 className="font-semibold text-white text-base flex items-center gap-2">
              <FileCheck className="w-5 h-5 text-indigo-400" />
              {t.shift.acceptModalTitle}
            </h3>
            <p className="text-xs text-slate-300">
              {t.shift.acceptVerifyText} ({activeShift?.actual_cash?.toLocaleString()} {t.common.currency})
            </p>

            <div className="space-y-2 pt-2">
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={isDisputed}
                  onChange={e => setIsDisputed(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-950"
                />
                <span className="text-amber-400 font-medium">{t.shift.flagDispute}</span>
              </label>

              {isDisputed && (
                <textarea
                  rows={2}
                  placeholder={t.shift.disputeNotesPlaceholder}
                  value={disputeNotes}
                  onChange={e => setDisputeNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-white"
                />
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAcceptModal(false)}
                className="px-3 py-2 text-slate-400 hover:text-white text-xs"
              >
                {t.common.cancel}
              </button>
              <button
                onClick={handleAcceptHandover}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold"
              >
                {t.shift.confirmTakeover}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
