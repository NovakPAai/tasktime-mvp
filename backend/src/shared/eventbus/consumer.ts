import type { Consumer, EachMessagePayload, Kafka, KafkaMessage } from 'kafkajs';

import { createKafkaClient } from './client.js';
import { type EventEnvelope, eventEnvelopeSchema } from './envelope.js';
import { hasProcessedMessage, markProcessedOnce } from '../outbox/processed-messages.service.js';

export type EventHandler<T = Record<string, unknown>> = (
  envelope: EventEnvelope,
  payload: T,
  kafka: Pick<EachMessagePayload, 'topic' | 'partition'> & { offset: string },
) => Promise<void>;

export type ProcessKafkaMessageOptions<T = Record<string, unknown>> = {
  consumerGroup: string;
  message: Pick<KafkaMessage, 'value' | 'offset'>;
  topic: string;
  partition: number;
  handler: EventHandler<T>;
};

export async function processKafkaMessage<T = Record<string, unknown>>({
  consumerGroup,
  message,
  topic,
  partition,
  handler,
}: ProcessKafkaMessageOptions<T>): Promise<'processed' | 'skipped'> {
  if (!message.value) {
    throw new Error(`Kafka message on ${topic}[${partition}] offset ${message.offset} has no value`);
  }

  const envelope = eventEnvelopeSchema.parse(JSON.parse(message.value.toString()));
  if (await hasProcessedMessage(consumerGroup, envelope.messageId)) {
    return 'skipped';
  }

  await handler(envelope, envelope.payload as T, { topic, partition, offset: message.offset });
  await markProcessedOnce(consumerGroup, envelope.messageId);
  return 'processed';
}

export type EventBusConsumerOptions<T = Record<string, unknown>> = {
  consumerGroup: string;
  topics: string[];
  handler: EventHandler<T>;
  kafka?: Kafka;
  consumer?: Consumer;
  fromBeginning?: boolean;
};

export class EventBusConsumer<T = Record<string, unknown>> {
  private readonly consumer: Consumer;
  private readonly consumerGroup: string;
  private readonly topics: string[];
  private readonly handler: EventHandler<T>;
  private readonly fromBeginning: boolean;
  private connected = false;

  constructor(options: EventBusConsumerOptions<T>) {
    this.consumerGroup = options.consumerGroup;
    this.topics = options.topics;
    this.handler = options.handler;
    this.fromBeginning = options.fromBeginning ?? false;
    this.consumer = options.consumer ?? (options.kafka ?? createKafkaClient()).consumer({ groupId: options.consumerGroup });
  }

  async connectAndRun(): Promise<void> {
    if (this.connected) return;
    await this.consumer.connect();
    for (const topic of this.topics) {
      await this.consumer.subscribe({ topic, fromBeginning: this.fromBeginning });
    }
    await this.consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        await processKafkaMessage({
          consumerGroup: this.consumerGroup,
          message,
          topic,
          partition,
          handler: this.handler,
        });
      },
    });
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;
    await this.consumer.disconnect();
    this.connected = false;
  }
}
