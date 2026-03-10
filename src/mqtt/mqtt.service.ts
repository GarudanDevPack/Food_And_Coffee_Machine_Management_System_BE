import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as mqtt from 'mqtt';

@Injectable()
export class MqttService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MqttService.name);
  private client: mqtt.MqttClient;
  private readonly messageHandlers = new Map<string, ((payload: string) => void)[]>();

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const brokerUrl = this.configService.get<string>('MQTT_BROKER_URL', 'mqtt://broker.hivemq.com:1883');
    const clientId = `coffee_vending_${Math.random().toString(16).slice(2, 8)}`;

    this.client = mqtt.connect(brokerUrl, {
      clientId,
      clean: true,
      connectTimeout: 4000,
      reconnectPeriod: 5000,
    });

    this.client.on('connect', () => {
      this.logger.log(`MQTT connected to ${brokerUrl}`);
    });

    this.client.on('error', (err) => {
      this.logger.error('MQTT connection error', err.message);
    });

    this.client.on('message', (topic: string, message: Buffer) => {
      const payload = message.toString();
      const handlers = this.messageHandlers.get(topic) || [];
      handlers.forEach((handler) => handler(payload));
    });
  }

  onModuleDestroy() {
    this.client?.end();
  }

  publish(topic: string, payload: string | object): void {
    const message = typeof payload === 'string' ? payload : JSON.stringify(payload);
    this.client.publish(topic, message, { qos: 1 }, (err) => {
      if (err) this.logger.error(`MQTT publish error on ${topic}`, err.message);
    });
  }

  subscribe(topic: string, handler: (payload: string) => void): void {
    if (!this.messageHandlers.has(topic)) {
      this.messageHandlers.set(topic, []);
      this.client.subscribe(topic, { qos: 1 }, (err) => {
        if (err) this.logger.error(`MQTT subscribe error on ${topic}`, err.message);
      });
    }
    this.messageHandlers.get(topic)!.push(handler);
  }

  // Machine-specific publishers
  dispense(machineId: string, itemId: string, cupSize: string, quantity: number): void {
    this.publish(`machine/${machineId}/dispense`, { itemId, cupSize, quantity });
  }

  flush(machineId: string, type: 'daily' | 'weekly'): void {
    this.publish(`machine/${machineId}/flush`, { type, timestamp: new Date().toISOString() });
  }

  flushAll(machineIds: string[], type: 'daily' | 'weekly'): void {
    machineIds.forEach((id) => this.flush(id, type));
  }

  calibrate(machineId: string, calibrationData: object): void {
    this.publish(`machine/${machineId}/calibrate`, calibrationData);
  }

  requestStatus(machineId: string): void {
    this.publish(`machine/${machineId}/status/request`, { timestamp: new Date().toISOString() });
  }
}
