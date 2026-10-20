-- Only digests are persisted. One outstanding link per account, replaced on resend.
CREATE TABLE password_reset_tokens (
    user_id UUID PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    requested_at TIMESTAMP WITH TIME ZONE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT ck_reset_expiry CHECK (expires_at > requested_at)
);
