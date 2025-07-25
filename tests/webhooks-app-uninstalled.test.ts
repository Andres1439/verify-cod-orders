import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

describe("Webhook APP_UNINSTALLED - Validación de Estructura", () => {
  const webhookPath = join(process.cwd(), "app", "routes", "webhooks.app.uninstalled.tsx");

  it("debería existir el archivo del webhook", () => {
    expect(() => {
      readFileSync(webhookPath, "utf-8");
    }).not.toThrow();
  });

  it("debería contener todas las operaciones de eliminación requeridas", () => {
    const webhookContent = readFileSync(webhookPath, "utf-8");

    // Verificar que contiene las operaciones críticas de eliminación
    const requiredOperations = [
      "ticket.deleteMany",
      "orderConfirmation.deleteMany", 
      "vonageConfiguration.deleteMany",
      "chatbotConfiguration.deleteMany",
      "whatsAppNumber.updateMany",
      "session.deleteMany",
      "shop.delete"
    ];

    requiredOperations.forEach(operation => {
      expect(webhookContent).toContain(operation);
    });
  });

  it("debería usar transacciones para integridad de datos", () => {
    const webhookContent = readFileSync(webhookPath, "utf-8");
    expect(webhookContent).toContain("$transaction");
  });

  it("debería tener logging detallado para auditoría", () => {
    const webhookContent = readFileSync(webhookPath, "utf-8");
    
    const expectedLogs = [
      "INICIANDO ELIMINACIÓN COMPLETA",
      "Tickets eliminados",
      "Confirmaciones de orden eliminadas",
      "Configuración de Vonage eliminada",
      "Configuración de chatbot eliminada",
      "Números de WhatsApp liberados",
      "Sesiones eliminadas",
      "ELIMINACIÓN COMPLETA FINALIZADA"
    ];

    expectedLogs.forEach(logMessage => {
      expect(webhookContent).toContain(logMessage);
    });
  });

  it("debería manejar errores correctamente", () => {
    const webhookContent = readFileSync(webhookPath, "utf-8");
    
    expect(webhookContent).toContain("try");
    expect(webhookContent).toContain("catch");
    expect(webhookContent).toContain("logger.error");
  });

  it("debería liberar números de WhatsApp en lugar de eliminarlos", () => {
    const webhookContent = readFileSync(webhookPath, "utf-8");
    
    // Verificar que usa updateMany para WhatsApp (liberar) no deleteMany
    expect(webhookContent).toContain("whatsAppNumber.updateMany");
    expect(webhookContent).toContain('assignment_status: "AVAILABLE"');
    expect(webhookContent).toContain("default_shop_id: null");
  });

  describe("Comparación con SHOP_REDACT", () => {
    it("debería realizar operaciones similares a SHOP_REDACT para cumplimiento", () => {
      const webhookContent = readFileSync(webhookPath, "utf-8");
      const shopRedactPath = join(process.cwd(), "app", "routes", "webhooks.tsx");
      const shopRedactContent = readFileSync(shopRedactPath, "utf-8");

      // Ambos deben eliminar datos críticos
      const criticalOperations = [
        "session.deleteMany",
        "shop.delete"
      ];

      criticalOperations.forEach(operation => {
        expect(webhookContent).toContain(operation);
        expect(shopRedactContent).toContain(operation);
      });
    });

    it("debería tener la misma estructura de manejo de errores", () => {
      const webhookContent = readFileSync(webhookPath, "utf-8");
      
      // Verificar estructura de error handling
      expect(webhookContent).toContain("status: 200"); // Shopify requiere siempre 200
      expect(webhookContent).toContain("authenticate.webhook");
    });
  });

  describe("Validación de Cumplimiento Shopify 2025", () => {
    it("debería eliminar TODOS los datos de negocio en desinstalación", () => {
      const webhookContent = readFileSync(webhookPath, "utf-8");
      
      // Verificar que elimina todas las tablas de datos de negocio
      const businessDataTables = [
        "ticket",
        "orderConfirmation", 
        "vonageConfiguration",
        "chatbotConfiguration"
      ];

      businessDataTables.forEach(table => {
        expect(webhookContent).toContain(`${table}.deleteMany`);
      });
    });

    it("debería cumplir con requisitos de privacidad de datos", () => {
      const webhookContent = readFileSync(webhookPath, "utf-8");
      
      // Verificar que no deja datos huérfanos
      expect(webhookContent).toContain("shop_id: shopRecord.id");
      expect(webhookContent).toContain("shop: shop"); // Para sesiones
    });
  });
});
