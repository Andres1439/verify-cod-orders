import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createRemixStub } from "@remix-run/testing";
import { action } from "../app/routes/webhooks";
import crypto from "crypto";

// Mock de Prisma para testing
const mockDb = {
  shop: {
    findUnique: vi.fn(),
  },
  ticket: {
    findMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  orderConfirmation: {
    findMany: vi.fn(),
    updateMany: vi.fn(),
  },
  session: {
    deleteMany: vi.fn(),
  },
  $transaction: vi.fn(),
};

// Mock del servicio de email
const mockEmailService = {
  sendCustomerDataReportEmail: vi.fn(),
};

// Mock del logger
const mockLogger = {
  webhook: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

// Mock de authenticate.webhook
const mockAuthenticate = {
  webhook: vi.fn(),
};

vi.mock("../app/db.server", () => ({
  default: mockDb,
}));

vi.mock("../app/services/email.server", () => ({
  sendCustomerDataReportEmail: mockEmailService.sendCustomerDataReportEmail,
}));

vi.mock("../app/utils/logger.server", () => ({
  logger: mockLogger,
}));

vi.mock("../app/shopify.server", () => ({
  authenticate: mockAuthenticate,
}));

describe("Webhooks Integration Tests - Casos Reales", () => {
  beforeAll(() => {
    // Reset todos los mocks antes de cada test
    vi.clearAllMocks();
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  describe("CUSTOMERS_DATA_REQUEST - Caso Real", () => {
    it("debería procesar correctamente una solicitud de datos de cliente", async () => {
      // Arrange: Configurar datos de prueba reales
      const mockCustomer = {
        id: 123456,
        email: "cliente@ejemplo.com",
        phone: "+51987654321",
      };

      const mockTickets = [
        {
          id: 1,
          customer_email: "cliente@ejemplo.com",
          subject: "Consulta sobre pedido",
          message: "¿Cuándo llegará mi pedido?",
          created_at: new Date("2024-01-15"),
        },
      ];

      const mockOrders = [
        {
          id: 1,
          customer_email: "cliente@ejemplo.com",
          customer_phone: "+51987654321",
          customer_name: "Juan Pérez",
          order_total: 150.00,
          status: "CONFIRMED",
          created_at: new Date("2024-01-10"),
          call: {
            id: 1,
            call_status: "COMPLETED",
          },
        },
      ];

      const mockShopData = {
        data: {
          shop: {
            email: "tienda@ejemplo.com",
          },
        },
      };

      // Mock de las funciones de BD
      mockDb.ticket.findMany.mockResolvedValue(mockTickets);
      mockDb.orderConfirmation.findMany.mockResolvedValue(mockOrders);

      // Mock del admin GraphQL
      const mockAdmin = {
        graphql: vi.fn().mockResolvedValue({
          json: vi.fn().mockResolvedValue(mockShopData),
        }),
      };

      // Mock de authenticate.webhook
      mockAuthenticate.webhook.mockResolvedValue({
        topic: "CUSTOMERS_DATA_REQUEST",
        shop: "test-shop.myshopify.com",
        payload: { customer: mockCustomer },
        admin: mockAdmin,
      });

      // Act: Ejecutar el webhook
      const request = new Request("https://test.com/webhooks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Hmac-Sha256": "valid-hmac",
        },
        body: JSON.stringify({ customer: mockCustomer }),
      });

      const response = await action({ request } as any);

      // Assert: Verificar comportamiento
      expect(response.status).toBe(200);
      expect(mockLogger.webhook).toHaveBeenCalledWith(
        "CUSTOMERS_DATA_REQUEST",
        "test-shop.myshopify.com",
        "received"
      );
      expect(mockDb.ticket.findMany).toHaveBeenCalledWith({
        where: {
          shop: { shop_domain: "test-shop.myshopify.com" },
          customer_email: "cliente@ejemplo.com",
        },
      });
      expect(mockEmailService.sendCustomerDataReportEmail).toHaveBeenCalledWith({
        shopDomain: "test-shop.myshopify.com",
        customerDataReport: expect.objectContaining({
          requestDetails: expect.objectContaining({
            shopDomain: "test-shop.myshopify.com",
            customerIdentifiers: {
              email: "cliente@ejemplo.com",
              phone: "+51987654321",
              shopifyCustomerId: 123456,
            },
          }),
          dataFound: {
            tickets: mockTickets,
            orderConfirmations: mockOrders,
          },
        }),
        merchantEmail: "tienda@ejemplo.com",
      });
    });

    it("debería manejar correctamente cliente sin email ni teléfono", async () => {
      // Arrange
      const mockCustomer = {}; // Cliente sin datos

      mockAuthenticate.webhook.mockResolvedValue({
        topic: "CUSTOMERS_DATA_REQUEST",
        shop: "test-shop.myshopify.com",
        payload: { customer: mockCustomer },
        admin: null,
      });

      // Act
      const request = new Request("https://test.com/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customer: mockCustomer }),
      });

      const response = await action({ request } as any);

      // Assert
      expect(response.status).toBe(200);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        "Payload de CUSTOMERS_DATA_REQUEST no contiene email ni teléfono",
        { shop: "test-shop.myshopify.com" }
      );
      expect(mockEmailService.sendCustomerDataReportEmail).not.toHaveBeenCalled();
    });
  });

  describe("CUSTOMERS_REDACT - Caso Real", () => {
    it("debería redactar correctamente datos de cliente específico", async () => {
      // Arrange
      const mockCustomer = {
        id: 123456,
        email: "cliente@redactar.com",
        phone: "+51987654321",
      };

      const mockOrdersToRedact = [299938, 280263];

      mockDb.$transaction.mockImplementation(async (callback) => {
        const mockPrisma = {
          ticket: {
            deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
          },
          orderConfirmation: {
            updateMany: vi.fn().mockResolvedValue({ count: 3 }),
          },
        };
        return await callback(mockPrisma);
      });

      mockAuthenticate.webhook.mockResolvedValue({
        topic: "CUSTOMERS_REDACT",
        shop: "test-shop.myshopify.com",
        payload: {
          customer: mockCustomer,
          orders_to_redact: mockOrdersToRedact,
        },
        admin: null,
      });

      // Act
      const request = new Request("https://test.com/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer: mockCustomer,
          orders_to_redact: mockOrdersToRedact,
        }),
      });

      const response = await action({ request } as any);

      // Assert
      expect(response.status).toBe(200);
      expect(mockDb.$transaction).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Proceso de redacción completado con éxito",
        { shop: "test-shop.myshopify.com" }
      );
    });

    it("debería manejar error en transacción de redacción", async () => {
      // Arrange
      const mockCustomer = {
        id: 123456,
        email: "cliente@error.com",
      };

      mockDb.$transaction.mockRejectedValue(new Error("Database error"));

      mockAuthenticate.webhook.mockResolvedValue({
        topic: "CUSTOMERS_REDACT",
        shop: "test-shop.myshopify.com",
        payload: { customer: mockCustomer, orders_to_redact: [] },
        admin: null,
      });

      // Act
      const request = new Request("https://test.com/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customer: mockCustomer }),
      });

      const response = await action({ request } as any);

      // Assert
      expect(response.status).toBe(200);
      expect(mockLogger.error).toHaveBeenCalledWith(
        "Error durante la transacción de redacción de datos",
        {
          shop: "test-shop.myshopify.com",
          error: "Database error",
        }
      );
    });
  });

  describe("SHOP_REDACT - Caso Real", () => {
    it("debería eliminar completamente todos los datos de la tienda", async () => {
      // Arrange
      const shopDomain = "tienda-eliminada.myshopify.com";

      const mockShopRecord = {
        id: 1,
        shop_domain: shopDomain,
        access_token: "encrypted-token",
      };

      mockDb.$transaction.mockImplementation(async (callback) => {
        const mockPrisma = {
          shop: {
            findUnique: vi.fn().mockResolvedValue(mockShopRecord),
            delete: vi.fn().mockResolvedValue(mockShopRecord),
          },
          session: {
            deleteMany: vi.fn().mockResolvedValue({ count: 5 }),
          },
        };
        return await callback(mockPrisma);
      });

      mockAuthenticate.webhook.mockResolvedValue({
        topic: "SHOP_REDACT",
        shop: shopDomain,
        payload: { shop_domain: shopDomain },
        admin: null,
      });

      // Act
      const request = new Request("https://test.com/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shop_domain: shopDomain }),
      });

      const response = await action({ request } as any);

      // Assert
      expect(response.status).toBe(200);
      expect(mockDb.$transaction).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Proceso de eliminación completa finalizado",
        { shop_domain: shopDomain }
      );
    });

    it("debería manejar tienda no encontrada sin error", async () => {
      // Arrange
      const shopDomain = "tienda-inexistente.myshopify.com";

      mockDb.$transaction.mockImplementation(async (callback) => {
        const mockPrisma = {
          shop: {
            findUnique: vi.fn().mockResolvedValue(null),
          },
        };
        return await callback(mockPrisma);
      });

      mockAuthenticate.webhook.mockResolvedValue({
        topic: "SHOP_REDACT",
        shop: shopDomain,
        payload: { shop_domain: shopDomain },
        admin: null,
      });

      // Act
      const request = new Request("https://test.com/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shop_domain: shopDomain }),
      });

      const response = await action({ request } as any);

      // Assert
      expect(response.status).toBe(200);
      expect(mockLogger.info).toHaveBeenCalledWith(
        "La tienda no fue encontrada",
        { shop_domain: shopDomain }
      );
    });
  });

  describe("Manejo de Errores y Seguridad", () => {
    it("debería devolver 401 para webhook con HMAC inválido", async () => {
      // Arrange
      mockAuthenticate.webhook.mockRejectedValue(new Error("Invalid HMAC"));

      // Act
      const request = new Request("https://test.com/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ test: "data" }),
      });

      const response = await action({ request } as any);

      // Assert
      expect(response.status).toBe(401);
      expect(mockLogger.error).toHaveBeenCalledWith(
        "Error en webhook",
        expect.objectContaining({
          error: "Invalid HMAC",
        })
      );
    });

    it("debería manejar webhook no reconocido", async () => {
      // Arrange
      mockAuthenticate.webhook.mockResolvedValue({
        topic: "UNKNOWN_WEBHOOK",
        shop: "test-shop.myshopify.com",
        payload: {},
        admin: null,
      });

      // Act
      const request = new Request("https://test.com/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const response = await action({ request } as any);

      // Assert
      expect(response.status).toBe(200);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        "Webhook no manejado",
        { topic: "UNKNOWN_WEBHOOK", shop: "test-shop.myshopify.com" }
      );
    });
  });

  describe("Validación de Estructura de Datos", () => {
    it("debería validar estructura correcta de payload CUSTOMERS_DATA_REQUEST", async () => {
      // Arrange
      const validPayload = {
        shop_id: 954889,
        shop_domain: "test-shop.myshopify.com",
        customer: {
          id: 191167,
          email: "john@example.com",
          phone: "555-625-1199",
        },
        orders_to_redact: [299938, 280263, 220458],
      };

      mockAuthenticate.webhook.mockResolvedValue({
        topic: "CUSTOMERS_DATA_REQUEST",
        shop: "test-shop.myshopify.com",
        payload: validPayload,
        admin: {
          graphql: vi.fn().mockResolvedValue({
            json: vi.fn().mockResolvedValue({
              data: { shop: { email: "merchant@test.com" } },
            }),
          }),
        },
      });

      mockDb.ticket.findMany.mockResolvedValue([]);
      mockDb.orderConfirmation.findMany.mockResolvedValue([]);

      // Act
      const request = new Request("https://test.com/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validPayload),
      });

      const response = await action({ request } as any);

      // Assert
      expect(response.status).toBe(200);
      expect(mockDb.ticket.findMany).toHaveBeenCalled();
      expect(mockDb.orderConfirmation.findMany).toHaveBeenCalled();
    });

    it("debería validar estructura correcta de payload SHOP_REDACT", async () => {
      // Arrange
      const validPayload = {
        shop_id: 954889,
        shop_domain: "test-shop.myshopify.com",
      };

      mockAuthenticate.webhook.mockResolvedValue({
        topic: "SHOP_REDACT",
        shop: "test-shop.myshopify.com",
        payload: validPayload,
        admin: null,
      });

      mockDb.$transaction.mockImplementation(async (callback) => {
        const mockPrisma = {
          shop: {
            findUnique: vi.fn().mockResolvedValue({
              id: 1,
              shop_domain: "test-shop.myshopify.com",
            }),
            delete: vi.fn().mockResolvedValue({}),
          },
          session: {
            deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
          },
        };
        return await callback(mockPrisma);
      });

      // Act
      const request = new Request("https://test.com/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validPayload),
      });

      const response = await action({ request } as any);

      // Assert
      expect(response.status).toBe(200);
      expect(mockDb.$transaction).toHaveBeenCalled();
    });
  });
});
