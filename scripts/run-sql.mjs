// Rebuilds the MySQL schema by feeding every db/sql/*.sql file (in filename order)
// to the real `mysql` CLI inside the Docker container. The CLI understands
// "DELIMITER $$" natively, so triggers/procedures need no special handling.
//
//   npm run db:init     -> run all files (fails if tables already exist)
//   npm run db:reset    -> DROP + CREATE the database first, then run all files
//
// With MYSQL_CLI_PATH set (local MySQL, no Docker) the same files are fed to that mysql.exe instead.
// Equivalent manual command for one file (what this script does per file):
//   docker exec -i -e MYSQL_PWD=<app password> shadowtrace-mysql \
//       mysql -u<app user> <database> < db/sql/00_core.sql
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

const { MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE, MYSQL_ROOT_PASSWORD } = process.env;
const CONTAINER = "shadowtrace-mysql";

// Local mode: set MYSQL_CLI_PATH to a mysql.exe and no Docker is needed.
const { MYSQL_CLI_PATH, MYSQL_HOST, MYSQL_PORT } = process.env;

function mysqlCli(user, password, args, stdin) {
  // MYSQL_PWD env var keeps the password off the command line.
  const [cmd, cmdArgs] = MYSQL_CLI_PATH
    ? [MYSQL_CLI_PATH, ["-h", MYSQL_HOST ?? "127.0.0.1", "-P", MYSQL_PORT ?? "3306", `-u${user}`, ...args]]
    : ["docker", ["exec", "-i", "-e", `MYSQL_PWD=${password}`, CONTAINER, "mysql", `-u${user}`, ...args]];
  const r = spawnSync(cmd, cmdArgs, {
    input: stdin,
    stdio: ["pipe", "inherit", "inherit"],
    env: { ...process.env, MYSQL_PWD: password },
  });
  if (r.status !== 0) {
    console.error("FAILED");
    process.exit(r.status ?? 1);
  }
}

if (process.argv.includes("--reset")) {
  console.log("Dropping and recreating", MYSQL_DATABASE);
  // Root is needed only here; the app user cannot drop/create databases.
  mysqlCli("root", MYSQL_ROOT_PASSWORD, [], `DROP DATABASE IF EXISTS ${MYSQL_DATABASE}; CREATE DATABASE ${MYSQL_DATABASE} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
}

import { readFileSync } from "node:fs";
const files = readdirSync("db/sql").filter((f) => f.endsWith(".sql")).sort();
for (const f of files) {
  if (f.startsWith("99_")) continue; // ALTER/DROP demo is run by hand during the viva
  console.log("running", f);
  mysqlCli(MYSQL_USER, MYSQL_PASSWORD, [MYSQL_DATABASE], readFileSync(`db/sql/${f}`));
}
console.log("done");
