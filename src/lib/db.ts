import "server-only";

import { Pool, type PoolClient, type QueryResultRow } from "@neondatabase/serverless";

export type TransactionQuery = <T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
) => Promise<T[]>;

let pool: Pool | null = null;

function getDatabaseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não está configurada.");
  return url;
}

function getPool() {
  if (!pool) pool = new Pool({ connectionString: getDatabaseUrl() });
  return pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []) {
  const result = await getPool().query<T>(text, params);
  return result.rows;
}

export async function transaction<T>(callback: (tx: TransactionQuery) => Promise<T>) {
  const client: PoolClient = await getPool().connect();
  const tx: TransactionQuery = async <Row extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []) => {
    const result = await client.query<Row>(text, params);
    return result.rows;
  };

  try {
    await client.query("BEGIN");
    const result = await callback(tx);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function checkDatabaseConnection() {
  const rows = await query<{ ok: number }>("SELECT 1 AS ok");
  return rows[0]?.ok === 1;
}

export async function closeDatabasePool() {
  if (!pool) return;
  const current = pool;
  pool = null;
  await current.end();
}
