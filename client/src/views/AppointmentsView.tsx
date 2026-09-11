import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useLanguage } from '../i18n/LanguageContext';
import { useToast } from '../context/ToastContext';
import {
  Calendar,
  Clock,
  Plus,
  User,
  Smartphone,
  CheckCircle2,
  XCircle,
  RefreshCw
} from 'lucide-react';

export const AppointmentsView: React.FC = () => {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const { showToast } = useToast();

  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [appointments, setAppointments] = useState<any[]>([]);
  const [slots, setSlots] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);

  // Modal
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [bookingForm, setBookingForm] = useState({
    customer_name: '',
    customer_phone: '',
    device_brand: 'Apple',
    device_model: '',
    issue_description: '',
    appointment_date: new Date().toISOString().split('T')[0],
    appointment_time: '12:00 PM',
    assigned_tech_id: '',
    notes: ''
  });

  const loadData = async () => {
    try {
      const apts = await api.getAppointments(selectedDate);
      setAppointments(apts);
      const slts = await api.getAvailableSlots(selectedDate);
      setSlots(slts.slots || []);
      const u = await api.getUsers();
      setUsers(u.filter((x: any) => x.role === 'MaintenanceEngineer'));
    } catch (e: any) {
      console.error(e);
      showToast(e.message || 'فشل تحميل بيانات المواعيد', 'error');
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedDate]);

  const handleBook = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.bookAppointment(bookingForm);
      showToast(isAr ? 'تم حجز وتأكيد موعد الصيانة بنجاح' : 'Appointment booked', 'success');
      setShowBookingModal(false);
      setBookingForm({
        customer_name: '',
        customer_phone: '',
        device_brand: 'Apple',
        device_model: '',
        issue_description: '',
        appointment_date: selectedDate,
        appointment_time: '12:00 PM',
        assigned_tech_id: '',
        notes: ''
      });
      loadData();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleUpdateStatus = async (id: string, status: string) => {
    try {
      await api.updateAppointmentStatus(id, status);
      showToast(isAr ? 'تم تحديث حالة الموعد' : 'Status updated', 'info');
      loadData();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 select-text">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-wide flex items-center gap-2.5">
            <Calendar className="w-6 h-6 text-amber-400" />
            {isAr ? 'حجز مواعيد الصيانة والتقويم الإلكتروني (Appointments)' : 'Appointment Booking & Calendar'}
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            {isAr ? 'جدولة أجهزة الصيانة، إدارة أوقات الفحص، وتفادي الازدحام داخل معمل الصيانة.' : 'Electronic repair schedule, slots & capacity management.'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white font-mono"
          />
          <button
            onClick={() => setShowBookingModal(true)}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-lg shadow-amber-600/30 transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            {isAr ? 'حجز موعد جديد' : 'New Appointment'}
          </button>
          <button onClick={loadData} className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Available Slots Row */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl space-y-2">
        <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
          <Clock className="w-4 h-4 text-amber-400" />
          {isAr ? `المواعيد المتاحة ليوم (${selectedDate}):` : `Available slots for (${selectedDate}):`}
        </span>
        <div className="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-12 gap-2 text-xs">
          {slots.map((s, idx) => (
            <div
              key={idx}
              className={`p-2 rounded-lg border text-center font-mono text-[11px] font-bold ${
                s.isAvailable
                  ? 'bg-emerald-950/30 border-emerald-800 text-emerald-300'
                  : 'bg-slate-950/60 border-slate-800 text-slate-500 line-through'
              }`}
            >
              {s.time}
            </div>
          ))}
        </div>
      </div>

      {/* Appointments List */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl text-xs">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h3 className="font-bold text-white text-sm">مواعيد الصيانة المسجلة ليوم {selectedDate} ({appointments.length})</h3>
        </div>

        <table className="w-full text-start text-xs text-slate-300">
          <thead className="bg-slate-950 text-slate-400 uppercase font-semibold border-b border-slate-800 text-[11px]">
            <tr>
              <th className="px-4 py-3">الوقت</th>
              <th className="px-4 py-3">العميل</th>
              <th className="px-4 py-3">الجهاز</th>
              <th className="px-4 py-3">العطل المذكور</th>
              <th className="px-4 py-3">الفني المعين</th>
              <th className="px-4 py-3">الحالة</th>
              <th className="px-4 py-3 text-end">الإجراء</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {appointments.map(a => (
              <tr key={a.id} className="hover:bg-slate-800/40">
                <td className="px-4 py-3 font-mono font-bold text-amber-400">{a.appointment_time}</td>
                <td className="px-4 py-3">
                  <strong className="text-white block">{a.customer_name}</strong>
                  <span className="font-mono text-slate-400 text-[11px]">{a.customer_phone}</span>
                </td>
                <td className="px-4 py-3 font-semibold text-white">{a.device_brand} {a.device_model}</td>
                <td className="px-4 py-3 max-w-xs truncate text-slate-300">{a.issue_description}</td>
                <td className="px-4 py-3 text-slate-300">{a.technician_name || 'مهندس الاستقبال'}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                    a.status === 'CONFIRMED' ? 'bg-amber-950 text-amber-300 border-amber-800' :
                    a.status === 'COMPLETED' ? 'bg-emerald-950 text-emerald-300 border-emerald-800' :
                    'bg-rose-950 text-rose-300 border-rose-800'
                  }`}>
                    {a.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-end space-x-1">
                  {a.status === 'CONFIRMED' && (
                    <>
                      <button
                        onClick={() => handleUpdateStatus(a.id, 'COMPLETED')}
                        className="px-2 py-1 bg-emerald-700 hover:bg-emerald-600 text-white rounded text-[11px]"
                      >
                        تم الحضور
                      </button>
                      <button
                        onClick={() => handleUpdateStatus(a.id, 'CANCELLED')}
                        className="px-2 py-1 bg-rose-800 hover:bg-rose-700 text-white rounded text-[11px]"
                      >
                        إلغاء
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {appointments.length === 0 && (
              <tr>
                <td colSpan={7} className="py-10 text-center text-slate-500">
                  لا توجد حجوزات مواعيد مسجلة في هذا التاريخ.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Book Appointment Modal */}
      {showBookingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
          <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-xl p-6 text-xs space-y-4">
            <h3 className="font-bold text-white text-base">تسجيل موعد صيانة جديد</h3>
            <form onSubmit={handleBook} className="space-y-3">
              <div>
                <label className="block text-slate-300 mb-1">اسم العميل *</label>
                <input
                  type="text"
                  required
                  value={bookingForm.customer_name}
                  onChange={e => setBookingForm({ ...bookingForm, customer_name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-white"
                />
              </div>

              <div>
                <label className="block text-slate-300 mb-1">رقم هاتف العميل *</label>
                <input
                  type="text"
                  required
                  placeholder="01012345678"
                  value={bookingForm.customer_phone}
                  onChange={e => setBookingForm({ ...bookingForm, customer_phone: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-white font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-300 mb-1">الشركة المصنعة</label>
                  <select
                    value={bookingForm.device_brand}
                    onChange={e => setBookingForm({ ...bookingForm, device_brand: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-white"
                  >
                    <option value="Apple">Apple iPhone</option>
                    <option value="Samsung">Samsung</option>
                    <option value="Xiaomi">Xiaomi / Redmi</option>
                    <option value="Oppo">Oppo / Realme</option>
                    <option value="Huawei">Huawei</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 mb-1">موديل الهاتف *</label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: iPhone 14 Pro"
                    value={bookingForm.device_model}
                    onChange={e => setBookingForm({ ...bookingForm, device_model: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 mb-1">وصف العطل أو المطلوب</label>
                <textarea
                  rows={2}
                  value={bookingForm.issue_description}
                  onChange={e => setBookingForm({ ...bookingForm, issue_description: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-300 mb-1">تاريخ الموعد *</label>
                  <input
                    type="date"
                    required
                    value={bookingForm.appointment_date}
                    onChange={e => setBookingForm({ ...bookingForm, appointment_date: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1">وقت الموعد *</label>
                  <select
                    value={bookingForm.appointment_time}
                    onChange={e => setBookingForm({ ...bookingForm, appointment_time: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-white font-mono"
                  >
                    {slots.filter(s => s.isAvailable).map((s, idx) => (
                      <option key={idx} value={s.time}>{s.time}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 mb-1">تعيين مهندس الصيانة</label>
                <select
                  value={bookingForm.assigned_tech_id}
                  onChange={e => setBookingForm({ ...bookingForm, assigned_tech_id: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-white"
                >
                  <option value="">-- مهندس الصيانة المناوب --</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowBookingModal(false)} className="px-3 py-2 text-slate-400">
                  إلغاء
                </button>
                <button type="submit" className="px-4 py-2 bg-amber-600 text-white rounded font-semibold">
                  تأكيد الحجز
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
