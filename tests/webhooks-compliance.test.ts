import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

describe("Cumplimiento de Webhooks Shopify 2025", () => {
  let shopifyConfig: any;

  beforeAll(() => {
    try {
      const configPath = join(process.cwd(), "shopify.app.toml");
      const configContent = readFileSync(configPath, "utf-8");
      
      // Parsear el TOML básicamente (simplificado para este test)
      shopifyConfig = {
        webhooks: {
          subscriptions: [],
          api_version: "",
        },
        access_scopes: {
          scopes: "",
        },
      };

      // Extraer información básica del TOML
      const lines = configContent.split("\n");
      let currentSection = "";
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        
        if (trimmedLine.startsWith("[webhooks]")) {
          currentSection = "webhooks";
        } else if (trimmedLine.startsWith("api_version")) {
          shopifyConfig.webhooks.api_version = trimmedLine.split("=")[1].trim().replace(/"/g, "");
        } else if (trimmedLine.startsWith("[[webhooks.subscriptions]]")) {
          shopifyConfig.webhooks.subscriptions.push({});
        } else if (trimmedLine.startsWith("compliance_topics")) {
          const topics = trimmedLine.split("=")[1].trim();
          shopifyConfig.webhooks.subscriptions[shopifyConfig.webhooks.subscriptions.length - 1].compliance_topics = 
            topics.replace(/[\[\]"]/g, "").split(",").map(t => t.trim());
        } else if (trimmedLine.startsWith("topics")) {
          const topics = trimmedLine.split("=")[1].trim();
          shopifyConfig.webhooks.subscriptions[shopifyConfig.webhooks.subscriptions.length - 1].topics = 
            topics.replace(/[\[\]"]/g, "").split(",").map(t => t.trim());
        } else if (trimmedLine.startsWith("uri")) {
          shopifyConfig.webhooks.subscriptions[shopifyConfig.webhooks.subscriptions.length - 1].uri = 
            trimmedLine.split("=")[1].trim().replace(/"/g, "");
        } else if (trimmedLine.startsWith("[access_scopes]")) {
          currentSection = "access_scopes";
        } else if (trimmedLine.startsWith("scopes") && currentSection === "access_scopes") {
          shopifyConfig.access_scopes.scopes = trimmedLine.split("=")[1].trim().replace(/"/g, "");
        }
      }
    } catch (error) {
      console.error("Error leyendo shopify.app.toml:", error);
    }
  });

  describe("Configuración de Webhooks", () => {
    it("debería tener API version 2025-04", () => {
      expect(shopifyConfig.webhooks.api_version).toBe("2025-04");
    });

    it("debería tener webhooks de cumplimiento obligatorios", () => {
      const complianceSubscription = shopifyConfig.webhooks.subscriptions.find(
        (sub: any) => sub.compliance_topics
      );
      
      expect(complianceSubscription).toBeDefined();
      expect(complianceSubscription.compliance_topics).toContain("customers/data_request");
      expect(complianceSubscription.compliance_topics).toContain("customers/redact");
      expect(complianceSubscription.compliance_topics).toContain("shop/redact");
    });

    it("debería tener webhook de app/uninstalled", () => {
      const uninstalledSubscription = shopifyConfig.webhooks.subscriptions.find(
        (sub: any) => sub.topics && sub.topics.includes("app/uninstalled")
      );
      
      expect(uninstalledSubscription).toBeDefined();
      expect(uninstalledSubscription.uri).toBe("/webhooks/app/uninstalled");
    });

    it("debería tener webhook de app/scopes_update", () => {
      const scopesSubscription = shopifyConfig.webhooks.subscriptions.find(
        (sub: any) => sub.topics && sub.topics.includes("app/scopes_update")
      );
      
      expect(scopesSubscription).toBeDefined();
      expect(scopesSubscription.uri).toBe("/webhooks/app/scopes_update");
    });

    it("debería tener URIs válidas para todos los webhooks", () => {
      shopifyConfig.webhooks.subscriptions.forEach((sub: any) => {
        expect(sub.uri).toBeDefined();
        expect(sub.uri).toMatch(/^\/webhooks/);
      });
    });
  });

  describe("Access Scopes", () => {
    it("debería tener scopes apropiados para la funcionalidad", () => {
      const scopes = shopifyConfig.access_scopes.scopes.split(",");
      
      // Scopes mínimos requeridos para una app de verificación de órdenes
      expect(scopes).toContain("read_orders");
      expect(scopes).toContain("write_orders");
      expect(scopes).toContain("read_customers");
      expect(scopes).toContain("read_products");
    });

    it("debería tener scopes de escritura para customers", () => {
      const scopes = shopifyConfig.access_scopes.scopes.split(",");
      expect(scopes).toContain("write_customers");
    });
  });

  describe("Estructura de Archivos", () => {
    it("debería tener archivo principal de webhooks", () => {
      const fs = require("fs");
      const path = require("path");
      
      const webhooksFile = path.join(process.cwd(), "app", "routes", "webhooks.tsx");
      expect(fs.existsSync(webhooksFile)).toBe(true);
    });

    it("debería tener archivo de webhook app/uninstalled", () => {
      const fs = require("fs");
      const path = require("path");
      
      const uninstalledFile = path.join(process.cwd(), "app", "routes", "webhooks.app.uninstalled.tsx");
      expect(fs.existsSync(uninstalledFile)).toBe(true);
    });

    it("debería tener archivo de webhook app/scopes_update", () => {
      const fs = require("fs");
      const path = require("path");
      
      const scopesFile = path.join(process.cwd(), "app", "routes", "webhooks.app.scopes_update.tsx");
      expect(fs.existsSync(scopesFile)).toBe(true);
    });
  });

  describe("Cumplimiento GDPR", () => {
    it("debería implementar todos los webhooks de cumplimiento requeridos", () => {
      const requiredWebhooks = [
        "customers/data_request",
        "customers/redact", 
        "shop/redact"
      ];

      const complianceSubscription = shopifyConfig.webhooks.subscriptions.find(
        (sub: any) => sub.compliance_topics
      );

      requiredWebhooks.forEach(webhook => {
        expect(complianceSubscription.compliance_topics).toContain(webhook);
      });
    });

    it("debería tener URI centralizada para webhooks de cumplimiento", () => {
      const complianceSubscription = shopifyConfig.webhooks.subscriptions.find(
        (sub: any) => sub.compliance_topics
      );
      
      expect(complianceSubscription.uri).toBe("/webhooks");
    });
  });

  describe("Configuración de Build", () => {
    it("debería tener configuración moderna de build", () => {
      const fs = require("fs");
      const configContent = fs.readFileSync("shopify.app.toml", "utf-8");
      
      expect(configContent).toContain("automatically_update_urls_on_dev = true");
      expect(configContent).toContain("include_config_on_deploy = true");
    });
  });
}); 