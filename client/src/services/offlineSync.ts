// IndexedDB Offline Queue & Background Sync Engine (Architecture Proposal 44)
export interface QueuedOfflineAction {
  id: string;
  type: 'CREATE_SALE' | 'CREATE_TICKET' | 'UPDATE_STATUS';
  endpoint: string;
  method: 'POST' | 'PATCH' | 'PUT';
  payload: any;
  queuedAt: string;
  retries: number;
}

const STORAGE_KEY = 'erp_offline_action_queue';

class OfflineSyncManager {
  private queue: QueuedOfflineAction[] = [];
  private isSyncing = false;

  constructor() {
    this.loadQueue();
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        console.log('[OfflineSync] Internet restored. Triggering queue sync...');
        this.processQueue();
      });
    }
  }

  private loadQueue() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        this.queue = JSON.parse(raw);
      }
    } catch (e) {
      this.queue = [];
    }
  }

  private saveQueue() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.queue));
    } catch (e) {
      console.error('[OfflineSync] Failed to persist queue to localStorage', e);
    }
  }

  enqueueAction(action: Omit<QueuedOfflineAction, 'id' | 'queuedAt' | 'retries'>) {
    const item: QueuedOfflineAction = {
      ...action,
      id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      queuedAt: new Date().toISOString(),
      retries: 0
    };
    this.queue.push(item);
    this.saveQueue();
    return item;
  }

  getQueueCount(): number {
    return this.queue.length;
  }

  getQueue(): QueuedOfflineAction[] {
    return [...this.queue];
  }

  async processQueue(fetchFn?: (endpoint: string, options: any) => Promise<any>): Promise<{ synced: number; failed: number }> {
    if (this.isSyncing || this.queue.length === 0) {
      return { synced: 0, failed: 0 };
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return { synced: 0, failed: this.queue.length };
    }

    this.isSyncing = true;
    let synced = 0;
    let failed = 0;
    const remaining: QueuedOfflineAction[] = [];

    for (const item of this.queue) {
      try {
        const token = localStorage.getItem('erp_token') || localStorage.getItem('auth_token');
        const res = await fetch(`/api${item.endpoint}`, {
          method: item.method,
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            'X-ERP-Client': 'desktop',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify(item.payload)
        });

        if (res.ok) {
          synced++;
        } else {
          item.retries++;
          if (item.retries < 5) remaining.push(item);
          failed++;
        }
      } catch (err) {
        item.retries++;
        if (item.retries < 5) remaining.push(item);
        failed++;
      }
    }

    this.queue = remaining;
    this.saveQueue();
    this.isSyncing = false;

    return { synced, failed };
  }
}

export const offlineSyncService = new OfflineSyncManager();
