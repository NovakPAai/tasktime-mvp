import { createKafkaClient } from '../shared/eventbus/client.js';
import { eventEnvelopeSchema } from '../shared/eventbus/envelope.js';

const topics = process.argv.slice(2);

if (topics.length === 0) {
  console.error('Usage: npm run events:tail -- <topic> [topic...]');
  process.exit(1);
}

const groupId = `tasktime-events-tail-${Date.now()}`;
const kafka = createKafkaClient({ clientId: process.env.KAFKA_CLIENT_ID ?? 'tasktime-events-tail' });
const consumer = kafka.consumer({ groupId });

async function main() {
  await consumer.connect();
  for (const topic of topics) {
    await consumer.subscribe({ topic, fromBeginning: false });
  }

  console.log(`Tailing Kafka topics: ${topics.join(', ')}`);
  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      if (!message.value) {
        console.log(JSON.stringify({ topic, partition, offset: message.offset, empty: true }));
        return;
      }

      const parsed = JSON.parse(message.value.toString());
      const envelope = eventEnvelopeSchema.parse(parsed);
      console.log(JSON.stringify({ topic, partition, offset: message.offset, envelope }));
    },
  });
}

async function shutdown(signal: string) {
  console.error(`events:tail received ${signal}, shutting down`);
  await consumer.disconnect();
  process.exit(0);
}

process.once('SIGINT', () => {
  void shutdown('SIGINT');
});
process.once('SIGTERM', () => {
  void shutdown('SIGTERM');
});

main().catch(async (err) => {
  console.error(err);
  await consumer.disconnect().catch(() => undefined);
  process.exit(1);
});
