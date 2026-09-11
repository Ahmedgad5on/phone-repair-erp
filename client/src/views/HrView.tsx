import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useLanguage } from '../i18n/LanguageContext';
import { useToast } from '../context/ToastContext';
import {
  Users,
  Clock,
  Calendar,
  DollarSign,
  Plus,
  CheckCircle2,
  LogIn,
  LogOut,
  Calculator,
  RefreshCw
} from 'lucide-react';
import { TableSkeleton } from '../components/common/SkeletonLoader';
import { EmptyState } from '../components/common/EmptyState';

export const HrView: React.FC = () => {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'attendance' | 'leaves' | 'payroll'>('attendance');
  const [loading, setLoading] = useState(false);

  // Data states
  const [attendance, setAttendance] = useState<any[]>([]);
  const [leaves, setLeaves] = useState<any[]>([]);
  const [payroll, setPayroll] = useState<any[]>([]);

  // Modals & Forms
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [checkInForm, setCheckInForm] = useState({ employee_id: 'emp-tech-1', notes: '' });

  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [leaveForm, setLeaveForm] = useState({
    employee_id: 'emp-tech-1',
    leave_type: 'ANNUAL',
    start_date: new Date().toISOString().split('T')[0],
    end_date: new Date().toISOString().split('T')[0],
    reason: ''
  });

  const [generatingPayroll, setGeneratingPayroll] = useState(false);
  const [payrollMonth, setPayrollMonth] = useState(new Date().toISOString().slice(0, 7));

  const loadData = async () => {
    setLoading(true);
    try {
      const [att, lvs, pay] = await Promise.all([
        api.getAttendance(),
        api.getLeaves(),
        api.getPayroll()
      ]);
      setAttendance(att || []);
      setLeaves(lvs || []);
      setPayroll(pay || []);
    } catch (e: any) {
      console.error(e);
      showToast(isAr ? 'فشل تحميل بيانات الموظفين' : 'Failed to load HR data', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.checkIn(checkInForm);
      showToast(isAr ? 'تم تسجيل الحضور بنجاح' : 'Check-in recorded successfully', 'success');
      setShowCheckInModal(false);
      loadData();
    } catch (e: any) {
      showToast(e.message || (isAr ? 'فشل الحفظ' : 'Failed to record check-in'), 'error');
    }
  };

  const handleCheckOut = async (employee_id: string) => {
    try {
      await api.checkOut({ employee_id, notes: 'Day end' });
      showToast(isAr ? 'تم تسجيل الانصراف بنجاح' : 'Check-out recorded successfully', 'success');
      loadData();
    } catch (e: any) {
      showToast(e.message || (isAr ? 'فشل الحفظ' : 'Failed to record check-out'), 'error');
    }
  };

  const handleApplyLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.applyLeave(leaveForm);
      showToast(isAr ? 'تم تقديم طلب الإجازة بنجاح' : 'Leave application submitted', 'success');
      setShowLeaveModal(false);
      loadData();
    } catch (e: any) {
      showToast(e.message || (isAr ? 'فشل تقديم الإجازة' : 'Failed to apply leave'), 'error');
    }
  };

  const handleGeneratePayroll = async () => {
    setGeneratingPayroll(true);
    try {
      await api.generatePayroll(payrollMonth);
      showToast(isAr ? 'تم احتساب مسير الرواتب والعمولات بنجاح' : 'Payroll calculated with commissions', 'success');
      loadData();
    } catch (e: any) {
      showToast(e.message || (isAr ? 'فشل احتساب الرواتب' : 'Failed to calculate payroll'), 'error');
    } finally {
      setGeneratingPayroll(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Users className="w-7 h-7 text-indigo-600 dark:text-indigo-400" />
            {isAr ? 'الموارد البشرية وشؤون الموظفين (HR)' : 'HR & Employee Management'}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {isAr
              ? 'تسجيل الحضور والانصراف، إدارة الإجازات، واحتساب الرواتب مع عمولات الفنيين التلقائية'
              : 'Attendance tracking, leave requests, and automated payroll with technician commission rules'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
            title={isAr ? 'تحديث' : 'Refresh'}
          >
            <RefreshCw className="w-5 h-5" />
          </button>

          {activeTab === 'attendance' && (
            <button
              onClick={() => setShowCheckInModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl shadow-sm transition-all"
            >
              <LogIn className="w-5 h-5" />
              <span>{isAr ? 'تسجيل حضور' : 'Check In'}</span>
            </button>
          )}

          {activeTab === 'leaves' && (
            <button
              onClick={() => setShowLeaveModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl shadow-sm transition-all"
            >
              <Plus className="w-5 h-5" />
              <span>{isAr ? 'طلب إجازة' : 'Request Leave'}</span>
            </button>
          )}

          {activeTab === 'payroll' && (
            <div className="flex items-center gap-2">
              <input
                type="month"
                value={payrollMonth}
                onChange={(e) => setPayrollMonth(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs font-semibold"
              />
              <button
                disabled={generatingPayroll}
                onClick={handleGeneratePayroll}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl shadow-sm transition-all text-xs disabled:opacity-50"
              >
                <Calculator className="w-4 h-4" />
                <span>{generatingPayroll ? (isAr ? 'جاري الاحتساب...' : 'Calculating...') : (isAr ? 'احتساب الرواتب' : 'Generate Payroll')}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800">
        <button
          onClick={() => setActiveTab('attendance')}
          className={`px-4 py-3 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'attendance'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <Clock className="w-4 h-4" />
          {isAr ? 'سجل الحضور والانصراف' : 'Attendance'}
          <span className="px-2 py-0.5 text-xs rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
            {attendance.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('leaves')}
          className={`px-4 py-3 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'leaves'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <Calendar className="w-4 h-4" />
          {isAr ? 'طلبات الإجازات' : 'Leave Requests'}
          <span className="px-2 py-0.5 text-xs rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
            {leaves.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('payroll')}
          className={`px-4 py-3 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'payroll'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <DollarSign className="w-4 h-4" />
          {isAr ? 'مسير الرواتب والعمولات' : 'Payroll & Commissions'}
          <span className="px-2 py-0.5 text-xs rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
            {payroll.length}
          </span>
        </button>
      </div>

      {/* Tab Contents */}
      {loading ? (
        <TableSkeleton rows={5} cols={5} />
      ) : (
        <>
          {/* Attendance Tab */}
          {activeTab === 'attendance' && (
            <div className="space-y-4">
              {attendance.length === 0 ? (
                <EmptyState
                  icon={Clock}
                  title={isAr ? 'لا توجد تسجيلات حضور اليوم' : 'No attendance records yet'}
                  description={isAr ? 'سجل حضور المهندسين والموظفين لمتابعة ساعات العمل' : 'Track daily employee check-ins and check-outs.'}
                  actionLabel={isAr ? 'تسجيل حضور' : 'Check In'}
                  onAction={() => setShowCheckInModal(true)}
                />
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                  <table className="w-full text-sm text-left rtl:text-right">
                    <thead className="text-xs uppercase bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="px-6 py-3">{isAr ? 'معرف الموظف' : 'Employee ID'}</th>
                        <th className="px-6 py-3">{isAr ? 'تاريخ اليوم' : 'Date'}</th>
                        <th className="px-6 py-3">{isAr ? 'وقت الدخول' : 'Check-In'}</th>
                        <th className="px-6 py-3">{isAr ? 'وقت الخروج' : 'Check-Out'}</th>
                        <th className="px-6 py-3">{isAr ? 'الإجراء' : 'Action'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {attendance.map((row) => (
                        <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                          <td className="px-6 py-4 font-bold text-slate-900 dark:text-white">
                            {row.employee_id}
                          </td>
                          <td className="px-6 py-4 text-slate-600 dark:text-slate-400">
                            {row.date}
                          </td>
                          <td className="px-6 py-4 text-emerald-600 dark:text-emerald-400 font-mono">
                            {row.check_in_time ? new Date(row.check_in_time).toLocaleTimeString() : '-'}
                          </td>
                          <td className="px-6 py-4 text-amber-600 dark:text-amber-400 font-mono">
                            {row.check_out_time ? new Date(row.check_out_time).toLocaleTimeString() : (
                              <span className="text-xs text-slate-400">{isAr ? 'في الوردية' : 'On Shift'}</span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            {!row.check_out_time && (
                              <button
                                onClick={() => handleCheckOut(row.employee_id)}
                                className="flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded-lg text-xs font-semibold transition-colors"
                              >
                                <LogOut className="w-3.5 h-3.5" />
                                {isAr ? 'تسجيل انصراف' : 'Check Out'}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Leaves Tab */}
          {activeTab === 'leaves' && (
            <div className="space-y-4">
              {leaves.length === 0 ? (
                <EmptyState
                  icon={Calendar}
                  title={isAr ? 'لا توجد طلبات إجازة' : 'No leave requests'}
                  description={isAr ? 'سجل طلبات الإجازات السنوية أو المرضية للموظفين لمتابعة الرصيد' : 'Submit and manage staff leave applications.'}
                  actionLabel={isAr ? 'طلب إجازة' : 'Request Leave'}
                  onAction={() => setShowLeaveModal(true)}
                />
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                  <table className="w-full text-sm text-left rtl:text-right">
                    <thead className="text-xs uppercase bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="px-6 py-3">{isAr ? 'الموظف' : 'Employee'}</th>
                        <th className="px-6 py-3">{isAr ? 'نوع الإجازة' : 'Type'}</th>
                        <th className="px-6 py-3">{isAr ? 'من تاريخ' : 'Start Date'}</th>
                        <th className="px-6 py-3">{isAr ? 'إلى تاريخ' : 'End Date'}</th>
                        <th className="px-6 py-3">{isAr ? 'السبب' : 'Reason'}</th>
                        <th className="px-6 py-3">{isAr ? 'الحالة' : 'Status'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {leaves.map((l) => (
                        <tr key={l.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                          <td className="px-6 py-4 font-bold text-slate-900 dark:text-white">
                            {l.employee_id}
                          </td>
                          <td className="px-6 py-4 font-medium text-slate-600 dark:text-slate-300">
                            {l.leave_type}
                          </td>
                          <td className="px-6 py-4 text-slate-500 dark:text-slate-400">
                            {l.start_date}
                          </td>
                          <td className="px-6 py-4 text-slate-500 dark:text-slate-400">
                            {l.end_date}
                          </td>
                          <td className="px-6 py-4 text-slate-600 dark:text-slate-300 text-xs">
                            {l.reason || '-'}
                          </td>
                          <td className="px-6 py-4">
                            <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              {l.status || 'APPROVED'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Payroll Tab */}
          {activeTab === 'payroll' && (
            <div className="space-y-4">
              {payroll.length === 0 ? (
                <EmptyState
                  icon={DollarSign}
                  title={isAr ? 'لم يتم احتساب الرواتب لهذا الشهر' : 'No payroll entries found'}
                  description={isAr ? 'اضغط على زر احتساب الرواتب لحساب الراتب الأساسي + عمولات صيانة الهواتف المنجزة تلقائياً' : 'Click Generate Payroll to compute base salaries plus technician repair commissions automatically.'}
                  actionLabel={isAr ? 'احتساب رواتب هذا الشهر' : 'Generate This Month'}
                  onAction={handleGeneratePayroll}
                />
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                  <table className="w-full text-sm text-left rtl:text-right">
                    <thead className="text-xs uppercase bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="px-6 py-3">{isAr ? 'الموظف' : 'Employee'}</th>
                        <th className="px-6 py-3">{isAr ? 'شهر الاستحقاق' : 'Month'}</th>
                        <th className="px-6 py-3">{isAr ? 'الراتب الأساسي' : 'Base Salary'}</th>
                        <th className="px-6 py-3">{isAr ? 'عمولات الصيانة' : 'Commissions'}</th>
                        <th className="px-6 py-3">{isAr ? 'الخصومات' : 'Deductions'}</th>
                        <th className="px-6 py-3">{isAr ? 'صافي الراتب' : 'Net Salary'}</th>
                        <th className="px-6 py-3">{isAr ? 'الحالة' : 'Status'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {payroll.map((p) => (
                        <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                          <td className="px-6 py-4 font-bold text-slate-900 dark:text-white">
                            {p.employee_id}
                          </td>
                          <td className="px-6 py-4 text-slate-600 dark:text-slate-400 font-mono">
                            {p.month}
                          </td>
                          <td className="px-6 py-4 font-medium text-slate-700 dark:text-slate-300">
                            {p.base_salary} ج.م
                          </td>
                          <td className="px-6 py-4 text-emerald-600 dark:text-emerald-400 font-bold">
                            +{p.commission_amount} ج.م
                          </td>
                          <td className="px-6 py-4 text-red-600 dark:text-red-400">
                            -{p.deductions} ج.م
                          </td>
                          <td className="px-6 py-4 font-black text-indigo-600 dark:text-indigo-400 text-base">
                            {p.net_salary} ج.م
                          </td>
                          <td className="px-6 py-4">
                            <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              {p.status || 'PAID'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Modal: Check-In */}
      {showCheckInModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl p-6 space-y-4">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <LogIn className="w-5 h-5 text-indigo-600" />
              {isAr ? 'تسجيل حضور موظف' : 'Employee Check In'}
            </h2>
            <form onSubmit={handleCheckIn} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? 'معرف الموظف / الاسم' : 'Employee ID / Name'}
                </label>
                <input
                  type="text"
                  required
                  value={checkInForm.employee_id}
                  onChange={(e) => setCheckInForm({ ...checkInForm, employee_id: e.target.value })}
                  placeholder="emp-101"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? 'ملاحظات (اختياري)' : 'Notes (optional)'}
                </label>
                <input
                  type="text"
                  value={checkInForm.notes}
                  onChange={(e) => setCheckInForm({ ...checkInForm, notes: e.target.value })}
                  placeholder={isAr ? 'وردية صباحية' : 'Morning shift'}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCheckInModal(false)}
                  className="px-4 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
                >
                  {isAr ? 'تسجيل الآن' : 'Record Now'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Apply Leave */}
      {showLeaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl p-6 space-y-4">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Calendar className="w-5 h-5 text-indigo-600" />
              {isAr ? 'طلب إجازة جديد' : 'Submit Leave Request'}
            </h2>
            <form onSubmit={handleApplyLeave} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? 'معرف الموظف' : 'Employee ID'}
                </label>
                <input
                  type="text"
                  required
                  value={leaveForm.employee_id}
                  onChange={(e) => setLeaveForm({ ...leaveForm, employee_id: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? 'نوع الإجازة' : 'Leave Type'}
                </label>
                <select
                  value={leaveForm.leave_type}
                  onChange={(e) => setLeaveForm({ ...leaveForm, leave_type: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
                >
                  <option value="ANNUAL">{isAr ? 'سنوية' : 'Annual'}</option>
                  <option value="SICK">{isAr ? 'مرضية' : 'Sick'}</option>
                  <option value="UNPAID">{isAr ? 'بدون راتب' : 'Unpaid'}</option>
                  <option value="EMERGENCY">{isAr ? 'طارئة' : 'Emergency'}</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {isAr ? 'من تاريخ' : 'Start Date'}
                  </label>
                  <input
                    type="date"
                    required
                    value={leaveForm.start_date}
                    onChange={(e) => setLeaveForm({ ...leaveForm, start_date: e.target.value })}
                    className="w-full px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {isAr ? 'إلى تاريخ' : 'End Date'}
                  </label>
                  <input
                    type="date"
                    required
                    value={leaveForm.end_date}
                    onChange={(e) => setLeaveForm({ ...leaveForm, end_date: e.target.value })}
                    className="w-full px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? 'سبب الإجازة' : 'Reason'}
                </label>
                <input
                  type="text"
                  value={leaveForm.reason}
                  onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })}
                  placeholder={isAr ? 'إجازة عائلية' : 'Personal reasons'}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowLeaveModal(false)}
                  className="px-4 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
                >
                  {isAr ? 'إرسال الطلب' : 'Submit Application'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
