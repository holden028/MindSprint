const { Queue } = require('bullmq');
const { redisConnection } = require('../config/redisConnection');

const ingestQueue = new Queue('ingest', {
  connection: redisConnection()
});

async function addIngestJob(data) {
  try {
    const job = await ingestQueue.add('process-ingest', data, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000
      }
    });
    console.log(`Added job ${job.id} to queue`);
    return job;
  } catch (error) {
    console.error('Failed to add job to queue:', error);
    throw error;
  }
}

module.exports = {
  ingestQueue,
  addIngestJob
};
