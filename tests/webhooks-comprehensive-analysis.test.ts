import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

describe("🔍 ANÁLISIS EXHAUSTIVO DE TODOS LOS WEBHOOKS", () => {
  const webhooksMainPath = join(process.cwd(), "app", "routes", "webhooks.tsx");
  const webhooksAppUninstalledPath = join(process.cwd(), "app", "routes", "webhooks.app.uninstalled.tsx");
  const webhooksAppScopesPath = join(process.cwd(), "app", "routes", "webhooks.app.scopes_update.tsx");
  
  const mainWebhookContent = readFileSync(webhooksMainPath, "utf-8");
  const appUninstalledContent = readFileSync(webhooksAppUninstalledPath, "utf-8");
  
  // Verificar si existe el archivo de scopes
  let appScopesContent = "";
  try {
    appScopesContent = readFileSync(webhooksAppScopesPath, "utf-8");
  } catch (error) {
    // El archivo puede no existir
  }

  describe("📋 WEBHOOK PRINCIPAL (webhooks.tsx)", () => {
    describe("🔧 Estructura y Configuración", () => {
      it("debe tener imports correctos y completos", () => {
        const requiredImports = [
          "ActionFunctionArgs",
          "Prisma",
          "authenticate",
          "db",
          "sendCustomerDataReportEmail",
          "logger"
        ];

        requiredImports.forEach(importItem => {
          expect(mainWebhookContent).toContain(importItem);
        });
      });

      it("debe exportar función action async", () => {
        expect(mainWebhookContent).toContain("export const action = async");
        expect(mainWebhookContent).toContain("ActionFunctionArgs");
      });

      it("debe usar authenticate.webhook correctamente", () => {
        expect(mainWebhookContent).toContain("authenticate.webhook(request)");
        expect(mainWebhookContent).toContain("const { topic, shop, payload, admin }");
      });

      it("debe tener estructura switch para manejar diferentes topics", () => {
        expect(mainWebhookContent).toContain("switch (topic)");
        expect(mainWebhookContent).toContain("case \"CUSTOMERS_DATA_REQUEST\":");
        expect(mainWebhookContent).toContain("case \"CUSTOMERS_REDACT\":");
        expect(mainWebhookContent).toContain("case \"SHOP_REDACT\":");
        expect(mainWebhookContent).toContain("default:");
      });
    });

    describe("🛡️ CUSTOMERS_DATA_REQUEST - Recopilación de Datos", () => {
      it("debe validar payload del customer correctamente", () => {
        expect(mainWebhookContent).toContain("const { customer } = payload");
        expect(mainWebhookContent).toContain("!customer.email && !customer.phone");
        expect(mainWebhookContent).toContain("Payload de CUSTOMERS_DATA_REQUEST no contiene email ni teléfono");
      });

      it("debe buscar datos en tickets y orderConfirmations", () => {
        expect(mainWebhookContent).toContain("db.ticket.findMany");
        expect(mainWebhookContent).toContain("db.orderConfirmation.findMany");
        expect(mainWebhookContent).toContain("Promise.all");
      });

      it("debe usar whereClause correcto para búsqueda", () => {
        expect(mainWebhookContent).toContain("whereClauseForOrders");
        expect(mainWebhookContent).toContain("OR:");
        expect(mainWebhookContent).toContain("customer_email: customer.email");
        expect(mainWebhookContent).toContain("customer_phone: customer.phone");
      });

      it("debe incluir relaciones necesarias", () => {
        expect(mainWebhookContent).toContain("include: { call: true }");
      });

      it("debe crear reporte estructurado de datos", () => {
        expect(mainWebhookContent).toContain("customerDataReport");
        expect(mainWebhookContent).toContain("requestDetails");
        expect(mainWebhookContent).toContain("dataFound");
        expect(mainWebhookContent).toContain("tickets: foundTickets");
        expect(mainWebhookContent).toContain("orderConfirmations: foundOrderConfirmations");
      });

      it("debe obtener email del merchant via GraphQL", () => {
        expect(mainWebhookContent).toContain("admin.graphql");
        expect(mainWebhookContent).toContain("query GetShopEmail");
        expect(mainWebhookContent).toContain("shop { email }");
      });

      it("debe enviar email con reporte", () => {
        expect(mainWebhookContent).toContain("sendCustomerDataReportEmail");
        expect(mainWebhookContent).toContain("shopDomain: shop");
        expect(mainWebhookContent).toContain("customerDataReport");
        expect(mainWebhookContent).toContain("merchantEmail");
      });

      it("debe tener logging detallado", () => {
        expect(mainWebhookContent).toContain("Iniciando recopilación de datos de cliente");
        expect(mainWebhookContent).toContain("Datos recopilados para cliente");
        expect(mainWebhookContent).toContain("Proceso de recopilación completado");
      });

      it("debe manejar errores apropiadamente", () => {
        expect(mainWebhookContent).toContain("try {");
        expect(mainWebhookContent).toContain("} catch (error)");
        expect(mainWebhookContent).toContain("Error durante la recopilación de datos");
      });
    });

    describe("🗑️ CUSTOMERS_REDACT - Redacción de Datos", () => {
      it("debe validar payload del customer", () => {
        expect(mainWebhookContent).toContain("const { customer: customerToRedact } = payload");
        expect(mainWebhookContent).toContain("!customerToRedact.email && !customerToRedact.phone");
      });

      it("debe usar transacciones para integridad", () => {
        expect(mainWebhookContent).toContain("db.$transaction");
        expect(mainWebhookContent).toContain("async (prisma)");
      });

      it("debe eliminar tickets del customer", () => {
        expect(mainWebhookContent).toContain("prisma.ticket.deleteMany");
        expect(mainWebhookContent).toContain("customer_email: customerToRedact.email");
      });

      it("debe anonimizar orderConfirmations", () => {
        expect(mainWebhookContent).toContain("prisma.orderConfirmation.updateMany");
        expect(mainWebhookContent).toContain("customer_phone: \"[REDACTED]\"");
        expect(mainWebhookContent).toContain("customer_name: \"[REDACTED]\"");
        expect(mainWebhookContent).toContain("customer_email: \"[REDACTED]\"");
        expect(mainWebhookContent).toContain("shipping_address: Prisma.JsonNull");
      });

      it("debe usar whereClause apropiado para redacción", () => {
        expect(mainWebhookContent).toContain("whereClauseForRedact");
        expect(mainWebhookContent).toContain("orders_to_redact");
      });

      it("debe loggear operaciones con conteos", () => {
        expect(mainWebhookContent).toContain("Tickets eliminados");
        expect(mainWebhookContent).toContain("Confirmaciones de pedido anonimizadas");
        expect(mainWebhookContent).toContain("count:");
      });

      it("debe manejar errores en transacción", () => {
        expect(mainWebhookContent).toContain("Error durante la transacción de redacción");
      });
    });

    describe("🏪 SHOP_REDACT - Eliminación Completa de Tienda", () => {
      it("debe validar shop_domain en payload", () => {
        expect(mainWebhookContent).toContain("const { shop_domain } = payload");
        expect(mainWebhookContent).toContain("!shop_domain");
        expect(mainWebhookContent).toContain("Payload de SHOP_REDACT no contiene shop_domain");
      });

      it("debe usar transacciones para eliminación", () => {
        expect(mainWebhookContent).toContain("db.$transaction");
      });

      it("debe verificar existencia de tienda", () => {
        expect(mainWebhookContent).toContain("prisma.shop.findUnique");
        expect(mainWebhookContent).toContain("where: { shop_domain }");
        expect(mainWebhookContent).toContain("if (!shopRecord)");
      });

      it("debe eliminar sesiones", () => {
        expect(mainWebhookContent).toContain("prisma.session.deleteMany");
        expect(mainWebhookContent).toContain("where: { shop: shop_domain }");
      });

      it("debe eliminar registro de tienda", () => {
        expect(mainWebhookContent).toContain("prisma.shop.delete");
        expect(mainWebhookContent).toContain("where: { shop_domain }");
      });

      it("debe tener logging apropiado", () => {
        expect(mainWebhookContent).toContain("Iniciando eliminación completa de datos");
        expect(mainWebhookContent).toContain("Sesiones eliminadas");
        expect(mainWebhookContent).toContain("Registro de la tienda eliminado");
        expect(mainWebhookContent).toContain("Proceso de eliminación completa finalizado");
      });
    });

    describe("🔄 Manejo General", () => {
      it("debe tener logging de webhook recibido", () => {
        expect(mainWebhookContent).toContain("logger.webhook(topic, shop, \"received\")");
      });

      it("debe manejar webhooks no reconocidos", () => {
        expect(mainWebhookContent).toContain("default:");
        expect(mainWebhookContent).toContain("Webhook no manejado");
      });

      it("debe retornar status 200 para éxito", () => {
        expect(mainWebhookContent).toContain("new Response(null, { status: 200 })");
      });

      it("debe retornar status 401 para errores de autenticación", () => {
        expect(mainWebhookContent).toContain("new Response(null, { status: 401 })");
      });

      it("debe tener manejo global de errores", () => {
        expect(mainWebhookContent).toContain("} catch (error) {");
        expect(mainWebhookContent).toContain("Error en webhook");
        expect(mainWebhookContent).toContain("error instanceof Error");
      });

      it("debe mencionar webhooks separados", () => {
        expect(mainWebhookContent).toContain("APP_UNINSTALLED y APP_SCOPES_UPDATE están manejados en archivos separados");
        expect(mainWebhookContent).toContain("webhooks.app.uninstalled.tsx");
        expect(mainWebhookContent).toContain("webhooks.app.scopes_update.tsx");
      });
    });
  });

  describe("🗑️ WEBHOOK APP_UNINSTALLED (webhooks.app.uninstalled.tsx)", () => {
    describe("🔧 Estructura Básica", () => {
      it("debe existir y tener estructura correcta", () => {
        expect(appUninstalledContent).toBeTruthy();
        expect(appUninstalledContent).toContain("export const action");
        expect(appUninstalledContent).toContain("ActionFunctionArgs");
      });

      it("debe tener imports necesarios", () => {
        const requiredImports = [
          "ActionFunctionArgs",
          "authenticate",
          "db",
          "logger"
        ];

        requiredImports.forEach(importItem => {
          expect(appUninstalledContent).toContain(importItem);
        });
      });

      it("debe usar authenticate.webhook", () => {
        expect(appUninstalledContent).toContain("authenticate.webhook(request)");
        expect(appUninstalledContent).toContain("const { shop, session, topic }");
      });
    });

    describe("🗂️ Eliminación Completa de Datos", () => {
      it("debe eliminar TODOS los datos de negocio", () => {
        const businessDataOperations = [
          "ticket.deleteMany",
          "orderConfirmation.deleteMany",
          "vonageConfiguration.deleteMany",
          "chatbotConfiguration.deleteMany",
          "whatsAppNumber.updateMany",
          "session.deleteMany",
          "shop.delete"
        ];

        businessDataOperations.forEach(operation => {
          expect(appUninstalledContent).toContain(operation);
        });
      });

      it("debe usar transacciones para integridad", () => {
        expect(appUninstalledContent).toContain("db.$transaction");
        expect(appUninstalledContent).toContain("async (prisma)");
      });

      it("debe verificar existencia de tienda", () => {
        expect(appUninstalledContent).toContain("prisma.shop.findUnique");
        expect(appUninstalledContent).toContain("where: { shop_domain: shop }");
        expect(appUninstalledContent).toContain("if (!shopRecord)");
      });

      it("debe usar relaciones correctas shop_id", () => {
        expect(appUninstalledContent).toContain("shop_id: shopRecord.id");
      });

      it("debe liberar números WhatsApp (no eliminar)", () => {
        expect(appUninstalledContent).toContain("whatsAppNumber.updateMany");
        expect(appUninstalledContent).toContain("assignment_status: \"AVAILABLE\"");
        expect(appUninstalledContent).toContain("default_shop_id: null");
        expect(appUninstalledContent).not.toContain("whatsAppNumber.deleteMany");
      });

      it("debe seguir orden correcto de eliminación", () => {
        const content = appUninstalledContent;
        const ticketIndex = content.indexOf("ticket.deleteMany");
        const orderIndex = content.indexOf("orderConfirmation.deleteMany");
        const vonageIndex = content.indexOf("vonageConfiguration.deleteMany");
        const chatbotIndex = content.indexOf("chatbotConfiguration.deleteMany");
        const whatsappIndex = content.indexOf("whatsAppNumber.updateMany");
        const sessionIndex = content.indexOf("session.deleteMany");
        const shopIndex = content.indexOf("shop.delete");

        expect(ticketIndex).toBeLessThan(orderIndex);
        expect(orderIndex).toBeLessThan(vonageIndex);
        expect(vonageIndex).toBeLessThan(chatbotIndex);
        expect(chatbotIndex).toBeLessThan(whatsappIndex);
        expect(whatsappIndex).toBeLessThan(sessionIndex);
        expect(sessionIndex).toBeLessThan(shopIndex);
      });
    });

    describe("📊 Logging y Auditoría", () => {
      it("debe tener logging de inicio", () => {
        expect(appUninstalledContent).toContain("🚨 INICIANDO ELIMINACIÓN COMPLETA DE DATOS DE LA TIENDA");
      });

      it("debe loggear cada operación con conteo", () => {
        const expectedLogs = [
          "Tickets eliminados",
          "Confirmaciones de órdenes eliminadas",
          "Configuración de Vonage eliminada",
          "Configuración de chatbot eliminada",
          "Números de WhatsApp liberados",
          "Sesiones eliminadas"
        ];

        expectedLogs.forEach(logMessage => {
          expect(appUninstalledContent).toContain(logMessage);
        });

        expect(appUninstalledContent).toContain("count:");
      });

      it("debe loggear finalización exitosa", () => {
        expect(appUninstalledContent).toContain("🎉 ELIMINACIÓN COMPLETA FINALIZADA CON ÉXITO");
      });

      it("debe incluir shop en todos los logs", () => {
        expect(appUninstalledContent).toContain("{ shop }");
        expect(appUninstalledContent).toContain("shop,");
      });
    });

    describe("🛡️ Manejo de Errores", () => {
      it("debe tener estructura try-catch", () => {
        expect(appUninstalledContent).toContain("try {");
        expect(appUninstalledContent).toContain("} catch");
      });

      it("debe retornar status 200 siempre", () => {
        const responseMatches = appUninstalledContent.match(/status: 200/g);
        expect(responseMatches).toBeTruthy();
        expect(responseMatches!.length).toBeGreaterThanOrEqual(2);
      });

      it("debe loggear errores con detalles", () => {
        expect(appUninstalledContent).toContain("logger.error");
        expect(appUninstalledContent).toContain("Error durante la eliminación completa");
        expect(appUninstalledContent).toContain("Error crítico en webhook");
      });

      it("debe manejar tienda no encontrada", () => {
        expect(appUninstalledContent).toContain("La tienda no fue encontrada en la BD");
      });
    });
  });

  describe("🔄 WEBHOOK APP_SCOPES_UPDATE", () => {
    it("debe existir o estar documentado", () => {
      if (appScopesContent) {
        expect(appScopesContent).toContain("export const action");
        expect(appScopesContent).toContain("ActionFunctionArgs");
      } else {
        // Si no existe, debe estar mencionado en el webhook principal
        expect(mainWebhookContent).toContain("webhooks.app.scopes_update.tsx");
      }
    });
  });

  describe("🎯 CUMPLIMIENTO SHOPIFY 2025", () => {
    describe("📋 Webhooks Obligatorios", () => {
      it("debe implementar todos los webhooks obligatorios", () => {
        const mandatoryWebhooks = [
          "CUSTOMERS_DATA_REQUEST",
          "CUSTOMERS_REDACT", 
          "SHOP_REDACT"
        ];

        mandatoryWebhooks.forEach(webhook => {
          expect(mainWebhookContent).toContain(`case "${webhook}":`);
        });
      });

      it("debe tener APP_UNINSTALLED en archivo separado", () => {
        expect(appUninstalledContent).toBeTruthy();
        expect(mainWebhookContent).toContain("APP_UNINSTALLED");
        expect(mainWebhookContent).toContain("archivos separados");
      });
    });

    describe("🔒 Privacidad y GDPR", () => {
      it("debe eliminar datos personales en CUSTOMERS_REDACT", () => {
        expect(mainWebhookContent).toContain("[REDACTED]");
        expect(mainWebhookContent).toContain("Prisma.JsonNull");
      });

      it("debe eliminar TODOS los datos en SHOP_REDACT", () => {
        expect(mainWebhookContent).toContain("session.deleteMany");
        expect(mainWebhookContent).toContain("shop.delete");
      });

      it("debe eliminar TODOS los datos en APP_UNINSTALLED", () => {
        expect(appUninstalledContent).toContain("ticket.deleteMany");
        expect(appUninstalledContent).toContain("orderConfirmation.deleteMany");
        expect(appUninstalledContent).toContain("shop.delete");
      });
    });

    describe("⚡ Rendimiento y Mejores Prácticas", () => {
      it("debe usar transacciones para operaciones múltiples", () => {
        expect(mainWebhookContent).toContain("$transaction");
        expect(appUninstalledContent).toContain("$transaction");
      });

      it("debe usar operaciones batch (deleteMany/updateMany)", () => {
        expect(mainWebhookContent).toContain("deleteMany");
        expect(mainWebhookContent).toContain("updateMany");
        expect(appUninstalledContent).toContain("deleteMany");
        expect(appUninstalledContent).toContain("updateMany");
      });

      it("debe tener logging estructurado", () => {
        expect(mainWebhookContent).toContain("logger.info");
        expect(mainWebhookContent).toContain("logger.error");
        expect(appUninstalledContent).toContain("logger.info");
        expect(appUninstalledContent).toContain("logger.error");
      });

      it("debe retornar respuestas HTTP apropiadas", () => {
        expect(mainWebhookContent).toContain("status: 200");
        expect(mainWebhookContent).toContain("status: 401");
        expect(appUninstalledContent).toContain("status: 200");
      });
    });

    describe("🔐 Seguridad", () => {
      it("debe usar authenticate.webhook para validación HMAC", () => {
        expect(mainWebhookContent).toContain("authenticate.webhook(request)");
        expect(appUninstalledContent).toContain("authenticate.webhook(request)");
      });

      it("debe manejar errores de autenticación", () => {
        expect(mainWebhookContent).toContain("status: 401");
        expect(appUninstalledContent).toContain("Error crítico en webhook");
      });

      it("no debe exponer información sensible en logs", () => {
        // Los logs deben ser seguros
        expect(mainWebhookContent).not.toContain("password");
        expect(mainWebhookContent).not.toContain("secret");
        expect(appUninstalledContent).not.toContain("password");
        expect(appUninstalledContent).not.toContain("secret");
      });
    });
  });

  describe("🧪 VALIDACIÓN DE SINTAXIS", () => {
    it("webhooks principales deben tener sintaxis TypeScript válida", () => {
      expect(mainWebhookContent).toContain("import type");
      expect(mainWebhookContent).toContain("ActionFunctionArgs");
      expect(appUninstalledContent).toContain("import type");
      expect(appUninstalledContent).toContain("ActionFunctionArgs");
    });

    it("debe usar async/await correctamente", () => {
      expect(mainWebhookContent).toContain("export const action = async");
      expect(mainWebhookContent).toContain("await authenticate.webhook");
      expect(appUninstalledContent).toContain("export const action = async");
      expect(appUninstalledContent).toContain("await authenticate.webhook");
    });

    it("debe tener destructuring apropiado", () => {
      expect(mainWebhookContent).toContain("const { topic, shop, payload, admin }");
      expect(appUninstalledContent).toContain("const { shop, session, topic }");
    });
  });
});
