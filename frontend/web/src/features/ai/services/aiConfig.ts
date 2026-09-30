import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

export type AiProviderName = 'gemini' | 'glm';

function envValue(name: string): string {
  return (import.meta.env as Record<string, string | undefined>)[name]?.trim() ?? '';
}

/** Zhipu China: https://open.bigmodel.cn/api/paas/v4 · Z.ai international: https://api.z.ai/api/paas/v4 */
const ENV_GLM_BASE_URL = envValue('VITE_GLM_BASE_URL') || 'https://open.bigmodel.cn/api/paas/v4';

/**
 * Runtime AI configuration, fetched once per session from the Firestore doc
 * `system/aiConfig` (fields: provider, glmApiKey, glmBaseUrl, glmModel,
 * geminiApiKey). Lets the owner rotate keys or switch models from the
 * Firebase console without redeploying. Missing/forbidden doc → the env
 * values baked at build time are used instead.
 */
export type AiRuntimeConfig = {
  provider: AiProviderName;
  model: string;
  apiKey: string;
  baseUrl?: string;
};

function envRuntimeConfig(): AiRuntimeConfig | null {
  const glmApiKey = envValue('VITE_GLM_API_KEY');
  const geminiApiKey = envValue('VITE_GEMINI_API_KEY');
  const explicit = envValue('VITE_AI_PROVIDER').toLowerCase();
  const provider: AiProviderName = explicit === 'glm' || explicit === 'gemini'
    ? (explicit as AiProviderName)
    : glmApiKey ? 'glm' : geminiApiKey ? 'gemini' : 'glm';
  const apiKey = provider === 'glm' ? glmApiKey : geminiApiKey;
  if (!apiKey) return null;
  return {
    provider,
    model: provider === 'glm' ? envValue('VITE_GLM_MODEL') || 'glm-5.3' : 'gemini-3.6-flash',
    apiKey,
    baseUrl: provider === 'glm' ? ENV_GLM_BASE_URL : undefined,
  };
}

let runtimeConfig: Promise<AiRuntimeConfig | null> | null = null;

function mergeRuntime(raw: unknown): AiRuntimeConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const doc = raw as Record<string, unknown>;
  const env = envRuntimeConfig();
  const provider = doc.provider === 'glm' || doc.provider === 'gemini'
    ? (doc.provider as AiProviderName)
    : env?.provider;
  if (!provider) return null;
  const docKey = provider === 'glm' ? doc.glmApiKey : doc.geminiApiKey;
  const apiKey = typeof docKey === 'string' && docKey.trim() ? docKey.trim() : env?.apiKey;
  if (!apiKey) return null;
  const model = provider === 'glm' && typeof doc.glmModel === 'string' && doc.glmModel.trim()
    ? doc.glmModel.trim()
    : env?.model ?? (provider === 'glm' ? 'glm-5.3' : 'gemini-3.6-flash');
  const baseUrl = provider === 'glm'
    ? (typeof doc.glmBaseUrl === 'string' && doc.glmBaseUrl.trim() ? doc.glmBaseUrl.trim() : env?.baseUrl ?? ENV_GLM_BASE_URL)
    : undefined;
  return { provider, model, apiKey, baseUrl };
}

export function loadAiRuntimeConfig(): Promise<AiRuntimeConfig | null> {
  runtimeConfig ??= (async () => {
    try {
      const { dbLib } = await import('@/libs/db');
      // dbLib escapes to the root path when householdId is 'system':
      // ('system', 'system', 'aiConfig') reads the root doc system/aiConfig.
      const doc = await dbLib.getDoc('system', 'system', 'aiConfig');
      return mergeRuntime(doc);
    } catch (error) {
      console.warn('[kippa] system/aiConfig unavailable — using built-in AI config.', error);
      return envRuntimeConfig();
    }
  })();
  return runtimeConfig;
}

/** Cloud Function that proxies GLM calls (z.ai has no CORS; the key stays server-side). */
function glmProxyBaseUrl(): string {
  const projectId = envValue('VITE_FIREBASE_PROJECT_ID');
  return `https://us-central1-${projectId}.cloudfunctions.net/glmProxy`;
}

/**
 * Builds the chat model for the resolved config. GLM requests go through the
 * glmProxy Cloud Function and authenticate with the caller's Firebase ID
 * token (the proxy verifies it and swaps in the real GLM key); Gemini uses
 * its first-party SDK directly.
 */
export async function createChatModel(config: AiRuntimeConfig) {
  if (config.provider === 'glm') {
    const { auth } = await import('@/config/firebase');
    const currentUser = auth?.currentUser;
    if (!currentUser) throw new Error('Sign in required to use Kip.');
    const idToken = await currentUser.getIdToken();
    const glm = createOpenAICompatible({
      name: 'glm',
      apiKey: idToken,
      baseURL: glmProxyBaseUrl(),
    });
    return { model: glm.chatModel(config.model), provider: 'glm' as AiProviderName };
  }
  const google = createGoogleGenerativeAI({ apiKey: config.apiKey });
  return { model: google(config.model), provider: 'gemini' as AiProviderName };
}

/**
 * Synchronous env-only resolution, kept for the error classifier and defaults.
 * The streaming path resolves the runtime config before creating a model.
 */
export const AI_PROVIDER: AiProviderName = envRuntimeConfig()?.provider ?? 'glm';
export const AI_MODEL = envRuntimeConfig()?.model ?? 'glm-5.3';
