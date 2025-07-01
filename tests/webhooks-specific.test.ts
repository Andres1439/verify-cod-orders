import { describe, it, expect, beforeEach, vi } from "vitest";
import { action as uninstalledAction } from "../app/routes/webhooks.app.uninstalled";
import { action as scopesAction } from "../app/routes/webhooks.app.scopes_update";

// Mock del logger
vi.mock("../app/utils/logger.server", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock de la base de datos
vi.mock("../app/db.server", () => ({
  default: {
    session: {
      deleteMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// Mock de authenticate.webhook
vi.mock("../app/shopify.server", () => ({
  authenticate: {
    webhook: vi.fn(),
  },
}));

describe("Webhooks Específicos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("APP_UNINSTALLED Webhook", () => {
    it("debería eliminar sesiones correctamente cuando se desinstala la app", async () => {
      const { authenticate } = await import("../app/shopify.server");
      const db = await import("../app/db.server");
      
      // Mock de la autenticación
      (authenticate.webhook as any).mockResolvedValue({
        shop: "test-shop.myshopify.com",
        session: { id: "session-123", shop: "test-shop.myshopify.com" },
        topic: "APP_UNINSTALLED",
      });

      // Mock de la eliminación de sesiones
      (db.default.session.deleteMany as any).mockResolvedValue({ count: 1 });

      const request = {
        method: "POST",
        headers: new Headers({ "content-type": "application/json" }),
        json: () => Promise.resolve({}),
      } as any;

      const response = await uninstalledAction({ request, params: {}, context: {} });

      expect(response.status).toBe(200);
      expect(db.default.session.deleteMany).toHaveBeenCalledWith({
        where: { shop: "test-shop.myshopify.com" }
      });
    });

    it("debería manejar el caso cuando no hay sesión", async () => {
      const { authenticate } = await import("../app/shopify.server");
      
      // Mock sin sesión
      (authenticate.webhook as any).mockResolvedValue({
        shop: "test-shop.myshopify.com",
        session: null,
        topic: "APP_UNINSTALLED",
      });

      const request = {
        method: "POST",
        headers: new Headers({ "content-type": "application/json" }),
        json: () => Promise.resolve({}),
      } as any;

      const response = await uninstalledAction({ request, params: {}, context: {} });

      expect(response.status).toBe(200);
    });

    it("debería manejar errores y devolver 200 OK", async () => {
      const { authenticate } = await import("../app/shopify.server");
      
      // Mock que lanza error
      (authenticate.webhook as any).mockRejectedValue(new Error("Error de autenticación"));

      const request = {
        method: "POST",
        headers: new Headers({ "content-type": "application/json" }),
        json: () => Promise.resolve({}),
      } as any;

      const response = await uninstalledAction({ request, params: {}, context: {} });

      expect(response.status).toBe(200);
    });
  });

  describe("APP_SCOPES_UPDATE Webhook", () => {
    it("debería actualizar scopes correctamente", async () => {
      const { authenticate } = await import("../app/shopify.server");
      const db = await import("../app/db.server");
      
      // Mock de la autenticación
      (authenticate.webhook as any).mockResolvedValue({
        shop: "test-shop.myshopify.com",
        session: { 
          id: "session-123", 
          shop: "test-shop.myshopify.com",
          scope: "read_orders,write_orders"
        },
        topic: "APP_SCOPES_UPDATE",
        payload: {
          current: ["read_orders", "write_orders", "read_customers"]
        },
      });

      // Mock de la actualización
      (db.default.session.update as any).mockResolvedValue({
        id: "session-123",
        scope: "read_orders,write_orders,read_customers"
      });

      const request = {
        method: "POST",
        headers: new Headers({ "content-type": "application/json" }),
        json: () => Promise.resolve({}),
      } as any;

      const response = await scopesAction({ request, params: {}, context: {} });

      expect(response.status).toBe(200);
      expect(db.default.session.update).toHaveBeenCalledWith({
        where: { id: "session-123" },
        data: { scope: "read_orders,write_orders,read_customers" }
      });
    });

    it("debería manejar el caso cuando no hay sesión", async () => {
      const { authenticate } = await import("../app/shopify.server");
      
      // Mock sin sesión
      (authenticate.webhook as any).mockResolvedValue({
        shop: "test-shop.myshopify.com",
        session: null,
        topic: "APP_SCOPES_UPDATE",
        payload: {
          current: ["read_orders", "write_orders"]
        },
      });

      const request = {
        method: "POST",
        headers: new Headers({ "content-type": "application/json" }),
        json: () => Promise.resolve({}),
      } as any;

      const response = await scopesAction({ request, params: {}, context: {} });

      expect(response.status).toBe(200);
    });

    it("debería manejar errores y devolver 200 OK", async () => {
      const { authenticate } = await import("../app/shopify.server");
      
      // Mock que lanza error
      (authenticate.webhook as any).mockRejectedValue(new Error("Error de autenticación"));

      const request = {
        method: "POST",
        headers: new Headers({ "content-type": "application/json" }),
        json: () => Promise.resolve({}),
      } as any;

      const response = await scopesAction({ request, params: {}, context: {} });

      expect(response.status).toBe(200);
    });
  });
}); 