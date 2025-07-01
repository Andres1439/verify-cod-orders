import { describe, it, expect, vi, beforeEach } from "vitest";

// Usar global para exponer el mock y evitar problemas de hoisting
(globalThis as any).__webhookMock = vi.fn();

vi.mock("../app/shopify.server", () => ({
  authenticate: {
    webhook: (...args: any[]) => (globalThis as any).__webhookMock(...args),
  },
}));

vi.mock("../app/db.server", () => ({
  default: {
    ticket: { findMany: vi.fn(), deleteMany: vi.fn() },
    orderConfirmation: { findMany: vi.fn(), updateMany: vi.fn() },
    session: { deleteMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    shop: { findUnique: vi.fn(), delete: vi.fn() },
    $transaction: vi.fn((fn) => fn({
      ticket: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
      orderConfirmation: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      session: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
      shop: { delete: vi.fn().mockResolvedValue({ id: 1 }) },
    })),
  },
}));

vi.mock("../app/utils/logger.server", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    webhook: vi.fn(),
  },
}));

vi.mock("../app/services/email.server", () => ({
  sendEmail: vi.fn().mockResolvedValue(true),
}));

// Importar la función action del módulo de webhooks
import { action as webhookAction } from "../app/routes/webhooks";

describe("Webhooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).__webhookMock = vi.fn();
  });

  // Función helper para crear mock de Request
  const createMockRequest = (body: any, headers: Record<string, string> = {}) => {
    return {
      method: "POST",
      headers: new Headers({
        "content-type": "application/json",
        ...headers,
      }),
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(JSON.stringify(body)),
    } as any;
  };

  describe("CUSTOMERS_DATA_REQUEST", () => {
    it("debería procesar correctamente la solicitud de datos del cliente", async () => {
      (globalThis as any).__webhookMock.mockResolvedValue({
        topic: "CUSTOMERS_DATA_REQUEST",
        shop: "test-shop.myshopify.com",
        payload: {
          shop_id: 123456,
          shop_domain: "test-shop.myshopify.com",
          customer: {
            id: 789,
            email: "test@example.com",
            first_name: "Test",
            last_name: "User",
          },
          orders_requested: true,
        },
        admin: {
          graphql: vi.fn().mockResolvedValue({
            json: vi.fn().mockResolvedValue({
              data: { shop: { email: "merchant@shop.com" } }
            })
          })
        }
      });

      const payload = {
        shop_id: 123456,
        shop_domain: "test-shop.myshopify.com",
        customer: {
          id: 789,
          email: "test@example.com",
          first_name: "Test",
          last_name: "User",
        },
        orders_requested: true,
      };

      const request = createMockRequest(payload);

      const response = await webhookAction({
        request,
        params: {},
        context: {},
      });

      expect(response).toBeInstanceOf(Response);
      expect(response.status).toBe(200);
    });

    it("debería manejar payload inválido", async () => {
      (globalThis as any).__webhookMock.mockResolvedValue({
        topic: "CUSTOMERS_DATA_REQUEST",
        shop: "test-shop.myshopify.com",
        payload: { invalid: "data" },
        admin: {
          graphql: vi.fn().mockResolvedValue({
            json: vi.fn().mockResolvedValue({
              data: { shop: { email: "merchant@shop.com" } }
            })
          })
        }
      });

      const payload = { invalid: "data" };
      const request = createMockRequest(payload);

      const response = await webhookAction({
        request,
        params: {},
        context: {},
      });

      expect(response).toBeInstanceOf(Response);
      expect(response.status).toBe(200); // Shopify espera 200 incluso en errores
    });
  });

  describe("CUSTOMERS_REDACT", () => {
    it("debería eliminar correctamente los datos del cliente", async () => {
      (globalThis as any).__webhookMock.mockResolvedValue({
        topic: "CUSTOMERS_REDACT",
        shop: "test-shop.myshopify.com",
        payload: {
          shop_id: 123456,
          shop_domain: "test-shop.myshopify.com",
          customer: {
            id: 789,
            email: "test@example.com",
          },
          orders_to_redact: [123, 456],
        },
      });

      const payload = {
        shop_id: 123456,
        shop_domain: "test-shop.myshopify.com",
        customer: {
          id: 789,
          email: "test@example.com",
        },
        orders_to_redact: [123, 456],
      };

      const request = createMockRequest(payload);

      const response = await webhookAction({
        request,
        params: {},
        context: {},
      });

      expect(response).toBeInstanceOf(Response);
      expect(response.status).toBe(200);
    });
  });

  describe("SHOP_REDACT", () => {
    it("debería eliminar correctamente todos los datos de la tienda", async () => {
      (globalThis as any).__webhookMock.mockResolvedValue({
        topic: "SHOP_REDACT",
        shop: "test-shop.myshopify.com",
        payload: {
          shop_id: 123456,
          shop_domain: "test-shop.myshopify.com",
        },
      });

      const payload = {
        shop_id: 123456,
        shop_domain: "test-shop.myshopify.com",
      };

      const request = createMockRequest(payload);

      const response = await webhookAction({
        request,
        params: {},
        context: {},
      });

      expect(response).toBeInstanceOf(Response);
      expect(response.status).toBe(200);
    });

    it("debería manejar tienda no encontrada", async () => {
      (globalThis as any).__webhookMock.mockResolvedValue({
        topic: "SHOP_REDACT",
        shop: "non-existent-shop.myshopify.com",
        payload: {
          shop_domain: "non-existent-shop.myshopify.com",
        },
      });

      const payload = {
        shop_domain: "non-existent-shop.myshopify.com",
      };

      const request = createMockRequest(payload);

      const response = await webhookAction({
        request,
        params: {},
        context: {},
      });

      expect(response).toBeInstanceOf(Response);
      expect(response.status).toBe(200);
    });
  });

  describe("APP_UNINSTALLED", () => {
    it("debería procesar correctamente la desinstalación de la app", async () => {
      (globalThis as any).__webhookMock.mockResolvedValue({
        topic: "APP_UNINSTALLED",
        shop: "test-shop.myshopify.com",
        payload: {
          id: 123456,
          domain: "test-shop.myshopify.com",
          name: "Test Shop",
          email: "test@shop.com",
          province: "CA",
          country: "US",
          city: "Test City",
          address1: "123 Test St",
          zip: "12345",
          latitude: 37.7749,
          longitude: -122.4194,
          primary_locale: "en",
          address2: null,
          created_at: "2023-01-01T00:00:00Z",
          updated_at: "2023-01-01T00:00:00Z",
          country_code: "US",
          country_name: "United States",
          currency: "USD",
          customer_email: "test@shop.com",
          timezone: "(GMT-08:00) Pacific Time (US & Canada)",
          iana_timezone: "America/Los_Angeles",
          shop_owner: "Test Owner",
          money_format: "${{amount}}",
          money_with_currency_format: "${{amount}} USD",
          weight_unit: "lb",
          province_code: "CA",
          taxes_included: false,
          auto_configure_tax_inclusivity: null,
          tax_shipping: null,
          county_taxes: true,
          plan_display_name: "Basic Shopify",
          plan_name: "basic",
          has_discounts: false,
          has_gift_cards: false,
          myshopify_domain: "test-shop.myshopify.com",
          google_apps_domain: null,
          google_apps_login_enabled: null,
          money_in_emails_format: "${{amount}}",
          money_with_currency_in_emails_format: "${{amount}} USD",
          eligible_for_payments: true,
          requires_extra_payments_agreement: false,
          password_enabled: false,
          has_storefront: true,
          finances: true,
          primary_location_id: 123456,
          cookie_consent_level: "implicit",
          visitor_tracking_consent_preference: "allow_all",
          checkout_api_supported: true,
          multi_location_enabled: false,
          setup_required: false,
          pre_launch_enabled: false,
          enabled_presentment_currencies: ["USD"],
          transactional_sms_disabled: false,
          marketing_sms_consent_enabled_at_checkout: false,
          default_locale: "en",
          phony: false,
          app_proxy: {
            proxy_subpath: "apps",
            proxy_subpath_prefix: "apps",
            proxy_url: "https://test-shop.myshopify.com/apps",
          },
          phone: "+1234567890",
          has_discount_codes: false,
          presentment_prices: "USD",
          api_client_log_schema_version: "2025-04",
          original_domain: "test-shop.myshopify.com",
          address: "123 Test St, Test City, CA 12345, United States",
          enabled_currencies: ["USD"],
          tax_number: null,
          tax_exempt: false,
          location_id: 123456,
          source: null,
          primary_location: {
            id: 123456,
            country_code: "US",
            province_code: "CA",
            country_name: "United States",
            province_name: "California",
            address1: "123 Test St",
            address2: null,
            city: "Test City",
            zip: "12345",
            phone: "+1234567890",
            created_at: "2023-01-01T00:00:00Z",
            updated_at: "2023-01-01T00:00:00Z",
            legacy: false,
            active: true,
            country_id: 1,
            localized_country_name: "United States",
            localized_province_name: "California",
            name: "Primary Location",
            address: "123 Test St, Test City, CA 12345, United States",
          },
        },
      });

      const payload = {
        id: 123456,
        domain: "test-shop.myshopify.com",
        name: "Test Shop",
        email: "test@shop.com",
        province: "CA",
        country: "US",
        city: "Test City",
        address1: "123 Test St",
        zip: "12345",
        latitude: 37.7749,
        longitude: -122.4194,
        primary_locale: "en",
        address2: null,
        created_at: "2023-01-01T00:00:00Z",
        updated_at: "2023-01-01T00:00:00Z",
        country_code: "US",
        country_name: "United States",
        currency: "USD",
        customer_email: "test@shop.com",
        timezone: "(GMT-08:00) Pacific Time (US & Canada)",
        iana_timezone: "America/Los_Angeles",
        shop_owner: "Test Owner",
        money_format: "${{amount}}",
        money_with_currency_format: "${{amount}} USD",
        weight_unit: "lb",
        province_code: "CA",
        taxes_included: false,
        auto_configure_tax_inclusivity: null,
        tax_shipping: null,
        county_taxes: true,
        plan_display_name: "Basic Shopify",
        plan_name: "basic",
        has_discounts: false,
        has_gift_cards: false,
        myshopify_domain: "test-shop.myshopify.com",
        google_apps_domain: null,
        google_apps_login_enabled: null,
        money_in_emails_format: "${{amount}}",
        money_with_currency_in_emails_format: "${{amount}} USD",
        eligible_for_payments: true,
        requires_extra_payments_agreement: false,
        password_enabled: false,
        has_storefront: true,
        finances: true,
        primary_location_id: 123456,
        cookie_consent_level: "implicit",
        visitor_tracking_consent_preference: "allow_all",
        checkout_api_supported: true,
        multi_location_enabled: false,
        setup_required: false,
        pre_launch_enabled: false,
        enabled_presentment_currencies: ["USD"],
        transactional_sms_disabled: false,
        marketing_sms_consent_enabled_at_checkout: false,
        default_locale: "en",
        phony: false,
        app_proxy: {
          proxy_subpath: "apps",
          proxy_subpath_prefix: "apps",
          proxy_url: "https://test-shop.myshopify.com/apps",
        },
        phone: "+1234567890",
        has_discount_codes: false,
        presentment_prices: "USD",
        api_client_log_schema_version: "2025-04",
        original_domain: "test-shop.myshopify.com",
        address: "123 Test St, Test City, CA 12345, United States",
        enabled_currencies: ["USD"],
        tax_number: null,
        tax_exempt: false,
        location_id: 123456,
        source: null,
        primary_location: {
          id: 123456,
          country_code: "US",
          province_code: "CA",
          country_name: "United States",
          province_name: "California",
          address1: "123 Test St",
          address2: null,
          city: "Test City",
          zip: "12345",
          phone: "+1234567890",
          created_at: "2023-01-01T00:00:00Z",
          updated_at: "2023-01-01T00:00:00Z",
          legacy: false,
          active: true,
          country_id: 1,
          localized_country_name: "United States",
          localized_province_name: "California",
          name: "Primary Location",
          address: "123 Test St, Test City, CA 12345, United States",
        },
      };

      const request = createMockRequest(payload);

      const response = await webhookAction({
        request,
        params: {},
        context: {},
      });

      expect(response).toBeInstanceOf(Response);
      expect(response.status).toBe(200);
    });
  });

  describe("APP_SCOPES_UPDATE", () => {
    it("debería procesar correctamente la actualización de scopes", async () => {
      (globalThis as any).__webhookMock.mockResolvedValue({
        topic: "APP_SCOPES_UPDATE",
        shop: "test-shop.myshopify.com",
        payload: {
          id: 123456,
          domain: "test-shop.myshopify.com",
          scopes: ["read_orders", "write_orders"],
        },
      });

      const payload = {
        id: 123456,
        domain: "test-shop.myshopify.com",
        scopes: ["read_orders", "write_orders"],
      };

      const request = createMockRequest(payload);

      const response = await webhookAction({
        request,
        params: {},
        context: {},
      });

      expect(response).toBeInstanceOf(Response);
      expect(response.status).toBe(200);
    });
  });

  describe("Manejo de errores", () => {
    it("debería manejar webhook desconocido", async () => {
      (globalThis as any).__webhookMock.mockResolvedValue({
        topic: "unknown/webhook",
        shop: "test-shop.myshopify.com",
        payload: {
          topic: "unknown/webhook",
          data: {},
        },
      });

      const payload = {
        topic: "unknown/webhook",
        data: {},
      };

      const request = createMockRequest(payload);

      const response = await webhookAction({
        request,
        params: {},
        context: {},
      });

      expect(response).toBeInstanceOf(Response);
      expect(response.status).toBe(200);
    });

    it("debería manejar errores de parsing JSON", async () => {
      (globalThis as any).__webhookMock.mockRejectedValue(new Error("Invalid JSON"));

      const request = {
        method: "POST",
        headers: new Headers({ "content-type": "application/json" }),
        json: () => Promise.reject(new Error("Invalid JSON")),
        text: () => Promise.resolve("invalid json"),
      } as any;

      const response = await webhookAction({
        request,
        params: {},
        context: {},
      });

      expect(response).toBeInstanceOf(Response);
      expect(response.status).toBe(200);
    });
  });
}); 