import { v4 as uuidv4 } from 'uuid';
import { logger } from './logger';

export type JobType = 'GENERATE_PDF' | 'SEND_EMAIL_CAMPAIGN' | 'DISPATCH_SMS' | 'SYNC_ECOMMERCE' | 'DAILY_BACKUP';

export interface Job<T = any> {
  id: string;
  type: JobType;
  data: T;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  retries: number;
  maxRetries: number;
  error?: string;
  result?: any;
  createdAt: string;
  completedAt?: string;
}

type JobHandler<T = any> = (job: Job<T>) => Promise<any>;

class AsynchronousQueueManager {
  private queue: Job[] = [];
  private handlers = new Map<JobType, JobHandler>();
  private isProcessing = false;

  constructor() {
    // Start background worker loop
    setInterval(() => this.processNext(), 1000);
  }

  registerHandler<T = any>(type: JobType, handler: JobHandler<T>): void {
    this.handlers.set(type, handler);
  }

  enqueue<T = any>(type: JobType, data: T, maxRetries: number = 3): Job<T> {
    const job: Job<T> = {
      id: `job-${uuidv4().slice(0, 8)}`,
      type,
      data,
      status: 'PENDING',
      retries: 0,
      maxRetries,
      createdAt: new Date().toISOString()
    };

    this.queue.push(job);
    logger.info(`Enqueued background job ${job.id} [${job.type}]`, 'QueueService');
    return job;
  }

  private async processNext(): Promise<void> {
    if (this.isProcessing) return;
    const pendingJob = this.queue.find(j => j.status === 'PENDING');
    if (!pendingJob) return;

    this.isProcessing = true;
    pendingJob.status = 'PROCESSING';

    const handler = this.handlers.get(pendingJob.type);
    if (!handler) {
      logger.warn(`No handler registered for job type: ${pendingJob.type}`, 'QueueService');
      pendingJob.status = 'FAILED';
      pendingJob.error = 'No handler registered';
      this.isProcessing = false;
      return;
    }

    try {
      const result = await handler(pendingJob);
      pendingJob.status = 'COMPLETED';
      pendingJob.result = result;
      pendingJob.completedAt = new Date().toISOString();
      logger.info(`Completed background job ${pendingJob.id} [${pendingJob.type}]`, 'QueueService');
    } catch (err: any) {
      pendingJob.retries += 1;
      logger.error(`Error processing job ${pendingJob.id} (Attempt ${pendingJob.retries}/${pendingJob.maxRetries}): ${err.message}`, 'QueueService');
      
      if (pendingJob.retries < pendingJob.maxRetries) {
        pendingJob.status = 'PENDING'; // Retry
      } else {
        pendingJob.status = 'FAILED';
        pendingJob.error = err.message;
      }
    } finally {
      this.isProcessing = false;
    }
  }

  getJob(id: string): Job | undefined {
    return this.queue.find(j => j.id === id);
  }

  getStats(): { pending: number; processing: number; completed: number; failed: number; total: number } {
    return {
      pending: this.queue.filter(j => j.status === 'PENDING').length,
      processing: this.queue.filter(j => j.status === 'PROCESSING').length,
      completed: this.queue.filter(j => j.status === 'COMPLETED').length,
      failed: this.queue.filter(j => j.status === 'FAILED').length,
      total: this.queue.length
    };
  }
}

export const queueService = new AsynchronousQueueManager();
