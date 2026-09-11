import React, { useState, useEffect } from 'react';
import { WifiOff, Wifi } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';

export const NetworkStatus: React.FC = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showReconnected, setShowReconnected] = useState(false);
  const { language } = useLanguage();

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setShowReconnected(true);
      setTimeout(() => setShowReconnected(false), 3000);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowReconnected(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline && !showReconnected) return null;

  const isAr = language === 'ar';

  return (
    <div
      className={`fixed bottom-4 right-4 z-50 flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold shadow-lg backdrop-blur-md transition-all ${
        isOnline
          ? 'bg-emerald-950/90 text-emerald-200 border border-emerald-500/30'
          : 'bg-rose-950/90 text-rose-200 border border-rose-500/30 animate-pulse'
      }`}
    >
      {isOnline ? (
        <>
          <Wifi className="w-4 h-4 text-emerald-400" />
          <span>{isAr ? 'تمت استعادة الاتصال' : 'Online'}</span>
        </>
      ) : (
        <>
          <WifiOff className="w-4 h-4 text-rose-400" />
          <span>{isAr ? 'وضع عدم الاتصال (Offline)' : 'Offline Mode (Local SQLite Ready)'}</span>
        </>
      )}
    </div>
  );
};
