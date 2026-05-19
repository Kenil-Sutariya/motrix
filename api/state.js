import { Redis } from '@upstash/redis';

const KV_KEY = 'motrix:state:v2';
const PASSWORD = process.env.MOTRIX_PASSWORD || '';

function getRedis() {
  const url = process.env.REDIS_URL || '';
  if (!url) throw new Error('Missing REDIS_URL environment variable');

  // Handle Upstash REST format: https://TOKEN@HOST
  if (url.startsWith('https://')) {
    const parsed = new URL(url);
    const token = parsed.password || parsed.username;
    const restUrl = `${parsed.protocol}//${parsed.host}`;
    return new Redis({ url: restUrl, token });
  }

  // Handle rediss://default:TOKEN@HOST:PORT format
  if (url.startsWith('rediss://') || url.startsWith('redis://')) {
    const parsed = new URL(url);
    const token = parsed.password;
    const host = parsed.hostname;
    const restUrl = `https://${host}`;
    return new Redis({ url: restUrl, token });
  }

  throw new Error('Unrecognized REDIS_URL format');
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const provided = req.headers['x-motrix-password'] || '';
  if (!PASSWORD) {
    return res.status(500).json({ error: 'Server is missing MOTRIX_PASSWORD env var.' });
  }
  if (provided !== PASSWORD) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  let redis;
  try {
    redis = getRedis();
  } catch (err) {
    return res.status(500).json({ error: 'Redis config error: ' + err.message });
  }

  try {
    if (req.method === 'GET') {
      const data = await redis.get(KV_KEY);
      return res.status(200).json({
        progress: data?.progress || {},
        updatedAt: data?.updatedAt || null,
        updatedBy: data?.updatedBy || null
      });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const { progress, updatedBy = 'unknown' } = body;
      if (!progress || typeof progress !== 'object') {
        return res.status(400).json({ error: 'Missing or invalid progress object' });
      }
      const payload = { progress, updatedAt: new Date().toISOString(), updatedBy };
      await redis.set(KV_KEY, payload);
      return res.status(200).json(payload);
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('API error:', err);
    return res.status(500).json({ error: 'Internal error: ' + (err.message || 'unknown') });
  }
}
