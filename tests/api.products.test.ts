import { describe, test, expect, vi } from "vitest";
import { loader } from "../app/routes/api.products";

vi.mock("../app/db.server", () => ({
  default: {
    shop: {
      findUnique: vi.fn().mockImplementation(({ where }) => {
        if (where.shop_domain === "test.myshopify.com") {
          return Promise.resolve({ shop_domain: "test.myshopify.com", access_token: "EAA" + "x".repeat(100) });
        }
        return Promise.resolve(null);
      }),
    },
  },
}));

describe("API Products Endpoint", () => {
  test("debe rechazar si la tienda no existe", async () => {
    const url = new URL("http://localhost/api/products?shop=notfound.myshopify.com");
    const request = new Request(url.toString(), { method: "GET" });
    const response = await loader({ request } as any);
    const data = await response.json();
    expect(response.status).toBe(404);
    expect(data.error).toMatch(/Tienda no encontrada/);
  });

  test("debe responder con productos si la tienda existe", async () => {
    const url = new URL("http://localhost/api/products?shop=test.myshopify.com");
    const request = new Request(url.toString(), { method: "GET" });
    // Mockear fetch global para simular respuesta de Shopify
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          products: {
            edges: [],
          },
        },
      }),
    }) as any;
    const response = await loader({ request } as any);
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data).toBeDefined();
    // Puedes agregar más validaciones según tu lógica
  });
}); 