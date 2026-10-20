ALTER TABLE player_feedback ADD COLUMN version BIGINT NOT NULL DEFAULT 0;
ALTER TABLE player_feedback ADD COLUMN moderation_note VARCHAR(2000);
