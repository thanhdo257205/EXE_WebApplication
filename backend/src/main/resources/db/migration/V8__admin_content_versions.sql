-- Draft edits serialize on their release and use one optimistic version for the whole draft.
ALTER TABLE content_releases ADD COLUMN version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0);
CREATE INDEX ix_release_status_created ON content_releases(status, created_at);
