import { describe, test, expect, vi } from "vitest";
import { action } from "../app/routes/api.whatsapp-info";

vi.mock("../app/db.server", () => ({
  default: {
    shop: {
      findUnique: vi.fn().mockResolvedValue({ id: 1, shop_domain: "test.myshopify.com" }),
    },
    whatsappBusinessConfig: {
      upsert: vi.fn().mockResolvedValue({ accessToken: JSON.stringify({ encrypted: "abc", iv: "iv", tag: "tag" }), webhookToken: "webhook", phoneNumberId: "123", businessAccountId: "456" }),
    },
  },
}));

vi.mock("../app/utils/encryption.server", () => ({
  encryptToken: vi.fn().mockReturnValue({ encrypted: "abc", iv: "iv", tag: "tag" }),
  decryptToken: vi.fn().mockReturnValue("decrypted-token"),
}));

vi.mock("../app/utils/token-validator.server", () => ({
  TokenValidator: {
    validateMetaAccessToken: vi.fn().mockReturnValue({ valid: true }),
  },
}));

describe("API WhatsApp Info Endpoint", () => {
  test("debe rechazar token inválido", async () => {
    // Forzar el validador a devolver inválido
    const { TokenValidator } = await import("../app/utils/token-validator.server");
    TokenValidator.validateMetaAccessToken = vi.fn().mockReturnValue({ valid: false, reason: "Token inválido" });
    const request = new Request("http://localhost/api/whatsapp-info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "configure_whatsapp", shop_domain: "test.myshopify.com", metaConfig: { accessToken: "bad" } }),
    });
    const response = await action({ request } as any);
    const data = await response.json();
    expect(response.status).toBe(400);
    expect(data.error).toMatch(/Token inválido/);
  });

  test("debe aceptar token válido", async () => {
    const request = new Request("http://localhost/api/whatsapp-info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "configure_whatsapp", shop_domain: "test.myshopify.com", metaConfig: { accessToken: "EAA" + "x".repeat(100) } }),
    });
    const response = await action({ request } as any);
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });
}); 