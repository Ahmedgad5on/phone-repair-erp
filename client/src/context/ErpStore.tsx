import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, Shift, Store } from '../types/erp';
import { api } from '../services/api';

interface ErpStoreContextType {
  currentUser: User | null;
  setCurrentUser: (user: User | null) => void;
  activeShift: Shift | null;
  setActiveShift: (shift: Shift | null) => void;
  store: Store | null;
  setStore: (store: Store | null) => void;
  cfdCart: any[];
  setCfdCart: (cart: any[]) => void;
  refreshShift: () => Promise<void>;
}

const ErpStoreContext = createContext<ErpStoreContextType | undefined>(undefined);

export const ErpStoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeShift, setActiveShift] = useState<Shift | null>(null);
  const [store, setStore] = useState<Store | null>(null);
  const [cfdCart, setCfdCart] = useState<any[]>([]);

  const refreshShift = async () => {
    try {
      const data = await api.getCurrentShift();
      setActiveShift(data?.activeShift || null);
    } catch (e) {
      console.error('[ErpStore] Failed to refresh shift', e);
    }
  };

  return (
    <ErpStoreContext.Provider
      value={{
        currentUser,
        setCurrentUser,
        activeShift,
        setActiveShift,
        store,
        setStore,
        cfdCart,
        setCfdCart,
        refreshShift
      }}
    >
      {children}
    </ErpStoreContext.Provider>
  );
};

export function useErpStore() {
  const context = useContext(ErpStoreContext);
  if (!context) {
    throw new Error('useErpStore must be used within an ErpStoreProvider');
  }
  return context;
}
