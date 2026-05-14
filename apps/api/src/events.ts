import type { WebSocket } from 'ws';
import type { DesktopEvent } from '@trading-journal/shared';

const clients = new Set<WebSocket>();

export function addEventClient(socket: WebSocket) {
  clients.add(socket);
  socket.on('close', () => clients.delete(socket));
  socket.on('error', () => clients.delete(socket));
}

export function publishDesktopEvent(event: DesktopEvent) {
  const payload = JSON.stringify(event);
  for (const client of clients) {
    if (client.readyState === client.OPEN) client.send(payload);
  }
}
