/**
 * Provider data source — unified configuration for all AI model providers.
 * Model IDs synced with PRD latest (2025 Q2 data).
 */

export interface ProviderModel {
  id: string;
  name: string;
}

export interface ProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  endpoint: string;
  models: ProviderModel[];
  authType: string;
  brandColor: string;
}

export interface ModelItem {
  id: number;
  name: string;
  provider: string;
  baseUrl: string;
  hasApiKey: boolean;
  modelId: string;
  enabled: boolean;
  isDefault: boolean;
  endpoint: string;
  createdAt: string;
  balance?: string;
}

export interface ModelFormState {
  apiKey: string;
  modelId: string;
  provider: string;
  customName: string;
  customBaseUrl: string;
}

export const PROVIDERS: ProviderConfig[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    endpoint: '/chat/completions',
    brandColor: '#4F46E5',
    models: [
      { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro' },
      { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash' },
    ],
    authType: 'bearer',
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    baseUrl: 'https://api.minimax.chat/v1',
    endpoint: '/chat/completions',
    brandColor: '#F59E0B',
    models: [
      { id: 'MiniMax-M3', name: 'MiniMax M3' },
      { id: 'MiniMax-M2.7', name: 'MiniMax M2.7' },
    ],
    authType: 'bearer',
  },
  {
    id: 'mimo',
    name: 'Mimo AI',
    baseUrl: 'https://api.mimoai.com',
    endpoint: '/chat/completions',
    brandColor: '#EC4899',
    models: [
      { id: 'mimo-v2.5-pro', name: 'Mimo V2.5 Pro' },
      { id: 'mimo-v2.5-flash', name: 'Mimo V2.5 Flash' },
    ],
    authType: 'bearer',
  },
  {
    id: 'zhipu',
    name: '智谱 AI',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    endpoint: '/chat/completions',
    brandColor: '#6366F1',
    models: [
      { id: 'glm-5', name: 'GLM-5' },
      { id: 'glm-5-flash', name: 'GLM-5 Flash' },
    ],
    authType: 'bearer',
  },
  {
    id: 'moonshot',
    name: 'Moonshot',
    baseUrl: 'https://api.moonshot.cn/v1',
    endpoint: '/chat/completions',
    brandColor: '#10B981',
    models: [
      { id: 'kimi-k2.6', name: 'Kimi K2.6' },
      { id: 'kimi-k2.5', name: 'Kimi K2.5' },
      { id: 'moonshot-v1-8k', name: 'Moonshot V1 8K' },
    ],
    authType: 'bearer',
  },
  {
    id: 'dashscope',
    name: '阿里云百炼',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    endpoint: '/chat/completions',
    brandColor: '#06B6D4',
    models: [
      { id: 'qwen3.7-max', name: 'Qwen3.7 Max' },
      { id: 'qwen3.7-plus', name: 'Qwen3.7 Plus' },
    ],
    authType: 'bearer',
  },
  {
    id: 'volcengine',
    name: '火山引擎',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    endpoint: '/chat/completions',
    brandColor: '#8B5CF6',
    models: [
      { id: 'doubao-seed-2.0-32k', name: '豆包 Seed 2.0 Pro' },
      { id: 'doubao-seed-2.0-lite', name: '豆包 Seed 2.0 Lite' },
    ],
    authType: 'bearer',
  },
  {
    id: 'tencent',
    name: '腾讯混元',
    baseUrl: 'https://api.hunyuan.cloud.tencent.com/v1',
    endpoint: '/chat/completions',
    brandColor: '#14B8A6',
    models: [
      { id: 'hunyuan-turbos-latest', name: '混元 TurboS' },
      { id: 'hunyuan-lite', name: '混元 Lite' },
    ],
    authType: 'bearer',
  },
  {
    id: 'qianfan',
    name: '百度千帆',
    baseUrl: 'https://qianfan.baidubce.com/v2',
    endpoint: '/chat/completions',
    brandColor: '#F43F5E',
    models: [
      { id: 'ernie-5.1', name: 'ERNIE 5.1' },
      { id: 'ernie-5.0', name: 'ERNIE 5.0' },
    ],
    authType: 'bearer',
  },
  {
    id: 'siliconflow',
    name: '硅基流动',
    baseUrl: 'https://api.siliconflow.cn/v1',
    endpoint: '/chat/completions',
    brandColor: '#EAB308',
    models: [
      { id: 'deepseek-ai/DeepSeek-V3', name: 'DeepSeek V3' },
      { id: 'Qwen/Qwen3-235B-A22B', name: 'Qwen3 235B' },
    ],
    authType: 'bearer',
  },
];

/** Indexed lookup map keyed by provider id */
export const PROVIDER_MAP: Record<string, ProviderConfig> = {};
PROVIDERS.forEach((p) => (PROVIDER_MAP[p.id] = p));
