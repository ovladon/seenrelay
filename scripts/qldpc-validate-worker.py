#!/usr/bin/env python3
"""Bounded qldpc validator worker used only by SeenRelay external reproduction CI."""
import hashlib
import json
import os
import sys
import time

root = os.path.abspath(os.environ["QLDPC_ROOT"])
sys.path.insert(0, os.path.join(root, "research", "kit"))
sys.path.insert(0, os.path.join(root, "verify"))

import coordination  # noqa: E402
import validate_candidate  # noqa: E402

candidate_path = os.path.join(root, os.environ["QLDPC_CANDIDATE"])
cache_root = os.path.abspath(os.environ["QLDPC_CACHE_ROOT"])
gate_log = os.path.abspath(os.environ["QLDPC_GATE_LOG"])
seed = int(os.environ["QLDPC_SEED"])
ready_file = os.environ.get("QLDPC_READY_FILE")
start_file = os.environ.get("QLDPC_START_FILE")

with open(candidate_path, encoding="utf-8") as f:
    candidate = json.load(f)

cache = coordination.VerdictCache(
    root=cache_root,
    codes_dir=os.path.join(root, "codes"),
)


def append_gate_start():
    os.makedirs(os.path.dirname(gate_log), exist_ok=True)
    fd = os.open(gate_log, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
    try:
        os.write(fd, f"{os.getpid()}\n".encode("ascii"))
    finally:
        os.close(fd)


def wrapped_validator(doc, *, seed=None, refute=True):
    append_gate_start()
    return validate_candidate.validate_candidate(doc, seed=seed, refute=refute)


if ready_file:
    os.makedirs(os.path.dirname(os.path.abspath(ready_file)), exist_ok=True)
    with open(ready_file, "w", encoding="utf-8") as f:
        f.write("ready\n")

if start_file:
    deadline = time.monotonic() + 30
    while not os.path.exists(start_file):
        if time.monotonic() >= deadline:
            raise RuntimeError("timed out waiting for start barrier")
        time.sleep(0.01)

wall_start = time.perf_counter()
cpu_start = time.process_time()
verdict, reused = coordination.validate_cached(
    candidate,
    cache=cache,
    validator=wrapped_validator,
    seed=seed,
    refute=True,
)
cpu_ms = (time.process_time() - cpu_start) * 1000
elapsed_ms = (time.perf_counter() - wall_start) * 1000

canonical = json.dumps(verdict, sort_keys=True, separators=(",", ":")).encode("utf-8")
print(json.dumps({
    "reused": bool(reused),
    "elapsed_ms": round(elapsed_ms, 3),
    "cpu_ms": round(cpu_ms, 3),
    "verdict_sha256": hashlib.sha256(canonical).hexdigest(),
    "passed": bool(verdict.get("passed")),
    "validator_seed": (verdict.get("validator") or {}).get("seed"),
    "candidate": {
        "n": (verdict.get("candidate") or {}).get("n"),
        "k": (verdict.get("candidate") or {}).get("k"),
        "d": (verdict.get("candidate") or {}).get("d"),
    },
}))
