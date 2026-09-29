import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

export type AiProviderName = 'gemini' | 'glm';

const GEMINI_MODEL = 'gemini-3.6-flash';
/** GLM's OpenAI-compatible endpoint. Zhipu China: https://open.bigmodel.cn/api/paas/v4 · Z.ai international: https://api.z.ai/api/paas/v4 */
const GLM_BASE_URL = envValue('VITE_GLM_BASE_URL') || 'https://open.bigmodel.cn/api/paas/v4';

function envValue(name: string): string {
  return (import.meta.env as Record<string, string | undefined>)[name]?.trim() ?? '';
}

const explicitProvider = envValue('VITE_AI_PROVIDER').toLowerCase();
const glmApiKey = envValue('VITE_GLM_API_KEY');
const geminiApiKey = envValue('VITE_GEMINI_API_KEY');

/** Explicit VITE_AI_PROVIDER wins; otherwise GLM whenever its key exists, with Gemini as the legacy fallback. */
export const AI_PROVIDER: AiProviderName = explicitProvider === 'glm' || explicitProvider === 'gemini'
  ? (explicitProvider as AiProviderName)
  : glmApiKey
    ? 'glm'
    : 'gemini';

export const AI_MODEL = AI_PROVIDER === 'glm'
  ? envValue('VITE_GLM_MODEL') || 'glm-5.3'
  : GEMINI_MODEL;

function requireApiKey(provider: AiProviderName): string {
  const key = provider === 'glm' ? glmApiKey : geminiApiKey;
  if (!key) {
    const envName = provider === 'glm' ? 'VITE_GLM_API_KEY' : 'VITE_GEMINI_API_KEY';
    throw new Error(`${provider === 'glm' ? 'GLM' : 'Gemini'} is not configured. Set ${envName} before building Kippa.`);
  }
  return key;
}

export function requireProviderApiKey(): string {
  return requireApiKey(AI_PROVIDER);
}

/** Returns a model-id → chat-model factory for the configured provider. GLM speaks the OpenAI-compatible protocol. */
export function getChatModel() {
  if (AI_PROVIDER === 'glm') {
    const glm = createOpenAICompatible({
      name: 'glm',
      apiKey: requireApiKey('glm'),
      baseURL: GLM_BASE_URL,
    });
    return (modelId: string) => glm.chatModel(modelId);
  }
  const google = createGoogleGenerativeAI({ apiKey: requireApiKey('gemini') });
  return (modelId: string) => google(modelId);
}
