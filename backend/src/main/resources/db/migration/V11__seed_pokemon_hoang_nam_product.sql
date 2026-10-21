-- One trial storefront product requested by the project owner: card "Pokémon Hoàng Nam" at 2,000 VND.
-- Fixed identifiers let the frontend and tests refer to the same rows. Price, stock and status remain
-- authoritative database values; checkout never trusts client-sent prices.
INSERT INTO product_categories(id, slug, name, sort_order)
VALUES ('5a1f0c2e-7b1d-4c8a-9a10-000000000001', 'the-bai-suu-tap', 'Thẻ bài sưu tập', 0);

INSERT INTO products(id, category_id, slug, name, description_markdown, status)
VALUES ('5a1f0c2e-7b1d-4c8a-9a10-000000000002', '5a1f0c2e-7b1d-4c8a-9a10-000000000001', 'pokemon-hoang-nam',
        'Pokémon Hoàng Nam',
        'Thẻ sưu tập Pokémon Hoàng Nam (bản thử nghiệm cửa hàng). Giao hàng tận nơi, thanh toán qua PayOS.', 'ACTIVE');

INSERT INTO product_variants(id, product_id, sku, name, price_amount, weight_grams, enabled)
VALUES ('5a1f0c2e-7b1d-4c8a-9a10-000000000003', '5a1f0c2e-7b1d-4c8a-9a10-000000000002', 'POKEMON-HOANG-NAM-01',
        '1 lá', 2000, 10, TRUE);

INSERT INTO product_images(id, product_id, image_url, alt_text, sort_order)
VALUES ('5a1f0c2e-7b1d-4c8a-9a10-000000000004', '5a1f0c2e-7b1d-4c8a-9a10-000000000002',
        '/assets/cards/pokemon-hoang-nam-poster.webp', 'Thẻ Pokémon Hoàng Nam', 0);

INSERT INTO inventory_balances(variant_id, on_hand) VALUES ('5a1f0c2e-7b1d-4c8a-9a10-000000000003', 10);
INSERT INTO inventory_movements(id, variant_id, operation_key, movement_type, on_hand_delta, reserved_delta, reason)
VALUES ('5a1f0c2e-7b1d-4c8a-9a10-000000000005', '5a1f0c2e-7b1d-4c8a-9a10-000000000003',
        'seed-v11-pokemon-hoang-nam-receive', 'RECEIVE', 10, 0, 'Tồn kho ban đầu cho cửa hàng thử nghiệm');
