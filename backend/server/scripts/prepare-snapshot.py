"""Validate a PostgreSQL JSON snapshot in SQLite before importing it into Turso.

The input is an array containing column metadata and table records exported in
one PostgreSQL REPEATABLE READ transaction. Never print rows or credentials.
"""
import argparse
import datetime
import hashlib
import json
import pathlib
import sqlite3


def prepare(source, output):
    output.mkdir(parents=True, exist_ok=True)
    dbfile = output / "candidate.sqlite"
    if dbfile.exists():
        raise ValueError("Refusing to overwrite an existing candidate database")
    records = json.loads(source.read_text(encoding="utf-8"))
    metadata = next(r["rows"] for r in records if r["kind"] == "columns")
    types = {(c["table_name"], c["column_name"]): c["udt_name"] for c in metadata}
    schema = (pathlib.Path(__file__).parents[1] / "schema.sql").read_text(encoding="utf-8")
    con = sqlite3.connect(dbfile)
    con.executescript(schema)
    tables = {r[0].lower() for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    manifest = []
    con.execute("BEGIN")
    con.execute("PRAGMA defer_foreign_keys=ON")
    try:
        for record in records:
            if record["kind"] != "table" or record["name"] == "flyway_schema_history":
                continue  # Historical Flyway checksums remain in the PostgreSQL archive.
            table = record["name"]
            if table not in tables:
                raise ValueError("Unmapped source table: " + table)
            rows = []
            for row in record["rows"]:
                normalized = {}
                for key, value in row.items():
                    kind = types[table, key]
                    if value is not None:
                        if kind in ("timestamptz", "timestamp"):
                            moment = datetime.datetime.fromisoformat(value)
                            if moment.tzinfo is None:
                                moment = moment.replace(tzinfo=datetime.timezone.utc)
                            value = moment.astimezone(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")
                        elif kind == "bool":
                            value = int(value)
                        elif kind == "bytea":
                            value = {"blobHex": value.removeprefix("\\x")}
                    normalized[key] = value
                    if isinstance(value, int) and abs(value) > 9007199254740991:
                        raise ValueError("Integer outside lossless JavaScript range: " + table + "." + key)
                rows.append(normalized)
                keys = list(normalized)
                values = [bytes.fromhex(v["blobHex"]) if isinstance(v, dict) else v for v in normalized.values()]
                con.execute('INSERT INTO "' + table + '" (' + ','.join('"' + k + '"' for k in keys) + ') VALUES (' + ','.join('?' for _ in keys) + ')', values)
            manifest.append({"name": table, "rows": rows})
        maximum = con.execute("SELECT COALESCE(MAX(provider_order_code),99999999) FROM payment_attempts").fetchone()[0]
        con.execute("UPDATE app_sequences SET value=? WHERE name='payos_order_code'", (max(99999999, maximum),))
        if con.execute("PRAGMA foreign_key_check").fetchall():
            raise ValueError("Foreign key validation failed")
        con.commit()
        if con.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise ValueError("SQLite integrity validation failed")
        for table in manifest:
            count = con.execute('SELECT COUNT(*) FROM "' + table["name"] + '"').fetchone()[0]
            if count != len(table["rows"]):
                raise ValueError("Row count mismatch: " + table["name"])
        (output / "import.json").write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf-8")
        digest = hashlib.sha256(dbfile.read_bytes()).hexdigest()
        (output / "candidate.sha256").write_text(digest + "  candidate.sqlite\n")
        print(f"Validated {len(manifest)} tables, {sum(len(t['rows']) for t in manifest)} rows; integrity and foreign keys passed.")
    except Exception:
        con.rollback()
        raise
    finally:
        con.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=pathlib.Path, required=True)
    parser.add_argument("--output", type=pathlib.Path, required=True)
    args = parser.parse_args()
    repo = pathlib.Path(__file__).resolve().parents[3]
    if args.output.resolve().is_relative_to(repo):
        raise SystemExit("Backup/import data must be stored outside the source repository")
    prepare(args.source, args.output)
