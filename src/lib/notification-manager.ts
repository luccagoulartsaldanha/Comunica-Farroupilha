import type { QueryResultRow } from "@neondatabase/serverless";
import type { TransactionQuery } from "./db.ts";
import type { NotificationRecord } from "./platform-types.ts";

export type NotificationInput = {
  dedupeKey: string;
  title: string;
  body: string;
  activityId?: string;
};

export type NotificationRow = QueryResultRow & {
  id: string;
  title: string;
  body: string;
  activity_id: string | null;
  created_at: Date | string;
  read: boolean;
  dedupe_key: string | null;
  occurrence_count: number | string;
};

function timestamp(value: Date | string) {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

function displayTimestamp(value: Date | string) {
  return value instanceof Date ? value.toISOString() : value;
}

export async function createNotification(tx: TransactionQuery, input: NotificationInput) {
  await tx(
    `INSERT INTO notifications (id, title, body, activity_id, dedupe_key, occurrence_count)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, 1)
     ON CONFLICT (dedupe_key) DO UPDATE SET
       title = EXCLUDED.title,
       body = EXCLUDED.body,
       activity_id = EXCLUDED.activity_id,
       occurrence_count = notifications.occurrence_count + 1,
       created_at = now()`,
    [input.title, input.body, input.activityId ?? null, input.dedupeKey],
  );
}

export function collapseNotifications(rows: NotificationRow[]) {
  const groups = new Map<string, NotificationRecord>();
  for (const row of rows) {
    const key = row.dedupe_key ?? `${row.title}\u0000${row.body}`;
    const current = groups.get(key);
    const occurrences = Number(row.occurrence_count ?? 1);
    if (!current) {
      groups.set(key, {
        id: row.id,
        title: row.title,
        body: row.body,
        createdAt: displayTimestamp(row.created_at),
        read: row.read,
        occurrences,
        ...(row.activity_id ? { activityId: row.activity_id } : {}),
      });
      continue;
    }
    current.occurrences = (current.occurrences ?? 1) + occurrences;
    current.read = current.read && row.read;
    if (timestamp(row.created_at) > timestamp(current.createdAt)) current.createdAt = displayTimestamp(row.created_at);
  }
  return Array.from(groups.values());
}

export function notificationKey(resource: string, id: string, event: string) {
  return `${resource}:${id}:${event}`;
}
