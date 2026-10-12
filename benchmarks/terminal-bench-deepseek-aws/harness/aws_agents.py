import asyncio
import json
import shlex
import tempfile
from pathlib import Path
from harbor.agents.base import BaseAgent
from harbor.models.agent.context import AgentContext

ROOT = Path(__file__).parent
RUNTIME = "/opt/hive-runtime/runtime"
NODE = f"{RUNTIME}/node/bin/node"
KEYS = Path("/opt/hive-benchmark/credentials")


class HiveAgent(BaseAgent):
    kind = ""

    def version(self):
        package = ROOT / "runtime" / ("node_modules/mixdog/package.json" if self.kind == "mixdog"
                                      else "dsh/node_modules/@deepseek-ai/dsh/package.json")
        return json.loads(package.read_text())["version"]

    async def setup(self, environment):
        result = await environment.exec(f"{NODE} --version && mkdir -p /logs/agent", timeout_sec=30)
        if result.return_code:
            raise RuntimeError("Mounted runtime unavailable")

    async def run(self, instruction: str, environment, context: AgentContext):
        key = (KEYS / f"{self.kind}.key").read_text()
        with tempfile.TemporaryDirectory(prefix="hive-instruction-") as directory:
            path = Path(directory) / "instruction.txt"
            path.write_text(instruction)
            await environment.upload_file(path, "/tmp/hive-instruction.txt")
        env = {
            "HIVE_API_KEY": key,
            "PATH": f"{RUNTIME}/node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
            "DSH_HOME": "/tmp/hive-dsh-home",
            "DSH_TELEMETRY_MODE": "DISABLED",
            "DSH_PERMISSION_MODE": "danger-full-access",
        }
        command = f"{NODE} {RUNTIME}/hive-{self.kind}.mjs"
        if self.kind == "dsh":
            command += " < /tmp/hive-instruction.txt"
        shell = f"set -o pipefail; {command} 2>/logs/agent/stderr.txt | tee /logs/agent/events.jsonl"
        try:
            result = await environment.exec("bash -c " + shlex.quote(shell), env=env)
            if result.return_code:
                raise RuntimeError(f"{self.kind} exited with code {result.return_code}")
        finally:
            self.logs_dir.mkdir(parents=True, exist_ok=True)
            target = self.logs_dir / "events.jsonl"
            try:
                await asyncio.wait_for(asyncio.shield(
                    environment.download_file("/logs/agent/events.jsonl", target)), 10)
                events = []
                for line in target.read_text().splitlines():
                    try:
                        events.append(json.loads(line))
                    except json.JSONDecodeError:
                        continue
                if self.kind == "mixdog":
                    usages = [e["usage"] for e in events if e.get("type") == "model.request.completed"]
                    fields = ("input_tokens", "cached_input_tokens", "output_tokens")
                else:
                    usages = [e["usage"] for e in events if e.get("phase") == "step_end" and "usage" in e]
                    fields = ("inputTokens", "cacheReadTokens", "outputTokens")
                if usages:
                    context.n_input_tokens = sum(u.get(fields[0], 0) for u in usages)
                    if all(fields[1] in u for u in usages):
                        context.n_cache_tokens = sum(u[fields[1]] for u in usages)
                    context.n_output_tokens = sum(u.get(fields[2], 0) for u in usages)
                context.metadata = {
                    "usage_events": len(usages), "context_window": 400000,
                    "endpoint": "https://api-cdn.thehive.ai/api/v3/",
                }
            except Exception as error:
                context.metadata = {"usage_complete": False, "usage_error": type(error).__name__}


class HiveMixdog(HiveAgent):
    kind = "mixdog"

    @staticmethod
    def name():
        return "hive-mixdog"


class HiveDSH(HiveAgent):
    kind = "dsh"

    @staticmethod
    def name():
        return "hive-dsh"
