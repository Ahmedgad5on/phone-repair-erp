import React, { useState, useEffect } from 'react';
import { RepairTicket } from '../../types/erp';
import { Camera, Image as ImageIcon, Plus, Trash2, X, Eye, Clock, CheckCircle, Upload, AlertCircle } from 'lucide-react';

export interface TicketPhoto {
  id: string;
  ticket_id: string;
  url: string;
  stage: 'BEFORE' | 'DURING' | 'AFTER';
  caption?: string;
  taken_at: string;
}

interface PhotoTimelinePanelProps {
  ticket: RepairTicket;
  isOpen: boolean;
  onClose: () => void;
  isAr?: boolean;
}

export const PhotoTimelinePanel: React.FC<PhotoTimelinePanelProps> = ({
  ticket,
  isOpen,
  onClose,
  isAr = true
}) => {
  const [photos, setPhotos] = useState<TicketPhoto[]>([]);
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'BEFORE' | 'DURING' | 'AFTER'>('ALL');
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // New photo form
  const [stage, setStage] = useState<'BEFORE' | 'DURING' | 'AFTER'>('BEFORE');
  const [caption, setCaption] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileBase64, setFileBase64] = useState<string | null>(null);

  const loadPhotos = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/repair/tickets/${ticket.id}/photos`);
      if (res.ok) {
        const data = await res.json();
        setPhotos(data);
      }
    } catch (err: any) {
      console.error('Failed to load ticket photos:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadPhotos();
    }
  }, [isOpen, ticket.id]);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);

      const reader = new FileReader();
      reader.onload = () => {
        setFileBase64(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUploadPhoto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fileBase64) {
      setError(isAr ? 'يرجى اختيار صورة أولاً' : 'Please select an image first');
      return;
    }

    setUploading(true);
    setError(null);
    try {
      const res = await fetch(`/api/repair/tickets/${ticket.id}/photos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: fileBase64,
          stage,
          caption
        })
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to upload photo');
      }

      setSelectedFile(null);
      setFileBase64(null);
      setCaption('');
      loadPhotos();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDeletePhoto = async (photoId: string) => {
    if (!window.confirm(isAr ? 'هل أنت متأكد من حذف هذه الصورة التوثيقية؟' : 'Are you sure you want to delete this photo?')) {
      return;
    }
    try {
      await fetch(`/api/repair/tickets/${ticket.id}/photos/${photoId}`, { method: 'DELETE' });
      setPhotos(prev => prev.filter(p => p.id !== photoId));
    } catch (err: any) {
      alert(err.message || 'Failed to delete photo');
    }
  };

  const filteredPhotos = activeFilter === 'ALL' ? photos : photos.filter(p => p.stage === activeFilter);

  const getStageBadge = (st: string) => {
    switch (st) {
      case 'BEFORE':
        return {
          label: isAr ? 'قبل الصيانة (Intake)' : 'Before Repair',
          color: 'bg-rose-500/10 text-rose-400 border-rose-500/30'
        };
      case 'DURING':
        return {
          label: isAr ? 'أثناء الصيانة (Lab Work)' : 'During Repair',
          color: 'bg-sky-500/10 text-sky-400 border-sky-500/30'
        };
      case 'AFTER':
        return {
          label: isAr ? 'بعد الصيانة (Ready)' : 'After Repair',
          color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
        };
      default:
        return { label: st, color: 'bg-slate-800 text-slate-300 border-slate-700' };
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                {isAr ? 'معرض التوثيق الفوتوغرافي للأعطال' : 'Photo Evidence Timeline'}
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-sky-400 border border-slate-700 font-mono">
                  #{ticket.ticket_number}
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {ticket.device_brand} {ticket.device_model} — {isAr ? 'توثيق حالة الجهاز (قبل / أثناء / بعد الصيانة)' : 'Visual chronological proof (Before / During / After)'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filters and Upload Header */}
        <div className="px-6 py-3 bg-slate-950/50 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 p-1 rounded-xl">
            {(['ALL', 'BEFORE', 'DURING', 'AFTER'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveFilter(tab)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  activeFilter === tab
                    ? 'bg-sky-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {tab === 'ALL' ? (isAr ? 'الكل' : 'All Photos') :
                 tab === 'BEFORE' ? (isAr ? 'قبل الصيانة' : 'Before') :
                 tab === 'DURING' ? (isAr ? 'أثناء الصيانة' : 'During') :
                 (isAr ? 'بعد الصيانة' : 'After')}
                <span className="ms-1.5 text-[10px] opacity-75 font-mono">
                  ({tab === 'ALL' ? photos.length : photos.filter(p => p.stage === tab).length})
                </span>
              </button>
            ))}
          </div>

          <span className="text-xs text-slate-400">
            {isAr ? `إجمالي الصور المسجلة: ${photos.length}` : `Total Evidence: ${photos.length}`}
          </span>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Quick Photo Upload Form */}
          <form onSubmit={handleUploadPhoto} className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-3">
            <h4 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <Plus className="w-4 h-4 text-sky-400" />
              {isAr ? 'إضافة صورة توثيقية جديدة' : 'Add New Evidence Photo'}
            </h4>

            {error && (
              <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-lg text-xs text-rose-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label className="text-[11px] font-medium text-slate-400 block mb-1">
                  {isAr ? 'مرحلة الصورة:' : 'Stage:'}
                </label>
                <select
                  value={stage}
                  onChange={e => setStage(e.target.value as any)}
                  className="w-full bg-slate-900 border border-slate-700 text-xs text-white rounded-lg p-2 focus:outline-hidden focus:border-sky-500"
                >
                  <option value="BEFORE">{isAr ? 'قبل الصيانة (استلام)' : 'Before (Intake Condition)'}</option>
                  <option value="DURING">{isAr ? 'أثناء الصيانة (المجهر/اللحام)' : 'During (Board Repair)'}</option>
                  <option value="AFTER">{isAr ? 'بعد الصيانة (جاهز للتسليم)' : 'After (Completed / QA)'}</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="text-[11px] font-medium text-slate-400 block mb-1">
                  {isAr ? 'وصف الصورة أو ملاحظة الفني:' : 'Caption / Observation:'}
                </label>
                <input
                  type="text"
                  value={caption}
                  onChange={e => setCaption(e.target.value)}
                  placeholder={isAr ? 'مثال: كسر زجاج الشاشة الخارجي، لحام مسار الشحن...' : 'e.g. Broken digitizer glass, micro-jumper wire soldered...'}
                  className="w-full bg-slate-900 border border-slate-700 text-xs text-white rounded-lg p-2 focus:outline-hidden focus:border-sky-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-slate-400 block mb-1">
                  {isAr ? 'ملف الصورة:' : 'Image File:'}
                </label>
                <label className="flex items-center justify-center gap-2 w-full p-2 bg-slate-800 hover:bg-slate-750 border border-dashed border-slate-600 rounded-lg text-xs text-slate-300 cursor-pointer transition">
                  <Upload className="w-4 h-4 text-sky-400" />
                  <span className="truncate">{selectedFile ? selectedFile.name : (isAr ? 'اختر صورة...' : 'Browse...')}</span>
                  <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
                </label>
              </div>
            </div>

            {fileBase64 && (
              <div className="flex items-center gap-3 pt-2">
                <img src={fileBase64} alt="Preview" className="w-14 h-14 rounded-lg object-cover border border-slate-700" />
                <button
                  type="submit"
                  disabled={uploading}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-bold shadow-md shadow-sky-600/30 transition flex items-center gap-2 cursor-pointer"
                >
                  <CheckCircle className="w-4 h-4" />
                  {uploading ? (isAr ? 'جاري الرفع...' : 'Uploading...') : (isAr ? 'رفع وحفظ الصورة' : 'Save Photo')}
                </button>
              </div>
            )}
          </form>

          {/* Photos Grid Timeline */}
          {loading ? (
            <div className="py-12 text-center text-xs text-slate-400 flex flex-col items-center justify-center gap-2">
              <div className="w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
              <span>{isAr ? 'جاري تحميل التوثيق...' : 'Loading photos...'}</span>
            </div>
          ) : filteredPhotos.length === 0 ? (
            <div className="py-16 text-center border border-dashed border-slate-800 rounded-2xl bg-slate-950/40">
              <ImageIcon className="w-10 h-10 text-slate-600 mx-auto mb-2" />
              <p className="text-xs text-slate-400">
                {isAr ? 'لا توجد صور مسجلة في هذا القسم بعد' : 'No photos recorded in this stage yet'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {filteredPhotos.map(photo => {
                const badge = getStageBadge(photo.stage);
                return (
                  <div
                    key={photo.id}
                    className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden group shadow-lg flex flex-col justify-between transition hover:border-slate-700"
                  >
                    <div className="relative aspect-video bg-slate-900 overflow-hidden cursor-pointer" onClick={() => setPreviewImage(photo.url)}>
                      <img
                        src={photo.url}
                        alt={photo.caption || 'Evidence'}
                        className="w-full h-full object-cover transition duration-300 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-3">
                        <span className="p-2 bg-slate-900/80 rounded-full text-white">
                          <Eye className="w-4 h-4" />
                        </span>
                      </div>
                      <span className={`absolute top-2 start-2 text-[10px] font-bold px-2 py-0.5 rounded-md border ${badge.color}`}>
                        {badge.label}
                      </span>
                    </div>

                    <div className="p-3 space-y-2">
                      <p className="text-xs text-slate-200 font-medium line-clamp-2">
                        {photo.caption || (isAr ? 'توثيق حالة الجهاز' : 'Inspection Evidence')}
                      </p>
                      <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-900">
                        <span className="flex items-center gap-1 font-mono">
                          <Clock className="w-3 h-3" />
                          {new Date(photo.taken_at).toLocaleDateString()} {new Date(photo.taken_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <button
                          onClick={() => handleDeletePhoto(photo.id)}
                          className="text-slate-500 hover:text-rose-400 transition p-1"
                          title={isAr ? 'حذف الصورة' : 'Delete Photo'}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Full Image Preview Modal */}
        {previewImage && (
          <div
            className="fixed inset-0 z-60 bg-black/90 flex items-center justify-center p-4"
            onClick={() => setPreviewImage(null)}
          >
            <div className="relative max-w-4xl max-h-[90vh]">
              <img src={previewImage} alt="Full view" className="max-w-full max-h-[85vh] rounded-xl object-contain shadow-2xl" />
              <button
                onClick={() => setPreviewImage(null)}
                className="absolute top-3 end-3 p-2 bg-slate-900/80 rounded-full text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
export default PhotoTimelinePanel;
