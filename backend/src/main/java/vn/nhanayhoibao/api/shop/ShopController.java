package vn.nhanayhoibao.api.shop;

import java.util.*;
import org.springframework.http.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

/** Read-only storefront catalog. Prices and availability come from the database, never from clients. */
@RestController
@RequestMapping("/api/v1/shop")
public class ShopController {
    private final JdbcTemplate db;
    public ShopController(JdbcTemplate db) { this.db = db; }

    public record Variant(UUID id, String sku, String name, long priceAmount, boolean available) {}
    public record Product(UUID id, String slug, String name, String description, String imageUrl, List<Variant> variants) {}

    @GetMapping("/products")
    public ResponseEntity<List<Product>> products() {
        var products = db.query("""
            SELECT p.id, p.slug, p.name, p.description_markdown,
                   (SELECT i.image_url FROM product_images i WHERE i.product_id = p.id ORDER BY i.sort_order LIMIT 1) AS image_url
            FROM products p WHERE p.status = 'ACTIVE' ORDER BY p.created_at, p.slug""",
            (r, n) -> new Object[] { r.getObject("id", UUID.class), r.getString("slug"), r.getString("name"),
                r.getString("description_markdown"), r.getString("image_url") });
        var result = new ArrayList<Product>();
        for (var p : products) {
            var variants = db.query("""
                SELECT v.id, v.sku, v.name, v.price_amount,
                       COALESCE(b.on_hand - b.reserved, 0) > 0 AS available
                FROM product_variants v LEFT JOIN inventory_balances b ON b.variant_id = v.id
                WHERE v.product_id = ? AND v.enabled = TRUE ORDER BY v.price_amount, v.sku""",
                (r, n) -> new Variant(r.getObject("id", UUID.class), r.getString("sku"), r.getString("name"),
                    r.getLong("price_amount"), r.getBoolean("available")), p[0]);
            if (!variants.isEmpty()) result.add(new Product((UUID) p[0], (String) p[1], (String) p[2], (String) p[3], (String) p[4], variants));
        }
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(result);
    }
}
