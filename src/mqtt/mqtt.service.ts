import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as mqtt from 'mqtt';

@Injectable()
export class MqttService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MqttService.name);
  private client: mqtt.MqttClient;
  private readonly messageHandlers = new Map<
    string,
    ((payload: string) => void)[]
  >();
  private statusUpdateCallback:
    | ((payload: MachineStatusPayload) => void)
    | null = null;
  private orderStatusCallback: ((payload: OrderStatusPayload) => void) | null =
    null;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const brokerUrl =
      this.configService.get<string>('MQTT_BROKER_URL', { infer: true }) ??
      'mqtt://broker.hivemq.com:1883';
    const clientId = `qfox_vending_${Math.random().toString(16).slice(2, 8)}`;

    this.client = mqtt.connect(brokerUrl, {
      clientId,
      clean: true,
      connectTimeout: 4000,
      reconnectPeriod: 5000,
    });

    this.client.on('connect', () => {
      this.logger.log(`MQTT connected to ${brokerUrl}`);
      // Subscribe to machine response topics (same as reference hardware)
      this.client.subscribe('machine/status/update', { qos: 1 });
      this.client.subscribe('machine/order/status', { qos: 1 });
    });

    this.client.on('error', (err) => {
      this.logger.error('MQTT connection error', err.message);
    });

    this.client.on('message', (topic: string, message: Buffer) => {
      const raw = message.toString();

      // Handle machine status updates
      if (topic === 'machine/status/update') {
        try {
          const payload: MachineStatusPayload = JSON.parse(raw);
          if (this.statusUpdateCallback) this.statusUpdateCallback(payload);
        } catch {
          this.logger.warn('Failed to parse machine/status/update payload');
        }
        return;
      }

      // Handle order status updates from machine
      if (topic === 'machine/order/status') {
        try {
          const payload: OrderStatusPayload = JSON.parse(raw);
          if (this.orderStatusCallback) this.orderStatusCallback(payload);
        } catch {
          this.logger.warn('Failed to parse machine/order/status payload');
        }
        return;
      }

      // Generic handler fallback
      const handlers = this.messageHandlers.get(topic) || [];
      handlers.forEach((handler) => handler(raw));
    });
  }

  onModuleDestroy() {
    this.client?.end();
  }

  // ─── Register callbacks (called from MachinesService / OrdersService) ───────

  onMachineStatusUpdate(cb: (payload: MachineStatusPayload) => void): void {
    this.statusUpdateCallback = cb;
  }

  onOrderStatusUpdate(cb: (payload: OrderStatusPayload) => void): void {
    this.orderStatusCallback = cb;
  }

  // ─── Generic pub/sub ─────────────────────────────────────────────────────────

  publish(topic: string, payload: string | object): Promise<void> {
    const message =
      typeof payload === 'string' ? payload : JSON.stringify(payload);
    return new Promise((resolve, reject) => {
      this.client.publish(topic, message, { qos: 1 }, (err) => {
        if (err) {
          this.logger.error(`MQTT publish error on ${topic}`, err.message);
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  subscribe(topic: string, handler: (payload: string) => void): void {
    if (!this.messageHandlers.has(topic)) {
      this.messageHandlers.set(topic, []);
      this.client.subscribe(topic, { qos: 1 }, (err) => {
        if (err)
          this.logger.error(`MQTT subscribe error on ${topic}`, err.message);
      });
    }
    this.messageHandlers.get(topic)!.push(handler);
  }

  // ─── Machine-specific publishers ─────────────────────────────────────────────

  /**
   * Send dispense command to machine.
   * Topic: machine/order/{machineId}
   * Payload matches reference hardware format:
   *   Coffee: ord = N{nozzle}-{name}-{qty}-{waterTimer}-{powderTimer}
   *   Food:   ord = N{nozzle}-{name}-{qty}-   (no timers)
   */
  dispense(
    machineId: string,
    itemId: string,
    cupSize: string,
    quantity: number,
    nozzle?: number,
    itemName?: string,
    timerOfWater?: number,
    timerOfPowder?: number,
    orderId?: string,
    userName?: string,
    machineType: 'coffee' | 'food' = 'coffee',
  ): Promise<void> {
    const ordStr =
      machineType === 'food'
        ? `N${nozzle ?? 1}-${itemName ?? itemId}-${quantity}-`
        : `N${nozzle ?? 1}-${itemName ?? itemId}-${quantity}-${timerOfWater ?? 5000}-${timerOfPowder ?? 3000}`;
    return this.publish(`machine/order/${machineId}`, {
      ord_id: orderId ?? `ORD-${Date.now()}`,
      user: userName ?? 'customer',
      ord: ordStr,
      status: 'pending',
      // Also include structured format for newer firmware
      itemId,
      cupSize,
      quantity,
    });
  }

  flush(machineId: string, type: 'daily' | 'weekly'): void {
    void this.publish(`machine/${machineId}/flush`, {
      type,
      timestamp: new Date().toISOString(),
    });
    // Also send via log topic (reference format)
    void this.publish(`machine/log/${machineId}`, {
      flush: 'true',
      sleep: 'false',
      configMode: 'false',
    });
  }

  flushAll(machineIds: string[], type: 'daily' | 'weekly'): void {
    machineIds.forEach((id) => this.flush(id, type));
  }

  calibrate(machineId: string, calibrationData: object): void {
    void this.publish(`machine/${machineId}/calibrate`, calibrationData);
    void this.publish(`machine/log/${machineId}`, {
      configMode: 'true',
      ...calibrationData,
    });
  }

  requestStatus(machineId: string): void {
    void this.publish(`machine/${machineId}/status/request`, {
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Send sleep command to machine (old backend: sleep_mode).
   * Topic: machine/log/{machineId}
   */
  sleep(machineId: string): void {
    void this.publish(`machine/log/${machineId}`, {
      flush: 'false',
      sleep: 'true',
      configMode: 'false',
    });
  }

  /**
   * Wake machine from sleep mode.
   * Topic: machine/log/{machineId}
   */
  wake(machineId: string): void {
    void this.publish(`machine/log/${machineId}`, {
      flush: 'false',
      sleep: 'false',
      configMode: 'false',
    });
  }
}

// ─── Payload types ────────────────────────────────────────────────────────────

export interface MachineStatusPayload {
  machine_id: string;
  status?: 'online' | 'offline' | 'busy';
  error?: string;
  sensor?: {
    temp?: number;
    water?: string;
    powderlevel?: { canister: number; level: number }[];
  };
}

export interface OrderStatusPayload {
  id: string; // order id
  status: 'completed' | 'processing' | 'cancelled' | 'half-completed';
  items?: {
    item_id: string;
    remaining_qty: number;
    status: string;
  }[];
}
