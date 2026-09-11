import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { logger } from './logger';

export interface SystemEvent {
  type: string;
  data: any;
  timestamp: string;
}

class WebSocketManager {
  private wss: WebSocketServer | null = null;
  private clients = new Set<WebSocket>();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  init(server: Server) {
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', (ws: WebSocket, req) => {
      (ws as any).isAlive = true;
      this.clients.add(ws);
      const ip = req.socket.remoteAddress;
      logger.info(`WebSocket client connected from ${ip}. Total clients: ${this.clients.size}`, 'WebSocket');

      // Send initial connection handshake
      ws.send(JSON.stringify({
        type: 'CONNECTED',
        data: { message: 'Modular Mobile ERP WebSocket Gateway Connected', activeClients: this.clients.size },
        timestamp: new Date().toISOString()
      }));

      ws.on('pong', () => {
        (ws as any).isAlive = true;
      });

      ws.on('message', (message: string) => {
        try {
          const parsed = JSON.parse(message.toString());
          if (parsed.type === 'PING') {
            (ws as any).isAlive = true;
            ws.send(JSON.stringify({ type: 'PONG', timestamp: new Date().toISOString() }));
          }
        } catch (e) {
          // ignore malformed ping
        }
      });

      ws.on('close', () => {
        this.clients.delete(ws);
        logger.info(`WebSocket client disconnected. Remaining clients: ${this.clients.size}`, 'WebSocket');
      });

      ws.on('error', (err) => {
        logger.error(`WebSocket client error: ${err.message}`, 'WebSocket');
        this.clients.delete(ws);
      });
    });

    // Ghost socket purge / WebSocket heartbeat (Maintenance Proposal 47)
    this.heartbeatInterval = setInterval(() => {
      for (const client of this.clients) {
        if ((client as any).isAlive === false) {
          logger.warn('Purging ghost WebSocket client (inactive / dead connection)', 'WebSocket');
          client.terminate();
          this.clients.delete(client);
          continue;
        }
        (client as any).isAlive = false;
        client.ping();
      }
    }, 30000);

    logger.info('WebSocket Server initialized at /ws with 30s heartbeat & ghost purge', 'WebSocket');
  }

  broadcast(type: string, data: any) {
    const payload: SystemEvent = {
      type,
      data,
      timestamp: new Date().toISOString()
    };

    const message = JSON.stringify(payload);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }

  getActiveClientsCount(): number {
    return this.clients.size;
  }

  stop() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.wss) {
      this.wss.close();
    }
  }
}

export const wsService = new WebSocketManager();
