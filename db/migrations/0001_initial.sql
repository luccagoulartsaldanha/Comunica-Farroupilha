CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  username TEXT NOT NULL,
  username_normalized TEXT NOT NULL UNIQUE,
  class_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('student', 'gef')),
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS proposals (
  id UUID PRIMARY KEY,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 5 AND 160),
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 20 AND 4000),
  author_id UUID REFERENCES users(id) ON DELETE SET NULL,
  author_name TEXT NOT NULL,
  anonymous BOOLEAN NOT NULL DEFAULT false,
  theme TEXT NOT NULL CHECK (char_length(theme) BETWEEN 1 AND 80),
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'analysis', 'development', 'scheduled', 'completed', 'archived')),
  origin TEXT NOT NULL DEFAULT 'student' CHECK (origin IN ('student', 'gef')),
  gef_response TEXT CHECK (gef_response IS NULL OR char_length(gef_response) <= 4000),
  gef_response_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS proposals_created_at_idx ON proposals(created_at DESC);

CREATE TABLE IF NOT EXISTS proposal_supports (
  proposal_id UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (proposal_id, user_id)
);

CREATE TABLE IF NOT EXISTS proposal_saves (
  proposal_id UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (proposal_id, user_id)
);

CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY,
  proposal_id UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  author_id UUID REFERENCES users(id) ON DELETE SET NULL,
  author_name TEXT NOT NULL,
  author_role TEXT NOT NULL CHECK (author_role IN ('student', 'gef')),
  anonymous BOOLEAN NOT NULL DEFAULT false,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  parent_id UUID REFERENCES comments(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS comments_proposal_id_idx ON comments(proposal_id, created_at);

CREATE TABLE IF NOT EXISTS comment_likes (
  comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, user_id)
);

CREATE TABLE IF NOT EXISTS activities (
  id UUID PRIMARY KEY,
  proposal_id UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  activity_date DATE NOT NULL,
  time_label TEXT NOT NULL CHECK (char_length(time_label) BETWEEN 1 AND 80),
  place TEXT NOT NULL CHECK (char_length(place) BETWEEN 1 AND 160),
  audience TEXT NOT NULL CHECK (char_length(audience) BETWEEN 1 AND 160),
  status TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'done', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS activities_date_idx ON activities(activity_date);

CREATE TABLE IF NOT EXISTS activity_feedbacks (
  id UUID PRIMARY KEY,
  activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  participated BOOLEAN NOT NULL,
  reason_not_participated TEXT CHECK (reason_not_participated IS NULL OR char_length(reason_not_participated) <= 500),
  rating TEXT CHECK (rating IS NULL OR rating IN ('great', 'good', 'ok', 'poor')),
  comment TEXT CHECK (comment IS NULL OR char_length(comment) <= 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (activity_id, user_id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  activity_id UUID REFERENCES activities(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_created_at_idx ON notifications(created_at DESC);

CREATE TABLE IF NOT EXISTS notification_reads (
  notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (notification_id, user_id)
);

CREATE TABLE IF NOT EXISTS chapa_questions (
  id UUID PRIMARY KEY,
  chapa_id TEXT NOT NULL CHECK (chapa_id IN ('chapa-1', 'chapa-2')),
  proposal_area TEXT NOT NULL CHECK (char_length(proposal_area) BETWEEN 1 AND 120),
  proposal_title TEXT CHECK (proposal_title IS NULL OR char_length(proposal_title) <= 160),
  question TEXT NOT NULL CHECK (char_length(question) BETWEEN 5 AND 2000),
  author_id UUID REFERENCES users(id) ON DELETE SET NULL,
  author_name TEXT NOT NULL,
  class_name TEXT NOT NULL,
  answer TEXT CHECK (answer IS NULL OR char_length(answer) <= 4000),
  answered_by TEXT CHECK (answered_by IS NULL OR char_length(answered_by) <= 160),
  answered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chapa_questions_chapa_idx ON chapa_questions(chapa_id, created_at DESC);

CREATE TABLE IF NOT EXISTS legacy_imports (
  migration_key TEXT PRIMARY KEY,
  imported_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  result JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS legacy_entities (
  fingerprint TEXT PRIMARY KEY,
  migration_key TEXT NOT NULL REFERENCES legacy_imports(migration_key) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
