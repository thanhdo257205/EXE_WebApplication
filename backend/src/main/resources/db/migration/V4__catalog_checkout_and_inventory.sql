-- VND amounts are integer dong, never floating point. No illustrative product seed data.
CREATE TABLE product_categories (
    id UUID PRIMARY KEY,
    slug VARCHAR(160) NOT NULL UNIQUE,
    name VARCHAR(160) NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE products (
    id UUID PRIMARY KEY,
    category_id UUID NOT NULL REFERENCES product_categories(id),
    content_release_id UUID REFERENCES content_releases(id),
    slug VARCHAR(160) NOT NULL UNIQUE,
    name VARCHAR(200) NOT NULL,
    description_markdown TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ACTIVE', 'ARCHIVED')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX ix_products_category_status ON products(category_id, status);

CREATE TABLE product_variants (
    id UUID PRIMARY KEY,
    product_id UUID NOT NULL REFERENCES products(id),
    sku VARCHAR(80) NOT NULL UNIQUE,
    name VARCHAR(160) NOT NULL,
    price_amount BIGINT NOT NULL CHECK (price_amount BETWEEN 0 AND 1000000000000),
    currency CHAR(3) NOT NULL DEFAULT 'VND' CHECK (currency = 'VND'),
    weight_grams INTEGER CHECK (weight_grams >= 0),
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX ix_variants_product ON product_variants(product_id);

CREATE TABLE product_images (
    id UUID PRIMARY KEY,
    product_id UUID NOT NULL REFERENCES products(id),
    image_url VARCHAR(2048) NOT NULL,
    alt_text VARCHAR(250) NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT uq_product_image_position UNIQUE (product_id, sort_order)
);

CREATE TABLE inventory_balances (
    variant_id UUID PRIMARY KEY REFERENCES product_variants(id),
    on_hand INTEGER NOT NULL DEFAULT 0 CHECK (on_hand >= 0),
    reserved INTEGER NOT NULL DEFAULT 0 CHECK (reserved >= 0 AND reserved <= on_hand),
    version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE carts (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL UNIQUE REFERENCES app_users(id) ON DELETE CASCADE,
    version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE cart_items (
    cart_id UUID NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
    variant_id UUID NOT NULL REFERENCES product_variants(id),
    quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 100),
    PRIMARY KEY (cart_id, variant_id)
);
CREATE INDEX ix_cart_items_variant ON cart_items(variant_id);

CREATE TABLE orders (
    id UUID PRIMARY KEY,
    order_number VARCHAR(40) NOT NULL UNIQUE,
    user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
    checkout_key VARCHAR(100) NOT NULL,
    checkout_fingerprint CHAR(64) NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'PENDING_PAYMENT'
        CHECK (status IN ('PENDING_PAYMENT', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'COMPLETED', 'CANCELLED')),
    payment_status VARCHAR(24) NOT NULL DEFAULT 'UNPAID'
        CHECK (payment_status IN ('UNPAID', 'PARTIALLY_PAID', 'PAID', 'REFUND_PENDING', 'PARTIALLY_REFUNDED', 'REFUNDED', 'REVIEW')),
    currency CHAR(3) NOT NULL DEFAULT 'VND' CHECK (currency = 'VND'),
    subtotal_amount BIGINT NOT NULL CHECK (subtotal_amount BETWEEN 0 AND 1000000000000),
    shipping_amount BIGINT NOT NULL DEFAULT 0 CHECK (shipping_amount BETWEEN 0 AND 1000000000000),
    discount_amount BIGINT NOT NULL DEFAULT 0 CHECK (discount_amount BETWEEN 0 AND subtotal_amount),
    total_amount BIGINT NOT NULL CHECK (total_amount BETWEEN 1 AND 1000000000000),
    coupon_code_snapshot VARCHAR(80),
    buyer_email VARCHAR(254) NOT NULL,
    recipient_name VARCHAR(120) NOT NULL CHECK (CHAR_LENGTH(TRIM(recipient_name)) > 0),
    recipient_phone VARCHAR(32) NOT NULL CHECK (CHAR_LENGTH(TRIM(recipient_phone)) > 0),
    shipping_address_line VARCHAR(500) NOT NULL CHECK (CHAR_LENGTH(TRIM(shipping_address_line)) > 0),
    shipping_ward VARCHAR(120),
    shipping_district VARCHAR(120),
    shipping_province VARCHAR(120) NOT NULL,
    shipping_postal_code VARCHAR(20),
    shipping_country_code CHAR(2) NOT NULL DEFAULT 'VN',
    customer_note VARCHAR(1000),
    cancellation_reason VARCHAR(500),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    paid_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_order_total CHECK (total_amount = subtotal_amount + shipping_amount - discount_amount),
    CONSTRAINT uq_checkout_request UNIQUE (user_id, checkout_key)
);
CREATE INDEX ix_orders_user_created ON orders(user_id, created_at);
CREATE INDEX ix_orders_status_created ON orders(status, created_at);
CREATE INDEX ix_orders_expiry ON orders(status, expires_at);
CREATE INDEX ix_orders_payment_status ON orders(payment_status, updated_at);

CREATE TABLE order_items (
    id UUID PRIMARY KEY,
    order_id UUID NOT NULL REFERENCES orders(id),
    variant_id UUID NOT NULL REFERENCES product_variants(id),
    sku_snapshot VARCHAR(80) NOT NULL,
    product_name_snapshot VARCHAR(200) NOT NULL,
    variant_name_snapshot VARCHAR(160) NOT NULL,
    image_url_snapshot VARCHAR(2048),
    quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 100),
    unit_price_amount BIGINT NOT NULL CHECK (unit_price_amount BETWEEN 0 AND 1000000000000),
    line_discount_amount BIGINT NOT NULL DEFAULT 0 CHECK (line_discount_amount >= 0),
    line_total_amount BIGINT NOT NULL CHECK (line_total_amount BETWEEN 0 AND 1000000000000),
    CONSTRAINT ck_order_line_total CHECK (line_total_amount = unit_price_amount * quantity - line_discount_amount),
    CONSTRAINT ck_order_line_discount CHECK (line_discount_amount <= unit_price_amount * quantity),
    CONSTRAINT uq_order_variant UNIQUE (order_id, variant_id),
    CONSTRAINT uq_order_item_variant_identity UNIQUE (id, variant_id)
);
CREATE INDEX ix_order_items_variant ON order_items(variant_id);

-- One reservation holds the complete immutable order line quantity; no split fulfillment in MVP.
CREATE TABLE inventory_reservations (
    order_item_id UUID PRIMARY KEY REFERENCES order_items(id),
    status VARCHAR(20) NOT NULL DEFAULT 'HELD' CHECK (status IN ('HELD', 'CONSUMED', 'RELEASED')),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    closed_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT ck_reservation_closed CHECK ((status = 'HELD' AND closed_at IS NULL) OR (status <> 'HELD' AND closed_at IS NOT NULL))
);
CREATE INDEX ix_reservations_expiry ON inventory_reservations(status, expires_at);

CREATE TABLE inventory_movements (
    id UUID PRIMARY KEY,
    variant_id UUID NOT NULL REFERENCES product_variants(id),
    order_item_id UUID,
    operation_key VARCHAR(120) NOT NULL UNIQUE,
    movement_type VARCHAR(20) NOT NULL CHECK (movement_type IN ('RECEIVE', 'RESERVE', 'RELEASE', 'SALE', 'RETURN', 'ADJUST')),
    on_hand_delta INTEGER NOT NULL,
    reserved_delta INTEGER NOT NULL,
    reason VARCHAR(500),
    actor_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
    id UUID PRIMARY KEY,
    order_id UUID NOT NULL REFERENCES orders(id),
    event_type VARCHAR(64) NOT NULL,
    previous_status VARCHAR(24),
    new_status VARCHAR(24),
    note VARCHAR(1000),
    actor_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
    operation_key VARCHAR(120) NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX ix_order_events_timeline ON order_events(order_id, created_at);

CREATE TABLE shipments (
    id UUID PRIMARY KEY,
    order_id UUID NOT NULL UNIQUE REFERENCES orders(id),
    carrier VARCHAR(80),
    tracking_code VARCHAR(120),
    tracking_url VARCHAR(2048),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'READY', 'IN_TRANSIT', 'DELIVERED', 'RETURNED', 'FAILED')),
    dispatched_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX ix_shipments_status ON shipments(status, updated_at);
