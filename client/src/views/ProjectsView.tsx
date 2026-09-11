import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useLanguage } from '../i18n/LanguageContext';
import { useToast } from '../context/ToastContext';
import {
  FolderKanban,
  CheckSquare,
  Clock,
  Plus,
  TrendingUp,
  RefreshCw,
  Play,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { TableSkeleton } from '../components/common/SkeletonLoader';
import { EmptyState } from '../components/common/EmptyState';

export const ProjectsView: React.FC = () => {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const { showToast } = useToast();

  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('ALL');

  // Modals
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [projectForm, setProjectForm] = useState({
    title: '',
    description: '',
    customer_id: '',
    budget: 0,
    deadline: ''
  });

  const [showTaskModal, setShowTaskModal] = useState(false);
  const [taskForm, setTaskForm] = useState({
    project_id: '',
    title: '',
    description: '',
    assigned_to: 'Tech Lead',
    estimated_hours: 2,
    status: 'TODO'
  });

  const [showTimeModal, setShowTimeModal] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string>('');
  const [timeForm, setTimeForm] = useState({
    hours_spent: 1,
    notes: ''
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [projs, tList] = await Promise.all([
        api.getProjects(),
        api.getTasks()
      ]);
      setProjects(projs || []);
      setTasks(tList || []);
      if (projs && projs.length > 0 && !taskForm.project_id) {
        setTaskForm(prev => ({ ...prev, project_id: projs[0].id }));
      }
    } catch (e: any) {
      console.error(e);
      showToast(isAr ? 'فشل تحميل المشاريع' : 'Failed to load projects', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createProject({
        ...projectForm,
        budget: Number(projectForm.budget)
      });
      showToast(isAr ? 'تم إنشاء المشروع بنجاح' : 'Project created successfully', 'success');
      setShowProjectModal(false);
      setProjectForm({
        title: '',
        description: '',
        customer_id: '',
        budget: 0,
        deadline: ''
      });
      loadData();
    } catch (e: any) {
      showToast(e.message || (isAr ? 'فشل الحفظ' : 'Failed to create project'), 'error');
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createTask({
        ...taskForm,
        estimated_hours: Number(taskForm.estimated_hours)
      });
      showToast(isAr ? 'تم إنشاء المهمة بنجاح' : 'Task created successfully', 'success');
      setShowTaskModal(false);
      setTaskForm({
        project_id: projects[0]?.id || '',
        title: '',
        description: '',
        assigned_to: 'Tech Lead',
        estimated_hours: 2,
        status: 'TODO'
      });
      loadData();
    } catch (e: any) {
      showToast(e.message || (isAr ? 'فشل الحفظ' : 'Failed to create task'), 'error');
    }
  };

  const handleUpdateStatus = async (taskId: string, newStatus: string) => {
    try {
      await api.updateTaskStatus(taskId, { status: newStatus });
      showToast(isAr ? 'تم تحديث حالة المهمة' : 'Task status updated', 'success');
      loadData();
    } catch (e: any) {
      showToast(e.message || (isAr ? 'فشل التحديث' : 'Failed to update task'), 'error');
    }
  };

  const handleLogTime = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.logTaskTime(selectedTaskId, {
        hours_spent: Number(timeForm.hours_spent),
        notes: timeForm.notes
      });
      showToast(isAr ? 'تم تسجيل ساعات العمل بنجاح' : 'Time log saved successfully', 'success');
      setShowTimeModal(false);
      setTimeForm({ hours_spent: 1, notes: '' });
      loadData();
    } catch (e: any) {
      showToast(e.message || (isAr ? 'فشل الحفظ' : 'Failed to log time'), 'error');
    }
  };

  const filteredTasks = selectedProjectId === 'ALL'
    ? tasks
    : tasks.filter(t => t.project_id === selectedProjectId);

  const todoTasks = filteredTasks.filter(t => t.status === 'TODO');
  const inProgressTasks = filteredTasks.filter(t => t.status === 'IN_PROGRESS');
  const doneTasks = filteredTasks.filter(t => t.status === 'DONE');

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <FolderKanban className="w-7 h-7 text-indigo-600 dark:text-indigo-400" />
            {isAr ? 'إدارة المشاريع والمهام الهندسية' : 'Engineering Projects & Tasks'}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {isAr
              ? 'متابعة مشاريع صيانة العقود وتوريدات الشركات، وتوزيع المهام على الفنيين وتسجيل ساعات العمل الفعلية'
              : 'Corporate repair contracts, task Kanban boards, and technician labor hours time logging'}
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

          <button
            onClick={() => setShowProjectModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-white font-medium rounded-xl transition-all"
          >
            <Plus className="w-5 h-5" />
            <span>{isAr ? 'مشروع جديد' : 'New Project'}</span>
          </button>

          <button
            onClick={() => setShowTaskModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl shadow-sm transition-all"
          >
            <Plus className="w-5 h-5" />
            <span>{isAr ? 'مهمة جديدة' : 'New Task'}</span>
          </button>
        </div>
      </div>

      {/* Filter by Project */}
      <div className="flex items-center gap-3 overflow-x-auto pb-2">
        <button
          onClick={() => setSelectedProjectId('ALL')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            selectedProjectId === 'ALL'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
          }`}
        >
          {isAr ? 'جميع المشاريع' : 'All Projects'} ({tasks.length})
        </button>
        {projects.map((p) => (
          <button
            key={p.id}
            onClick={() => setSelectedProjectId(p.id)}
            className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
              selectedProjectId === p.id
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            {p.title}
          </button>
        ))}
      </div>

      {loading ? (
        <TableSkeleton rows={4} cols={3} />
      ) : projects.length === 0 && tasks.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title={isAr ? 'لا توجد مشاريع أو مهام بعد' : 'No projects or tasks yet'}
          description={isAr ? 'أنشئ أول مشروع لتنظيم عقود الصيانة الضخمة وتوزيع المهام' : 'Create your first project to distribute tasks to engineers.'}
          actionLabel={isAr ? 'مشروع جديد' : 'New Project'}
          onAction={() => setShowProjectModal(true)}
        />
      ) : (
        /* Kanban Board Columns */
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* TO DO */}
          <div className="bg-slate-50 dark:bg-slate-900/50 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-slate-700 dark:text-slate-200 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-400"></span>
                {isAr ? 'قيد الانتظار' : 'To Do'}
              </h3>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold">
                {todoTasks.length}
              </span>
            </div>

            <div className="space-y-3">
              {todoTasks.map((task) => (
                <div
                  key={task.id}
                  className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2 hover:border-indigo-500 transition-all"
                >
                  <h4 className="font-bold text-slate-900 dark:text-white text-sm">
                    {task.title}
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                    {task.description || (isAr ? 'بدون وصف' : 'No description')}
                  </p>
                  <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <span>{task.assigned_to}</span>
                    <button
                      onClick={() => handleUpdateStatus(task.id, 'IN_PROGRESS')}
                      className="px-2.5 py-1 bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 text-indigo-600 dark:text-indigo-400 rounded-lg font-medium transition-colors"
                    >
                      {isAr ? 'بدء العمل ←' : 'Start →'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* IN PROGRESS */}
          <div className="bg-slate-50 dark:bg-slate-900/50 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-indigo-600 dark:text-indigo-400 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-500"></span>
                {isAr ? 'جاري التنفيذ' : 'In Progress'}
              </h3>
              <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-semibold">
                {inProgressTasks.length}
              </span>
            </div>

            <div className="space-y-3">
              {inProgressTasks.map((task) => (
                <div
                  key={task.id}
                  className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-900 shadow-sm space-y-2"
                >
                  <h4 className="font-bold text-slate-900 dark:text-white text-sm">
                    {task.title}
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                    {task.description || (isAr ? 'بدون وصف' : 'No description')}
                  </p>
                  <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <button
                      onClick={() => {
                        setSelectedTaskId(task.id);
                        setShowTimeModal(true);
                      }}
                      className="flex items-center gap-1 text-slate-600 dark:text-slate-300 hover:text-indigo-600 font-medium"
                    >
                      <Clock className="w-3.5 h-3.5" />
                      {isAr ? 'تسجيل وقت' : 'Log Time'}
                    </button>
                    <button
                      onClick={() => handleUpdateStatus(task.id, 'DONE')}
                      className="px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 text-emerald-600 dark:text-emerald-400 rounded-lg font-medium transition-colors"
                    >
                      {isAr ? 'إنجاز ✓' : 'Complete ✓'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* DONE */}
          <div className="bg-slate-50 dark:bg-slate-900/50 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                {isAr ? 'مكتمل' : 'Done'}
              </h3>
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-semibold">
                {doneTasks.length}
              </span>
            </div>

            <div className="space-y-3">
              {doneTasks.map((task) => (
                <div
                  key={task.id}
                  className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2 opacity-90"
                >
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-slate-900 dark:text-white text-sm line-through text-slate-500">
                      {task.title}
                    </h4>
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <span>{task.assigned_to}</span>
                    <span className="text-emerald-600 font-semibold">{isAr ? 'تم الإنجاز' : 'Completed'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal: New Project */}
      {showProjectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl p-6 space-y-4">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <FolderKanban className="w-5 h-5 text-indigo-600" />
              {isAr ? 'مشروع جديد' : 'New Project'}
            </h2>
            <form onSubmit={handleCreateProject} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? 'اسم المشروع' : 'Project Title'}
                </label>
                <input
                  type="text"
                  required
                  value={projectForm.title}
                  onChange={(e) => setProjectForm({ ...projectForm, title: e.target.value })}
                  placeholder={isAr ? 'صيانة أسطول هواتف شركة كوكاكولا' : 'Corporate Contract Repairs'}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? 'وصف المشروع' : 'Description'}
                </label>
                <textarea
                  value={projectForm.description}
                  onChange={(e) => setProjectForm({ ...projectForm, description: e.target.value })}
                  className="w-full px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm h-20"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {isAr ? 'الميزانية (ج.م)' : 'Budget (EGP)'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={projectForm.budget}
                    onChange={(e) => setProjectForm({ ...projectForm, budget: Number(e.target.value) })}
                    className="w-full px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {isAr ? 'الموعد النهائي' : 'Deadline'}
                  </label>
                  <input
                    type="date"
                    value={projectForm.deadline}
                    onChange={(e) => setProjectForm({ ...projectForm, deadline: e.target.value })}
                    className="w-full px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowProjectModal(false)}
                  className="px-4 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
                >
                  {isAr ? 'حفظ المشروع' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: New Task */}
      {showTaskModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl p-6 space-y-4">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <CheckSquare className="w-5 h-5 text-indigo-600" />
              {isAr ? 'مهمة جديدة' : 'New Task'}
            </h2>
            <form onSubmit={handleCreateTask} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? 'المشروع التابع له' : 'Project'}
                </label>
                <select
                  value={taskForm.project_id}
                  onChange={(e) => setTaskForm({ ...taskForm, project_id: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.title}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? 'عنوان المهمة' : 'Task Title'}
                </label>
                <input
                  type="text"
                  required
                  value={taskForm.title}
                  onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                  placeholder={isAr ? 'فحص شاحن 20 جهاز لوحي' : 'Inspect charging ICs'}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {isAr ? 'المسند إليه' : 'Assigned To'}
                  </label>
                  <input
                    type="text"
                    required
                    value={taskForm.assigned_to}
                    onChange={(e) => setTaskForm({ ...taskForm, assigned_to: e.target.value })}
                    className="w-full px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {isAr ? 'ساعات تقديرية' : 'Est. Hours'}
                  </label>
                  <input
                    type="number"
                    min="0.5"
                    step="0.5"
                    required
                    value={taskForm.estimated_hours}
                    onChange={(e) => setTaskForm({ ...taskForm, estimated_hours: Number(e.target.value) })}
                    className="w-full px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowTaskModal(false)}
                  className="px-4 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
                >
                  {isAr ? 'حفظ المهمة' : 'Create Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Log Task Time */}
      {showTimeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl p-6 space-y-4">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Clock className="w-5 h-5 text-indigo-600" />
              {isAr ? 'تسجيل ساعات العمل الفعلية' : 'Log Task Hours'}
            </h2>
            <form onSubmit={handleLogTime} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? 'الساعات المستغرقة' : 'Hours Spent'}
                </label>
                <input
                  type="number"
                  min="0.25"
                  step="0.25"
                  required
                  value={timeForm.hours_spent}
                  onChange={(e) => setTimeForm({ ...timeForm, hours_spent: Number(e.target.value) })}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? 'ملاحظات العمل المنجز' : 'Work Notes'}
                </label>
                <textarea
                  value={timeForm.notes}
                  onChange={(e) => setTimeForm({ ...timeForm, notes: e.target.value })}
                  placeholder={isAr ? 'تم استبدال آي سي الشحن واختبار سحب التيار' : 'Replaced charging IC and tested draw'}
                  className="w-full px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-sm h-20"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowTimeModal(false)}
                  className="px-4 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
                >
                  {isAr ? 'حفظ الساعات' : 'Log Time'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
