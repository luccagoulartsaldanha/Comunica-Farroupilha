CREATE TABLE IF NOT EXISTS interaction_revisions (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('support', 'save', 'comment_like')),
  resource_id UUID NOT NULL,
  revision BIGINT NOT NULL CHECK (revision >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, action, resource_id)
);
