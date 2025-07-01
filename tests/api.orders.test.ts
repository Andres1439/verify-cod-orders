import { describe, test, expect, vi } from "vitest";
import { action } from "../app/routes/api.orders";

// Mock de la base de datos y logger
vi.mock("../app/db.server", () => ({
  default: {
    shop: {
      findUnique: vi.fn().mockResolvedValue({ shop_domain: "test.myshopify.com", access_token: "EAA" + "x".repeat(100) }),
    },
  },
}));
vi.mock("../app/utils/logger.server", () => ({ logger: { info: vi.fn(), error: vi.fn() } }));

// Mock de la función de creación de orden
vi.mock("../app/routes/api.orders", async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    createShopifyOrder: vi.fn().mockResolvedValue({ success: true, order: { id: "1", name: "#1001", totalPrice: "100", currency: "USD", customer: { id: "c1", email: "test@example.com" }, lineItems: [] } }),
  };
});

describe("API Orders Endpoint", () => {
  test("debe rechazar si faltan parámetros", async () => {
    const request = new Request("http://localhost/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shopDomain: "test.myshopify.com" }), // faltan campos requeridos
    });
    const response = await action({ request } as any);
    const data = await response.json();
    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
  });

  test("debe crear orden con datos válidos", async () => {
    const request = new Request("http://localhost/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shopDomain: "test.myshopify.com",
        accessToken: "EAA" + "x".repeat(100),
        customerData: { email: "test@example.com", phone: "1234567890", firstName: "Test", lastName: "User" },
        shippingAddress: { firstName: "Test", lastName: "User", address1: "Calle 1", city: "Ciudad", province: "Provincia", country: "País", zip: "12345", phone: "1234567890" },
        lineItems: [{ variantId: "v1", quantity: 1, customAttributes: [] }],
        itemPrice: 100,
        subject: "Test Order"
      }),
    });
    const response = await action({ request } as any);
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.order).toBeDefined();
    expect(data.order.name).toBe("#1001");
  });
}); 