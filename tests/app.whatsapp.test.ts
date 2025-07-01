import { describe, test, expect, vi } from "vitest";
import { action } from "../app/routes/app.whatsapp";

vi.mock("../app/db.server", () => ({
  default: {
    shop: {
      findUnique: vi.fn().mockResolvedValue({ id: 1, shop_domain: "test.myshopify.com" }),
    },
    whatsappBusinessConfig: {
      upsert: vi.fn().mockResolvedValue({ accessToken: JSON.stringify({ encrypted: "abc", iv: "iv", tag: "tag" }), webhookToken: "webhook", phoneNumberId: "123", businessAccountId: "456" }),
      findUnique: vi.fn().mockResolvedValue({ accessToken: JSON.stringify({ encrypted: "abc", iv: "iv", tag: "tag" }), phoneNumberId: "123", businessAccountId: "456" }),
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

describe("App WhatsApp Endpoint", () => {
  test("debe rechazar token inválido", async () => {
    // Forzar el validador a devolver inválido
    const { TokenValidator } = await import("../app/utils/token-validator.server");
    TokenValidator.validateMetaAccessToken = vi.fn().mockReturnValue({ valid: false, reason: "Token inválido" });
    const request = new Request("http://localhost/app/whatsapp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save_meta_config", metaData: JSON.stringify({ accessToken: "bad" }) }),
    });
    const response = await action({ request } as any);
    const data = await response.json();
    expect(response.status).toBe(400);
    expect(data.error).toMatch(/Token inválido/);
  });

  test("debe aceptar configuración válida", async () => {
    const request = new Request("http://localhost/app/whatsapp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save_meta_config", metaData: JSON.stringify({ accessToken: "EAA" + "x".repeat(100) }) }),
    });
    const response = await action({ request } as any);
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });
}); 