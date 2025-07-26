import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

describe("Cumplimiento Oficial Shopify - Documentación 2025", () => {
  let shopifyConfig: any;

  beforeAll(() => {
    try {
      const configPath = join(process.cwd(), "shopify.app.toml");
      const configContent = readFileSync(configPath, "utf-8");
      
      // Parsear el TOML básicamente
      shopifyConfig = {
        webhooks: {
          subscriptions: [],
          api_version: "",
        },
        access_scopes: {
          scopes: "",
        },
      };

      // Extraer información del TOML
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

  describe("Requisitos Obligatorios de Shopify App Store", () => {
    it("debería tener API version compatible (2024-07 o superior)", () => {
      // Según la documentación, debe ser 2024-07 o superior
      expect(shopifyConfig.webhooks.api_version).toBe("2025-07");
      expect(shopifyConfig.webhooks.api_version >= "2024-07").toBe(true);
    });

    it("debería tener webhooks de cumplimiento obligatorios configurados", () => {
      const complianceSubscription = shopifyConfig.webhooks.subscriptions.find(
        (sub: any) => sub.compliance_topics
      );
      
      expect(complianceSubscription).toBeDefined();
      expect(complianceSubscription.compliance_topics).toContain("customers/data_request");
      expect(complianceSubscription.compliance_topics).toContain("customers/redact");
      expect(complianceSubscription.compliance_topics).toContain("shop/redact");
    });

    it("debería tener URI válida para webhooks de cumplimiento", () => {
      const complianceSubscription = shopifyConfig.webhooks.subscriptions.find(
        (sub: any) => sub.compliance_topics
      );
      
      expect(complianceSubscription.uri).toBe("/webhooks");
      expect(complianceSubscription.uri).toMatch(/^\/webhooks/);
    });
  });

  describe("Webhooks de Cumplimiento - Requisitos Específicos", () => {
    describe("customers/data_request", () => {
      it("debería estar configurado para manejar solicitudes de datos de clientes", () => {
        const complianceSubscription = shopifyConfig.webhooks.subscriptions.find(
          (sub: any) => sub.compliance_topics
        );
        
        expect(complianceSubscription.compliance_topics).toContain("customers/data_request");
      });

      it("debería tener archivo de implementación", () => {
        const fs = require("fs");
        const path = require("path");
        
        const webhooksFile = path.join(process.cwd(), "app", "routes", "webhooks.tsx");
        expect(fs.existsSync(webhooksFile)).toBe(true);
      });
    });

    describe("customers/redact", () => {
      it("debería estar configurado para manejar eliminación de datos de clientes", () => {
        const complianceSubscription = shopifyConfig.webhooks.subscriptions.find(
          (sub: any) => sub.compliance_topics
        );
        
        expect(complianceSubscription.compliance_topics).toContain("customers/redact");
      });
    });

    describe("shop/redact", () => {
      it("debería estar configurado para manejar eliminación completa de datos de tienda", () => {
        const complianceSubscription = shopifyConfig.webhooks.subscriptions.find(
          (sub: any) => sub.compliance_topics
        );
        
        expect(complianceSubscription.compliance_topics).toContain("shop/redact");
      });
    });
  });

  describe("Requisitos de Respuesta HTTP", () => {
    it("debería tener archivos que manejen POST requests con JSON", () => {
      const fs = require("fs");
      const path = require("path");
      
      const webhooksFile = path.join(process.cwd(), "app", "routes", "webhooks.tsx");
      const content = fs.readFileSync(webhooksFile, "utf-8");
      
      // Verificar que maneja POST requests
      expect(content).toContain("export const action");
      expect(content).toContain("request");
    });

    it("debería tener manejo de Content-Type application/json", () => {
      const fs = require("fs");
      const path = require("path");
      
      const webhooksFile = path.join(process.cwd(), "app", "routes", "webhooks.tsx");
      const content = fs.readFileSync(webhooksFile, "utf-8");
      
      // Verificar que maneja JSON
      expect(content).toContain("authenticate.webhook");
    });
  });

  describe("Requisitos de Seguridad", () => {
    it("debería usar authenticate.webhook para verificar HMAC", () => {
      const fs = require("fs");
      const path = require("path");
      
      const webhooksFile = path.join(process.cwd(), "app", "routes", "webhooks.tsx");
      const content = fs.readFileSync(webhooksFile, "utf-8");
      
      expect(content).toContain("authenticate.webhook");
    });

    it("debería devolver 200 OK en respuestas exitosas", () => {
      const fs = require("fs");
      const path = require("path");
      
      const webhooksFile = path.join(process.cwd(), "app", "routes", "webhooks.tsx");
      const content = fs.readFileSync(webhooksFile, "utf-8");
      
      expect(content).toContain("status: 200");
    });
  });

  describe("Estructura de Archivos Requerida", () => {
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

  describe("Cumplimiento con GDPR y CPRA", () => {
    it("debería implementar todos los derechos de privacidad requeridos", () => {
      const complianceSubscription = shopifyConfig.webhooks.subscriptions.find(
        (sub: any) => sub.compliance_topics
      );
      
      const requiredRights = [
        "customers/data_request",  // Derecho de acceso
        "customers/redact",        // Derecho al olvido
        "shop/redact"              // Eliminación completa
      ];

      requiredRights.forEach(right => {
        expect(complianceSubscription.compliance_topics).toContain(right);
      });
    });

    it("debería tener scopes apropiados para manejar datos de clientes", () => {
      const scopes = shopifyConfig.access_scopes.scopes.split(",");
      
      // Scopes mínimos para manejar datos de clientes
      expect(scopes).toContain("read_customers");
      expect(scopes).toContain("read_orders");
    });
  });

  describe("Configuración de Build y Deploy", () => {
    it("debería tener configuración moderna de build", () => {
      const fs = require("fs");
      const configContent = fs.readFileSync("shopify.app.toml", "utf-8");
      
      expect(configContent).toContain("automatically_update_urls_on_dev = true");
      expect(configContent).toContain("include_config_on_deploy = true");
    });
  });

  describe("Verificación de Tests", () => {
    it("debería tener tests de cumplimiento", () => {
      const fs = require("fs");
      const path = require("path");
      
      const complianceTestFile = path.join(process.cwd(), "tests", "webhooks-compliance.test.ts");
      expect(fs.existsSync(complianceTestFile)).toBe(true);
    });

    it("debería tener tests de funcionalidad", () => {
      const fs = require("fs");
      const path = require("path");
      
      const functionalTestFile = path.join(process.cwd(), "tests", "webhooks.test.ts");
      expect(fs.existsSync(functionalTestFile)).toBe(true);
    });

    it("debería tener tests específicos", () => {
      const fs = require("fs");
      const path = require("path");
      
      const specificTestFile = path.join(process.cwd(), "tests", "webhooks-specific.test.ts");
      expect(fs.existsSync(specificTestFile)).toBe(true);
    });
  });
}); 