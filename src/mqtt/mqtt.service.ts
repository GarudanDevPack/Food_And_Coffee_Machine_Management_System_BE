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
    // Build connection options matching old backend format (MQTT_HOST/PORT/USER/PASS)
    const mqttHost =
      this.configService.get<string>('MQTT_HOST', { infer: true }) ??
      'broker.hivemq.com';
    const mqttPort =
      this.configService.get<string>('MQTT_PORT', { infer: true }) ?? '1883';
    // Use mqtts:// for TLS port 8883, mqtt:// otherwise
    const scheme = mqttPort === '8883' ? 'mqtts' : 'mqtt';
    const brokerUrl =
      this.configService.get<string>('MQTT_BROKER_URL', { infer: true }) ||
      `${scheme}://${mqttHost}:${mqttPort}`;

    const clientId =
      this.configService.get<string>('MQTT_CLIENT_ID', { infer: true }) ??
      `qfox_vending_${Math.random().toString(16).slice(2, 8)}`;

    const username = this.configService.get<string>('MQTT_USERNAME', {
      infer: true,
    });
    const password = this.configService.get<string>('MQTT_PASSWORD', {
      infer: true,
    });

    this.client = mqtt.connect(brokerUrl, {
      clientId,
      clean: true,
      connectTimeout: 4000,
      reconnectPeriod: 5000,
      ...(username ? { username } : {}),
      ...(password ? { password } : {}),
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

    this.client.on('reconnect', () => {
      this.logger.warn(
        'MQTT reconnecting — possible clientId conflict or broker disconnect',
      );
    });

    this.client.on('offline', () => {
      this.logger.warn('MQTT client went offline');
    });

    this.client.on('message', (topic: string, message: Buffer) => {
      const raw = message.toString();
      try {
        const parsed = JSON.parse(raw);
        this.logger.log(
          `[MQTT ←] ${topic}\n${JSON.stringify(parsed, null, 2)}`,
        );
      } catch {
        this.logger.log(`[MQTT ←] ${topic} | ${raw}`);
      }

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
          const raw_payload = JSON.parse(raw);
          let payload: OrderStatusPayload;

          // Normalize old firmware format: { command: { ord_id, ord, status } }
          if (raw_payload.command) {
            const cmd = raw_payload.command as Record<string, string>;
            const rawStatus = (cmd.status ?? '').toLowerCase();
            let normalizedStatus: OrderStatusPayload['status'] = 'processing';
            if (rawStatus === 'processing') normalizedStatus = 'processing';
            else if (rawStatus.includes('completed'))
              normalizedStatus = 'completed';
            else if (rawStatus.includes('cancel'))
              normalizedStatus = 'cancelled';
            payload = {
              id: cmd.ord_id,
              ord: cmd.ord,
              status: normalizedStatus,
            };
          } else {
            payload = raw_payload as OrderStatusPayload;
          }

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

  publish(
    topic: string,
    payload: string | object,
    options: { retain?: boolean; qos?: 0 | 1 | 2 } = {},
  ): Promise<void> {
    const message =
      typeof payload === 'string' ? payload : JSON.stringify(payload);
    // Log every outgoing publish so we can confirm exact payload reaching broker
    try {
      const pretty = JSON.stringify(JSON.parse(message), null, 2);
      this.logger.log(
        `[MQTT →] ${topic} | qos=${options.qos ?? 1} retain=${options.retain ?? false}\n${pretty}`,
      );
    } catch {
      this.logger.log(
        `[MQTT →] ${topic} | qos=${options.qos ?? 1} retain=${options.retain ?? false} | ${message}`,
      );
    }
    return new Promise((resolve, reject) => {
      this.client.publish(
        topic,
        message,
        { qos: options.qos ?? 1, retain: options.retain ?? false },
        (err) => {
          if (err) {
            this.logger.error(`MQTT publish error on ${topic}`, err.message);
            reject(err);
          } else {
            resolve();
          }
        },
      );
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
    _cupSize: string,
    quantity: number,
    nozzle?: number,
    itemName?: string,
    timerOfWater?: number,
    timerOfPowder?: number,
    orderId?: string,
    userName?: string,
    machineType: 'coffee' | 'food' = 'coffee',
  ): Promise<void> {
    // Round timers to nearest 100ms — firmware motor control expects this (matches old backend behaviour)
    const tw = Math.round((timerOfWater ?? 5000) / 100) * 100;
    const tp = Math.round((timerOfPowder ?? 3000) / 100) * 100;

    const ordStr =
      machineType === 'food'
        ? `N${nozzle ?? 1}-${itemName ?? itemId}-${quantity}-`
        : `N${nozzle ?? 1}-${itemName ?? itemId}-${quantity}-${tw}-${tp}`;

    // Wrap in { command: ... } — matches old backend publishers.js format
    // Firmware reads payload.command to process the order
    // QoS 0 matches old backend (publishMachineCommand uses default QoS 0)
    return this.publish(
      `machine/order/${machineId}`,
      {
        command: {
          ord_id: orderId ?? `ORD-${Date.now()}`,
          user: userName ?? 'customer',
          ord: ordStr,
          status: 'pending',
        },
      },
      { qos: 0 },
    );
  }

  /**
   * Send flush command to machine.
   * Only publishes to machine/log/{machineId} — the topic firmware subscribes to.
   */
  flush(machineId: string): Promise<void> {
    // Exact payload the old backend (machineLogController.js updateMachine) sent:
    // String(undefined) = "undefined", String(true) = "true"
    // The physical machine firmware expects these exact string values.
    return this.publish(
      `machine/log/${machineId}`,
      {
        command: { sleep: 'undefined', flush: 'true', configMode: 'undefined' },
      },
      { qos: 0 },
    );
  }

  flushAll(machineIds: string[]): void {
    machineIds.forEach((id) => this.flush(id));
  }

  calibrate(machineId: string, calibrationData: object): void {
    void this.publish(`machine/log/${machineId}`, {
      command: { configMode: 'true', ...calibrationData },
    });
  }

  requestStatus(machineId: string): void {
    void this.publish(`machine/${machineId}/status/request`, {
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Send sleep command to machine.
   * Topic: machine/log/{machineId}
   */
  sleep(machineId: string): void {
    void this.publish(
      `machine/log/${machineId}`,
      { command: { flush: 'false', sleep: 'true', configMode: 'false' } },
      { qos: 0 },
    );
  }

  /**
   * Wake machine from sleep.
   * Published with retain:true so the broker stores it and delivers it
   * the moment the sleeping machine reconnects to MQTT.
   * After delivery, the retained message is cleared automatically when
   * the machine sends its first online heartbeat (handled in MachinesService).
   */
  wake(machineId: string): void {
    void this.publish(
      `machine/log/${machineId}`,
      { command: { flush: 'false', sleep: 'false', configMode: 'false' } },
      { qos: 0, retain: true },
    );
    this.logger.log(
      `Wake command published (retained) for machine ${machineId}`,
    );
  }

  /**
   * Clear the retained wake message from the broker once the machine is awake.
   * Call this after the machine sends its first online heartbeat post-wake.
   */
  clearRetainedWake(machineId: string): void {
    // Publishing empty string with retain:true removes the retained message
    void this.publish(`machine/log/${machineId}`, '', { retain: true });
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
  id: string; // order id (ETR-... or ord_id from firmware)
  ord?: string; // N{nozzle}-{name}-{qty}-{waterTimer}-{powderTimer}, comma-separated
  status: 'completed' | 'processing' | 'cancelled' | 'half-completed';
  items?: {
    item_id: string;
    remaining_qty: number;
    status: string;
  }[];
}
