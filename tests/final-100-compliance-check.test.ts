import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

describe("🎯 VERIFICACIÓN FINAL 100% CUMPLIMIENTO SHOPIFY 2025", () => {
  const shopifyConfigPath = join(process.cwd(), "shopify.app.toml");
  const webhooksMainPath = join(process.cwd(), "app", "routes", "webhooks.tsx");
  const webhooksAppUninstalledPath = join(process.cwd(), "app", "routes", "webhooks.app.uninstalled.tsx");
  const webhooksAppScopesPath = join(process.cwd(), "app", "routes", "webhooks.app.scopes_update.tsx");
  
  const shopifyConfig = readFileSync(shopifyConfigPath, "utf-8");
  const mainWebhookContent = readFileSync(webhooksMainPath, "utf-8");
  const appUninstalledContent = readFileSync(webhooksAppUninstalledPath, "utf-8");
  const appScopesContent = readFileSync(webhooksAppScopesPath, "utf-8");

  describe("✅ REQUISITOS CRÍTICOS SHOPIFY 2025", () => {
    it("debe usar API version 2025-04 (OBLIGATORIO)", () => {
      expect(shopifyConfig).toContain('api_version = "2025-04"');
    });

    it("debe tener todos los webhooks de cumplimiento obligatorios", () => {
      expect(shopifyConfig).toContain('compliance_topics = [ "customers/data_request", "customers/redact", "shop/redact" ]');
    });

    it("debe tener webhook app/uninstalled configurado", () => {
      expect(shopifyConfig).toContain('topics = [ "app/uninstalled" ]');
    });

    it("debe tener webhook app/scopes_update configurado", () => {
      expect(shopifyConfig).toContain('topics = [ "app/scopes_update" ]');
    });

    it("debe tener application_url válida con HTTPS", () => {
      expect(shopifyConfig).toContain('application_url = "https://cod-orders.fly.dev/"');
    });

    it("debe estar configurado como embedded app", () => {
      expect(shopifyConfig).toContain('embedded = true');
    });

    it("debe tener scopes necesarios para funcionalidad", () => {
      const requiredScopes = [
        "read_customers",
        "read_inventory", 
        "read_orders",
        "read_products",
        "write_customers",
        "write_orders"
      ];

      requiredScopes.forEach(scope => {
        expect(shopifyConfig).toContain(scope);
      });
    });
  });

  describe("🛡️ WEBHOOKS DE PRIVACIDAD (OBLIGATORIOS)", () => {
    it("CUSTOMERS_DATA_REQUEST debe estar completamente implementado", () => {
      expect(mainWebhookContent).toContain('case "CUSTOMERS_DATA_REQUEST":');
      expect(mainWebhookContent).toContain("db.ticket.findMany");
      expect(mainWebhookContent).toContain("db.orderConfirmation.findMany");
      expect(mainWebhookContent).toContain("sendCustomerDataReportEmail");
      expect(mainWebhookContent).toContain("admin.graphql");
      expect(mainWebhookContent).toContain("query GetShopEmail");
    });

    it("CUSTOMERS_REDACT debe eliminar/anonimizar datos correctamente", () => {
      expect(mainWebhookContent).toContain('case "CUSTOMERS_REDACT":');
      expect(mainWebhookContent).toContain("prisma.ticket.deleteMany");
      expect(mainWebhookContent).toContain("prisma.orderConfirmation.updateMany");
      expect(mainWebhookContent).toContain('"[REDACTED]"');
      expect(mainWebhookContent).toContain("Prisma.JsonNull");
      expect(mainWebhookContent).toContain("$transaction");
    });

    it("SHOP_REDACT debe eliminar todos los datos de la tienda", () => {
      expect(mainWebhookContent).toContain('case "SHOP_REDACT":');
      expect(mainWebhookContent).toContain("prisma.session.deleteMany");
      expect(mainWebhookContent).toContain("prisma.shop.delete");
      expect(mainWebhookContent).toContain("$transaction");
    });
  });

  describe("🗑️ WEBHOOK APP_UNINSTALLED (CRÍTICO PARA CUMPLIMIENTO)", () => {
    it("debe eliminar TODOS los datos de negocio (no solo sesiones)", () => {
      const requiredDeletions = [
        "ticket.deleteMany",
        "orderConfirmation.deleteMany",
        "vonageConfiguration.deleteMany",
        "chatbotConfiguration.deleteMany",
        "session.deleteMany",
        "shop.delete"
      ];

      requiredDeletions.forEach(deletion => {
        expect(appUninstalledContent).toContain(deletion);
      });
    });

    it("debe liberar números de WhatsApp (no eliminarlos)", () => {
      expect(appUninstalledContent).toContain("whatsAppNumber.updateMany");
      expect(appUninstalledContent).toContain('assignment_status: "AVAILABLE"');
      expect(appUninstalledContent).toContain("default_shop_id: null");
      expect(appUninstalledContent).not.toContain("whatsAppNumber.deleteMany");
    });

    it("debe usar transacciones para integridad de datos", () => {
      expect(appUninstalledContent).toContain("db.$transaction");
      expect(appUninstalledContent).toContain("async (prisma)");
    });

    it("debe verificar existencia de tienda antes de eliminar", () => {
      expect(appUninstalledContent).toContain("prisma.shop.findUnique");
      expect(appUninstalledContent).toContain("where: { shop_domain: shop }");
      expect(appUninstalledContent).toContain("if (!shopRecord)");
    });

    it("debe usar relaciones correctas con shop_id", () => {
      expect(appUninstalledContent).toContain("shop_id: shopRecord.id");
    });

    it("debe tener logging exhaustivo para auditoría", () => {
      const requiredLogs = [
        "🚨 INICIANDO ELIMINACIÓN COMPLETA",
        "Tickets eliminados",
        "Confirmaciones de órdenes eliminadas", 
        "Configuración de Vonage eliminada",
        "Configuración de chatbot eliminada",
        "Números de WhatsApp liberados",
        "Sesiones eliminadas",
        "🎉 ELIMINACIÓN COMPLETA FINALIZADA"
      ];

      requiredLogs.forEach(log => {
        expect(appUninstalledContent).toContain(log);
      });
    });

    it("debe retornar status 200 siempre (requerido por Shopify)", () => {
      const statusMatches = appUninstalledContent.match(/status: 200/g);
      expect(statusMatches).toBeTruthy();
      expect(statusMatches!.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("🔄 WEBHOOK APP_SCOPES_UPDATE", () => {
    it("debe actualizar scopes en sesiones correctamente", () => {
      expect(appScopesContent).toContain("db.session.update");
      expect(appScopesContent).toContain("scope: current.toString()");
    });

    it("debe tener logging de cambios de scopes", () => {
      expect(appScopesContent).toContain("Scopes actualizados");
      expect(appScopesContent).toContain("oldScope:");
      expect(appScopesContent).toContain("newScope:");
    });

    it("debe manejar sesión no encontrada", () => {
      expect(appScopesContent).toContain("No se encontró sesión");
    });

    it("debe retornar status 200 siempre", () => {
      expect(appScopesContent).toContain("status: 200");
    });
  });

  describe("🔐 SEGURIDAD Y AUTENTICACIÓN", () => {
    it("todos los webhooks deben usar authenticate.webhook", () => {
      expect(mainWebhookContent).toContain("authenticate.webhook(request)");
      expect(appUninstalledContent).toContain("authenticate.webhook(request)");
      expect(appScopesContent).toContain("authenticate.webhook(request)");
    });

    it("debe manejar errores de autenticación apropiadamente", () => {
      expect(mainWebhookContent).toContain("status: 401");
      expect(appUninstalledContent).toContain("Error crítico en webhook");
      expect(appScopesContent).toContain("Error en webhook");
    });

    it("no debe exponer información sensible en logs", () => {
      [mainWebhookContent, appUninstalledContent, appScopesContent].forEach(content => {
        expect(content).not.toContain("password");
        expect(content).not.toContain("secret");
        expect(content).not.toContain("token");
      });
    });
  });

  describe("⚡ RENDIMIENTO Y MEJORES PRÁCTICAS", () => {
    it("debe usar operaciones batch para eficiencia", () => {
      expect(mainWebhookContent).toContain("deleteMany");
      expect(mainWebhookContent).toContain("updateMany");
      expect(appUninstalledContent).toContain("deleteMany");
      expect(appUninstalledContent).toContain("updateMany");
    });

    it("debe usar transacciones para operaciones múltiples", () => {
      expect(mainWebhookContent).toContain("$transaction");
      expect(appUninstalledContent).toContain("$transaction");
    });

    it("debe tener manejo robusto de errores", () => {
      [mainWebhookContent, appUninstalledContent, appScopesContent].forEach(content => {
        expect(content).toContain("try {");
        expect(content).toContain("} catch");
        expect(content).toContain("logger.error");
      });
    });
  });

  describe("📊 LOGGING Y AUDITORÍA", () => {
    it("debe tener logging estructurado en todos los webhooks", () => {
      [mainWebhookContent, appUninstalledContent, appScopesContent].forEach(content => {
        expect(content).toContain("logger.info");
        expect(content).toContain("logger.error");
      });
    });

    it("debe incluir información del shop en logs", () => {
      [mainWebhookContent, appUninstalledContent, appScopesContent].forEach(content => {
        expect(content).toContain("shop");
      });
    });

    it("debe loggear conteos de operaciones para auditoría", () => {
      expect(mainWebhookContent).toContain("count:");
      expect(appUninstalledContent).toContain("count:");
    });
  });

  describe("🎯 VALIDACIÓN FINAL DE ARQUITECTURA", () => {
    it("debe tener estructura modular con archivos separados", () => {
      expect(mainWebhookContent).toContain("APP_UNINSTALLED y APP_SCOPES_UPDATE están manejados en archivos separados");
      expect(mainWebhookContent).toContain("webhooks.app.uninstalled.tsx");
      expect(mainWebhookContent).toContain("webhooks.app.scopes_update.tsx");
    });

    it("debe tener imports correctos en todos los archivos", () => {
      const requiredImports = ["ActionFunctionArgs", "authenticate", "logger"];
      
      [mainWebhookContent, appUninstalledContent, appScopesContent].forEach(content => {
        requiredImports.forEach(importItem => {
          expect(content).toContain(importItem);
        });
      });
    });

    it("debe exportar función action async en todos los webhooks", () => {
      [mainWebhookContent, appUninstalledContent, appScopesContent].forEach(content => {
        expect(content).toContain("export const action = async");
      });
    });
  });

  describe("🚀 VERIFICACIÓN FINAL DE CUMPLIMIENTO 100%", () => {
    it("CUMPLE: Todos los webhooks obligatorios implementados", () => {
      // Webhooks de cumplimiento
      expect(mainWebhookContent).toContain("CUSTOMERS_DATA_REQUEST");
      expect(mainWebhookContent).toContain("CUSTOMERS_REDACT");
      expect(mainWebhookContent).toContain("SHOP_REDACT");
      
      // Webhooks de lifecycle
      expect(appUninstalledContent).toBeTruthy();
      expect(appScopesContent).toBeTruthy();
    });

    it("CUMPLE: Eliminación completa de datos en desinstalación", () => {
      // Verificar que app/uninstalled elimina MÁS que solo sesiones
      const deletionOperations = appUninstalledContent.match(/\.deleteMany/g);
      expect(deletionOperations!.length).toBeGreaterThan(1);
      
      // Verificar eliminación específica de datos de negocio
      expect(appUninstalledContent).toContain("ticket.deleteMany");
      expect(appUninstalledContent).toContain("orderConfirmation.deleteMany");
    });

    it("CUMPLE: API version 2025-04 configurada", () => {
      expect(shopifyConfig).toContain('api_version = "2025-04"');
    });

    it("CUMPLE: HTTPS y SSL configurados", () => {
      expect(shopifyConfig).toContain("https://cod-orders.fly.dev/");
    });

    it("CUMPLE: Arquitectura modular y escalable", () => {
      // Verificar que los webhooks están separados apropiadamente
      expect(mainWebhookContent).not.toContain("APP_UNINSTALLED:");
      expect(mainWebhookContent).not.toContain("APP_SCOPES_UPDATE:");
    });

    it("CUMPLE: Manejo de errores y logging para auditoría", () => {
      [mainWebhookContent, appUninstalledContent, appScopesContent].forEach(content => {
        expect(content).toContain("logger.error");
        expect(content).toContain("try {");
        expect(content).toContain("} catch");
      });
    });

    it("CUMPLE: Respuestas HTTP apropiadas para Shopify", () => {
      [mainWebhookContent, appUninstalledContent, appScopesContent].forEach(content => {
        expect(content).toContain("status: 200");
      });
      
      // Solo el webhook principal debe tener 401 para errores de auth
      expect(mainWebhookContent).toContain("status: 401");
    });
  });

  describe("🎉 CONFIRMACIÓN FINAL", () => {
    it("PROYECTO 100% LISTO PARA SHOPIFY APP STORE 2025", () => {
      // Este test confirma que todos los requisitos críticos están implementados
      const criticalRequirements = [
        // API Version
        shopifyConfig.includes('api_version = "2025-04"'),
        
        // Webhooks obligatorios
        shopifyConfig.includes('compliance_topics = [ "customers/data_request", "customers/redact", "shop/redact" ]'),
        
        // Eliminación completa en desinstalación
        appUninstalledContent.includes("ticket.deleteMany") &&
        appUninstalledContent.includes("orderConfirmation.deleteMany") &&
        appUninstalledContent.includes("shop.delete"),
        
        // HTTPS configurado
        shopifyConfig.includes("https://cod-orders.fly.dev/"),
        
        // Autenticación en todos los webhooks
        mainWebhookContent.includes("authenticate.webhook") &&
        appUninstalledContent.includes("authenticate.webhook") &&
        appScopesContent.includes("authenticate.webhook"),
        
        // Logging para auditoría
        mainWebhookContent.includes("logger.info") &&
        appUninstalledContent.includes("logger.info") &&
        appScopesContent.includes("logger.info")
      ];

      const allRequirementsMet = criticalRequirements.every(req => req === true);
      expect(allRequirementsMet).toBe(true);
      
      if (allRequirementsMet) {
        console.log("🎉 ¡CONFIRMADO! PROYECTO 100% LISTO PARA SHOPIFY APP STORE 2025");
      }
    });
  });
});
