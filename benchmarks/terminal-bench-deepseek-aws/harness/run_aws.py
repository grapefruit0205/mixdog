import asyncio
import json
import os
import subprocess
import sys
import tomllib
from pathlib import Path

ROOT = Path(__file__).parent
DATA = ROOT / "datasets/terminal-bench-2-1"
RESULTS = ROOT.parent / "results"
BUCKET = sys.argv[1]
REGION = "us-east-1"
GROUPS = {1: 5, 2: 3, 4: 1}


def sync_results():
    subprocess.run(["aws", "s3", "sync", str(RESULTS), f"s3://{BUCKET}/results/",
                    "--region", REGION, "--only-show-errors", "--sse", "AES256"], check=True)


async def run(kind, cpus, concurrency, subset):
    agent = "HiveMixdog" if kind == "mixdog" else "HiveDSH"
    output = RESULTS / f"jobs-{kind}-{cpus}cpu"
    command = [
        str(ROOT.parent / "venv/bin/harbor"), "run", "-p", str(subset),
        "-a", f"aws_agents:{agent}", "-m", "deepseek-ai/deepseek-v4.1-flash",
        "--n-attempts", "1", "--max-retries", "0",
        "--n-concurrent", str(concurrency), "-o", str(output),
        "--mounts", json.dumps([{
            "type": "bind", "source": str(ROOT), "target": "/opt/hive-runtime", "read_only": True,
        }]),
    ]
    with (RESULTS / f"{kind}-{cpus}cpu.log").open("wb") as log:
        process = await asyncio.create_subprocess_exec(
            *command, cwd=ROOT, env={**os.environ, "PYTHONPATH": str(ROOT)},
            stdout=log, stderr=asyncio.subprocess.STDOUT)
        return await process.wait()


async def main():
    RESULTS.mkdir(parents=True, exist_ok=True)
    tasks = sorted(DATA.glob("*/task.toml"))
    assert len(tasks) == 89
    subsets = {}
    for cpus in GROUPS:
        subset = ROOT / f"tasks-{cpus}cpu"
        subset.mkdir()
        for task in tasks:
            if tomllib.loads(task.read_text())["environment"]["cpus"] == cpus:
                (subset / task.parent.name).symlink_to(task.parent, target_is_directory=True)
        subsets[cpus] = subset
    assert sum(len(list(path.iterdir())) for path in subsets.values()) == 89
    status = {"state": "running", "context_window": 400000, "tasks_per_harness": 89,
              "run_id": "hive-20261012-xewnns", "groups": {}}
    results = []
    try:
        for cpus, concurrency in GROUPS.items():
            status["current_cpus"] = cpus
            (RESULTS / "status.json").write_text(json.dumps(status))
            pair = asyncio.gather(*(run(kind, cpus, concurrency, subsets[cpus])
                                    for kind in ("mixdog", "dsh")))
            while not pair.done():
                done, _ = await asyncio.wait({pair}, timeout=60)
                await asyncio.to_thread(sync_results)
            codes = await pair
            results.extend(codes)
            status["groups"][str(cpus)] = codes
        status["state"] = "completed" if not any(results) else "failed"
        (RESULTS / "status.json").write_text(json.dumps(status))
        if any(results):
            raise RuntimeError(f"Harbor exit codes: {results}")
    except BaseException:
        status["state"] = "failed"
        (RESULTS / "status.json").write_text(json.dumps(status))
        raise
    finally:
        await asyncio.to_thread(sync_results)


if __name__ == "__main__":
    asyncio.run(main())
