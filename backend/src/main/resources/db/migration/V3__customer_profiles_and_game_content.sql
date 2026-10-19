-- Additive only: preserve the existing Spring Security users and session tables.
-- UUIDs are assigned by the application; timestamps are stored with an offset.
CREATE TABLE user_profiles (
    user_id UUID PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
    phone VARCHAR(32),
    avatar_url VARCHAR(2048),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_addresses (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    label VARCHAR(60),
    recipient_name VARCHAR(120) NOT NULL CHECK (CHAR_LENGTH(TRIM(recipient_name)) > 0),
    phone VARCHAR(32) NOT NULL CHECK (CHAR_LENGTH(TRIM(phone)) > 0),
    address_line VARCHAR(500) NOT NULL CHECK (CHAR_LENGTH(TRIM(address_line)) > 0),
    ward VARCHAR(120),
    district VARCHAR(120), -- Optional: do not assume a fixed administrative hierarchy.
    province VARCHAR(120) NOT NULL,
    postal_code VARCHAR(20),
    country_code CHAR(2) NOT NULL DEFAULT 'VN',
    default_slot SMALLINT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_address_default CHECK (default_slot IS NULL OR default_slot = 1),
    CONSTRAINT uq_user_default_address UNIQUE (user_id, default_slot)
);
CREATE INDEX ix_addresses_user ON user_addresses(user_id);

CREATE TABLE content_releases (
    id UUID PRIMARY KEY,
    version_label VARCHAR(40) NOT NULL UNIQUE,
    title VARCHAR(200) NOT NULL,
    release_notes TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
    current_slot SMALLINT UNIQUE,
    created_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    published_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT ck_release_published CHECK (status <> 'PUBLISHED' OR published_at IS NOT NULL),
    CONSTRAINT ck_current_release CHECK (current_slot IS NULL OR (current_slot = 1 AND status = 'PUBLISHED'))
);

-- Stable identities/slugs support permanent URLs and printed QR codes.
CREATE TABLE game_characters (
    id UUID PRIMARY KEY,
    code VARCHAR(40) NOT NULL UNIQUE,
    slug VARCHAR(160) NOT NULL UNIQUE
);
CREATE TABLE character_revisions (
    id UUID PRIMARY KEY,
    character_id UUID NOT NULL REFERENCES game_characters(id),
    release_id UUID NOT NULL REFERENCES content_releases(id),
    name VARCHAR(160) NOT NULL,
    biography TEXT NOT NULL,
    ability_text TEXT,
    portrait_url VARCHAR(2048),
    sort_order INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT uq_character_release UNIQUE (character_id, release_id)
);
CREATE INDEX ix_character_revision_release ON character_revisions(release_id, sort_order);

CREATE TABLE card_sets (
    id UUID PRIMARY KEY,
    code VARCHAR(40) NOT NULL UNIQUE,
    slug VARCHAR(160) NOT NULL UNIQUE
);
CREATE TABLE card_set_revisions (
    id UUID PRIMARY KEY,
    card_set_id UUID NOT NULL REFERENCES card_sets(id),
    release_id UUID NOT NULL REFERENCES content_releases(id),
    name VARCHAR(160) NOT NULL,
    description TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT uq_card_set_release UNIQUE (card_set_id, release_id)
);
CREATE INDEX ix_set_revision_release ON card_set_revisions(release_id, sort_order);

CREATE TABLE game_cards (
    id UUID PRIMARY KEY,
    code VARCHAR(40) NOT NULL UNIQUE,
    slug VARCHAR(160) NOT NULL UNIQUE
);
CREATE TABLE card_revisions (
    id UUID PRIMARY KEY,
    card_id UUID NOT NULL REFERENCES game_cards(id),
    release_id UUID NOT NULL REFERENCES content_releases(id),
    card_set_id UUID NOT NULL,
    character_id UUID,
    name VARCHAR(160) NOT NULL,
    effect_text TEXT NOT NULL,
    ruling_notes TEXT,
    rule_status VARCHAR(24) NOT NULL DEFAULT 'NEEDS_REVIEW' CHECK (rule_status IN ('CONFIRMED', 'NEEDS_REVIEW')),
    copies_in_deck INTEGER NOT NULL DEFAULT 1 CHECK (copies_in_deck > 0),
    artwork_url VARCHAR(2048),
    sort_order INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT uq_card_release UNIQUE (card_id, release_id),
    CONSTRAINT fk_card_set_same_release FOREIGN KEY (card_set_id, release_id)
        REFERENCES card_set_revisions(card_set_id, release_id),
    CONSTRAINT fk_card_character_same_release FOREIGN KEY (character_id, release_id)
        REFERENCES character_revisions(character_id, release_id)
);
CREATE INDEX ix_cards_release_set ON card_revisions(release_id, card_set_id, sort_order);
CREATE INDEX ix_cards_character_release ON card_revisions(character_id, release_id);

CREATE TABLE wiki_pages (
    id UUID PRIMARY KEY,
    slug VARCHAR(160) NOT NULL UNIQUE,
    page_type VARCHAR(20) NOT NULL CHECK (page_type IN ('STORY', 'RULE', 'GUIDE', 'FAQ', 'DEVLOG'))
);
CREATE TABLE wiki_page_revisions (
    id UUID PRIMARY KEY,
    page_id UUID NOT NULL REFERENCES wiki_pages(id),
    release_id UUID NOT NULL REFERENCES content_releases(id),
    title VARCHAR(200) NOT NULL,
    summary VARCHAR(1000),
    body_markdown TEXT NOT NULL,
    rule_status VARCHAR(24) NOT NULL DEFAULT 'NEEDS_REVIEW' CHECK (rule_status IN ('CONFIRMED', 'NEEDS_REVIEW')),
    sort_order INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT uq_wiki_release UNIQUE (page_id, release_id)
);
CREATE INDEX ix_wiki_revision_release ON wiki_page_revisions(release_id, sort_order);

CREATE TABLE player_feedback (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
    release_id UUID REFERENCES content_releases(id),
    card_id UUID REFERENCES game_cards(id),
    page_id UUID REFERENCES wiki_pages(id),
    category VARCHAR(24) NOT NULL CHECK (category IN ('RULE_QUESTION', 'CARD_ISSUE', 'PLAYTEST', 'OTHER')),
    message TEXT NOT NULL CHECK (CHAR_LENGTH(TRIM(message)) BETWEEN 1 AND 5000),
    contact_email VARCHAR(254),
    status VARCHAR(20) NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW', 'IN_REVIEW', 'RESOLVED', 'REJECTED')),
    moderated_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX ix_feedback_queue ON player_feedback(status, created_at);
CREATE INDEX ix_feedback_user ON player_feedback(user_id, created_at);
