import { describe, test, expect, vi, beforeEach } from "vitest";
import { action } from "../app/routes/api.create-ticket";

// Mock de la base de datos
vi.mock("../app/db.server", () => ({
  default: {
    shop: {
      findUnique: vi.fn().mockResolvedValue({ id: 1, shop_domain: "test.myshopify.com" }),
    },
    ticket: {
      create: vi.fn().mockResolvedValue({
        id: 123,
        customer_email: "test@example.com",
        customerName: "Test User",
        customerPhone: "1234567890",
        shopDomain: "test.myshopify.com",
        subject: "Test Subject",
        status: "PENDING",
        created_at: new Date(),
        shop: { shop_domain: "test.myshopify.com" },
      }),
    },
  },
}));

describe("API Create Ticket Endpoint", () => {
  test("debe rechazar si faltan parámetros", async () => {
    const request = new Request("http://localhost/api/create-ticket", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shopId: "fake" }), // faltan campos requeridos
    });
    const response = await action({ request } as any);
    const data = await response.json();
    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toMatch(/Faltan parámetros/);
  });

  test("debe crear ticket con datos válidos", async () => {
    const request = new Request("http://localhost/api/create-ticket", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shopId: 1,
        customerEmail: "test@example.com",
        subject: "Test Subject",
        message: "Test message",
      }),
    });
    const response = await action({ request } as any);
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.ticket).toBeDefined();
    expect(data.ticket.customerEmail).toBe("test@example.com");
  });
}); 