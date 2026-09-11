import React, { useState, useEffect } from 'react';
import { FileText, Plus, Trash2, Check, Sparkles, X } from 'lucide-react';

export interface RepairTemplate {
  id: string;
  title: string;
  content: string;
  branch_id?: string;
  created_by?: string;
}

interface NotesTemplatePickerProps {
  onSelectTemplate: (content: string, title: string) => void;
  isAr?: boolean;
}

export const NotesTemplatePicker: React.FC<NotesTemplatePickerProps> = ({
  onSelectTemplate,
  isAr = true
}) => {
  const [templates, setTemplates] = useState<RepairTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showManageModal, setShowManageModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [saving, setSaving] = useState(false);

  const loadTemplates = async () => {
    try {
      const res = await fetch('/api/repair/templates');
      if (res.ok) {
        const data = await res.json();
        setTemplates(data);
      }
    } catch (e) {
      console.error('Failed to load notes templates', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim()) return;

    setSaving(true);
    try {
      const res = await fetch('/api/repair/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle.trim(),
          content: newContent.trim(),
          branch_id: 'WH-MAIN',
          created_by: 'admin'
        })
      });

      if (res.ok) {
        setNewTitle('');
        setNewContent('');
        loadTemplates();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTemplate = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch(`/api/repair/templates/${id}`, { method: 'DELETE' });
      setTemplates(prev => prev.filter(t => t.id !== id));
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5 text-sky-400" />
          {isAr ? 'مكتبة نماذج التشخيص السريعة (Standard Notes):' : 'Quick Diagnosis Templates:'}
        </label>
        <button
          type="button"
          onClick={() => setShowManageModal(true)}
          className="text-[11px] text-sky-400 hover:text-sky-300 font-medium flex items-center gap-1 cursor-pointer transition"
        >
          <Plus className="w-3 h-3" />
          {isAr ? 'إدارة النماذج' : 'Manage'}
        </button>
      </div>

      {/* Badges bar */}
      <div className="flex flex-wrap gap-1.5">
        {loading ? (
          <span className="text-[11px] text-slate-500">{isAr ? 'جاري تحميل النماذج...' : 'Loading templates...'}</span>
        ) : templates.length === 0 ? (
          <span className="text-[11px] text-slate-500">{isAr ? 'لا توجد نماذج مسجلة' : 'No templates found'}</span>
        ) : (
          templates.slice(0, 6).map(tmpl => (
            <button
              key={tmpl.id}
              type="button"
              onClick={() => onSelectTemplate(tmpl.content, tmpl.title)}
              title={tmpl.content}
              className="px-2.5 py-1 bg-slate-900 hover:bg-sky-950/40 text-slate-300 hover:text-sky-300 border border-slate-800 hover:border-sky-700/50 rounded-lg text-[11px] font-medium transition cursor-pointer flex items-center gap-1 shadow-xs"
            >
              <Sparkles className="w-2.5 h-2.5 text-amber-400 shrink-0" />
              <span className="truncate max-w-[180px]">{tmpl.title}</span>
            </button>
          ))
        )}
      </div>

      {/* Modal for adding/deleting templates */}
      {showManageModal && (
        <div className="fixed inset-0 z-60 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-sky-400" />
                {isAr ? 'إدارة مكتبة نماذج تشخيص الصيانة' : 'Manage Repair Notes Templates'}
              </h3>
              <button
                type="button"
                onClick={() => setShowManageModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Create new template form */}
            <form onSubmit={handleCreateTemplate} className="space-y-3 bg-slate-950/60 p-3.5 rounded-xl border border-slate-800">
              <input
                type="text"
                placeholder={isAr ? 'عنوان النموذج (مثال: استبدال شاشة OLED)' : 'Template Title'}
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-sky-500"
                required
              />
              <textarea
                placeholder={isAr ? 'نص التشخيص أو الملاحظة الفنية...' : 'Diagnosis / Technical Notes content...'}
                value={newContent}
                onChange={e => setNewContent(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-sky-500 resize-none h-16"
                required
              />
              <button
                type="submit"
                disabled={saving}
                className="w-full py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-sky-600/20"
              >
                <Plus className="w-3.5 h-3.5" />
                {saving ? (isAr ? 'جاري الحفظ...' : 'Saving...') : (isAr ? 'إضافة نموذج جديد' : 'Add Template')}
              </button>
            </form>

            {/* Existing templates list */}
            <div className="space-y-2 max-h-56 overflow-y-auto">
              <span className="text-[11px] font-semibold text-slate-400 block">
                {isAr ? 'النماذج الحالية المسجلة:' : 'Registered Templates:'}
              </span>
              {templates.map(t => (
                <div
                  key={t.id}
                  className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl flex items-start justify-between gap-3 text-xs"
                >
                  <div className="space-y-0.5 flex-1">
                    <p className="font-bold text-slate-200">{t.title}</p>
                    <p className="text-[11px] text-slate-400 line-clamp-2">{t.content}</p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => handleDeleteTemplate(t.id, e)}
                    className="p-1 text-slate-500 hover:text-rose-400 transition"
                    title={isAr ? 'حذف' : 'Delete'}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default NotesTemplatePicker;
