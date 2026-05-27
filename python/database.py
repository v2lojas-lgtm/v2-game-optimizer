"""
SQLite persistence layer.
Stores benchmark runs, integrity scores and optimization logs.
"""
import sqlite3
import json
import time
import os
from pathlib import Path


def _db_path() -> str:
    data_dir = Path(os.environ.get("APPDATA", Path.home())) / "V2GameOptimizer"
    data_dir.mkdir(parents=True, exist_ok=True)
    return str(data_dir / "history.db")


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(_db_path())
    conn.row_factory = sqlite3.Row
    return conn


def _init_db() -> None:
    with _connect() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS benchmark_runs (
                id        INTEGER PRIMARY KEY AUTOINCREMENT,
                ts        INTEGER NOT NULL,
                overall   INTEGER NOT NULL,
                cpu_score INTEGER,
                disk_read REAL,
                disk_write REAL,
                ram_pct   REAL,
                ram_speed INTEGER,
                latency   REAL,
                payload   TEXT
            );

            CREATE TABLE IF NOT EXISTS integrity_runs (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                ts           INTEGER NOT NULL,
                overall      INTEGER NOT NULL,
                pc_score     INTEGER,
                network_score INTEGER,
                software_score INTEGER,
                input_score  INTEGER,
                issues_count INTEGER,
                payload      TEXT
            );

            CREATE TABLE IF NOT EXISTS optimization_runs (
                id      INTEGER PRIMARY KEY AUTOINCREMENT,
                ts      INTEGER NOT NULL,
                applied TEXT,
                skipped TEXT,
                errors  TEXT
            );

            CREATE TABLE IF NOT EXISTS diagnosis_runs (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                ts           INTEGER NOT NULL,
                score        INTEGER NOT NULL,
                grade        TEXT NOT NULL,
                critical_cnt INTEGER NOT NULL DEFAULT 0,
                warning_cnt  INTEGER NOT NULL DEFAULT 0,
                info_cnt     INTEGER NOT NULL DEFAULT 0,
                payload      TEXT
            );
        """)

_init_db()


# ── Benchmark ─────────────────────────────────────────────────────────────────

def save_benchmark(result: dict) -> int:
    with _connect() as conn:
        cur = conn.execute(
            """INSERT INTO benchmark_runs
               (ts, overall, cpu_score, disk_read, disk_write, ram_pct, ram_speed, latency, payload)
               VALUES (?,?,?,?,?,?,?,?,?)""",
            (
                int(time.time()),
                result.get("overall_score", 0),
                result.get("cpu", {}).get("score"),
                result.get("disk", {}).get("read_mbps"),
                result.get("disk", {}).get("write_mbps"),
                result.get("ram", {}).get("percent"),
                result.get("ram", {}).get("speed_mhz"),
                result.get("latency", {}).get("avg_latency_ms"),
                json.dumps(result),
            )
        )
        return cur.lastrowid


def get_benchmark_history(limit: int = 10) -> list[dict]:
    with _connect() as conn:
        rows = conn.execute(
            "SELECT id, ts, overall, cpu_score, disk_read, ram_pct FROM benchmark_runs ORDER BY ts DESC LIMIT ?",
            (limit,)
        ).fetchall()
    return [dict(r) for r in rows]


# ── Integrity ─────────────────────────────────────────────────────────────────

def save_integrity(result: dict) -> int:
    with _connect() as conn:
        cur = conn.execute(
            """INSERT INTO integrity_runs
               (ts, overall, pc_score, network_score, software_score, input_score, issues_count, payload)
               VALUES (?,?,?,?,?,?,?,?)""",
            (
                int(time.time()),
                result.get("overall", 0),
                result.get("pc", {}).get("score"),
                result.get("network", {}).get("score"),
                result.get("software", {}).get("score"),
                result.get("inputs", {}).get("score"),
                len(result.get("issues", [])),
                json.dumps(result),
            )
        )
        return cur.lastrowid


def get_integrity_history(limit: int = 10) -> list[dict]:
    with _connect() as conn:
        rows = conn.execute(
            "SELECT id, ts, overall, pc_score, network_score, software_score FROM integrity_runs ORDER BY ts DESC LIMIT ?",
            (limit,)
        ).fetchall()
    return [dict(r) for r in rows]


# ── Optimization ──────────────────────────────────────────────────────────────

def save_optimization(result: dict) -> int:
    with _connect() as conn:
        cur = conn.execute(
            "INSERT INTO optimization_runs (ts, applied, skipped, errors) VALUES (?,?,?,?)",
            (
                int(time.time()),
                json.dumps(result.get("applied", [])),
                json.dumps(result.get("skipped", [])),
                json.dumps(result.get("errors", [])),
            )
        )
        return cur.lastrowid


def get_optimization_history(limit: int = 10) -> list[dict]:
    with _connect() as conn:
        rows = conn.execute(
            "SELECT id, ts, applied, skipped, errors FROM optimization_runs ORDER BY ts DESC LIMIT ?",
            (limit,)
        ).fetchall()
    result = []
    for r in rows:
        d = dict(r)
        d["applied"] = json.loads(d["applied"])
        d["skipped"]  = json.loads(d["skipped"])
        d["errors"]   = json.loads(d["errors"])
        result.append(d)
    return result


# ── Diagnosis ─────────────────────────────────────────────────────────────────

def save_diagnosis(result: dict) -> int:
    counts = result.get("counts", {})
    with _connect() as conn:
        cur = conn.execute(
            """INSERT INTO diagnosis_runs
               (ts, score, grade, critical_cnt, warning_cnt, info_cnt, payload)
               VALUES (?,?,?,?,?,?,?)""",
            (
                int(time.time()),
                result.get("score", 0),
                result.get("grade", "?"),
                counts.get("critical", 0),
                counts.get("warning",  0),
                counts.get("info",     0),
                json.dumps(result),
            )
        )
        return cur.lastrowid


def get_diagnosis_history(limit: int = 7) -> list[dict]:
    with _connect() as conn:
        rows = conn.execute(
            """SELECT id, ts, score, grade, critical_cnt, warning_cnt, info_cnt
               FROM diagnosis_runs ORDER BY ts DESC LIMIT ?""",
            (limit,)
        ).fetchall()
    return [dict(r) for r in rows]
