DROP INDEX IF EXISTS notifications_dedupe_key_idx;
CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedupe_key_idx ON notifications(dedupe_key);
