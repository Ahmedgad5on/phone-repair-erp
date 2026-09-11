import React, { useState, useEffect } from 'react';
import {
  Wrench,
  Search,
  CheckCircle2,
  Clock,
  User,
  Calendar,
  AlertCircle,
  Phone,
  MapPin,
  Camera,
  ShieldCheck,
  Check,
  XCircle,
  ArrowRight,
  ExternalLink,
  Smartphone
} from 'lucide-react';

interface PortalTicketData {
  ticket: {
    id: string;
    ticket_number: number;
    device_brand: string;
    device_model: string;
    status: string;
    priority: string;
    estimated_cost: number;
    labor_charge: number;
    parts_cost: number;
    reported_defects: string;
    sla_deadline?: string;
    completed_at?: string;
    delivered_at?: string;
    created_at: string;
    customer_name: string;
    customer_phone: string;
    technician_name?: string;
    store_name?: string;
    store_phone?: string;
    store_address?: string;
  };
  technician_name?: string;
  estimated_ready_date?: string;
  photos?: Array<{ id: string; url: string; stage: string; caption?: string; taken_at: string }>;
  timeline?: Array<{ step: string; label: string; completed: boolean; timestamp?: string }>;
}

const STEP_DEFINITIONS = [
  { step: 'RECEIVED', labelAr: 'تم استلام الجهاز وفحصه', labelEn: 'Device Received & Inspected' },
  { step: 'DIAGNOSED', labelAr: 'الفحص والتشخيص الفني', labelEn: 'Lab Technical Diagnosis' },
  { step: 'IN_REPAIR', labelAr: 'قيد الصيانة وتغيير القطع', labelEn: 'Component Rework & Assembly' },
  { step: 'QA', labelAr: 'فحص الجودة الشامل (10 نقاط)', labelEn: '10-Point QA Verification' },
  { step: 'READY', labelAr: 'جاهز للاستلام والتسليم', labelEn: 'Ready for Pickup' },
  { step: 'DELIVERED', labelAr: 'تم التسليم مع الضمان', labelEn: 'Delivered with Warranty' }
];

export const CustomerTrackingPortal: React.FC = () => {
  const [ticketQuery, setTicketQuery] = useState('');
  const [data, setData] = useState<PortalTicketData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [approvalActionDone, setApprovalActionDone] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);

  // Parse URL query parameter on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const query = params.get('ticket') || params.get('q');
    if (query) {
      setTicketQuery(query);
      fetchTicketData(query);
    }
  }, []);

  const fetchTicketData = async (query: string) => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setApprovalActionDone(null);
    try {
      // First try /api/repair/portal/track, fallback to /api/portal/track
      let res = await fetch(`/api/repair/portal/track?ticket=${encodeURIComponent(query.trim())}`);
      if (!res.ok) {
        res = await fetch(`/api/portal/track/${encodeURIComponent(query.trim())}`);
      }

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'لم يتم العثور على تذكرة صيانة مطابقة لهذا الرقم');
      }

      const json = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err.message || 'فشل في استرجاع تفاصيل التذكرة');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchTicketData(ticketQuery);
  };

  const handleQuoteDecision = async (approved: boolean) => {
    if (!data?.ticket?.id) return;
    setApproving(true);
    try {
      const res = await fetch(`/api/repair/tickets/${data.ticket.id}/estimate-response`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved })
      });

      if (res.ok) {
        setApprovalActionDone(approved ? 'APPROVED' : 'REJECTED');
        fetchTicketData(String(data.ticket.ticket_number));
      } else {
        const errJson = await res.json().catch(() => ({}));
        alert(errJson.error || 'فشل في تسجيل قرار التكلفة');
      }
    } catch (e: any) {
      alert(e.message);
    } finally {
      setApproving(false);
    }
  };

  const getStatusBadge = (st: string) => {
    switch (st) {
      case 'RECEIVED':
      case 'INTAKE':
        return { label: 'تم الاستلام (Received)', bg: 'bg-slate-800 text-slate-200 border-slate-700' };
      case 'DIAGNOSED':
      case 'DIAGNOSING':
        return { label: 'قيد الفحص (Diagnosing)', bg: 'bg-amber-950 text-amber-300 border-amber-800' };
      case 'IN_REPAIR':
      case 'IN_PROGRESS':
        return { label: 'قيد الصيانة (In Repair)', bg: 'bg-sky-950 text-sky-300 border-sky-800 animate-pulse' };
      case 'QA':
      case 'WAITING_APPROVAL':
        return { label: 'فحص الجودة (QA Verification)', bg: 'bg-purple-950 text-purple-300 border-purple-800' };
      case 'READY':
        return { label: 'جاهز للاستلام (Ready for Pickup)', bg: 'bg-emerald-950 text-emerald-300 border-emerald-800' };
      case 'DELIVERED':
        return { label: 'تم التسليم (Delivered)', bg: 'bg-teal-950 text-teal-300 border-teal-800' };
      default:
        return { label: st, bg: 'bg-slate-800 text-slate-300 border-slate-700' };
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans p-4 sm:p-6 md:p-8 selection:bg-sky-500 selection:text-white" dir="rtl">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Top Header */}
        <header className="flex items-center justify-between border-b border-slate-800 pb-5">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-to-br from-sky-500 to-indigo-600 rounded-2xl shadow-lg shadow-sky-500/20 text-white">
              <Wrench className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-black tracking-tight text-white flex items-center gap-2">
                بوابة التتبع الذكي للصيانة
                <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20 font-mono">
                  Live Status
                </span>
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                تتبع دورة صيانة جهازك خطوة بخطوة بالوقت الفعلي مع إمكانية اعتماد التكلفة
              </p>
            </div>
          </div>

          <a
            href="/"
            className="text-xs font-semibold text-slate-400 hover:text-white flex items-center gap-1.5 transition"
          >
            <span>لوحة النظام</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </header>

        {/* Search Bar */}
        <form onSubmit={handleSearch} className="bg-slate-900 border border-slate-800 rounded-2xl p-2 sm:p-3 shadow-xl flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-500 absolute start-3 top-3" />
            <input
              type="text"
              value={ticketQuery}
              onChange={e => setTicketQuery(e.target.value)}
              placeholder="أدخل رقم التذكرة (مثال: 1001) أو رقم هاتف العميل..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl ps-9 pe-4 py-2.5 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-hidden focus:border-sky-500 transition"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs sm:text-sm font-bold transition shadow-md shadow-sky-600/30 flex items-center gap-2 cursor-pointer shrink-0"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <span>تتبع الآن</span>
            )}
          </button>
        </form>

        {error && (
          <div className="bg-rose-950/40 border border-rose-800/60 rounded-2xl p-4 text-xs sm:text-sm text-rose-300 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Ticket Details View */}
        {data && (
          <div className="space-y-6">
            {/* Main Overview Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-2xl space-y-6">
              {/* Header Title & Status */}
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800 pb-5">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-base sm:text-lg font-black text-white">
                      تذكرة #{data.ticket.ticket_number}
                    </span>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
                      {new Date(data.ticket.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <h2 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
                    <Smartphone className="w-5 h-5 text-sky-400" />
                    {data.ticket.device_brand} {data.ticket.device_model}
                  </h2>
                </div>

                <div className="flex flex-col items-end gap-1.5">
                  <span className={`px-3 py-1 rounded-xl text-xs font-bold border ${getStatusBadge(data.ticket.status).bg}`}>
                    {getStatusBadge(data.ticket.status).label}
                  </span>
                  <span className="text-[11px] text-slate-400">
                    العميل: {data.ticket.customer_name}
                  </span>
                </div>
              </div>

              {/* KPI Details Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3.5 flex items-center gap-3">
                  <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-lg">
                    <User className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-400 block">مهندس الصيانة المسؤول</span>
                    <span className="text-xs font-bold text-slate-200">
                      {data.technician_name || data.ticket.technician_name || 'طاقم المختبر الفني'}
                    </span>
                  </div>
                </div>

                <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3.5 flex items-center gap-3">
                  <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg">
                    <Calendar className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-400 block">موعد الجاهزية المتوقع</span>
                    <span className="text-xs font-bold text-emerald-400 font-mono">
                      {data.estimated_ready_date || data.ticket.sla_deadline
                        ? new Date(data.estimated_ready_date || data.ticket.sla_deadline!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ' + new Date(data.estimated_ready_date || data.ticket.sla_deadline!).toLocaleDateString()
                        : 'خلال 2-4 ساعات'}
                    </span>
                  </div>
                </div>

                <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3.5 flex items-center gap-3">
                  <div className="p-2 bg-amber-500/10 text-amber-400 rounded-lg">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-400 block">تقدير التكلفة الإجمالي</span>
                    <span className="text-xs font-bold text-amber-300 font-mono">
                      {data.ticket.estimated_cost} ج.م
                    </span>
                  </div>
                </div>
              </div>

              {/* Defect Description */}
              <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-4">
                <span className="text-xs font-semibold text-slate-400 block mb-1">
                  العطل المسجل والتشخيص:
                </span>
                <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">
                  {data.ticket.reported_defects}
                </p>
              </div>

              {/* Pre-Authorization Quote Decision Box */}
              {['INTAKE', 'RECEIVED', 'DIAGNOSING', 'DIAGNOSED', 'WAITING_APPROVAL', 'QA'].includes(data.ticket.status) && (
                <div className="bg-gradient-to-r from-sky-950/40 via-indigo-950/30 to-slate-900 border border-sky-500/30 rounded-2xl p-5 space-y-3.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 bg-sky-500/20 text-sky-400 rounded-xl">
                        <Clock className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-white">اعتماد مقايسة الصيانة والتكلفة</h4>
                        <p className="text-xs text-slate-400">
                          يرجى مراجعة التكلفة المقدرة ({data.ticket.estimated_cost} ج.م) واختيار الموافقة لبدء الصيانة فوراً
                        </p>
                      </div>
                    </div>
                  </div>

                  {approvalActionDone ? (
                    <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs font-bold text-emerald-400 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>
                        {approvalActionDone === 'APPROVED' ? 'تم تسجيل موافقتك على التكلفة بنجاح! بدأ الفني في العمل.' : 'تم تسجيل اعتذارك عن المقايسة.'}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 pt-1">
                      <button
                        onClick={() => handleQuoteDecision(true)}
                        disabled={approving}
                        className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/30 transition flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Check className="w-4 h-4" />
                        <span>موافقة على التكلفة والبدء (Approve)</span>
                      </button>
                      <button
                        onClick={() => handleQuoteDecision(false)}
                        disabled={approving}
                        className="py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-rose-300 rounded-xl text-xs font-medium transition cursor-pointer border border-slate-700"
                      >
                        <XCircle className="w-4 h-4" />
                        <span>رفض المقايسة</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Visual 6-Step Progress Timeline */}
              <div className="space-y-3 pt-2">
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  مراحل دورة الصيانة (Progress Stepper)
                </h3>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                  {STEP_DEFINITIONS.map((stepDef, idx) => {
                    // Check if current step is completed
                    const currentStatusIdx = ['INTAKE', 'RECEIVED'].includes(data.ticket.status) ? 0 :
                      ['DIAGNOSING', 'DIAGNOSED'].includes(data.ticket.status) ? 1 :
                      ['IN_REPAIR', 'IN_PROGRESS'].includes(data.ticket.status) ? 2 :
                      ['WAITING_APPROVAL', 'QA'].includes(data.ticket.status) ? 3 :
                      data.ticket.status === 'READY' ? 4 :
                      data.ticket.status === 'DELIVERED' ? 5 : 0;

                    const isDone = idx <= currentStatusIdx;
                    const isCurrent = idx === currentStatusIdx;

                    return (
                      <div
                        key={stepDef.step}
                        className={`p-3 rounded-xl border flex flex-col justify-between transition ${
                          isCurrent
                            ? 'bg-sky-950/40 border-sky-500/60 shadow-lg shadow-sky-500/10 text-white'
                            : isDone
                            ? 'bg-emerald-950/20 border-emerald-500/30 text-slate-300'
                            : 'bg-slate-950/40 border-slate-800/80 text-slate-500'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-mono text-[10px] font-bold opacity-60">
                            0{idx + 1}
                          </span>
                          {isDone ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          ) : (
                            <div className="w-3.5 h-3.5 rounded-full border border-slate-700" />
                          )}
                        </div>
                        <div>
                          <p className={`text-xs font-bold leading-snug ${isCurrent ? 'text-sky-300' : ''}`}>
                            {stepDef.labelAr}
                          </p>
                          <p className="text-[10px] text-slate-500 mt-0.5 truncate">
                            {stepDef.labelEn}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Photo Evidence Timeline (If any photos recorded) */}
              {data.photos && data.photos.length > 0 && (
                <div className="space-y-3 pt-3 border-t border-slate-800">
                  <h3 className="text-xs font-bold text-slate-300 flex items-center gap-2">
                    <Camera className="w-4 h-4 text-sky-400" />
                    <span>صور التوثيق الفني للجهاز ({data.photos.length})</span>
                  </h3>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {data.photos.map(p => (
                      <div key={p.id} className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-md">
                        <img src={p.url} alt={p.caption || 'Evidence'} className="w-full aspect-video object-cover" />
                        <div className="p-2 space-y-0.5 text-[11px]">
                          <span className="text-sky-400 font-bold block">{p.stage}</span>
                          <span className="text-slate-300 line-clamp-1">{p.caption || 'توثيق حالة الجهاز'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Store Contacts & Pickup Information */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-400">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-rose-400" />
                  <span>{data.ticket.store_name || 'مركز الصيانة المعتمد'} — {data.ticket.store_address || 'القاهرة، مصر'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-emerald-400" />
                  <span className="font-mono">{data.ticket.store_phone || '01000000000'}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
export default CustomerTrackingPortal;
