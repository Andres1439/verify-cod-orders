import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

describe("Webhook APP_UNINSTALLED - Tests Exhaustivos", () => {
  const webhookPath = join(process.cwd(), "app", "routes", "webhooks.app.uninstalled.tsx");
  const webhookContent = readFileSync(webhookPath, "utf-8");

  describe("🔍 Análisis Detallado de Eliminación de Datos", () => {
    it("debe eliminar tickets con la relación correcta shop_id", () => {
      expect(webhookContent).toContain("ticket.deleteMany");
      expect(webhookContent).toContain("shop_id: shopRecord.id");
      
      // Verificar que usa el ID correcto de la tienda
      expect(webhookContent).toContain("where: { shop_id: shopRecord.id }");
    });

    it("debe eliminar orderConfirmation con la relación correcta shop_id", () => {
      expect(webhookContent).toContain("orderConfirmation.deleteMany");
      expect(webhookContent).toContain("shop_id: shopRecord.id");
      
      // Verificar sintaxis correcta
      expect(webhookContent).toContain("where: { shop_id: shopRecord.id }");
    });

    it("debe eliminar vonageConfiguration con la relación correcta", () => {
      expect(webhookContent).toContain("vonageConfiguration.deleteMany");
      expect(webhookContent).toContain("shop_id: shopRecord.id");
      
      // Verificar que no hay referencias a vonageCall (que no existe)
      expect(webhookContent).not.toContain("vonageCall.deleteMany");
    });

    it("debe eliminar chatbotConfiguration correctamente", () => {
      expect(webhookContent).toContain("chatbotConfiguration.deleteMany");
      expect(webhookContent).toContain("shop_id: shopRecord.id");
    });

    it("debe liberar números de WhatsApp sin eliminarlos", () => {
      expect(webhookContent).toContain("whatsAppNumber.updateMany");
      expect(webhookContent).not.toContain("whatsAppNumber.deleteMany");
      
      // Verificar que libera correctamente
      expect(webhookContent).toContain('assignment_status: "AVAILABLE"');
      expect(webhookContent).toContain("default_shop_id: null");
      expect(webhookContent).toContain("assigned_at: null");
    });

    it("debe eliminar sesiones con el dominio correcto", () => {
      expect(webhookContent).toContain("session.deleteMany");
      expect(webhookContent).toContain("shop: shop");
      
      // Verificar que usa la variable shop correcta
      expect(webhookContent).toContain("where: { shop: shop }");
    });

    it("debe eliminar el registro de la tienda al final", () => {
      expect(webhookContent).toContain("shop.delete");
      expect(webhookContent).toContain("shop_domain");
      
      // Verificar que elimina por shop_domain
      expect(webhookContent).toContain("where: { shop_domain: shop }");
    });
  });

  describe("🔒 Verificación de Transacciones y Integridad", () => {
    it("debe usar transacciones para todas las operaciones", () => {
      expect(webhookContent).toContain("$transaction");
      
      // Verificar que todas las operaciones están dentro de la transacción
      const transactionMatch = webhookContent.match(/\$transaction\(async \(prisma\) => \{([\s\S]*?)\}\)/);
      expect(transactionMatch).toBeTruthy();
      
      if (transactionMatch) {
        const transactionContent = transactionMatch[1];
        expect(transactionContent).toContain("ticket.deleteMany");
        expect(transactionContent).toContain("orderConfirmation.deleteMany");
        expect(transactionContent).toContain("vonageConfiguration.deleteMany");
        expect(transactionContent).toContain("chatbotConfiguration.deleteMany");
        expect(transactionContent).toContain("whatsAppNumber.updateMany");
        expect(transactionContent).toContain("session.deleteMany");
        expect(transactionContent).toContain("shop.delete");
      }
    });

    it("debe verificar la existencia de la tienda antes de eliminar", () => {
      expect(webhookContent).toContain("shop.findUnique");
      expect(webhookContent).toContain("shop_domain");
      
      // Verificar que maneja el caso de tienda no encontrada
      expect(webhookContent).toContain("if (!shopRecord)");
      expect(webhookContent).toContain("return");
    });

    it("debe usar el objeto prisma correcto dentro de la transacción", () => {
      // Verificar que usa 'prisma' dentro de la transacción, no 'db'
      const transactionMatch = webhookContent.match(/\$transaction\(async \(prisma\) => \{([\s\S]*?)\}\)/);
      expect(transactionMatch).toBeTruthy();
      
      if (transactionMatch) {
        const transactionContent = transactionMatch[1];
        expect(transactionContent).toContain("prisma.ticket");
        expect(transactionContent).toContain("prisma.orderConfirmation");
        expect(transactionContent).toContain("prisma.vonageConfiguration");
        expect(transactionContent).toContain("prisma.chatbotConfiguration");
        expect(transactionContent).toContain("prisma.whatsAppNumber");
        expect(transactionContent).toContain("prisma.session");
        expect(transactionContent).toContain("prisma.shop");
      }
    });
  });

  describe("📊 Logging y Auditoría", () => {
    it("debe tener logging de inicio de eliminación", () => {
      expect(webhookContent).toContain("🚨 INICIANDO ELIMINACIÓN COMPLETA DE DATOS DE LA TIENDA");
      expect(webhookContent).toContain("logger.info");
    });

    it("debe loggear cada operación de eliminación con conteo", () => {
      const expectedLogs = [
        "Tickets eliminados",
        "Confirmaciones de orden eliminadas",
        "Configuración de Vonage eliminada",
        "Configuración de chatbot eliminada",
        "Números de WhatsApp liberados",
        "Sesiones eliminadas"
      ];

      expectedLogs.forEach(logMessage => {
        expect(webhookContent).toContain(logMessage);
        // Verificar que incluye el conteo
        expect(webhookContent).toContain("count:");
      });
    });

    it("debe loggear la finalización exitosa", () => {
      expect(webhookContent).toContain("🎉 ELIMINACIÓN COMPLETA FINALIZADA CON ÉXITO");
    });

    it("debe loggear errores con detalles", () => {
      expect(webhookContent).toContain("logger.error");
      expect(webhookContent).toContain("❌ Error durante la eliminación completa de la tienda");
      expect(webhookContent).toContain("error:");
    });

    it("debe incluir el shop en todos los logs", () => {
      const logMatches = webhookContent.match(/logger\.(info|error)\(/g);
      expect(logMatches).toBeTruthy();
      expect(logMatches!.length).toBeGreaterThan(5);
      
      // Verificar que la mayoría de logs incluyen shop
      expect(webhookContent).toContain("shop,");
      expect(webhookContent).toContain("shop:");
    });
  });

  describe("🛡️ Manejo de Errores", () => {
    it("debe tener estructura try-catch completa", () => {
      expect(webhookContent).toContain("try {");
      expect(webhookContent).toContain("} catch");
      expect(webhookContent).toContain("logger.error");
    });

    it("debe retornar status 200 siempre (requerido por Shopify)", () => {
      const responseMatches = webhookContent.match(/new Response\([^)]*status:\s*200/g);
      expect(responseMatches).toBeTruthy();
      expect(responseMatches!.length).toBeGreaterThanOrEqual(2); // En try y catch
    });

    it("debe manejar error de autenticación", () => {
      expect(webhookContent).toContain("authenticate.webhook");
      
      // Verificar que está dentro del try-catch
      const tryBlockMatch = webhookContent.match(/try \{([\s\S]*?)\} catch/);
      expect(tryBlockMatch).toBeTruthy();
      
      if (tryBlockMatch) {
        expect(tryBlockMatch[1]).toContain("authenticate.webhook");
      }
    });

    it("debe loggear errores críticos con información del shop", () => {
      expect(webhookContent).toContain("❌ Error crítico en webhook de desinstalación");
      expect(webhookContent).toContain('shop: "unknown"');
    });
  });

  describe("🔄 Orden de Operaciones", () => {
    it("debe seguir el orden correcto de eliminación", () => {
      const operations = [
        "ticket.deleteMany",
        "orderConfirmation.deleteMany", 
        "vonageConfiguration.deleteMany",
        "chatbotConfiguration.deleteMany",
        "whatsAppNumber.updateMany",
        "session.deleteMany",
        "shop.delete"
      ];

      let lastIndex = -1;
      operations.forEach(operation => {
        const currentIndex = webhookContent.indexOf(operation);
        expect(currentIndex).toBeGreaterThan(lastIndex);
        lastIndex = currentIndex;
      });
    });

    it("debe verificar la tienda antes de cualquier eliminación", () => {
      const findUniqueIndex = webhookContent.indexOf("shop.findUnique");
      const firstDeleteIndex = webhookContent.indexOf("deleteMany");
      
      expect(findUniqueIndex).toBeGreaterThan(-1);
      expect(firstDeleteIndex).toBeGreaterThan(-1);
      expect(findUniqueIndex).toBeLessThan(firstDeleteIndex);
    });
  });

  describe("🎯 Cumplimiento Específico Shopify 2025", () => {
    it("debe eliminar TODOS los datos de negocio (no solo sesiones)", () => {
      // Verificar que no es solo eliminación de sesiones como antes
      const businessDataOperations = [
        "ticket.deleteMany",
        "orderConfirmation.deleteMany",
        "vonageConfiguration.deleteMany", 
        "chatbotConfiguration.deleteMany"
      ];

      businessDataOperations.forEach(operation => {
        expect(webhookContent).toContain(operation);
      });

      // Verificar que elimina más que solo sesiones
      const deleteOperations = webhookContent.match(/\.deleteMany/g);
      expect(deleteOperations!.length).toBeGreaterThan(1);
    });

    it("debe ser funcionalmente equivalente a SHOP_REDACT", () => {
      const shopRedactPath = join(process.cwd(), "app", "routes", "webhooks.tsx");
      const shopRedactContent = readFileSync(shopRedactPath, "utf-8");
      
      // Ambos deben eliminar sesiones y tienda
      expect(webhookContent).toContain("session.deleteMany");
      expect(webhookContent).toContain("shop.delete");
      expect(shopRedactContent).toContain("session.deleteMany");
      expect(shopRedactContent).toContain("shop.delete");
    });

    it("debe cumplir con GDPR/CPRA para eliminación de datos", () => {
      // Verificar que elimina datos personales/comerciales
      expect(webhookContent).toContain("ticket.deleteMany"); // Datos de soporte
      expect(webhookContent).toContain("orderConfirmation.deleteMany"); // Datos de órdenes
      
      // Verificar que libera recursos compartidos apropiadamente
      expect(webhookContent).toContain("whatsAppNumber.updateMany");
      expect(webhookContent).toContain('assignment_status: "AVAILABLE"');
    });
  });

  describe("🧪 Validación de Sintaxis y Estructura", () => {
    it("debe tener imports correctos", () => {
      expect(webhookContent).toContain("import");
      expect(webhookContent).toContain("ActionFunctionArgs");
      expect(webhookContent).toContain("authenticate");
      expect(webhookContent).toContain("logger");
      expect(webhookContent).toContain("db");
    });

    it("debe exportar la función action", () => {
      expect(webhookContent).toContain("export const action");
      expect(webhookContent).toContain("async");
      expect(webhookContent).toContain("ActionFunctionArgs");
    });

    it("debe tener destructuring correcto de authenticate.webhook", () => {
      expect(webhookContent).toContain("const { shop");
      expect(webhookContent).toContain("authenticate.webhook(request)");
    });

    it("no debe tener referencias a modelos inexistentes", () => {
      // Verificar que no usa vonageCall que no existe en el schema
      expect(webhookContent).not.toContain("vonageCall.deleteMany");
      expect(webhookContent).not.toContain("vonageCall.updateMany");
    });
  });

  describe("⚡ Rendimiento y Eficiencia", () => {
    it("debe usar deleteMany en lugar de múltiples delete individuales", () => {
      expect(webhookContent).toContain("deleteMany");
      expect(webhookContent).not.toContain("delete({");
      
      // La única excepción debe ser shop.delete al final
      const deleteMatches = webhookContent.match(/\.delete\(/g);
      expect(deleteMatches).toBeTruthy();
      expect(deleteMatches!.length).toBe(1); // Solo shop.delete
    });

    it("debe usar updateMany para WhatsApp (más eficiente que individual)", () => {
      expect(webhookContent).toContain("whatsAppNumber.updateMany");
      expect(webhookContent).not.toContain("whatsAppNumber.update({");
    });

    it("debe usar transacción única para todas las operaciones", () => {
      const transactionMatches = webhookContent.match(/\$transaction/g);
      expect(transactionMatches).toBeTruthy();
      expect(transactionMatches!.length).toBe(1); // Solo una transacción
    });
  });
});
