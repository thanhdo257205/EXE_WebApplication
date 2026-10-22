"""Private PostgreSQL backup/export using existing local Aiven credentials.

Requires requests and PostgreSQL18 client in Ubuntu WSL. --freeze-source is only
for the final migration window: it makes the named database read-only and drains
connections belonging to the same database user. It never deletes a service.
"""
import argparse
import datetime
import hashlib
import json
import pathlib
import shlex
import subprocess
import urllib.parse
import requests


def export(output, freeze=False):
    output = output.resolve()
    if output.is_relative_to(pathlib.Path(__file__).resolve().parents[3]):
        raise ValueError("Backup must be outside the source repository")
    output.mkdir(parents=True, exist_ok=False)
    config = pathlib.Path.home() / ".config" / "aiven"
    project = json.loads((config / "aiven-client.json").read_text())["default_project"]
    token = json.loads((config / "aiven-credentials.json").read_text())["auth_token"]
    session = requests.Session()
    session.headers["Authorization"] = "aivenv1 " + token
    prefix = "https://api.aiven.io/v1/project/" + urllib.parse.quote(project, safe="")
    response = session.get(prefix + "/service/exe-web-pg", params={"include_secrets": "true"}, timeout=30)
    response.raise_for_status()
    service = response.json()["service"]
    connection, user = service["service_uri_params"], service["users"][0]
    if connection["dbname"] != "defaultdb" or not user.get("password") or user["password"] == "<redacted>":
        raise ValueError("Unexpected source database or unavailable credential")
    ca = session.get(prefix + "/kms/ca", timeout=30)
    ca.raise_for_status()
    (output / "aiven-ca.pem").write_text(ca.json()["certificate"])
    converted = subprocess.run(["wsl.exe", "-d", "Ubuntu", "--", "wslpath", "-a", output.as_posix()], capture_output=True, check=True)
    linux = converted.stdout.decode().strip()
    variables = dict(PGHOST=connection["host"], PGPORT=str(connection["port"]), PGUSER=user["username"], PGPASSWORD=user["password"], PGDATABASE="defaultdb", PGSSLMODE="verify-full", PGSSLROOTCERT=linux + "/aiven-ca.pem", PGCONNECT_TIMEOUT="20")
    script = "set -e\n" + "".join("export " + key + "=" + shlex.quote(value) + "\n" for key, value in variables.items())
    if freeze:
        script += "psql -X -qAt -v ON_ERROR_STOP=1 <<'FREEZE_SQL'\nALTER DATABASE defaultdb SET default_transaction_read_only=on;\nSELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=current_database() AND usename=current_user AND pid<>pg_backend_pid();\nFREEZE_SQL\n"
    script += "pg_dump --format=custom --no-owner --no-acl --lock-wait-timeout=10000 --file=" + shlex.quote(linux + "/defaultdb.dump") + "\n"
    script += "pg_restore --list " + shlex.quote(linux + "/defaultdb.dump") + " > " + shlex.quote(linux + "/archive-toc.txt") + "\n"
    script += "pg_restore --no-owner --no-acl --file=/dev/null " + shlex.quote(linux + "/defaultdb.dump") + "\n"
    sql = r"""BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT json_build_object('kind','columns','rows',json_agg(c)) FROM (SELECT table_name,column_name,udt_name,column_default,is_nullable,character_maximum_length,ordinal_position FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position) c;
SELECT format('SELECT json_build_object(''kind'',''table'',''name'',%L,''rows'',COALESCE(json_agg(t),''[]''::json)) FROM public.%I t;',tablename,tablename) FROM pg_tables WHERE schemaname='public' ORDER BY tablename
\gexec
COMMIT;
"""
    script += "psql -X -qAt -v ON_ERROR_STOP=1 > " + shlex.quote(linux + "/snapshot.jsonl") + " <<'EXPORT_SQL'\n" + sql + "EXPORT_SQL\n"
    result = subprocess.run(["wsl.exe", "-d", "Ubuntu", "--", "bash", "-s"], input=script.encode(), capture_output=True, timeout=180)
    if result.returncode:
        # Raw psql/driver output may contain connection information. Do not dump it.
        raise RuntimeError("Backup/export failed; source may already be read-only if --freeze-source was used. Inspect privately and restore default_transaction_read_only if rolling back.")
    remaining = (output / "snapshot.jsonl").read_text()
    decoder, records = json.JSONDecoder(), []
    while remaining.strip():
        record, length = decoder.raw_decode(remaining.lstrip())
        remaining = remaining.lstrip()[length:]
        records.append(record)
    (output / "snapshot.json").write_text(json.dumps(records, ensure_ascii=False), encoding="utf-8")
    checksum = hashlib.sha256((output / "defaultdb.dump").read_bytes()).hexdigest()
    (output / "SHA256SUMS.txt").write_text(checksum + "  defaultdb.dump\n")
    counts = {record["name"]: len(record["rows"]) for record in records if record["kind"] == "table"}
    (output / "manifest.json").write_text(json.dumps({"source": "exe-web-pg/defaultdb", "capturedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(), "sourceFrozen": freeze, "sha256": checksum, "counts": counts}, indent=2))
    print("Backup/export verified:", len(counts), "tables,", sum(counts.values()), "rows; frozen:", freeze)
    print("Private backup directory:", output)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=pathlib.Path, required=True)
    parser.add_argument("--freeze-source", action="store_true")
    args = parser.parse_args()
    export(args.output, args.freeze_source)
