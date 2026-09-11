import React, { useState, useEffect } from 'react';
import { RepairTicket, User, ScrapItem, DiagnosticsItem } from '../types/erp';
import { api } from '../services/api';
import { useLanguage } from '../i18n/LanguageContext';
import { useToast } from '../context/ToastContext';
import { ThermalReceiptModal } from '../components/receipt/ThermalReceiptModal';
import { A4WarrantyCertificateModal } from '../components/invoices/A4WarrantyCertificateModal';
import { BootAmperageModal } from '../components/repair/BootAmperageModal';
import { DiodeReadingsModal } from '../components/repair/DiodeReadingsModal';
import { SerializerSyncModal } from '../components/repair/SerializerSyncModal';
import { RapidInspectionModal } from '../components/repair/RapidInspectionModal';
import { BoardviewModal } from '../components/repair/BoardviewModal';
import { PatternLockSelector } from '../components/repair/PatternLockSelector';
import { DeviceDamageCanvas } from '../components/repair/DeviceDamageCanvas';
import { KanbanBoard } from '../components/repair/KanbanBoard';
import { QAChecklistModal } from '../components/repair/QAChecklistModal';
import { PhotoTimelinePanel } from '../components/repair/PhotoTimelinePanel';
import { NotesTemplatePicker } from '../components/repair/NotesTemplatePicker';
import { QrTrackingModal } from '../components/repair/QrTrackingModal';
import {
  Wrench,
  Plus,
  Cpu,
  Sparkles,
  Search,
  ShieldCheck,
  Printer,
  Trash2,
  Award,
  FileCheck,
  Zap,
  Activity,
  Layers,
  LayoutGrid,
  Kanban as KanbanIcon,
  Send,
  Camera,
  QrCode,
  AlertTriangle
} from 'lucide-react';

interface RepairLabViewProps {
  users: User[];
}

export const RepairLabView: React.FC<RepairLabViewProps> = ({ users }) => {
  const { t, language } = useLanguage();
  const { showToast } = useToast();
  const isAr = language === 'ar';

  const [tickets, setTickets] = useState<RepairTicket[]>([]);
  const [activeTab, setActiveTab] = useState<'board' | 'scrap' | 'diagnostics' | 'technicians'>('board');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Modals
  const [showIntakeModal, setShowIntakeModal] = useState(false);
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [selectedTicketForOtp, setSelectedTicketForOtp] = useState<RepairTicket | null>(null);
  const [enteredOtp, setEnteredOtp] = useState('');

  // R1 State & Modals
  const [boardViewMode, setBoardViewMode] = useState<'kanban' | 'grid'>('kanban');
  const [showQaModal, setShowQaModal] = useState(false);
  const [selectedTicketForQa, setSelectedTicketForQa] = useState<RepairTicket | null>(null);
  const [showPhotosModal, setShowPhotosModal] = useState(false);
  const [selectedTicketForPhotos, setSelectedTicketForPhotos] = useState<RepairTicket | null>(null);
  const [showQrModal, setShowQrModal] = useState(false);
  const [selectedTicketForQr, setSelectedTicketForQr] = useState<RepairTicket | null>(null);
  const [showEstimateModal, setShowEstimateModal] = useState(false);
  const [selectedTicketForEstimate, setSelectedTicketForEstimate] = useState<RepairTicket | null>(null);
  const [estimateCostInput, setEstimateCostInput] = useState(0);
  const [estimateDiagInput, setEstimateDiagInput] = useState('');
  const [sendingEstimate, setSendingEstimate] = useState(false);

  // Available Inventory Parts for Stock Warnings
  const [availableParts, setAvailableParts] = useState<any[]>([]);
  const [selectedPartId, setSelectedPartId] = useState('');
  const [selectedPartWarning, setSelectedPartWarning] = useState<string | null>(null);

  // 70 Proposals Hardware Diagnostic Modals State
  const [activeAmperageTicket, setActiveAmperageTicket] = useState<RepairTicket | null>(null);
  const [activeDiodeTicket, setActiveDiodeTicket] = useState<RepairTicket | null>(null);
  const [activeSerializerTicket, setActiveSerializerTicket] = useState<RepairTicket | null>(null);
  const [activeInspectionTicket, setActiveInspectionTicket] = useState<RepairTicket | null>(null);
  const [activeBoardviewTicket, setActiveBoardviewTicket] = useState<RepairTicket | null>(null);

  const [receiptToPrint, setReceiptToPrint] = useState<{ text: string; phone?: string } | null>(null);
  const [warrantyCertData, setWarrantyCertData] = useState<any | null>(null);

  // Financials & Commission modal
  const [showFinancialsModal, setShowFinancialsModal] = useState(false);
  const [financialsForm, setFinancialsForm] = useState({ ticketId: '', labor: 0, parts: 0, techId: '' });

  // Scrap items & Diagnostics
  const [scrapItems, setScrapItems] = useState<ScrapItem[]>([]);
  const [diagnosticsList, setDiagnosticsList] = useState<DiagnosticsItem[]>([]);
  const [techPerformance, setTechPerformance] = useState<any[]>([]);

  // AI Diagnostic Query State
  const [aiForm, setAiForm] = useState({ brand: 'Apple', model: 'iPhone 13 Pro', symptoms: '', draw: '0.04A' });
  const [aiResult, setAiResult] = useState<any>(null);
  const [loadingAi, setLoadingAi] = useState(false);

  // New Intake Form
  const [intakeForm, setIntakeForm] = useState({
    customer_name: '',
    customer_phone: '',
    device_brand: 'Apple',
    device_model: 'iPhone 14 Pro',
    imei_sn: '',
    passcode: '',
    pattern_code: '',
    damage_points: [] as any[],
    physical_condition: 'خدوش خفيفة بالأركان، الظهر سليم، مؤشر الرطوبة أبيض',
    reported_defects: 'الشاشة مكسورة واللمس متوقف تماماً',
    intake_media_url: '',
    priority: 'NORMAL',
    estimated_cost: 3500,
    labor_charge: 600,
    assigned_tech_id: 'usr-tech-1',
    checklist: {
      power: true,
      screen: false,
      touch: false,
      cameras: true,
      faceId: true,
      charging: true,
      speaker: true
    }
  });

  const loadTickets = async () => {
    try {
      const data = await api.getTickets({ q: searchQuery, status: statusFilter || undefined });
      setTickets(data);
    } catch (e: any) {
      console.error(e);
    }
  };

  const loadScrap = async () => {
    try {
      const data = await api.getScrapParts();
      setScrapItems(data);
    } catch (e: any) {
      console.error(e);
    }
  };

  const loadDiagnostics = async () => {
    try {
      const data = await api.getDiagnostics();
      setDiagnosticsList(data);
    } catch (e: any) {
      console.error(e);
    }
  };

  const loadTechPerformance = async () => {
    try {
      const data = await api.getTechnicianPerformance();
      setTechPerformance(data);
    } catch (e: any) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadTickets();
  }, [searchQuery, statusFilter]);

  useEffect(() => {
    if (activeTab === 'scrap') loadScrap();
    if (activeTab === 'diagnostics') loadDiagnostics();
    if (activeTab === 'technicians') loadTechPerformance();
  }, [activeTab]);

  const handleCreateIntake = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.createTicket({
        ...intakeForm,
        checklist_json: intakeForm.checklist
      });
      setShowIntakeModal(false);
      loadTickets();
      showToast(isAr ? `تم تسجيل التذكرة #${res.ticket.ticket_number} وكود الاستلام ${res.releaseOtp}` : `Ticket #${res.ticket.ticket_number} created with OTP ${res.releaseOtp}`, 'success');
      if (res.receiptText) {
        setReceiptToPrint({ text: res.receiptText, phone: intakeForm.customer_phone });
      }
    } catch (err: any) {
      showToast(err.message || 'Intake creation failed', 'error');
    }
  };

  const loadAvailableParts = async () => {
    try {
      const res = await fetch('/api/repair/parts/available');
      if (res.ok) {
        const data = await res.json();
        setAvailableParts(data);
      }
    } catch (e) {
      console.error('Failed to load parts', e);
    }
  };

  useEffect(() => {
    loadAvailableParts();
  }, []);

  const handlePartSelected = (partId: string) => {
    setSelectedPartId(partId);
    const p = availableParts.find(item => item.id === partId);
    if (p) {
      if (p.isOutOfStock) {
        setSelectedPartWarning(isAr ? `⚠️ تنبيه هام: هذا الصنف غير متوفر تماماً بالمخزن (الرصيد: 0)` : `⚠️ CRITICAL: Part is completely OUT OF STOCK!`);
      } else if (p.isLowStock) {
        setSelectedPartWarning(isAr ? `⚠️ تنبيه: الصنف أوشك على النفاد من المخزن! (الرصيد المتبقي: ${p.stock_quantity}، حد إعادة الطلب: ${p.reorder_point})` : `⚠️ WARNING: Low stock! Current quantity (${p.stock_quantity}) <= reorder point (${p.reorder_point})`);
      } else {
        setSelectedPartWarning(null);
      }
    } else {
      setSelectedPartWarning(null);
    }
  };

  const handleUpdateStatus = async (ticketId: string, newStatus: string, qaChecklist?: any) => {
    try {
      const res = await fetch(`/api/repair/tickets/${ticketId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, qa_checklist: qaChecklist })
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to update ticket status');
      }

      showToast(isAr ? 'تم تحديث حالة تذكرة الصيانة بنجاح' : 'Ticket status updated', 'success');
      loadTickets();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleOpenQaForTicket = (ticket: RepairTicket) => {
    setSelectedTicketForQa(ticket);
    setShowQaModal(true);
  };

  const handleSubmitQaChecklist = async (checklist: Record<string, any>) => {
    if (!selectedTicketForQa) return;
    await handleUpdateStatus(selectedTicketForQa.id, 'READY', checklist);
  };

  const handleOpenEstimateModal = (ticket: RepairTicket) => {
    setSelectedTicketForEstimate(ticket);
    setEstimateCostInput(ticket.estimated_cost || 0);
    setEstimateDiagInput(ticket.reported_defects || '');
    setShowEstimateModal(true);
  };

  const handleSendEstimateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicketForEstimate) return;
    setSendingEstimate(true);
    try {
      const res = await fetch(`/api/repair/tickets/${selectedTicketForEstimate.id}/send-estimate`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cost_estimate: estimateCostInput,
          diagnosis: estimateDiagInput
        })
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to send estimate');
      }

      showToast(isAr ? 'تم إرسال المقايسة بنجاح عبر واتساب' : 'Estimate sent via WhatsApp', 'success');
      setShowEstimateModal(false);
      loadTickets();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setSendingEstimate(false);
    }
  };

  const handleSearchTickets = async (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      loadTickets();
      return;
    }
    try {
      const res = await fetch(`/api/repair/search?imei=${encodeURIComponent(query.trim())}`);
      if (res.ok) {
        const data = await res.json();
        setTickets(data);
      } else {
        loadTickets();
      }
    } catch {
      loadTickets();
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicketForOtp) return;
    try {
      const res = await api.verifyReleaseOtp(selectedTicketForOtp.id, enteredOtp);
      showToast(res.message, 'success');
      setShowOtpModal(false);
      setEnteredOtp('');
      handleUpdateStatus(selectedTicketForOtp.id, 'DELIVERED');
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleOpenWarrantyCert = async (ticket: RepairTicket) => {
    try {
      const store = await api.getStore();
      let cert: any = null;
      try {
        cert = await api.getWarrantyCertificate(ticket.id);
      } catch {
        cert = await api.createWarrantyCertificate(ticket.id);
      }
      setWarrantyCertData({ ticket, certificate: cert, store });
    } catch (err: any) {
      showToast(err.message || 'Failed to load warranty certificate', 'error');
    }
  };

  const handleDeleteTicket = async (ticketId: string) => {
    if (!window.confirm(isAr ? 'هل أنت متأكد من حذف هذه التذكرة؟ (حذف آمن قابل للاسترجاع)' : 'Are you sure you want to soft-delete this ticket?')) {
      return;
    }
    try {
      await api.deleteTicket(ticketId);
      showToast(isAr ? 'تم حذف التذكرة بنجاح' : 'Ticket soft-deleted', 'success');
      loadTickets();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleSaveFinancials = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.updateTicketFinancials(financialsForm.ticketId, {
        labor_charge: financialsForm.labor,
        parts_cost: financialsForm.parts,
        assigned_tech_id: financialsForm.techId
      });
      setShowFinancialsModal(false);
      loadTickets();
      showToast(`تم احتساب عمولة ${res.commissionDetails.calculatedCommission} ج.م للفني بنجاح`, 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleRunAiDiagnostic = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoadingAi(true);
    try {
      const res = await api.consultAiDiagnostics({
        device_brand: aiForm.brand,
        device_model: aiForm.model,
        observed_symptoms: aiForm.symptoms,
        current_draw: aiForm.draw
      });
      setAiResult(res.aiDiagnosis);
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setLoadingAi(false);
    }
  };

  const getSlaUrgency = (deadline?: string) => {
    if (!deadline) return { color: 'text-slate-400 bg-slate-800', label: 'بدون SLA' };
    const diff = new Date(deadline).getTime() - Date.now();
    const minutesLeft = Math.floor(diff / 60000);

    if (minutesLeft < 0) {
      return { color: 'text-rose-300 bg-rose-950 border border-rose-800 animate-pulse', label: `متأخر (منذ ${Math.abs(minutesLeft)} دقيقة)` };
    }
    if (minutesLeft <= 60) {
      return { color: 'text-amber-300 bg-amber-950 border border-amber-800', label: `مستعجل (متبقي ${minutesLeft} دقيقة)` };
    }
    return { color: 'text-emerald-300 bg-emerald-950 border border-emerald-800', label: `متبقي ${minutesLeft} دقيقة` };
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 select-text">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-wide flex items-center gap-2.5">
            <Wrench className="w-6 h-6 text-sky-400" />
            {t.repair.title}
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            {t.repair.subtitle}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-1 flex items-center gap-1">
            <button
              onClick={() => setActiveTab('board')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                activeTab === 'board' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              {t.repair.kanbanTab}
            </button>
            <button
              onClick={() => setActiveTab('scrap')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                activeTab === 'scrap' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              {t.repair.scrapTab} ({scrapItems.length})
            </button>
            <button
              onClick={() => setActiveTab('diagnostics')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                activeTab === 'diagnostics' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              {t.repair.diagnosticsTab}
            </button>
            <button
              onClick={() => setActiveTab('technicians')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                activeTab === 'technicians' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              {isAr ? 'تقييم وعمولات الفنيين' : 'Technicians & Commissions'}
            </button>
          </div>

          <button
            onClick={() => setShowIntakeModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold shadow-md shadow-sky-600/30 transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            {t.repair.newIntakeBtn}
          </button>
        </div>
      </div>

      {activeTab === 'board' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 p-3 rounded-xl border border-slate-800">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="w-4 h-4 text-slate-500 absolute start-3 top-2.5" />
              <input
                type="text"
                placeholder={t.repair.searchPlaceholder}
                value={searchQuery}
                onChange={e => handleSearchTickets(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg ps-9 pe-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-sky-500"
              />
            </div>

            <div className="flex items-center gap-3">
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="bg-slate-950 border border-slate-800 text-xs text-slate-300 rounded-lg px-3 py-2"
              >
                <option value="">{t.repair.allStatuses}</option>
                <option value="INTAKE">{t.repair.intakeStatus}</option>
                <option value="DIAGNOSING">{t.repair.diagnosingStatus}</option>
                <option value="WAITING_APPROVAL">{t.repair.waitingStatus}</option>
                <option value="IN_REPAIR">{t.repair.inRepairStatus}</option>
                <option value="READY">{t.repair.readyStatus}</option>
                <option value="DELIVERED">{t.repair.deliveredStatus}</option>
              </select>

              <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-1">
                <button
                  type="button"
                  onClick={() => setBoardViewMode('kanban')}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition cursor-pointer ${
                    boardViewMode === 'kanban' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                  }`}
                  title={isAr ? 'لوحة كانبان التفاعلية' : 'Interactive Kanban'}
                >
                  <KanbanIcon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{isAr ? 'كانبان' : 'Kanban'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setBoardViewMode('grid')}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition cursor-pointer ${
                    boardViewMode === 'grid' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                  }`}
                  title={isAr ? 'عرض بطاقات شبكي' : 'Grid Cards'}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{isAr ? 'شبكة' : 'Grid'}</span>
                </button>
              </div>
            </div>
          </div>

          {boardViewMode === 'kanban' ? (
            <KanbanBoard
              tickets={tickets}
              onUpdateStatus={async (ticketId, targetStatus) => {
                await handleUpdateStatus(ticketId, targetStatus);
              }}
              onOpenQaChecklist={(ticket) => {
                setSelectedTicketForQa(ticket);
                setShowQaModal(true);
              }}
              onOpenOtp={(ticket) => {
                setSelectedTicketForOtp(ticket);
                setShowOtpModal(true);
              }}
              onOpenPhotos={(ticket) => {
                setSelectedTicketForPhotos(ticket);
                setShowPhotosModal(true);
              }}
              onOpenQr={(ticket) => {
                setSelectedTicketForQr(ticket);
                setShowQrModal(true);
              }}
              onOpenFinancials={(ticket) => {
                setFinancialsForm({
                  ticketId: ticket.id,
                  labor: ticket.labor_charge,
                  parts: ticket.parts_cost,
                  techId: ticket.assigned_tech_id || ''
                });
                setShowFinancialsModal(true);
              }}
              onOpenWarranty={(ticket) => {
                handleOpenWarrantyCert(ticket);
              }}
              onSendEstimate={(ticket) => {
                handleOpenEstimateModal(ticket);
              }}
              onDeleteTicket={(ticketId) => {
                handleDeleteTicket(ticketId);
              }}
              isAr={isAr}
            />
          ) : (
            /* Tickets Cards Grid */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {tickets.map(ticket => {
                const sla = getSlaUrgency(ticket.sla_deadline);

                return (
                  <div
                    key={ticket.id}
                    className={`bg-slate-900 border rounded-xl p-4 shadow-xl flex flex-col justify-between space-y-3 transition ${
                      ticket.priority === 'URGENT' ? 'border-amber-700/60 bg-amber-950/10' : 'border-slate-800'
                    }`}
                  >
                    <div>
                      {/* Header */}
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-white text-sm">#{ticket.ticket_number}</span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              ticket.priority === 'URGENT' ? 'bg-amber-950 text-amber-300 border border-amber-800' :
                              ticket.priority === 'VIP' ? 'bg-purple-950 text-purple-300 border border-purple-800' :
                              'bg-slate-800 text-slate-400'
                            }`}>
                              {ticket.priority}
                            </span>
                          </div>
                          <h4 className="font-bold text-white text-sm mt-1">{ticket.device_brand} {ticket.device_model}</h4>
                        </div>

                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${sla.color}`}>
                          {sla.label}
                        </span>
                      </div>

                      {/* Customer & IMEI */}
                      <div className="mt-2 text-xs space-y-0.5 text-slate-300">
                        <p className="font-medium text-slate-200">العميل: {ticket.customer_name} ({ticket.customer_phone})</p>
                        {ticket.imei_sn && <p className="font-mono text-[11px] text-slate-400">IMEI: {ticket.imei_sn}</p>}
                        <p className="text-[11px] text-slate-400 line-clamp-2 mt-1">العطل: {ticket.reported_defects}</p>
                      </div>
                    </div>

                    {/* Footer & Actions */}
                    <div className="pt-3 border-t border-slate-800 space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-bold text-emerald-400 font-mono text-sm">
                          {ticket.estimated_cost} {t.common.currency}
                        </span>
                        <select
                          value={ticket.status}
                          onChange={e => {
                            if (e.target.value === 'DELIVERED') {
                              setSelectedTicketForOtp(ticket);
                              setShowOtpModal(true);
                            } else if (e.target.value === 'READY') {
                              handleOpenQaForTicket(ticket);
                            } else {
                              handleUpdateStatus(ticket.id, e.target.value);
                            }
                          }}
                          className="bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded px-2 py-1"
                        >
                          <option value="INTAKE">استلام جديد</option>
                          <option value="DIAGNOSING">فحص وتشخيص</option>
                          <option value="WAITING_APPROVAL">انتظار موافقة العميل</option>
                          <option value="IN_REPAIR">قيد الصيانة</option>
                          <option value="READY">جاهز للتسليم</option>
                          <option value="DELIVERED">تم التسليم</option>
                        </select>
                      </div>

                      {/* Diagnostic Lab Quick Tools (Proposals 1, 2, 3, 6, 33) */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-800/80">
                        <button
                          onClick={() => setActiveAmperageTicket(ticket)}
                          className="flex items-center gap-1 px-2 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded text-[10px] font-medium transition cursor-pointer"
                          title="راسم منحنى سحب التيار DC (Boot Amperage)"
                        >
                          <Zap className="w-3 h-3 text-amber-400" />
                          <span>منحنى الإقلاع</span>
                        </button>

                        <button
                          onClick={() => setActiveDiodeTicket(ticket)}
                          className="flex items-center gap-1 px-2 py-1 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 rounded text-[10px] font-medium transition cursor-pointer"
                          title="مقارنة ممانعات الملتيميتر (Diode Mode)"
                        >
                          <Activity className="w-3 h-3 text-cyan-400" />
                          <span>الدايود</span>
                        </button>

                        <button
                          onClick={() => setActiveSerializerTicket(ticket)}
                          className="flex items-center gap-1 px-2 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded text-[10px] font-medium transition cursor-pointer"
                          title="مزامنة سيريال TrueTone و BMS البطارية"
                        >
                          <Cpu className="w-3 h-3 text-emerald-400" />
                          <span>TrueTone / BMS</span>
                        </button>

                        <button
                          onClick={() => setActiveInspectionTicket(ticket)}
                          className="flex items-center gap-1 px-2 py-1 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded text-[10px] font-medium transition cursor-pointer"
                          title="الفحص الرقمي الشامل 24 نقطة"
                        >
                          <ShieldCheck className="w-3 h-3 text-indigo-400" />
                          <span>فحص 24 نقطة</span>
                        </button>

                        <button
                          onClick={() => setActiveBoardviewTicket(ticket)}
                          className="flex items-center gap-1 px-2 py-1 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded text-[10px] font-medium transition cursor-pointer"
                          title="مخطط البوردة الإلكتروني (Boardview & PDF)"
                        >
                          <Layers className="w-3 h-3 text-purple-400" />
                          <span>المخطط</span>
                        </button>
                      </div>

                      <div className="flex items-center justify-between gap-1 pt-1 text-xs">
                        <button
                          onClick={() => {
                            setFinancialsForm({
                              ticketId: ticket.id,
                              labor: ticket.labor_charge,
                              parts: ticket.parts_cost,
                              techId: ticket.assigned_tech_id || ''
                            });
                            setShowFinancialsModal(true);
                          }}
                          className="text-[11px] text-sky-400 hover:underline"
                        >
                          حساب العمولة ({ticket.tech_commission} ج.م)
                        </button>

                        <div className="flex items-center gap-1">
                          {/* Send WhatsApp Pre-Auth Estimate */}
                          <button
                            onClick={() => handleOpenEstimateModal(ticket)}
                            className="p-1.5 text-emerald-400 hover:text-emerald-300 hover:bg-slate-800 rounded transition-colors"
                            title="إرسال مقايسة واتساب للعميل"
                          >
                            <Send className="w-3.5 h-3.5" />
                          </button>
                          {/* Photo Timeline */}
                          <button
                            onClick={() => {
                              setSelectedTicketForPhotos(ticket);
                              setShowPhotosModal(true);
                            }}
                            className="p-1.5 text-sky-400 hover:text-sky-300 hover:bg-slate-800 rounded transition-colors"
                            title="معرض صور الجهاز (قبل / أثناء / بعد)"
                          >
                            <Camera className="w-3.5 h-3.5" />
                          </button>
                          {/* QR Code Portal Tracking */}
                          <button
                            onClick={() => {
                              setSelectedTicketForQr(ticket);
                              setShowQrModal(true);
                            }}
                            className="p-1.5 text-indigo-400 hover:text-indigo-300 hover:bg-slate-800 rounded transition-colors"
                            title="باركود التتبع الفوري للعميل"
                          >
                            <QrCode className="w-3.5 h-3.5" />
                          </button>
                          {/* QA Checklist */}
                          <button
                            onClick={() => handleOpenQaForTicket(ticket)}
                            className="p-1.5 text-purple-400 hover:text-purple-300 hover:bg-slate-800 rounded transition-colors"
                            title="فحص الجودة (QA)"
                          >
                            <ShieldCheck className="w-3.5 h-3.5" />
                          </button>
                          {/* A4 Warranty Certificate Button */}
                          {(ticket.status === 'READY' || ticket.status === 'DELIVERED') && (
                            <button
                              onClick={() => handleOpenWarrantyCert(ticket)}
                              className="p-1.5 text-emerald-400 hover:bg-slate-800 rounded transition-colors"
                              title="طباعة شهادة ضمان صيانة A4"
                            >
                              <FileCheck className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => {
                              const receipt = `Alpha Mobile Lab\nTicket #${ticket.ticket_number}\nModel: ${ticket.device_model}\nIMEI: ${ticket.imei_sn}\nCost: ${ticket.estimated_cost} EGP\nRelease OTP: ${ticket.release_otp}`;
                              setReceiptToPrint({ text: receipt, phone: ticket.customer_phone });
                            }}
                            className="p-1.5 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors"
                            title="طباعة إيصال استلام حراري"
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteTicket(ticket.id)}
                            className="p-1.5 text-slate-500 hover:text-rose-400 rounded hover:bg-slate-800 transition-colors"
                            title="حذف التذكرة"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Technician Performance Tab */}
      {activeTab === 'technicians' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h3 className="font-semibold text-white text-base flex items-center gap-2">
                <Award className="w-5 h-5 text-amber-400" />
                {isAr ? 'تقييم أداء مهندسي الصيانة ومحفظة العمولات' : 'Technician Performance & Commission Ledger'}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {isAr ? 'تتبع لحظي للإنتاجية والعمولات المستحقة عن التذاكر المكتملة' : 'Real-time commission tracker based on completed tickets.'}
              </p>
            </div>
          </div>

          <table className="w-full text-start text-xs text-slate-300">
            <thead className="bg-slate-950 text-slate-400 uppercase font-semibold border-b border-slate-800 text-[11px]">
              <tr>
                <th className="px-4 py-3">اسم المهندس</th>
                <th className="px-4 py-3">نسبة العمولة</th>
                <th className="px-4 py-3">إجمالي التذاكر المسندة</th>
                <th className="px-4 py-3">التذاكر المنجزة المسلمة</th>
                <th className="px-4 py-3">إجمالي العمولات المستحقة</th>
                <th className="px-4 py-3">متوسط وقت الإصلاح (TAT)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {techPerformance.map(tech => (
                <tr key={tech.id} className="hover:bg-slate-800/40">
                  <td className="px-4 py-3 font-semibold text-white">{tech.name}</td>
                  <td className="px-4 py-3 font-mono font-bold text-indigo-400">{(tech.commission_rate * 100).toFixed(0)}%</td>
                  <td className="px-4 py-3 font-mono">{tech.total_assigned}</td>
                  <td className="px-4 py-3 font-mono text-emerald-400 font-bold">{tech.completed_tickets}</td>
                  <td className="px-4 py-3 font-mono font-bold text-amber-300 text-sm">
                    {tech.earned_commissions.toLocaleString()} ج.م
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-400">
                    {tech.avg_tat_minutes ? `${tech.avg_tat_minutes} دقيقة` : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Scrap Warehouse Tab */}
      {activeTab === 'scrap' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h3 className="font-semibold text-white text-base flex items-center gap-2">
                <Cpu className="w-5 h-5 text-sky-400" />
                {t.repair.scrapTitle}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {t.repair.scrapDesc}
              </p>
            </div>
          </div>

          <table className="w-full text-start text-xs text-slate-300">
            <thead className="bg-slate-950 text-slate-400 uppercase font-semibold border-b border-slate-800 text-[11px]">
              <tr>
                <th className="px-4 py-3">كود الباركود</th>
                <th className="px-4 py-3">{t.repair.donorModel}</th>
                <th className="px-4 py-3">{t.repair.partName}</th>
                <th className="px-4 py-3">{t.repair.conditionGrade}</th>
                <th className="px-4 py-3">{t.repair.estValue}</th>
                <th className="px-4 py-3">{t.common.status}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {scrapItems.map(s => (
                <tr key={s.id} className="hover:bg-slate-800/40">
                  <td className="px-4 py-3 font-mono text-indigo-400">{s.barcode_label}</td>
                  <td className="px-4 py-3 font-semibold text-white">{s.donor_device_model}</td>
                  <td className="px-4 py-3 text-slate-200">{s.part_name}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-sky-300 border border-slate-700">
                      {s.condition_grade}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono font-bold text-emerald-400">{s.estimated_value} {t.common.currency}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">
                      {t.repair.testedWorking}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* AI Diagnostics Tab */}
      {activeTab === 'diagnostics' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
              <Sparkles className="w-5 h-5 text-indigo-400" />
              <h3 className="font-semibold text-white text-sm">{t.repair.aiTitle}</h3>
            </div>

            <form onSubmit={handleRunAiDiagnostic} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 mb-1">{t.repair.model}</label>
                <input
                  type="text"
                  value={aiForm.model}
                  onChange={e => setAiForm({ ...aiForm, model: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-white"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1">{t.repair.dcDrawLabel}</label>
                <input
                  type="text"
                  placeholder="e.g. 0.05A standby, 0.45A pulsating"
                  value={aiForm.draw}
                  onChange={e => setAiForm({ ...aiForm, draw: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1">{t.repair.symptomsLabel}</label>
                <textarea
                  rows={3}
                  placeholder="مثال: شاشة بيضاء بدون بيانات، قاطع صوت، رطوبة قرب آي سي الشحن..."
                  value={aiForm.symptoms}
                  onChange={e => setAiForm({ ...aiForm, symptoms: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-white"
                />
              </div>

              <button
                type="submit"
                disabled={loadingAi}
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-semibold flex items-center justify-center gap-2 cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                {loadingAi ? t.common.loading : t.repair.runAiBtn}
              </button>
            </form>

            {aiResult && (
              <div className="mt-4 p-3 bg-slate-950 border border-indigo-800/60 rounded-lg text-xs space-y-2">
                <span className="font-bold text-indigo-300 block">{t.repair.aiRecommendation}</span>
                <ul className="list-disc ps-4 space-y-1 text-slate-300">
                  {aiResult.guidance.map((g: string, idx: number) => (
                    <li key={idx} className="whitespace-pre-wrap">{g}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
            <h3 className="font-semibold text-white text-sm border-b border-slate-800 pb-3">
              {t.repair.hardwareDbTitle}
            </h3>

            <div className="space-y-3">
              {diagnosticsList.map(kb => (
                <div key={kb.id} className="p-4 rounded-lg bg-slate-950 border border-slate-800 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sky-300">{kb.device_brand} {kb.device_model}</span>
                    <span className="font-mono text-slate-400 bg-slate-800 px-2 py-0.5 rounded text-[10px]">
                      {kb.schematic_reference}
                    </span>
                  </div>
                  <div className="font-medium text-white">{kb.symptom}</div>
                  {kb.diode_readings && (
                    <div className="p-2 rounded bg-slate-900 font-mono text-[11px] text-amber-300">
                      ⚡ Diode Mode: {kb.diode_readings}
                    </div>
                  )}
                  <p className="text-slate-300 whitespace-pre-line text-[11px] bg-slate-900/50 p-2 rounded">
                    {kb.diagnostic_steps}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Intake Wizard Modal */}
      {showIntakeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-2xl w-full my-8 space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="font-semibold text-white text-base flex items-center gap-2">
              <Plus className="w-5 h-5 text-sky-400" />
              {t.repair.wizardTitle}
            </h3>

            <form onSubmit={handleCreateIntake} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">{t.repair.clientName}</label>
                  <input
                    type="text"
                    required
                    value={intakeForm.customer_name}
                    onChange={e => setIntakeForm({ ...intakeForm, customer_name: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">{t.repair.clientPhone}</label>
                  <input
                    type="text"
                    required
                    value={intakeForm.customer_phone}
                    onChange={e => setIntakeForm({ ...intakeForm, customer_phone: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">{t.repair.brand}</label>
                  <select
                    value={intakeForm.device_brand}
                    onChange={e => setIntakeForm({ ...intakeForm, device_brand: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-white"
                  >
                    <option value="Apple">Apple (آيفون)</option>
                    <option value="Samsung">Samsung (سامسونج)</option>
                    <option value="Xiaomi">Xiaomi (شاومي)</option>
                    <option value="Oppo">Oppo (أوبو)</option>
                    <option value="Realme">Realme (ريلمي)</option>
                    <option value="Huawei">Huawei (هواوي)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">{t.repair.model}</label>
                  <input
                    type="text"
                    required
                    value={intakeForm.device_model}
                    onChange={e => setIntakeForm({ ...intakeForm, device_model: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">{t.repair.imeiSn}</label>
                  <input
                    type="text"
                    value={intakeForm.imei_sn}
                    onChange={e => setIntakeForm({ ...intakeForm, imei_sn: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">{t.repair.passcode}</label>
                  <input
                    type="text"
                    value={intakeForm.passcode}
                    onChange={e => setIntakeForm({ ...intakeForm, passcode: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-white font-mono"
                  />
                </div>
              </div>

              {/* Pattern Lock Selector & Interactive Damage Canvas (Proposals 36 & 37) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-3 bg-slate-950/70 border border-slate-800 rounded-xl">
                <div>
                  <label className="block text-slate-300 font-medium mb-1.5 flex items-center justify-between">
                    <span>{isAr ? 'نمط قفل الشاشة (Touch Pattern)' : 'Touch Pattern Lock'}</span>
                    {intakeForm.pattern_code && (
                      <span className="text-[10px] font-mono text-emerald-400">
                        {isAr ? `النمط: ${intakeForm.pattern_code}` : `Nodes: ${intakeForm.pattern_code}`}
                      </span>
                    )}
                  </label>
                  <div className="flex justify-center p-2 bg-slate-900/80 rounded-lg border border-slate-800">
                    <PatternLockSelector
                      value={intakeForm.pattern_code}
                      onChange={code => setIntakeForm({ ...intakeForm, pattern_code: code })}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1.5 flex items-center justify-between">
                    <span>{isAr ? 'مخطط الصدمات والكسور (2D Canvas)' : 'Device Damage Canvas'}</span>
                    <span className="text-[10px] text-slate-400">{isAr ? 'انقر لتحديد الصدمات' : 'Click to pin damage'}</span>
                  </label>
                  <div className="flex justify-center p-2 bg-slate-900/80 rounded-lg border border-slate-800">
                    <DeviceDamageCanvas
                      value={intakeForm.damage_points || []}
                      onChange={points => setIntakeForm({ ...intakeForm, damage_points: points })}
                    />
                  </div>
                </div>
              </div>

              {/* Physical Checklist */}
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
                <span className="font-semibold text-slate-300 block">{t.repair.checklistTitle}</span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {Object.entries(intakeForm.checklist).map(([key, val]) => (
                    <label key={key} className="flex items-center gap-2 text-slate-300">
                      <input
                        type="checkbox"
                        checked={val}
                        onChange={e =>
                          setIntakeForm({
                            ...intakeForm,
                            checklist: { ...intakeForm.checklist, [key]: e.target.checked }
                          })
                        }
                        className="rounded border-slate-700 bg-slate-900"
                      />
                      <span>
                        {key === 'power' ? t.repair.powerCheck :
                         key === 'screen' ? t.repair.screenCheck :
                         key === 'touch' ? t.repair.touchCheck :
                         key === 'cameras' ? t.repair.camerasCheck :
                         key === 'faceId' ? t.repair.faceIdCheck :
                         key === 'charging' ? t.repair.chargingCheck :
                         t.repair.speakerCheck}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">{t.repair.reportedDefects}</label>
                <textarea
                  rows={2}
                  required
                  value={intakeForm.reported_defects}
                  onChange={e => setIntakeForm({ ...intakeForm, reported_defects: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-white"
                />
              </div>

              {/* Repair Notes Templates Library (R1.10) */}
              <div>
                <NotesTemplatePicker
                  onSelectTemplate={(content) => {
                    setIntakeForm(prev => ({
                      ...prev,
                      reported_defects: prev.reported_defects
                        ? `${prev.reported_defects}\n- ${content}`
                        : content
                    }));
                  }}
                  isAr={isAr}
                />
              </div>

              {/* Spare Part Inventory & Live Stock Warnings (R1.9) */}
              <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-lg space-y-1.5">
                <label className="block text-slate-300 font-medium">
                  {isAr ? 'قطعة الغيار المطلوبة (فحص المخزون الفوري)' : 'Required Spare Part (Live Inventory Check)'}
                </label>
                <select
                  value={selectedPartId}
                  onChange={e => handlePartSelected(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white text-xs"
                >
                  <option value="">{isAr ? '-- اختر قطعة غيار (اختياري) --' : '-- Select Spare Part (Optional) --'}</option>
                  {availableParts.map(part => (
                    <option key={part.id} value={part.id}>
                      {part.name} ({part.sku}) - {isAr ? `الرصيد: ${part.stock_quantity}` : `Stock: ${part.stock_quantity}`}
                    </option>
                  ))}
                </select>
                {selectedPartWarning && (
                  <div className="mt-1 p-2 bg-amber-950/60 border border-amber-800 text-amber-300 rounded text-xs flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>{selectedPartWarning}</span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">{t.repair.priority}</label>
                  <select
                    value={intakeForm.priority}
                    onChange={e => setIntakeForm({ ...intakeForm, priority: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-white"
                  >
                    <option value="NORMAL">{t.repair.priorityNormal}</option>
                    <option value="URGENT">{t.repair.priorityUrgent}</option>
                    <option value="VIP">{t.repair.priorityVip}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">{t.repair.estCost}</label>
                  <input
                    type="number"
                    value={intakeForm.estimated_cost}
                    onChange={e => setIntakeForm({ ...intakeForm, estimated_cost: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">{t.repair.assignTech}</label>
                  <select
                    value={intakeForm.assigned_tech_id}
                    onChange={e => setIntakeForm({ ...intakeForm, assigned_tech_id: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-white"
                  >
                    {users.filter(u => u.role === 'MaintenanceEngineer').map(u => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowIntakeModal(false)}
                  className="px-4 py-2 text-slate-400 hover:text-white cursor-pointer"
                >
                  {t.common.cancel}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded font-semibold cursor-pointer"
                >
                  {t.repair.confirmIntake}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* OTP Delivery Verification Modal */}
      {showOtpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-sm w-full space-y-4">
            <h3 className="font-semibold text-white text-base flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              {t.repair.otpModalTitle}
            </h3>
            <p className="text-xs text-slate-300">
              {t.repair.otpDesc} (#{selectedTicketForOtp?.ticket_number}).
            </p>
            <form onSubmit={handleVerifyOtp} className="space-y-3">
              <input
                type="text"
                maxLength={4}
                required
                placeholder="4-digit OTP"
                value={enteredOtp}
                onChange={e => setEnteredOtp(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-center text-xl font-mono tracking-widest text-white focus:border-emerald-500"
              />
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowOtpModal(false)}
                  className="px-3 py-2 text-slate-400 hover:text-white text-xs cursor-pointer"
                >
                  {t.common.cancel}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold cursor-pointer"
                >
                  {t.repair.verifyBtn}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Financials & Commission Modal */}
      {showFinancialsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-md w-full space-y-4 text-xs">
            <h3 className="font-semibold text-white text-base">تحديث المصنعية وعمولة مهندس الصيانة</h3>
            <form onSubmit={handleSaveFinancials} className="space-y-3">
              <div>
                <label className="block text-slate-300 mb-1">{t.repair.laborCharge}</label>
                <input
                  type="number"
                  value={financialsForm.labor}
                  onChange={e => setFinancialsForm({ ...financialsForm, labor: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-300 mb-1">تكلفة قطع الغيار المستهلكة (ج.م)</label>
                <input
                  type="number"
                  value={financialsForm.parts}
                  onChange={e => setFinancialsForm({ ...financialsForm, parts: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-300 mb-1">{t.repair.assignTech}</label>
                <select
                  value={financialsForm.techId}
                  onChange={e => setFinancialsForm({ ...financialsForm, techId: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-white"
                >
                  {users.filter(u => u.role === 'MaintenanceEngineer').map(u => (
                    <option key={u.id} value={u.id}>
                      {u.name} (عمولة {(u.commission_rate * 100).toFixed(0)}%)
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowFinancialsModal(false)}
                  className="px-3 py-2 text-slate-400 hover:text-white cursor-pointer"
                >
                  {t.common.cancel}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-medium cursor-pointer"
                >
                  {t.common.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ESC/POS Thermal Receipt Modal */}
      {receiptToPrint && (
        <ThermalReceiptModal
          receiptText={receiptToPrint.text}
          customerPhone={receiptToPrint.phone}
          title="إيصال استلام جهاز صيانة وباركود الفحص"
          onClose={() => setReceiptToPrint(null)}
        />
      )}

      {/* A4 Certified Warranty Certificate Modal */}
      {warrantyCertData && (
        <A4WarrantyCertificateModal
          isOpen={!!warrantyCertData}
          certificateData={warrantyCertData}
          onClose={() => setWarrantyCertData(null)}
        />
      )}

      {/* 70 Proposals Hardware Diagnostic Modals */}
      {activeAmperageTicket && (
        <BootAmperageModal
          isOpen={true}
          onClose={() => setActiveAmperageTicket(null)}
          ticketId={activeAmperageTicket.id}
          deviceModel={`${activeAmperageTicket.device_brand} ${activeAmperageTicket.device_model}`}
        />
      )}

      {activeDiodeTicket && (
        <DiodeReadingsModal
          isOpen={true}
          onClose={() => setActiveDiodeTicket(null)}
          deviceModel={activeDiodeTicket.device_model}
        />
      )}

      {activeSerializerTicket && (
        <SerializerSyncModal
          isOpen={true}
          onClose={() => setActiveSerializerTicket(null)}
          ticketId={activeSerializerTicket.id}
          deviceSerial={activeSerializerTicket.imei_sn}
        />
      )}

      {activeInspectionTicket && (
        <RapidInspectionModal
          isOpen={true}
          onClose={() => setActiveInspectionTicket(null)}
          ticketId={activeInspectionTicket.id}
          deviceModel={`${activeInspectionTicket.device_brand} ${activeInspectionTicket.device_model}`}
        />
      )}

      {activeBoardviewTicket && (
        <BoardviewModal
          isOpen={true}
          onClose={() => setActiveBoardviewTicket(null)}
          deviceModel={activeBoardviewTicket.device_model}
        />
      )}

      {/* R1 Post-Repair QA Checklist Enforcement Modal */}
      {showQaModal && selectedTicketForQa && (
        <QAChecklistModal
          isOpen={showQaModal}
          ticket={selectedTicketForQa}
          onClose={() => {
            setShowQaModal(false);
            setSelectedTicketForQa(null);
          }}
          onSubmit={handleSubmitQaChecklist}
          isAr={isAr}
        />
      )}

      {/* R1 Photo Evidence Timeline Panel (Before/During/After) */}
      {showPhotosModal && selectedTicketForPhotos && (
        <PhotoTimelinePanel
          isOpen={showPhotosModal}
          ticket={selectedTicketForPhotos}
          onClose={() => {
            setShowPhotosModal(false);
            setSelectedTicketForPhotos(null);
          }}
          isAr={isAr}
        />
      )}

      {/* R1 QR Code Customer Tracking Modal */}
      {showQrModal && selectedTicketForQr && (
        <QrTrackingModal
          isOpen={showQrModal}
          ticket={selectedTicketForQr}
          onClose={() => {
            setShowQrModal(false);
            setSelectedTicketForQr(null);
          }}
          isAr={isAr}
        />
      )}

      {/* R1 WhatsApp Cost Estimate Pre-Authorization Modal */}
      {showEstimateModal && selectedTicketForEstimate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 max-w-md w-full space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-semibold text-white text-base flex items-center gap-2">
                <Send className="w-4 h-4 text-emerald-400" />
                {isAr ? 'إرسال مقايسة تكلفة عبر واتساب للموافقة المسبقة' : 'WhatsApp Cost Pre-Authorization'}
              </h3>
            </div>

            <form onSubmit={handleSendEstimateSubmit} className="space-y-3">
              <div>
                <label className="block text-slate-300 mb-1">
                  {isAr ? 'رقم التذكرة والعميل' : 'Ticket & Customer'}
                </label>
                <div className="p-2.5 bg-slate-950 border border-slate-800 rounded text-slate-300">
                  <p className="font-semibold text-white">#{selectedTicketForEstimate.ticket_number} - {selectedTicketForEstimate.customer_name}</p>
                  <p className="text-[11px] text-slate-400 font-mono mt-0.5">{selectedTicketForEstimate.customer_phone}</p>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 mb-1">
                  {isAr ? 'قيمة المقايسة التقديرية (ج.م)' : 'Estimated Cost (EGP)'}
                </label>
                <input
                  type="number"
                  required
                  min={0}
                  value={estimateCostInput}
                  onChange={e => setEstimateCostInput(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-white font-mono text-sm"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1">
                  {isAr ? 'التشخيص وتفاصيل الإصلاح المطلوبة' : 'Diagnostic & Repair Details'}
                </label>
                <textarea
                  rows={3}
                  required
                  value={estimateDiagInput}
                  onChange={e => setEstimateDiagInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-white"
                  placeholder="وصف تفصيلي للأعطال والقطع المطلوب استبدالها للعميل..."
                />
              </div>

              <div className="p-2.5 bg-emerald-950/40 border border-emerald-800/60 rounded text-emerald-300 text-[11px] space-y-1">
                <p className="font-semibold">📲 سيتم إرسال رسالة واتساب رسمية للعميل متضمنة:</p>
                <p>• تفاصيل التكلفة التقديرية والتشخيص</p>
                <p>• رابط تتبع التذكرة المباشر وبوابة الاعتماد الإلكترونية</p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEstimateModal(false)}
                  className="px-3 py-2 text-slate-400 hover:text-white cursor-pointer"
                >
                  {t.common.cancel}
                </button>
                <button
                  type="submit"
                  disabled={sendingEstimate}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded font-medium flex items-center gap-1.5 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{sendingEstimate ? (isAr ? 'جارِ الإرسال...' : 'Sending...') : (isAr ? 'إرسال المقايسة الآن' : 'Send Estimate')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
