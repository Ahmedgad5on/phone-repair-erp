export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: string;
  correlationId?: string;
  metadata?: any;
}

class StructuredLogger {
  private format(entry: LogEntry): string {
    const meta = entry.metadata ? ` | ${JSON.stringify(entry.metadata)}` : '';
    const ctx = entry.context ? `[${entry.context}] ` : '';
    const corr = entry.correlationId ? `[ReqID: ${entry.correlationId}] ` : '';
    return `${entry.timestamp} [${entry.level}] ${ctx}${corr}${entry.message}${meta}`;
  }

  private log(level: LogLevel, message: string, context?: string, metadata?: any, correlationId?: string) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      correlationId,
      metadata
    };

    if (process.env.LOG_FORMAT === 'json') {
      console.log(JSON.stringify(entry));
      return;
    }

    const formatted = this.format(entry);
    if (level === 'ERROR') {
      console.error(formatted);
    } else if (level === 'WARN') {
      console.warn(formatted);
    } else {
      console.log(formatted);
    }
  }

  debug(message: string, context?: string, metadata?: any, correlationId?: string) {
    if (process.env.NODE_ENV !== 'production') {
      this.log('DEBUG', message, context, metadata, correlationId);
    }
  }

  info(message: string, context?: string, metadata?: any, correlationId?: string) {
    this.log('INFO', message, context, metadata, correlationId);
  }

  warn(message: string, context?: string, metadata?: any, correlationId?: string) {
    this.log('WARN', message, context, metadata, correlationId);
  }

  error(message: string, context?: string, metadata?: any, correlationId?: string) {
    this.log('ERROR', message, context, metadata, correlationId);
  }
}

export const logger = new StructuredLogger();
