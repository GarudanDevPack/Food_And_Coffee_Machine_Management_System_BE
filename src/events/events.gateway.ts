import { Injectable } from '@nestjs/common';
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';

@Injectable()
@WebSocketGateway({ cors: { origin: '*' } })
export class EventsGateway {
  @WebSocketServer()
  server: Server;

  emitMachineStatus(data: {
    machineId: string;
    isOnline?: boolean;
    sleepMode?: boolean;
    flushMode?: boolean;
    error?: string;
    sensor?: Record<string, any>;
  }) {
    this.server.emit('machine:status', data);
  }

  emitOrderStatus(data: {
    orderId: string;
    machineId?: string;
    status?: string;
    failureReason?: string;
  }) {
    this.server.emit('order:status', data);
  }
}
