import type { Kafka, Message, Producer } from 'kafkajs';

import { createKafkaClient } from './client.js';
import { type EventEnvelope, eventEnvelopeSchema } from './envelope.js';

export type EventBusProducerOptions = {
  kafka?: Kafka;
  producer?: Producer;
};

export class EventBusProducer {
  private readonly producer: Producer;
  private connected = false;

  constructor(options: EventBusProducerOptions = {}) {
    this.producer = options.producer ?? (options.kafka ?? createKafkaClient()).producer();
  }

  async connect(): Promise<void> {
    if (this.connected) return;
    await this.producer.connect();
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;
    await this.producer.disconnect();
    this.connected = false;
  }

  async sendEnvelope(topic: string, envelope: EventEnvelope): Promise<void> {
    const validEnvelope = eventEnvelopeSchema.parse(envelope);
    await this.connect();

    const message: Message = {
      key: validEnvelope.messageId,
      value: JSON.stringify(validEnvelope),
      headers: {
        type: validEnvelope.type,
        v: String(validEnvelope.v),
        occurredAt: validEnvelope.occurredAt,
      },
    };

    await this.producer.send({
      topic,
      messages: [message],
    });
  }
}

export function createEventBusProducer(options?: EventBusProducerOptions): EventBusProducer {
  return new EventBusProducer(options);
}
