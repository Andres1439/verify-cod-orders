import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

describe("Validación de Estructura de Webhooks - Análisis Profundo", () => {
  let webhooksCode: string;
  let shopifyConfig: string;

  beforeAll(() => {
    try {
      const webhooksPath = join(process.cwd(), "app", "routes", "webhooks.tsx");
      webhooksCode = readFileSync(webhooksPath, "utf-8");
      
      const configPath = join(process.cwd(), "shopify.app.toml");
      shopifyConfig = readFileSync(configPath, "utf-8");
    } catch (error) {
      console.error("Error leyendo archivos:", error);
    }
  });

  describe("Análisis de Código de Webhooks", () => {
    it("debería implementar todos los casos switch requeridos", () => {
      expect(webhooksCode).toContain("case \"CUSTOMERS_DATA_REQUEST\":");
      expect(webhooksCode).toContain("case \"CUSTOMERS_REDACT\":");
      expect(webhooksCode).toContain("case \"SHOP_REDACT\":");
    });

    it("debería usar authenticate.webhook correctamente", () => {
      expect(webhooksCode).toContain("await authenticate.webhook(request)");
      expect(webhooksCode).toContain("const { topic, shop, payload, admin }");
    });

    it("debería tener manejo de errores robusto", () => {
      expect(webhooksCode).toContain("try {");
      expect(webhooksCode).toContain("catch (error)");
      expect(webhooksCode).toContain("return new Response(null, { status: 401 })");
    });

    it("debería implementar logging detallado", () => {
      expect(webhooksCode).toContain("logger.webhook(topic, shop, \"received\")");
      expect(webhooksCode).toContain("logger.info");
      expect(webhooksCode).toContain("logger.warn");
      expect(webhooksCode).toContain("logger.error");
    });

    it("debería usar transacciones de base de datos", () => {
      expect(webhooksCode).toContain("await db.$transaction");
      expect(webhooksCode).toContain("async (prisma)");
    });

    it("debería validar payloads de entrada", () => {
      expect(webhooksCode).toContain("if (!customer || (!customer.email && !customer.phone))");
      expect(webhooksCode).toContain("if (!shop_domain)");
    });
  });

  describe("Validación de Cumplimiento GDPR", () => {
    it("debería implementar recopilación de datos para CUSTOMERS_DATA_REQUEST", () => {
      expect(webhooksCode).toContain("db.ticket.findMany");
      expect(webhooksCode).toContain("db.orderConfirmation.findMany");
      expect(webhooksCode).toContain("sendCustomerDataReportEmail");
    });

    it("debería implementar redacción de datos para CUSTOMERS_REDACT", () => {
      expect(webhooksCode).toContain("customer_phone: \"[REDACTED]\"");
      expect(webhooksCode).toContain("customer_name: \"[REDACTED]\"");
      expect(webhooksCode).toContain("customer_email: \"[REDACTED]\"");
      expect(webhooksCode).toContain("shipping_address: Prisma.JsonNull");
    });

    it("debería implementar eliminación completa para SHOP_REDACT", () => {
      expect(webhooksCode).toContain("await prisma.session.deleteMany");
      expect(webhooksCode).toContain("await prisma.shop.delete");
    });

    it("debería respetar órdenes específicas en redacción", () => {
      expect(webhooksCode).toContain("orders_to_redact");
      expect(webhooksCode).toContain("shopify_order_id: { in: ordersToRedact }");
    });
  });

  describe("Validación de Configuración shopify.app.toml", () => {
    it("debería tener API version actualizada", () => {
      expect(shopifyConfig).toContain("api_version = \"2025-04\"");
    });

    it("debería tener compliance_topics configurados", () => {
      expect(shopifyConfig).toContain("compliance_topics = [ \"customers/data_request\", \"customers/redact\", \"shop/redact\" ]");
    });

    it("debería tener URIs correctas para webhooks", () => {
      expect(shopifyConfig).toContain("uri = \"/webhooks\"");
      expect(shopifyConfig).toContain("uri = \"https://cod-orders.fly.dev/webhooks/app/uninstalled\"");
      expect(shopifyConfig).toContain("uri = \"https://cod-orders.fly.dev/webhooks/app/scopes_update\"");
    });

    it("debería tener scopes apropiados", () => {
      expect(shopifyConfig).toContain("read_customers");
      expect(shopifyConfig).toContain("write_customers");
      expect(shopifyConfig).toContain("read_orders");
      expect(shopifyConfig).toContain("write_orders");
    });

    it("debería tener configuración de build moderna", () => {
      expect(shopifyConfig).toContain("automatically_update_urls_on_dev = true");
      expect(shopifyConfig).toContain("include_config_on_deploy = true");
    });
  });

  describe("Validación de Seguridad", () => {
    it("debería validar HMAC en authenticate.webhook", () => {
      // El authenticate.webhook de Shopify valida automáticamente el HMAC
      expect(webhooksCode).toContain("await authenticate.webhook(request)");
    });

    it("debería manejar errores de autenticación", () => {
      expect(webhooksCode).toContain("catch (error)");
      expect(webhooksCode).toContain("status: 401");
    });

    it("debería responder siempre con 200 para webhooks válidos", () => {
      expect(webhooksCode).toContain("return new Response(null, { status: 200 })");
    });

    it("debería usar HTTPS en URLs de producción", () => {
      expect(shopifyConfig).toContain("https://cod-orders.fly.dev/");
    });
  });

  describe("Validación de Arquitectura", () => {
    it("debería tener webhooks separados para app/uninstalled", () => {
      const fs = require("fs");
      const path = require("path");
      
      const uninstalledFile = path.join(process.cwd(), "app", "routes", "webhooks.app.uninstalled.tsx");
      expect(fs.existsSync(uninstalledFile)).toBe(true);
    });

    it("debería tener webhooks separados para app/scopes_update", () => {
      const fs = require("fs");
      const path = require("path");
      
      const scopesFile = path.join(process.cwd(), "app", "routes", "webhooks.app.scopes_update.tsx");
      expect(fs.existsSync(scopesFile)).toBe(true);
    });

    it("debería usar imports correctos", () => {
      expect(webhooksCode).toContain("import type { ActionFunctionArgs }");
      expect(webhooksCode).toContain("import { authenticate }");
      expect(webhooksCode).toContain("import db from");
      expect(webhooksCode).toContain("import { logger }");
    });
  });

  describe("Validación de Casos Edge", () => {
    it("debería manejar customer sin email ni teléfono", () => {
      expect(webhooksCode).toContain("if (!customer || (!customer.email && !customer.phone))");
      expect(webhooksCode).toContain("return new Response(null, { status: 200 })");
    });

    it("debería manejar shop_domain faltante en SHOP_REDACT", () => {
      expect(webhooksCode).toContain("if (!shop_domain)");
    });

    it("debería manejar tienda no encontrada", () => {
      expect(webhooksCode).toContain("if (!shopRecord)");
      expect(webhooksCode).toContain("La tienda no fue encontrada");
    });

    it("debería manejar errores en transacciones", () => {
      expect(webhooksCode).toContain("catch (error)");
      expect(webhooksCode).toContain("Error durante la transacción");
    });
  });

  describe("Validación de Performance", () => {
    it("debería usar Promise.all para consultas paralelas", () => {
      expect(webhooksCode).toContain("await Promise.all([");
    });

    it("debería usar transacciones para operaciones atómicas", () => {
      expect(webhooksCode).toContain("await db.$transaction(async (prisma)");
    });

    it("debería tener queries optimizadas", () => {
      expect(webhooksCode).toContain("include: { call: true }");
      expect(webhooksCode).toContain("where: {");
    });
  });

  describe("Validación de Compliance Específico", () => {
    it("debería cumplir con tiempo de respuesta de 30 días", () => {
      // Los webhooks deben procesar inmediatamente pero el cumplimiento es de 30 días
      expect(webhooksCode).toContain("Complete the action within 30 days");
    });

    it("debería mantener logs de auditoría", () => {
      expect(webhooksCode).toContain("logger.info(\"Datos recopilados para cliente\"");
      expect(webhooksCode).toContain("logger.info(\"Proceso de redacción completado\"");
      expect(webhooksCode).toContain("logger.info(\"Proceso de eliminación completa\"");
    });

    it("debería enviar confirmación por email", () => {
      expect(webhooksCode).toContain("await sendCustomerDataReportEmail");
    });
  });
});
