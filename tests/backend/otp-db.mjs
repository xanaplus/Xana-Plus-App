import { execFile, execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const quote = value => value === null ? 'null' : typeof value === 'boolean' ? String(value) : `'${String(value).replaceAll("'", "''")}'`;

/**
 * Disposable PostgreSQL fixture, reachable only through a private Unix socket.
 * Never reads backend credentials or connects to the existing Supabase database.
 * Requires initdb, pg_ctl and psql on PATH; absence is an explicit test failure.
 */
export function createOtpDatabase(seedSql = '') {
  const root = mkdtempSync(join(tmpdir(), 'xanaplus-otp-'));
  const data = join(root, 'data');
  const args = ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-h', root, '-U', 'postgres', '-d', 'postgres'];
  let started = false;
  const close = () => {
    try {
      if (started) execFileSync('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop'], { stdio: 'pipe' });
    } finally { rmSync(root, { recursive: true, force: true }); }
  };
  const sql = async statement => {
    const { stdout } = await exec('psql', [...args, '-c', statement]);
    return stdout.trim();
  };
  try {
    execFileSync('initdb', ['-D', data, '-U', 'postgres', '--auth=trust', '--no-locale'], { stdio: 'pipe' });
    execFileSync('pg_ctl', ['-D', data, '-l', join(root, 'postgres.log'), '-o', `-k ${root} -c listen_addresses='' -c fsync=off`, '-w', 'start'], { stdio: 'pipe' });
    started = true;
    // Use the actual existing OTP schema. Auth/profiles are not needed here.
    const original = readFileSync('supabase/migrations/20260924000000_accounts_and_otp.sql', 'utf8').split('-- Hashed one-time codes.')[1];
    execFileSync('psql', [...args, '-c', `
      create role anon; create role authenticated; create role service_role;
      create schema cron;
      create table cron.jobs (name text, schedule text, command text);
      create function cron.schedule(text, text, text) returns bigint language sql as
        'insert into cron.jobs values ($1, $2, $3); select 1::bigint';
      ${original.slice(original.indexOf('create table'))}
      ${seedSql}
    `], { stdio: 'pipe' });
    execFileSync('psql', [...args, '-f', 'supabase/migrations/20261006000000_atomic_otp.sql'], { stdio: 'pipe' });
  } catch (error) {
    close();
    throw error;
  }
  return {
    sql, close,
    async rpc(name, params) {
      if (!['reserve_otp', 'consume_otp', 'finish_otp_delivery'].includes(name)) throw new Error(`Unexpected RPC: ${name}`);
      try {
        const result = await sql(`set role service_role; select public.${name}(${Object.values(params).map(quote).join(',')});`);
        return { data: JSON.parse(result), error: null };
      } catch (error) { return { data: null, error }; }
    },
  };
}
