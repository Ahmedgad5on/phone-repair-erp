import React, { useState, useEffect } from 'react';
import { Bell, CheckCheck, X, AlertTriangle, Sparkles, Wrench, DollarSign } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';

export interface AppNotification {
  id: string;
  type: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
}

export const NotificationsCenter: React.FC = () => {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([
    {
      id: 'notif-init-1',
      type: 'INFO',
      title: 'بدء تشغيل النظام',
      message: 'نظام ERP جاهز للعمل بكامل الموديولات المعيارية والمحلية.',
      timestamp: new Date().toLocaleTimeString('ar-EG'),
      read: false
    }
  ]);

  useEffect(() => {
    let ws: WebSocket | null = null;
    try {
      const wsUrl = `ws://${window.location.hostname}:5000/ws`;
      ws = new WebSocket(wsUrl);

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'CONNECTED' || payload.type === 'PONG') return;

          let notifTitle = 'إشعار جديد';
          let notifMsg = JSON.stringify(payload.data);
          let type: AppNotification['type'] = 'INFO';

          if (payload.type === 'TICKET_CREATED' || payload.type === 'APPOINTMENT_BOOKED') {
            notifTitle = 'حجز / صيانة جديدة';
            notifMsg = `تم تسجيل موعد صيانة جديد: ${payload.data.customer_name || payload.data.id}`;
            type = 'SUCCESS';
          } else if (payload.type === 'SALE_COMPLETED') {
            notifTitle = 'فاتورة مبيعات';
            notifMsg = `تم تنفيذ بيع جديد بقيمة ${payload.data.total || 0} ج.م`;
            type = 'SUCCESS';
          } else if (payload.type === 'LOW_STOCK_ALERT') {
            notifTitle = 'تنبيه مخزون منخفض';
            notifMsg = `صنف قارب على النفاد بالمخزن: ${payload.data.name}`;
            type = 'WARNING';
          }

          const newNotif: AppNotification = {
            id: `notif-${Date.now()}`,
            type,
            title: notifTitle,
            message: notifMsg,
            timestamp: new Date().toLocaleTimeString('ar-EG'),
            read: false
          };

          setNotifications(prev => [newNotif, ...prev].slice(0, 30));
        } catch (e) {
          // ignore
        }
      };
    } catch (e) {
      console.warn('WebSocket unavailable in current context');
    }

    return () => {
      if (ws) ws.close();
    };
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  return (
    <div className="relative">
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 hover:text-white transition border border-slate-700/60 cursor-pointer"
        title={isAr ? 'مركز الإشعارات الحية' : 'Notifications'}
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notifications Drawer Dropdown */}
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute end-0 mt-2 w-80 sm:w-96 bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl z-50 overflow-hidden text-xs animate-in fade-in slide-in-from-top-2">
            <div className="p-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-indigo-400" />
                <strong className="text-white font-semibold">{isAr ? 'مركز الإشعارات الحية' : 'Live Notifications'}</strong>
                <span className="bg-indigo-950 text-indigo-300 border border-indigo-800 px-1.5 py-0.2 rounded font-mono text-[10px]">
                  {unreadCount} {isAr ? 'جديد' : 'new'}
                </span>
              </div>
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="text-slate-400 hover:text-white flex items-center gap-1 text-[11px] transition"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  {isAr ? 'تحديد الكل كمقروء' : 'Mark all read'}
                </button>
              )}
            </div>

            <div className="max-h-96 overflow-y-auto divide-y divide-slate-800/60 p-1">
              {notifications.map(n => (
                <div
                  key={n.id}
                  className={`p-3 rounded-xl transition flex items-start justify-between gap-2.5 ${
                    !n.read ? 'bg-indigo-950/20 border-s-2 border-indigo-500' : 'hover:bg-slate-800/30'
                  }`}
                >
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-white text-[11px]">{n.title}</span>
                      <span className="text-[10px] font-mono text-slate-500">{n.timestamp}</span>
                    </div>
                    <p className="text-slate-300 text-[11px] leading-relaxed">{n.message}</p>
                  </div>
                  <button
                    onClick={() => removeNotification(n.id)}
                    className="text-slate-500 hover:text-slate-300 p-0.5"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}

              {notifications.length === 0 && (
                <div className="py-8 text-center text-slate-500">
                  {isAr ? 'لا توجد إشعارات جديدة حالياً' : 'No notifications'}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
