import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { Readable } from 'node:stream';
import { onRequest } from 'firebase-functions/v2/https';
import type { Request, Response } from 'express';

(getApps().length ? getApps()[0] : initializeApp());

/**
 * Streaming proxy between the Kip web app and the GLM OpenAI-compatible API.
 *
 * Why it exists: z.ai does not send CORS headers, so the browser cannot call
 * it directly. The proxy also keeps the GLM key server-side: the client
 * authenticates with a Firebase ID token (sent as the bearer token by the AI
 * SDK), which is verified here and then swapped for the real key.
 *
 * Upstream endpoint and key live in the Firestore doc `system/aiConfig`
 * (fields glmApiKey / glmBaseUrl), read via the Admin SDK (rules do not apply)
 * and cached briefly so console edits rotate keys without redeploying.
 */

const ALLOWED_ORIGINS = new Set([
  'https://kippa-1787921674.web.app',
  'https://kippa-1787921674.firebaseapp.com',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);

const DEFAULT_UPSTREAM = 'https://api.z.ai/api/coding/paas/v4';

type GlmConfig = { apiKey: string; baseUrl: string; fetchedAt: number };
let cachedConfig: GlmConfig | null = null;
const CONFIG_TTL_MS = 5 * 60 * 1000;

async function loadGlmConfig(): Promise<GlmConfig> {
  if (cachedConfig && Date.now() - cachedConfig.fetchedAt < CONFIG_TTL_MS) return cachedConfig;
  const snapshot = await getFirestore().doc('system/aiConfig').get();
  const doc = snapshot.data() as { glmApiKey?: unknown; glmBaseUrl?: unknown } | undefined;
  const apiKey = typeof doc?.glmApiKey === 'string' ? doc.glmApiKey.trim() : '';
  if (!apiKey) throw new Error('system/aiConfig is missing glmApiKey.');
  const baseUrl = typeof doc?.glmBaseUrl === 'string' && doc.glmBaseUrl.trim()
    ? doc.glmBaseUrl.trim().replace(/\/+$/, '')
    : DEFAULT_UPSTREAM;
  cachedConfig = { apiKey, baseUrl, fetchedAt: Date.now() };
  return cachedConfig;
}

function applyCors(req: Request, res: Response): boolean {
  const origin = req.get('origin') ?? '';
  const allowed = ALLOWED_ORIGINS.has(origin);
  if (allowed) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Vary', 'Origin');
    res.set('Access-Control-Allow-Headers', 'authorization, content-type');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Max-Age', '3600');
  }
  if (req.method === 'OPTIONS') {
    res.status(allowed ? 204 : 403).end();
    return true;
  }
  return false;
}

async function verifyCaller(req: Request): Promise<string> {
  const header = req.get('authorization') ?? '';
  const token = header.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new Error('missing_token');
  const decoded = await getAuth().verifyIdToken(token);
  return decoded.uid;
}

export const glmProxy = onRequest(
  { cors: false, maxInstances: 10, timeoutSeconds: 120, memory: '256MiB' },
  async (req, res) => {
    if (applyCors(req, res)) return;
    if (!ALLOWED_ORIGINS.has(req.get('origin') ?? '')) {
      res.status(403).json({ error: 'origin_not_allowed' });
      return;
    }
    if (req.method !== 'POST') {
      res.set('Allow', 'POST').status(405).json({ error: 'method_not_allowed' });
      return;
    }

    try {
      await verifyCaller(req);
    } catch {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }

    let config: GlmConfig;
    try {
      config = await loadGlmConfig();
    } catch (error) {
      console.error('GLM proxy config error', error);
      res.status(503).json({ error: 'ai_config_unavailable' });
      return;
    }

    const upstreamUrl = `${config.baseUrl}${req.path === '/' ? '' : req.path}`;
    let upstream: Awaited<ReturnType<typeof fetch>>;
    try {
      upstream = await fetch(upstreamUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
          'Accept': req.get('accept') ?? 'application/json',
        },
        body: JSON.stringify(req.body ?? {}),
      });
    } catch (error) {
      console.error('GLM proxy upstream fetch failed', error);
      res.status(502).json({ error: 'upstream_unreachable' });
      return;
    }

    res.status(upstream.status);
    const contentType = upstream.headers.get('content-type');
    if (contentType) res.set('Content-Type', contentType);
    res.set('Cache-Control', 'no-store');
    if (!upstream.body) {
      res.end();
      return;
    }
    Readable.fromWeb(upstream.body as import('node:stream/web').ReadableStream).pipe(res);
  },
);
