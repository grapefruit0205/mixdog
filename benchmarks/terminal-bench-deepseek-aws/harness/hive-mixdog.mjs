import { readFileSync } from 'node:fs';
import { runHeadlessExec } from './node_modules/mixdog/src/headless-exec.mjs';
import { createPristineExecutionBoundary } from './node_modules/mixdog/src/runtime/shared/pristine-execution.mjs';
import { config, model, provider } from '../routes.mjs';

const key = process.env.HIVE_API_KEY;
if (!key) throw new Error('HIVE_API_KEY is required');
delete process.env.HIVE_API_KEY;
process.env.MIXDOG_USAGE_LOG = '/logs/agent/usage.jsonl';
process.exitCode = await runHeadlessExec({
  provider, model, effort: 'high', json: true,
  message: readFileSync('/tmp/hive-instruction.txt', 'utf8'),
  boundaryFactory(route) {
    const boundary = createPristineExecutionBoundary(route);
    const load = boundary.loadConfig;
    boundary.loadConfig = () => {
      const initial = load();
      initial.providers[provider] = { ...config, apiKey: key };
      return initial;
    };
    return boundary;
  },
  write: text => process.stdout.write(text.split(key).join('[redacted]')),
  writeErr: text => process.stderr.write(text.split(key).join('[redacted]')),
});
