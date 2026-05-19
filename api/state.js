import { kv } from '@vercel/kv';

const KV_KEY = 'motrix:state:v2';
// Password is set as an env var on Vercel — see README.
const PASSWORD = process.env.MOTRIX_PASSWORD || '';

export default async function handler(req, res) {
  // CORS for safety even though same-origin
  res.setHeader('Cache-Control', 'no-store');

  // ---- Password gate ----
  const provided = req.headers['x-motrix-password'] || '';
  if (!PASSWORD) {
    return res.status(500).json({
      error: 'Server is missing MOTRIX_PASSWORD env var. Set it in Vercel project settings.'
    });
  }
  if (provided !== PASSWORD) {
    return res.status(401).json({ error: 'Invalid password' });
  }

  try {
    if (req.method === 'GET') {
      const data = await kv.get(KV_KEY);
      return res.status(200).json({
        progress: data?.progress || {},
        updatedAt: data?.updatedAt || null,
        updatedBy: data?.updatedBy || null
      });
    }

    if (req.method === 'POST') {
      // Body comes parsed on Vercel Node functions
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const progress = body.progress;
      const updatedBy = body.updatedBy || 'unknown';

      if (!progress || typeof progress !== 'object') {
        return res.status(400).json({ error: 'Missing or invalid progress object' });
      }

      const payload = {
        progress,
        updatedAt: new Date().toISOString(),
        updatedBy
      };
      await kv.set(KV_KEY, payload);
      return res.status(200).json(payload);
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('API error:', err);
    return res.status(500).json({ error: 'Internal error: ' + (err.message || 'unknown') });
  }
}
