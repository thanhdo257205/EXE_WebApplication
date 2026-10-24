PRAGMA foreign_keys=ON;
-- V1__initialize_application_metadata.sql
CREATE TABLE application_metadata (
    metadata_key TEXT NOT NULL PRIMARY KEY,
    metadata_value TEXT NOT NULL
);

;

-- V2__users_and_sessions.sql
CREATE TABLE app_users (
    id TEXT NOT NULL PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT,
    google_subject TEXT UNIQUE,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT TRUE,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f000Z','now'))
);

CREATE TABLE SPRING_SESSION (
    PRIMARY_ID TEXT NOT NULL PRIMARY KEY,
    SESSION_ID TEXT NOT NULL,
    CREATION_TIME INTEGER NOT NULL,
    LAST_ACCESS_TIME INTEGER NOT NULL,
    MAX_INACTIVE_INTERVAL INT NOT NULL,
    EXPIRY_TIME INTEGER NOT NULL,
    PRINCIPAL_NAME TEXT
);
CREATE UNIQUE INDEX SPRING_SESSION_IX1 ON SPRING_SESSION (SESSION_ID);
CREATE INDEX SPRING_SESSION_IX2 ON SPRING_SESSION (EXPIRY_TIME);
CREATE INDEX SPRING_SESSION_IX3 ON SPRING_SESSION (PRINCIPAL_NAME);
CREATE TABLE SPRING_SESSION_ATTRIBUTES (
    SESSION_PRIMARY_ID TEXT NOT NULL,
    ATTRIBUTE_NAME TEXT NOT NULL,
    ATTRIBUTE_BYTES BLOB NOT NULL,
    PRIMARY KEY (SESSION_PRIMARY_ID, ATTRIBUTE_NAME),
    FOREIGN KEY (SESSION_PRIMARY_ID) REFERENCES SPRING_SESSION(PRIMARY_ID) ON DELETE CASCADE
);

-- V3__customer_profiles_and_game_content.sql
CREATE TABLE user_profiles (
    user_id TEXT NOT NULL PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
    phone TEXT,
    avatar_url TEXT,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f000Z','now'))
);

CREATE TABLE user_addresses (
    id TEXT NOT NULL PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    label TEXT,
    recipient_name TEXT NOT NULL CHECK (length(TRIM(recipient_name)) > 0),
    phone TEXT NOT NULL CHECK (length(TRIM(phone)) > 0),
    address_line TEXT NOT NULL CHECK (length(TRIM(address_line)) > 0),
    ward TEXT,
    district TEXT,
    province TEXT NOT NULL,
    postal_code TEXT,
    country_code TEXT NOT NULL DEFAULT 'VN',
    default_slot INTEGER,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f000Z','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f000Z','now')),
    CONSTRAINT ck_address_default CHECK (default_slot IS NULL OR default_slot = 1),
    CONSTRAINT uq_user_default_address UNIQUE (user_id, default_slot)
);
CREATE INDEX ix_addresses_user ON user_addresses(user_id);

CREATE TABLE content_releases (
    id TEXT NOT NULL PRIMARY KEY,
    version_label TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    release_notes TEXT,
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
    current_slot INTEGER UNIQUE,
    created_by TEXT REFERENCES app_users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f000Z','now')),
    published_at TEXT,
    CONSTRAINT ck_release_published CHECK (status <> 'PUBLISHED' OR published_at IS NOT NULL),
    CONSTRAINT ck_current_release CHECK (current_slot IS NULL OR (current_slot = 1 AND status = 'PUBLISHED'))
);


CREATE TABLE game_characters (
    id TEXT NOT NULL PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE
);
CREATE TABLE character_revisions (
    id TEXT NOT NULL PRIMARY KEY,
    character_id TEXT NOT NULL REFERENCES game_characters(id),
    release_id TEXT NOT NULL REFERENCES content_releases(id),
    name TEXT NOT NULL,
    biography TEXT NOT NULL,
    ability_text TEXT,
    portrait_url TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT uq_character_release UNIQUE (character_id, release_id)
);
CREATE INDEX ix_character_revision_release ON character_revisions(release_id, sort_order);

CREATE TABLE card_sets (
    id TEXT NOT NULL PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE
);
CREATE TABLE card_set_revisions (
    id TEXT NOT NULL PRIMARY KEY,
    card_set_id TEXT NOT NULL REFERENCES card_sets(id),
    release_id TEXT NOT NULL REFERENCES content_releases(id),
    name TEXT NOT NULL,
    description TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT uq_card_set_release UNIQUE (card_set_id, release_id)
);
CREATE INDEX ix_set_revision_release ON card_set_revisions(release_id, sort_order);

CREATE TABLE game_cards (
    id TEXT NOT NULL PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE
);
CREATE TABLE card_revisions (
    id TEXT NOT NULL PRIMARY KEY,
    card_id TEXT NOT NULL REFERENCES game_cards(id),
    release_id TEXT NOT NULL REFERENCES content_releases(id),
    card_set_id TEXT NOT NULL,
    character_id TEXT,
    name TEXT NOT NULL,
    effect_text TEXT NOT NULL,
    ruling_notes TEXT,
    rule_status TEXT NOT NULL DEFAULT 'NEEDS_REVIEW' CHECK (rule_status IN ('CONFIRMED', 'NEEDS_REVIEW')),
    copies_in_deck INTEGER NOT NULL DEFAULT 1 CHECK (copies_in_deck > 0),
    artwork_url TEXT,
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
    id TEXT NOT NULL PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    page_type TEXT NOT NULL CHECK (page_type IN ('STORY', 'RULE', 'GUIDE', 'FAQ', 'DEVLOG'))
);
CREATE TABLE wiki_page_revisions (
    id TEXT NOT NULL PRIMARY KEY,
    page_id TEXT NOT NULL REFERENCES wiki_pages(id),
    release_id TEXT NOT NULL REFERENCES content_releases(id),
    title TEXT NOT NULL,
    summary TEXT,
    body_markdown TEXT NOT NULL,
    rule_status TEXT NOT NULL DEFAULT 'NEEDS_REVIEW' CHECK (rule_status IN ('CONFIRMED', 'NEEDS_REVIEW')),
    sort_order INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT uq_wiki_release UNIQUE (page_id, release_id)
);
CREATE INDEX ix_wiki_revision_release ON wiki_page_revisions(release_id, sort_order);

CREATE TABLE player_feedback (
    id TEXT NOT NULL PRIMARY KEY,
    user_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
    release_id TEXT REFERENCES content_releases(id),
    card_id TEXT REFERENCES game_cards(id),
    page_id TEXT REFERENCES wiki_pages(id),
    category TEXT NOT NULL CHECK (category IN ('RULE_QUESTION', 'CARD_ISSUE', 'PLAYTEST', 'OTHER')),
    message TEXT NOT NULL CHECK (length(TRIM(message)) BETWEEN 1 AND 5000),
    contact_email TEXT,
    status TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW', 'IN_REVIEW', 'RESOLVED', 'REJECTED')),
    moderated_by TEXT REFERENCES app_users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f000Z','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f000Z','now'))
);
CREATE INDEX ix_feedback_queue ON player_feedback(status, created_at);
CREATE INDEX ix_feedback_user ON player_feedback(user_id, created_at);

-- V4__catalog_checkout_and_inventory.sql
CREATE TABLE product_categories (
    id TEXT NOT NULL PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE products (
    id TEXT NOT NULL PRIMARY KEY,
    category_id TEXT NOT NULL REFERENCES product_categories(id),
    content_release_id TEXT REFERENCES content_releases(id),
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description_markdown TEXT,
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ACTIVE', 'ARCHIVED')),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f000Z','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f000Z','now'))
);
CREATE INDEX ix_products_category_status ON products(category_id, status);

CREATE TABLE product_variants (
    id TEXT NOT NULL PRIMARY KEY,
    product_id TEXT NOT NULL REFERENCES products(id),
    sku TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    price_amount INTEGER NOT NULL CHECK (price_amount BETWEEN 0 AND 1000000000000),
    currency TEXT NOT NULL DEFAULT 'VND' CHECK (currency = 'VND'),
    weight_grams INTEGER CHECK (weight_grams >= 0),
    enabled INTEGER NOT NULL DEFAULT TRUE,
    version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f000Z','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f000Z','now'))
);
CREATE INDEX ix_variants_product ON product_variants(product_id);

CREATE TABLE product_images (
    id TEXT NOT NULL PRIMARY KEY,
    product_id TEXT NOT NULL REFERENCES products(id),
    image_url TEXT NOT NULL,
    alt_text TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT uq_product_image_position UNIQUE (product_id, sort_order)
);

CREATE TABLE inventory_balances (
    variant_id TEXT NOT NULL PRIMARY KEY REFERENCES product_variants(id),
    on_hand INTEGER NOT NULL DEFAULT 0 CHECK (on_hand >= 0),
    reserved INTEGER NOT NULL DEFAULT 0 CHECK (reserved >= 0 AND reserved <= on_hand),
    version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f000Z','now'))
);

CREATE TABLE carts (
    id TEXT NOT NULL PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE REFERENCES app_users(id) ON DELETE CASCADE,
    version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f000Z','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f000Z','now'))
);
CREATE TABLE cart_items (
    cart_id TEXT NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
    variant_id TEXT NOT NULL REFERENCES product_variants(id),
    quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 100),
    PRIMARY KEY (cart_id, variant_id)
);
CREATE INDEX ix_cart_items_variant ON cart_items(variant_id);

CREATE TABLE orders (
    id TEXT NOT NULL PRIMARY KEY,
    order_number TEXT NOT NULL UNIQUE,
    user_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
    checkout_key TEXT NOT NULL,
    checkout_fingerprint TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING_PAYMENT'
        CHECK (status IN ('PENDING_PAYMENT', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'COMPLETED', 'CANCELLED')),
    payment_status TEXT NOT NULL DEFAULT 'UNPAID'
        CHECK (payment_status IN ('UNPAID', 'PARTIALLY_PAID', 'PAID', 'REFUND_PENDING', 'PARTIALLY_REFUNDED', 'REFUNDED', 'REVIEW')),
    currency TEXT NOT NULL DEFAULT 'VND' CHECK (currency = 'VND'),
    subtotal_amount INTEGER NOT NULL CHECK (subtotal_amount BETWEEN 0 AND 1000000000000),
    shipping_amount INTEGER NOT NULL DEFAULT 0 CHECK (shipping_amount BETWEEN 0 AND 1000000000000),
    discount_amount INTEGER NOT NULL DEFAULT 0 CHECK (discount_amount BETWEEN 0 AND subtotal_amount),
    total_amount INTEGER NOT NULL CHECK (total_amount BETWEEN 1 AND 1000000000000),
    coupon_code_snapshot TEXT,
    buyer_email TEXT NOT NULL,
    recipient_name TEXT NOT NULL CHECK (length(TRIM(recipient_name)) > 0),
    recipient_phone TEXT NOT NULL CHECK (length(TRIM(recipient_phone)) > 0),
    shipping_address_line TEXT NOT NULL CHECK (length(TRIM(shipping_address_line)) > 0),
    shipping_ward TEXT,
    shipping_district TEXT,
    shipping_province TEXT NOT NULL,
    shipping_postal_code TEXT,
    shipping_country_code TEXT NOT NULL DEFAULT 'VN',
    customer_note TEXT,
    cancellation_reason TEXT,
    expires_at TEXT NOT NULL,
    paid_at TEXT,
    cancelled_at TEXT,
    version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f000Z','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f000Z','now')),
    CONSTRAINT ck_order_total CHECK (total_amount = subtotal_amount + shipping_amount - discount_amount),
    CONSTRAINT uq_checkout_request UNIQUE (user_id, checkout_key)
);
CREATE INDEX ix_orders_user_created ON orders(user_id, created_at);
CREATE INDEX ix_orders_status_created ON orders(status, created_at);
CREATE INDEX ix_orders_expiry ON orders(status, expires_at);
CREATE INDEX ix_orders_payment_status ON orders(payment_status, updated_at);

CREATE TABLE order_items (
    id TEXT NOT NULL PRIMARY KEY,
    order_id TEXT NOT NULL REFERENCES orders(id),
    variant_id TEXT NOT NULL REFERENCES product_variants(id),
    sku_snapshot TEXT NOT NULL,
    product_name_snapshot TEXT NOT NULL,
    variant_name_snapshot TEXT NOT NULL,
    image_url_snapshot TEXT,
    quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 100),
    unit_price_amount INTEGER NOT NULL CHECK (unit_price_amount BETWEEN 0 AND 1000000000000),
    line_discount_amount INTEGER NOT NULL DEFAULT 0 CHECK (line_discount_amount >= 0),
    line_total_amount INTEGER NOT NULL CHECK (line_total_amount BETWEEN 0 AND 1000000000000),
    CONSTRAINT ck_order_line_total CHECK (line_total_amount = unit_price_amount * quantity - line_discount_amount),
    CONSTRAINT ck_order_line_discount CHECK (line_discount_amount <= unit_price_amount * quantity),
    CONSTRAINT uq_order_variant UNIQUE (order_id, variant_id),
    CONSTRAINT uq_order_item_variant_identity UNIQUE (id, variant_id)
);
CREATE INDEX ix_order_items_variant ON order_items(variant_id);


CREATE TABLE inventory_reservations (
    order_item_id TEXT NOT NULL PRIMARY KEY REFERENCES order_items(id),
    status TEXT NOT NULL DEFAULT 'HELD' CHECK (status IN ('HELD', 'CONSUMED', 'RELEASED')),
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f000Z','now')),
    closed_at TEXT,
    CONSTRAINT ck_reservation_closed CHECK ((status = 'HELD' AND closed_at IS NULL) OR (status <> 'HELD' AND closed_at IS NOT NULL))
);
CREATE INDEX ix_reservations_expiry ON inventory_reservations(status, expires_at);

CREATE TABLE inventory_movements (
    id TEXT NOT NULL PRIMARY KEY,
    variant_id TEXT NOT NULL REFERENCES product_variants(id),
    order_item_id TEXT,
    operation_key TEXT NOT NULL UNIQUE,
    movement_type TEXT NOT NULL CHECK (movement_type IN ('RECEIVE', 'RESERVE', 'RELEASE', 'SALE', 'RETURN', 'ADJUST')),
    on_hand_delta INTEGER NOT NULL,
    reserved_delta INTEGER NOT NULL,
    reason TEXT,
    actor_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f000Z','now')),
    CONSTRAINT fk_movement_order_variant FOREIGN KEY (order_item_id, variant_id) REFERENCES order_items(id, variant_id),
    CONSTRAINT ck_inventory_delta CHECK (
        (movement_type IN ('RECEIVE', 'RETURN') AND on_hand_delta > 0 AND reserved_delta = 0)
        OR (movement_type = 'ADJUST' AND on_hand_delta <> 0 AND reserved_delta = 0)
        OR (movement_type = 'RESERVE' AND on_hand_delta = 0 AND reserved_delta > 0 AND order_item_id IS NOT NULL)
        OR (movement_type = 'RELEASE' AND on_hand_delta = 0 AND reserved_delta < 0 AND order_item_id IS NOT NULL)
        OR (movement_type = 'SALE' AND on_hand_delta < 0 AND on_hand_delta = reserved_delta AND order_item_id IS NOT NULL)
    )
);
CREATE INDEX ix_inventory_movement_variant ON inventory_movements(variant_id, created_at);
CREATE INDEX ix_inventory_movement_order_item ON inventory_movements(order_item_id);

CREATE TABLE order_events (
    id TEXT NOT NULL PRIMARY KEY,
    order_id TEXT NOT NULL REFERENCES orders(id),
    event_type TEXT NOT NULL,
    previous_status TEXT,
    new_status TEXT,
    note TEXT,
    actor_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
    operation_key TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f000Z','now'))
);
CREATE INDEX ix_order_events_timeline ON order_events(order_id, created_at);

CREATE TABLE shipments (
    id TEXT NOT NULL PRIMARY KEY,
    order_id TEXT NOT NULL UNIQUE REFERENCES orders(id),
    carrier TEXT,
    tracking_code TEXT,
    tracking_url TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'READY', 'IN_TRANSIT', 'DELIVERED', 'RETURNED', 'FAILED')),
    dispatched_at TEXT,
    delivered_at TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f000Z','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f000Z','now'))
);
CREATE INDEX ix_shipments_status ON shipments(status, updated_at);

-- V5__payos_payment_ledger_and_audit.sql
CREATE TABLE payment_attempts (
    id TEXT NOT NULL PRIMARY KEY,
    order_id TEXT NOT NULL REFERENCES orders(id),
    provider TEXT NOT NULL DEFAULT 'PAYOS' CHECK (provider = 'PAYOS'),
    request_key TEXT NOT NULL UNIQUE,
    request_fingerprint TEXT NOT NULL,
    provider_order_code INTEGER NOT NULL UNIQUE,
    provider_payment_link_id TEXT UNIQUE,
    checkout_url TEXT,
    qr_code TEXT,
    description TEXT NOT NULL,
    amount_requested INTEGER NOT NULL CHECK (amount_requested BETWEEN 1 AND 1000000000000),
    amount_received INTEGER NOT NULL DEFAULT 0 CHECK (amount_received >= 0),
    currency TEXT NOT NULL DEFAULT 'VND' CHECK (currency = 'VND'),
    status TEXT NOT NULL DEFAULT 'CREATING'
        CHECK (status IN ('CREATING', 'PENDING', 'PARTIALLY_PAID', 'PAID', 'CANCELLED', 'EXPIRED', 'FAILED', 'UNKNOWN')),
    provider_status TEXT,
    active_slot INTEGER DEFAULT 1,
    expires_at TEXT NOT NULL,
    paid_at TEXT,
    cancelled_at TEXT,
    last_reconciled_at TEXT,
    failure_code TEXT,
    version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f000Z','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f000Z','now')),
    CONSTRAINT ck_payos_safe_integer CHECK (provider_order_code BETWEEN 1 AND 9007199254740991),
    CONSTRAINT ck_active_payment CHECK (
        (active_slot IS NOT NULL AND active_slot = 1 AND status IN ('CREATING', 'PENDING', 'PARTIALLY_PAID', 'UNKNOWN'))
        OR (active_slot IS NULL AND status IN ('PAID', 'CANCELLED', 'EXPIRED', 'FAILED'))
    ),
    CONSTRAINT ck_paid_attempt CHECK (status <> 'PAID' OR (paid_at IS NOT NULL AND amount_received >= amount_requested)),
    CONSTRAINT uq_live_payment_per_order UNIQUE (order_id, active_slot)
);
CREATE INDEX ix_payment_order_created ON payment_attempts(order_id, created_at);
CREATE INDEX ix_payment_reconciliation ON payment_attempts(status, last_reconciled_at);
CREATE INDEX ix_payment_expiry ON payment_attempts(status, expires_at);



CREATE TABLE payment_webhook_events (
    id TEXT NOT NULL PRIMARY KEY,
    event_key TEXT NOT NULL UNIQUE,
    payment_attempt_id TEXT REFERENCES payment_attempts(id),
    provider_order_code INTEGER NOT NULL,
    payment_link_id TEXT NOT NULL,
    provider_reference TEXT NOT NULL CHECK (length(TRIM(provider_reference)) > 0),
    amount INTEGER NOT NULL CHECK (amount > 0),
    currency TEXT NOT NULL CHECK (currency = 'VND'),
    provider_code TEXT NOT NULL,
    signature_verified INTEGER NOT NULL CHECK (signature_verified = TRUE),
    redacted_payload TEXT CHECK (length(redacted_payload) <= 16384),
    status TEXT NOT NULL DEFAULT 'RECEIVED' CHECK (status IN ('RECEIVED', 'PROCESSED', 'IGNORED', 'RETRY', 'FAILED')),
    delivery_count INTEGER NOT NULL DEFAULT 1 CHECK (delivery_count > 0),
    processing_attempts INTEGER NOT NULL DEFAULT 0 CHECK (processing_attempts >= 0),
    next_attempt_at TEXT,
    error_code TEXT,
    received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f000Z','now')),
    last_received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f000Z','now')),
    processed_at TEXT,
    CONSTRAINT ck_webhook_processed CHECK (status <> 'PROCESSED' OR processed_at IS NOT NULL),
    CONSTRAINT uq_event_attempt_identity UNIQUE (id, payment_attempt_id)
);
CREATE INDEX ix_webhook_retry ON payment_webhook_events(status, next_attempt_at);
CREATE INDEX ix_webhook_attempt ON payment_webhook_events(payment_attempt_id);
CREATE INDEX ix_webhook_order_code ON payment_webhook_events(provider_order_code);


CREATE TABLE payment_transactions (
    id TEXT NOT NULL PRIMARY KEY,
    payment_attempt_id TEXT NOT NULL REFERENCES payment_attempts(id),
    source_event_id TEXT UNIQUE,
    provider_reference TEXT NOT NULL CHECK (length(TRIM(provider_reference)) > 0),
    amount INTEGER NOT NULL CHECK (amount > 0),
    currency TEXT NOT NULL DEFAULT 'VND' CHECK (currency = 'VND'),
    source TEXT NOT NULL CHECK (source IN ('WEBHOOK', 'RECONCILIATION')),
    occurred_at TEXT NOT NULL,
    recorded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f000Z','now')),
    CONSTRAINT fk_transaction_event_attempt FOREIGN KEY (source_event_id, payment_attempt_id)
        REFERENCES payment_webhook_events(id, payment_attempt_id),
    CONSTRAINT uq_payment_bank_reference UNIQUE (payment_attempt_id, provider_reference),
    CONSTRAINT ck_transaction_source CHECK (source <> 'WEBHOOK' OR source_event_id IS NOT NULL)
);
CREATE INDEX ix_payment_transaction_reference ON payment_transactions(provider_reference);


CREATE TABLE refunds (
    id TEXT NOT NULL PRIMARY KEY,
    payment_transaction_id TEXT NOT NULL REFERENCES payment_transactions(id),
    idempotency_key TEXT NOT NULL UNIQUE,
    amount INTEGER NOT NULL CHECK (amount > 0),
    currency TEXT NOT NULL DEFAULT 'VND' CHECK (currency = 'VND'),
    reason TEXT NOT NULL CHECK (length(TRIM(reason)) > 0),
    status TEXT NOT NULL DEFAULT 'REQUESTED'
        CHECK (status IN ('REQUESTED', 'APPROVED', 'PROCESSING', 'SUCCEEDED', 'REJECTED', 'FAILED')),
    method TEXT NOT NULL DEFAULT 'MANUAL_BANK_TRANSFER' CHECK (method = 'MANUAL_BANK_TRANSFER'),
    external_reference TEXT UNIQUE,
    requested_by TEXT REFERENCES app_users(id) ON DELETE SET NULL,
    approved_by TEXT REFERENCES app_users(id) ON DELETE SET NULL,
    completed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f000Z','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f000Z','now')),
    CONSTRAINT ck_refund_completed CHECK (status <> 'SUCCEEDED' OR (completed_at IS NOT NULL AND external_reference IS NOT NULL))
);
CREATE INDEX ix_refunds_transaction ON refunds(payment_transaction_id);
CREATE INDEX ix_refunds_queue ON refunds(status, created_at);

CREATE TABLE audit_events (
    id TEXT NOT NULL PRIMARY KEY,
    actor_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    outcome TEXT NOT NULL CHECK (outcome IN ('SUCCESS', 'FAILURE')),
    details_redacted TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f000Z','now'))
);
CREATE INDEX ix_audit_entity ON audit_events(entity_type, entity_id, created_at);
CREATE INDEX ix_audit_actor ON audit_events(actor_id, created_at);

-- V6__password_reset_tokens.sql
CREATE TABLE password_reset_tokens (
    user_id TEXT NOT NULL PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    requested_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    CONSTRAINT ck_reset_expiry CHECK (expires_at > requested_at)
);

-- V7__jwt_auth_version.sql
ALTER TABLE app_users ADD COLUMN auth_version INTEGER NOT NULL DEFAULT 0;

-- V8__admin_content_versions.sql
ALTER TABLE content_releases ADD COLUMN version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0);
CREATE INDEX ix_release_status_created ON content_releases(status, created_at);

-- V9__feedback_moderation.sql
ALTER TABLE player_feedback ADD COLUMN version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE player_feedback ADD COLUMN moderation_note TEXT;

-- V10__admin_notifications.sql
CREATE TABLE admin_notifications (
    id INTEGER PRIMARY KEY,
    feedback_id TEXT NOT NULL UNIQUE REFERENCES player_feedback(id),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f000Z','now'))
);
CREATE TABLE admin_notification_reads (
    notification_id INTEGER NOT NULL REFERENCES admin_notifications(id),
    user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    read_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f000Z','now')),
    PRIMARY KEY (notification_id, user_id)
);
CREATE INDEX ix_notification_reads_user ON admin_notification_reads(user_id, notification_id);

-- V11__seed_pokemon_hoang_nam_product.sql
;

CREATE TABLE oauth_states (state_hash TEXT PRIMARY KEY NOT NULL, verifier TEXT NOT NULL, nonce TEXT NOT NULL, expires_at TEXT NOT NULL);
CREATE TABLE app_sequences (name TEXT PRIMARY KEY NOT NULL, value INTEGER NOT NULL);
INSERT INTO app_sequences VALUES ('payos_order_code', 99999999);
CREATE TABLE runtime_schema (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
INSERT INTO runtime_schema VALUES (1, strftime('%Y-%m-%dT%H:%M:%f000Z','now'));

-- Additive RBAC ownership registry. ADMIN remains the operational role for compatibility.
CREATE TABLE rbac_owner (
    slot INTEGER PRIMARY KEY CHECK (slot=1),
    user_id TEXT NOT NULL UNIQUE REFERENCES app_users(id) ON DELETE RESTRICT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f000Z','now'))
);

-- Registration events use separate storage to preserve existing feedback IDs/read receipts.
CREATE TABLE admin_registration_notifications (
    id INTEGER PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE REFERENCES app_users(id),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f000Z','now'))
);
CREATE TABLE admin_registration_notification_reads (
    notification_id INTEGER NOT NULL REFERENCES admin_registration_notifications(id),
    user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    read_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%f000Z','now')),
    PRIMARY KEY (notification_id,user_id)
);
