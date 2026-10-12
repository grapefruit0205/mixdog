import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
const key = process.env.HIVE_API_KEY;
if (!key) throw new Error('HIVE_API_KEY is required');
const child = spawn(process.execPath, [
  fileURLToPath(new URL('./dsh/node_modules/@deepseek-ai/dsh/lib/bin.js', import.meta.url)),
  '--profile', 'headless', '--patch',
  fileURLToPath(new URL('./hive-dsh.patch.yml', import.meta.url)),
  '--json', '-',
], { env: process.env, stdio: ['inherit', 'pipe', 'pipe'] });
for (const [source, destination] of [[child.stdout, process.stdout], [child.stderr, process.stderr]]) {
  createInterface({ input: source, crlfDelay: Infinity }).on('line', line => {
    destination.write(line.split(key).join('[redacted]') + '\n');
  });
}
child.on('error', error => {
  console.error(error.message.split(key).join('[redacted]'));
  process.exitCode = 1;
});
child.on('exit', (code, signal) => { process.exitCode = signal ? 1 : code; });
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal));
