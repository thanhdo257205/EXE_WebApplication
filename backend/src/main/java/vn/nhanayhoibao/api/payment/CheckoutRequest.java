package vn.nhanayhoibao.api.payment;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.List;
import java.util.UUID;

public record CheckoutRequest(
    @NotBlank @Pattern(regexp = "[A-Za-z0-9_-]{16,100}") String idempotencyKey,
    @NotEmpty @Size(max = 20) List<@Valid Line> items,
    @NotBlank @Size(max = 120) String recipientName,
    @NotBlank @Pattern(regexp = "[+0-9 ()-]{8,32}") String recipientPhone,
    @NotBlank @Size(max = 500) String addressLine,
    @NotBlank @Size(max = 120) String province,
    @Size(max = 1000) String note
) {
    public record Line(@NotNull UUID variantId, @Min(1) @Max(100) int quantity) {}
    @Override public String toString() { return "CheckoutRequest[redacted]"; }
}
