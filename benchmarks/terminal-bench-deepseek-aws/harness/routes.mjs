export const model = 'deepseek-ai/deepseek-v4.1-flash';
export const provider = 'custom-hive-benchmark';
export const contextWindow = 400000;
export const config = {
  type: 'custom', schemaVersion: 2, name: 'Hive benchmark',
  protocol: 'openai-chat', baseURL: 'https://api-cdn.thehive.ai/api/v3/',
  auth: 'key', enabled: true, preconnect: false,
  discovery: { newModelsHidden: true },
  modelOverrides: {
    [model]: {
      manual: true, hidden: false, contextWindow,
      reasoning: { levels: ['high'], wireFormat: 'deepseek', wireValues: { high: 'high' } },
    },
  },
};
