import { Redis } from '@upstash/redis';

const KV_KEY = 'motrix:state:v2';
const PASSWORD = process.env.MOTRIX_PASSWORD || '';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  // Password gate
  const provided = req.headers['x-motrix-password'] || '';
  if (!PASSWORD) {
    return res.status(500).json({ error: 'Server is missing MOTRIX_PASSWORD env var.' });
  }
  if (provided !== PASSWORD) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  // Connect using explicit REST URL + token (set manually in Vercel env vars)
  const url   = process.env.UPSTASH_REDIS_REST_URL   || '';
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || '';

  if (!url || !token) {
    return res.status(500).json({
      error: 'Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN env vars.'
    });
  }

  const redis = new Redis({ url, token });

  try {
    if (req.method === 'GET') {
      const data = await redis.get(KV_KEY);
      return res.status(200).json({
        progress:  data?.progress  || {},
        updatedAt: data?.updatedAt || null,
        updatedBy: data?.updatedBy || null
      });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string'
        ? JSON.parse(req.body)
        : (req.body || {});
      const { progress, updatedBy = 'unknown' } = body;

      if (!progress || typeof progress !== 'object') {
        return res.status(400).json({ error: 'Missing or invalid progress object' });
      }

      const payload = {
        progress,
        updatedAt: new Date().toISOString(),
        updatedBy
      };
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
