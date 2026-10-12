# Mixdog vs DSH — DeepSeek V4.1 Flash on Terminal-Bench 2.1 (AWS)

Model-matched comparison of **Mixdog 1.1.0** against the **DSH 0.2.0-rc.2**
native harness, both driving the same model —
`deepseek-ai/deepseek-v4.1-flash` — on all 89 Terminal-Bench 2.1 tasks,
scored by the official Harbor verifier. The run executed 2026-10-12 on a
single AWS `r7i.4xlarge` (run id `hive-20261012-xewnns`), with task CPU
requirements grouping execution into 1-CPU (83 tasks), 2-CPU (3), and 4-CPU
(3) waves. Unmodified task timeouts and resources; each task ran one attempt
with no retries on both sides.

Both harnesses are strict single-session runs of the same model through the
same endpoint (`https://api-cdn.thehive.ai/api/v3/`, 400K context window).
Mixdog is the product `mixdog exec` headless path; DSH is its stock headless
profile. Per-task raw artifacts for every trial are committed under
`jobs-hive-deepseek-v41-{mixdog,dsh}/` — Harbor `result.json` with the
verifier verdict, task checksum config, usage snapshots, verifier output,
and the harness exception on failures — so every number below is
recomputable from these files.

## Results

| Metric | Mixdog | DSH |
|---|---|---|
| Score | **68/89 (76.4%)** | 64/88 scored (72.7%)¹ |
| Pass-only median time | **167s (−15%)** | 196s |
| Pass-only median model calls | **18 (−22%)** | 23 |
| Total tokens (in+out) | 95.9M | 12.5M |

| Priced cost (all trials) | $11.26 | $7.27 |

¹ DSH `rstan-to-pystan` executed but its verifier produced no verdict; scored
trials only. Counting it as unsolved gives 64/89 (71.9%) — the ranking is
unchanged.

Total input is dominated by cache hits on the Mixdog side (75.9M of 90.6M
input cached, 84%) against 0.94M on DSH. At list rates (input $0.30, cached
$0.006, output $1.20 per 1M) Mixdog pays $6.55 for its 68 passes against
DSH's $5.12 for 64 — a cost per solved task of **$0.166 vs $0.080**, with
Mixdog 12% faster and making 22% fewer model calls on the tasks it solves.

## Failure profile — the case for a stuck-detection judge

| Phase | Mixdog | DSH |
|---|---|---|
| Failed tasks | 21 | 24 |
| Failure median time | **700s (4.2× its own passes)** | 283s |
| Failure cost | $4.71 (42% of total spend) | $2.15 (30%) |
| Fail on both | 13 | — |
| Fail on exactly one side (fallback candidates) | 19 | — |

Failed trials burn 4.2× the time of a pass and 42% of total spend on the
Mixdog side, mostly by running until the task timeout with no exit signal —
median failure duration is ~12 minutes against ~2.8 for a pass. 19 tasks
were solved by exactly one harness, and 13 stumps both: a per-run
classification of "on track / spinning / unlikely to finish" plus a fallback
re-attempt pool would convert part of that waste into passes at negligible
judging cost. Full proposal: [tribgames/mixdog#38](https://github.com/tribgames/mixdog/issues/38).

## Contents

- `jobs-hive-deepseek-v41-mixdog/` / `jobs-hive-deepseek-v41-dsh/` — per-trial
  Harbor artifacts for all 89 tasks on both sides (result, verifier,
  usage/usage-events, exception on failures)
- `harness/` — the exact harness sources that ran: `run_aws.py` (wave
  orchestrator), `aws_agents.py` (Harbor installed-agent adapters driving both
  harnesses in-container), `routes.mjs` (the Hive endpoint provider
  definition), `hive-mixdog.mjs` / `hive-dsh.mjs` + `hive-dsh.patch.yml`
  (in-container launchers)
- `tasks.csv` — per-task outcomes: group, harness, reward, duration seconds,
  input/cache/output tokens, model calls
- `status.json`, `{mixdog,dsh}-{1,2,4}cpu.log` — runner state and Harbor logs

## Reproduce

Prereqs: Docker + [Harbor](https://github.com/laude-institute/harbor), an AWS
EC2 `r7i.4xlarge` or similar, and a Hive API key. The orchestrator stages the
payload, runs CPU-grouped waves for both harnesses, and syncs results to S3:

```bash
python3 run_aws.py <s3-bucket>
```

Recompute the headline numbers from the committed artifacts:

```bash
python3 - <<'EOF'
import csv
rows = list(csv.DictReader(open("benchmarks/terminal-bench-deepseek-aws/tasks.csv")))
P_IN, P_CACHE, P_OUT = 0.30, 0.006, 1.20
for h in ("mixdog", "dsh"):
    sub = [r for r in rows if r["harness"] == h]
    ok = [r for r in sub if r["reward"] == "1.0"]
    cost = lambda r: (int(r["input_tokens"]) - min(int(r["input_tokens"]), int(r["cache_tokens"]))) / 1e6 * P_IN \
        + min(int(r["input_tokens"]), int(r["cache_tokens"])) / 1e6 * P_CACHE + int(r["output_tokens"]) / 1e6 * P_OUT
    print(h, f"{len(ok)}/{len(sub)}", "pass-median-time",
          sorted(float(r["duration_sec"]) for r in ok)[len(ok)//2], "cost",
          round(sum(cost(r) for r in sub), 2))
EOF
```

Versions: dataset `terminal-bench/terminal-bench-2-1` (per-trial
`task_checksum` in each committed `config.json`), Mixdog package **1.1.0**
(AMI snapshot of the published npm tree), DSH **0.2.0-rc.2**, model
`deepseek-ai/deepseek-v4.1-flash` via the Hive CDN endpoint.
