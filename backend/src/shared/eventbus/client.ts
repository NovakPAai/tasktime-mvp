import { Kafka, logLevel, type KafkaConfig } from 'kafkajs';

export function parseKafkaBrokers(value: string): string[] {
  return value
    .split(',')
    .map((broker) => broker.trim())
    .filter(Boolean);
}

export function createKafkaClient(overrides: Partial<KafkaConfig> = {}): Kafka {
  const brokers = overrides.brokers ?? parseKafkaBrokers(process.env.KAFKA_BROKERS ?? 'localhost:9092');
  if (brokers.length === 0) {
    throw new Error('KAFKA_BROKERS must contain at least one broker');
  }

  return new Kafka({
    clientId: process.env.KAFKA_CLIENT_ID ?? 'tasktime-backend',
    brokers,
    logLevel: logLevel.INFO,
    ...overrides,
  });
}
