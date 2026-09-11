import React, { useState } from 'react';
import {
  DndContext,
  useDraggable,
  useDroppable,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent
} from '@dnd-kit/core';
import { RepairTicket } from '../../types/erp';
import {
  Wrench,
  Clock,
  User,
  Phone,
  AlertTriangle,
  CheckCircle2,
  Camera,
  ShieldCheck,
  QrCode,
  Send,
  DollarSign,
  Award,
  Trash2,
  GripVertical,
  ExternalLink
} from 'lucide-react';

export interface KanbanColumnDef {
  id: string;
  statuses: string[];
  targetStatus: string;
  titleAr: string;
  titleEn: string;
  color: string;
  headerBg: string;
  badgeBg: string;
}

export const KANBAN_COLUMNS: KanbanColumnDef[] = [
  {
    id: 'col-received',
    statuses: ['RECEIVED', 'INTAKE'],
    targetStatus: 'INTAKE',
    titleAr: 'استلام جديد',
    titleEn: 'Received',
    color: 'border-slate-700',
    headerBg: 'bg-slate-800/80 text-slate-200',
    badgeBg: 'bg-slate-700 text-slate-200'
  },
  {
    id: 'col-diagnosed',
    statuses: ['DIAGNOSED', 'DIAGNOSING'],
    targetStatus: 'DIAGNOSING',
    titleAr: 'فحص وتشخيص',
    titleEn: 'Diagnosed',
    color: 'border-amber-700/60',
    headerBg: 'bg-amber-950/60 text-amber-300',
    badgeBg: 'bg-amber-900/60 text-amber-300'
  },
  {
    id: 'col-repair',
    statuses: ['IN_REPAIR', 'IN_PROGRESS'],
    targetStatus: 'IN_REPAIR',
    titleAr: 'قيد الصيانة',
    titleEn: 'In Repair',
    color: 'border-sky-700/60',
    headerBg: 'bg-sky-950/60 text-sky-300',
    badgeBg: 'bg-sky-900/60 text-sky-300'
  },
  {
    id: 'col-qa',
    statuses: ['QA', 'WAITING_APPROVAL'],
    targetStatus: 'WAITING_APPROVAL',
    titleAr: 'فحص الجودة (QA)',
    titleEn: 'Quality Assurance',
    color: 'border-purple-700/60',
    headerBg: 'bg-purple-950/60 text-purple-300',
    badgeBg: 'bg-purple-900/60 text-purple-300'
  },
  {
    id: 'col-ready',
    statuses: ['READY'],
    targetStatus: 'READY',
    titleAr: 'جاهز للتسليم',
    titleEn: 'Ready for Pickup',
    color: 'border-emerald-700/60',
    headerBg: 'bg-emerald-950/60 text-emerald-300',
    badgeBg: 'bg-emerald-900/60 text-emerald-300'
  },
  {
    id: 'col-delivered',
    statuses: ['DELIVERED'],
    targetStatus: 'DELIVERED',
    titleAr: 'تم التسليم',
    titleEn: 'Delivered',
    color: 'border-teal-700/60',
    headerBg: 'bg-teal-950/60 text-teal-300',
    badgeBg: 'bg-teal-900/60 text-teal-300'
  }
];

interface KanbanBoardProps {
  tickets: RepairTicket[];
  onUpdateStatus: (ticketId: string, targetStatus: string) => Promise<void>;
  onOpenQaChecklist: (ticket: RepairTicket) => void;
  onOpenOtp: (ticket: RepairTicket) => void;
  onOpenPhotos: (ticket: RepairTicket) => void;
  onOpenQr: (ticket: RepairTicket) => void;
  onOpenFinancials: (ticket: RepairTicket) => void;
  onOpenWarranty: (ticket: RepairTicket) => void;
  onSendEstimate: (ticket: RepairTicket) => void;
  onDeleteTicket: (ticketId: string) => void;
  isAr?: boolean;
}

// Draggable Card Component
const DraggableTicketCard: React.FC<{
  ticket: RepairTicket;
  onOpenQaChecklist: (ticket: RepairTicket) => void;
  onOpenOtp: (ticket: RepairTicket) => void;
  onOpenPhotos: (ticket: RepairTicket) => void;
  onOpenQr: (ticket: RepairTicket) => void;
  onOpenFinancials: (ticket: RepairTicket) => void;
  onOpenWarranty: (ticket: RepairTicket) => void;
  onSendEstimate: (ticket: RepairTicket) => void;
  onDeleteTicket: (ticketId: string) => void;
  isAr: boolean;
}> = ({
  ticket,
  onOpenQaChecklist,
  onOpenOtp,
  onOpenPhotos,
  onOpenQr,
  onOpenFinancials,
  onOpenWarranty,
  onSendEstimate,
  onDeleteTicket,
  isAr
}) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: ticket.id,
    data: { ticket }
  });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: 999
      }
    : undefined;

  const getSlaInfo = (deadline?: string) => {
    if (!deadline) return { label: isAr ? 'بدون SLA' : 'No SLA', color: 'text-slate-400 bg-slate-800' };
    const diff = new Date(deadline).getTime() - Date.now();
    const minutesLeft = Math.floor(diff / 60000);

    if (minutesLeft < 0) {
      return {
        label: isAr ? `متأخر (${Math.abs(minutesLeft)} د)` : `Overdue (${Math.abs(minutesLeft)}m)`,
        color: 'text-rose-300 bg-rose-950/80 border border-rose-800 animate-pulse'
      };
    }
    if (minutesLeft <= 60) {
      return {
        label: isAr ? `متبقي ${minutesLeft} د` : `${minutesLeft}m left`,
        color: 'text-amber-300 bg-amber-950/80 border border-amber-800'
      };
    }
    return {
      label: isAr ? `متبقي ${minutesLeft} د` : `${minutesLeft}m left`,
      color: 'text-emerald-300 bg-emerald-950/80 border border-emerald-800'
    };
  };

  const sla = getSlaInfo(ticket.sla_deadline);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-slate-900 border rounded-xl p-3.5 shadow-lg space-y-2.5 transition select-none ${
        isDragging ? 'opacity-40 border-sky-500 ring-2 ring-sky-500/50' : 'border-slate-800 hover:border-slate-700'
      } ${ticket.priority === 'URGENT' ? 'border-l-4 border-l-rose-500 bg-rose-950/5' : ticket.priority === 'VIP' ? 'border-l-4 border-l-purple-500' : ''}`}
    >
      {/* Header: Ticket Number, Drag Grip, Priority, SLA */}
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5">
          <div {...listeners} {...attributes} className="cursor-grab active:cursor-grabbing p-0.5 text-slate-500 hover:text-white">
            <GripVertical className="w-3.5 h-3.5" />
          </div>
          <span className="font-mono font-bold text-white text-xs">#{ticket.ticket_number}</span>
          <span
            className={`px-1.5 py-0.2 text-[9px] font-bold rounded ${
              ticket.priority === 'URGENT'
                ? 'bg-rose-950 text-rose-300 border border-rose-800'
                : ticket.priority === 'VIP'
                ? 'bg-purple-950 text-purple-300 border border-purple-800'
                : 'bg-slate-800 text-slate-400'
            }`}
          >
            {ticket.priority}
          </span>
        </div>

        <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${sla.color}`}>
          {sla.label}
        </span>
      </div>

      {/* Device & Reported Fault */}
      <div>
        <h4 className="font-bold text-white text-xs leading-snug">
          {ticket.device_brand} {ticket.device_model}
        </h4>
        <p className="text-[11px] text-slate-400 line-clamp-2 mt-0.5">
          {ticket.reported_defects}
        </p>
      </div>

      {/* Customer & Tech Info */}
      <div className="text-[10px] text-slate-400 space-y-0.5 pt-1 border-t border-slate-800/80">
        <div className="flex items-center justify-between">
          <span className="truncate max-w-[140px] font-medium text-slate-300">
            {ticket.customer_name}
          </span>
          <span className="font-mono text-emerald-400 font-bold">
            {ticket.estimated_cost} ج.م
          </span>
        </div>
        {ticket.tech_name && (
          <div className="flex items-center gap-1 text-[10px] text-slate-500">
            <User className="w-2.5 h-2.5 text-sky-400" />
            <span className="truncate">{ticket.tech_name}</span>
          </div>
        )}
      </div>

      {/* Interactive Tool Actions */}
      <div className="flex items-center justify-between gap-1 pt-1.5 border-t border-slate-800/60">
        <div className="flex items-center gap-0.5">
          {/* WhatsApp Estimate */}
          <button
            onClick={() => onSendEstimate(ticket)}
            className="p-1.5 rounded-md text-emerald-400 hover:bg-emerald-950/40 hover:text-emerald-300 transition"
            title={isAr ? 'إرسال مقايسة التكلفة (واتساب)' : 'Send WhatsApp Estimate'}
          >
            <Send className="w-3 h-3" />
          </button>

          {/* Photo Timeline */}
          <button
            onClick={() => onOpenPhotos(ticket)}
            className="p-1.5 rounded-md text-sky-400 hover:bg-sky-950/40 hover:text-sky-300 transition"
            title={isAr ? 'التوثيق الفوتوغرافي' : 'Photo Evidence'}
          >
            <Camera className="w-3 h-3" />
          </button>

          {/* QA Checklist */}
          <button
            onClick={() => onOpenQaChecklist(ticket)}
            className="p-1.5 rounded-md text-purple-400 hover:bg-purple-950/40 hover:text-purple-300 transition"
            title={isAr ? 'فحص الجودة (QA)' : 'QA Checklist'}
          >
            <ShieldCheck className="w-3 h-3" />
          </button>

          {/* QR Tracking Code */}
          <button
            onClick={() => onOpenQr(ticket)}
            className="p-1.5 rounded-md text-amber-400 hover:bg-amber-950/40 hover:text-amber-300 transition"
            title={isAr ? 'باركود تتبع العميل' : 'Tracking QR Code'}
          >
            <QrCode className="w-3 h-3" />
          </button>

          {/* Financials */}
          <button
            onClick={() => onOpenFinancials(ticket)}
            className="p-1.5 rounded-md text-indigo-400 hover:bg-indigo-950/40 hover:text-indigo-300 transition"
            title={isAr ? 'حساب التكلفة والعمولة' : 'Cost & Commission'}
          >
            <DollarSign className="w-3 h-3" />
          </button>

          {/* Warranty Certificate */}
          {ticket.status === 'READY' || ticket.status === 'DELIVERED' ? (
            <button
              onClick={() => onOpenWarranty(ticket)}
              className="p-1.5 rounded-md text-teal-400 hover:bg-teal-950/40 hover:text-teal-300 transition"
              title={isAr ? 'شهادة الضمان' : 'Warranty Certificate'}
            >
              <Award className="w-3 h-3" />
            </button>
          ) : null}
        </div>

        {/* Delete */}
        <button
          onClick={() => onDeleteTicket(ticket.id)}
          className="p-1 text-slate-500 hover:text-rose-400 transition"
          title={isAr ? 'حذف التذكرة' : 'Delete'}
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
};

// Droppable Column Component
const DroppableColumn: React.FC<{
  col: KanbanColumnDef;
  tickets: RepairTicket[];
  onOpenQaChecklist: (ticket: RepairTicket) => void;
  onOpenOtp: (ticket: RepairTicket) => void;
  onOpenPhotos: (ticket: RepairTicket) => void;
  onOpenQr: (ticket: RepairTicket) => void;
  onOpenFinancials: (ticket: RepairTicket) => void;
  onOpenWarranty: (ticket: RepairTicket) => void;
  onSendEstimate: (ticket: RepairTicket) => void;
  onDeleteTicket: (ticketId: string) => void;
  isAr: boolean;
}> = ({
  col,
  tickets,
  onOpenQaChecklist,
  onOpenOtp,
  onOpenPhotos,
  onOpenQr,
  onOpenFinancials,
  onOpenWarranty,
  onSendEstimate,
  onDeleteTicket,
  isAr
}) => {
  const { setNodeRef, isOver } = useDroppable({
    id: col.id,
    data: { col }
  });

  return (
    <div
      ref={setNodeRef}
      className={`bg-slate-950/60 border rounded-2xl p-3 flex flex-col min-w-[260px] max-w-[320px] flex-1 transition ${
        isOver ? 'ring-2 ring-sky-500 bg-sky-950/20 border-sky-500' : col.color
      }`}
    >
      {/* Column Header */}
      <div className={`p-2.5 rounded-xl mb-3 flex items-center justify-between shadow-xs ${col.headerBg}`}>
        <span className="text-xs font-bold">
          {isAr ? col.titleAr : col.titleEn}
        </span>
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${col.badgeBg}`}>
          {tickets.length}
        </span>
      </div>

      {/* Tickets Cards Area */}
      <div className="flex-1 space-y-2.5 overflow-y-auto min-h-[400px]">
        {tickets.length === 0 ? (
          <div className="h-32 flex items-center justify-center border border-dashed border-slate-800/80 rounded-xl text-[11px] text-slate-500 select-none">
            {isAr ? 'اسحب التذكرة إلى هنا' : 'Drop ticket here'}
          </div>
        ) : (
          tickets.map(ticket => (
            <DraggableTicketCard
              key={ticket.id}
              ticket={ticket}
              onOpenQaChecklist={onOpenQaChecklist}
              onOpenOtp={onOpenOtp}
              onOpenPhotos={onOpenPhotos}
              onOpenQr={onOpenQr}
              onOpenFinancials={onOpenFinancials}
              onOpenWarranty={onOpenWarranty}
              onSendEstimate={onSendEstimate}
              onDeleteTicket={onDeleteTicket}
              isAr={isAr}
            />
          ))
        )}
      </div>
    </div>
  );
};

export const KanbanBoard: React.FC<KanbanBoardProps> = ({
  tickets,
  onUpdateStatus,
  onOpenQaChecklist,
  onOpenOtp,
  onOpenPhotos,
  onOpenQr,
  onOpenFinancials,
  onOpenWarranty,
  onSendEstimate,
  onDeleteTicket,
  isAr = true
}) => {
  const [activeTicket, setActiveTicket] = useState<RepairTicket | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5
      }
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const t = tickets.find(ticket => ticket.id === active.id);
    if (t) {
      setActiveTicket(t);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTicket(null);

    if (!over) return;

    const ticket = tickets.find(t => t.id === active.id);
    if (!ticket) return;

    const col = KANBAN_COLUMNS.find(c => c.id === over.id);
    if (!col) return;

    const targetStatus = col.targetStatus;

    // Check if target is already the current status
    if (col.statuses.includes(ticket.status)) return;

    // Workflow Gate 1: Transitioning to READY requires QA Checklist
    if (targetStatus === 'READY') {
      onOpenQaChecklist(ticket);
      return;
    }

    // Workflow Gate 2: Transitioning to DELIVERED requires Release OTP
    if (targetStatus === 'DELIVERED') {
      onOpenOtp(ticket);
      return;
    }

    // Standard State Transition
    await onUpdateStatus(ticket.id, targetStatus);
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4 pt-1">
        {KANBAN_COLUMNS.map(col => {
          const colTickets = tickets.filter(t => col.statuses.includes(t.status));
          return (
            <DroppableColumn
              key={col.id}
              col={col}
              tickets={colTickets}
              onOpenQaChecklist={onOpenQaChecklist}
              onOpenOtp={onOpenOtp}
              onOpenPhotos={onOpenPhotos}
              onOpenQr={onOpenQr}
              onOpenFinancials={onOpenFinancials}
              onOpenWarranty={onOpenWarranty}
              onSendEstimate={onSendEstimate}
              onDeleteTicket={onDeleteTicket}
              isAr={isAr}
            />
          );
        })}
      </div>

      {/* Drag Overlay for smooth preview */}
      <DragOverlay>
        {activeTicket ? (
          <div className="w-72 bg-slate-900 border border-sky-500 rounded-xl p-3.5 shadow-2xl space-y-2 opacity-90 scale-105 pointer-events-none">
            <div className="flex items-center justify-between">
              <span className="font-mono font-bold text-white text-xs">#{activeTicket.ticket_number}</span>
              <span className="text-[10px] px-2 py-0.5 rounded font-bold bg-sky-950 text-sky-400">
                {activeTicket.priority}
              </span>
            </div>
            <h4 className="font-bold text-white text-xs">{activeTicket.device_brand} {activeTicket.device_model}</h4>
            <p className="text-[11px] text-slate-300 truncate">{activeTicket.reported_defects}</p>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};
export default KanbanBoard;
