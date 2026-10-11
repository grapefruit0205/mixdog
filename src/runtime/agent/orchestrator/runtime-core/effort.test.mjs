import assert from 'node:assert/strict';
import test from 'node:test';
import { coerceEffortFor, effortOptionsFor } from './effort.mjs';
import { _normalizeCodexModel } from '../providers/openai-codex-model.mjs';
import { enrichModels } from '../providers/model-catalog.mjs';

test('Codex OAuth effort levels survive enrichment with public API options', async () => {
  const levels = ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'].map((effort) => ({ effort }));
  // Offline catalogs: the gpt-6-sol manual override still supplies the public
  // API effort options (none..max) that must not replace the route's levels.
  const fetchFn = async () => ({ ok: true, json: async () => ({}) });
  const [row] = await enrichModels([_normalizeCodexModel({ slug: 'gpt-6-sol', supported_reasoning_levels: levels })], {
    fetchFn,
  });
  assert.deepEqual(effortOptionsFor('openai-oauth', row), ['low', 'medium', 'high', 'xhigh', 'max', 'ultra']);
});

test('a custom model declaring reasoningLevels supplies its own effort catalog', () => {
  const row = { id: 'm', reasoningLevels: ['low', 'high', 'max'] };
  assert.deepEqual(effortOptionsFor('custom-x', row), ['low', 'high', 'max']);
  assert.equal(coerceEffortFor('custom-x', row, 'max'), 'max');
  // `medium` is not declared, so the fallback ladder picks the highest level
  // below it that the model does declare.
  assert.equal(coerceEffortFor('custom-x', row, 'medium'), 'low');
  // No declaration, provider default or family list leaves custom models empty.
  assert.deepEqual(effortOptionsFor('custom-x', { id: 'm' }), []);
  assert.equal(coerceEffortFor('custom-x', { id: 'm' }, 'max'), null);
});

test('a custom model id naming DeepSeek gets DeepSeek levels when nothing declares them', () => {
  // Relay ids keep the vendor prefix (`deepseek-ai/...`), so the DeepSeek
  // branch anchors on the id rather than the provider catalog.
  const row = { id: 'deepseek-ai/deepseek-v4.1-flash' };
  assert.deepEqual(effortOptionsFor('custom-gw', row), ['low', 'high', 'max']);
  assert.equal(coerceEffortFor('custom-gw', row, 'max'), 'max');
});

test('a declared reasoningLevels list still wins over the vendor id hint', () => {
  const row = { id: 'deepseek-ai/deepseek-v4.1-flash', reasoningLevels: ['medium'] };
  assert.deepEqual(effortOptionsFor('custom-gw', row), ['medium']);
});

test('the vendor id hint never applies outside custom providers', () => {
  const row = { id: 'deepseek-ai/deepseek-v4.1-flash' };
  assert.deepEqual(effortOptionsFor('deepseek', row), []);
  assert.deepEqual(effortOptionsFor('openrouter', row), []);
});
