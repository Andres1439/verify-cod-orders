/* eslint-disable @typescript-eslint/no-unused-vars */
// app/routes/app.whatsapp.tsx - CON FORMULARIO MANUAL DE FALLBACK
import { useState, useEffect } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useActionData, useLoaderData, useSubmit } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  FormLayout,
  TextField,
  Button,
  Banner,
  Text,
  BlockStack,
  InlineStack,
  Badge,
  Modal,
  Spinner,
  Tabs,
  Link,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { encryptToken, decryptToken } from "../utils/encryption.server";
import { TokenValidator } from "../utils/token-validator.server";
import { RateLimiter } from "../utils/rate-limiter.server";
import { SecurityAudit } from "../utils/security-audit.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);

  const shop = await db.shop.findUnique({
    where: { shop_domain: session.shop },
    include: { whatsapp_configuration: true },
  });

  if (!shop) {
    throw new Error(`Tienda no encontrada: ${session.shop}`);
  }

  const config = shop.whatsapp_configuration;

  return json({
    config,
    shopDomain: session.shop,
    shopId: shop.id,
    appUrl: process.env.APP_URL,
    metaAppId: process.env.META_APP_ID,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const action = formData.get("action");

  // 1. Rate limiting por tienda
  const rateLimitResult = await RateLimiter.checkLimit(
    `whatsapp-config:${session.shop}`,
    3, // 3 intentos
    60000, // 1 minuto
    300000 // 5 minutos de bloqueo
  );
  if (!rateLimitResult.allowed) {
    SecurityAudit.log({
      shopId: session.shop,
      action: 'WHATSAPP_CONFIG_BLOCKED',
      success: false,
      details: { reason: 'Rate limit exceeded' }
    });
    return json({
      error: "Demasiados intentos. Inténtalo más tarde.",
      retryAfter: Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000)
    }, { status: 429 });
  }

  const shop = await db.shop.findUnique({
    where: { shop_domain: session.shop },
  });

  if (!shop) {
    return json({ error: "Tienda no encontrada" }, { status: 404 });
  }

  const shopId = shop.id;

  if (action === "save_meta_config") {
    const metaData = JSON.parse(formData.get("metaData") as string);

    // 2. Validación de token
    const tokenValidation = TokenValidator.validateMetaAccessToken(metaData.accessToken);
    if (!tokenValidation.valid) {
      SecurityAudit.log({
        shopId: session.shop,
        action: 'INVALID_TOKEN_ATTEMPT',
        success: false,
        details: { reason: tokenValidation.reason }
      });
      return json({ error: `Token inválido: ${tokenValidation.reason}` }, { status: 400 });
    }

    const encryptedToken = encryptToken(metaData.accessToken);

    const config = await db.whatsappBusinessConfig.upsert({
      where: { shop_id: shopId },
      update: {
        accessToken: JSON.stringify(encryptedToken),
        phoneNumberId: metaData.phoneNumberId,
        businessAccountId: metaData.businessAccountId,
        businessName: metaData.businessName || "Mi Negocio",
        agentPrompt: metaData.agentPrompt || getDefaultPrompt(),
        welcome_message:
          metaData.welcome_message || metaData.welcomeMessage || "¡Hola! ¿En qué puedo ayudarte?",
        webhookToken: generateWebhookToken(),
        isVerified: true,
        isActive: true,
        lastVerified: new Date(),
      },
      create: {
        shop_id: shopId,
        accessToken: JSON.stringify(encryptedToken),
        phoneNumberId: metaData.phoneNumberId,
        businessAccountId: metaData.businessAccountId,
        businessName: metaData.businessName || "Mi Negocio",
        agentPrompt: metaData.agentPrompt || getDefaultPrompt(),
        welcome_message:
          metaData.welcome_message || metaData.welcomeMessage || "¡Hola! ¿En qué puedo ayudarte?",
        webhookToken: generateWebhookToken(),
        isVerified: true,
        isActive: true,
        lastVerified: new Date(),
      },
    });

    SecurityAudit.log({
      shopId: session.shop,
      action: 'WHATSAPP_TOKEN_ENCRYPTED',
      success: true,
      details: { phoneNumberId: metaData.phoneNumberId }
    });

    const decryptedToken = decryptToken(JSON.parse(config.accessToken as string));

    await setupMetaWebhook({
      accessToken: decryptedToken,
      phoneNumberId: metaData.phoneNumberId,
      webhookToken: config.webhookToken as string,
    });

    return json({
      success: true,
      message: "WhatsApp Business configurado exitosamente",
      phoneNumber: metaData.displayPhoneNumber,
    });
  }

  if (action === "save_manual_config") {
    const configData = {
      accessToken: formData.get("accessToken") as string,
      phoneNumberId: formData.get("phoneNumberId") as string,
      businessAccountId: formData.get("businessAccountId") as string,
      webhookToken: generateWebhookToken(),
      businessName: shop.shop_domain.replace(".myshopify.com", ""),
      agentPrompt: getDefaultPrompt(),
      welcome_message: "¡Hola! ¿En qué puedo ayudarte?",
    };

    // 2. Validación de token
    const tokenValidation = TokenValidator.validateMetaAccessToken(configData.accessToken);
    if (!tokenValidation.valid) {
      SecurityAudit.log({
        shopId: session.shop,
        action: 'INVALID_TOKEN_ATTEMPT',
        success: false,
        details: { reason: tokenValidation.reason }
      });
      return json({ error: `Token inválido: ${tokenValidation.reason}` }, { status: 400 });
    }

    const isValid = await validateMetaCredentials(configData);

    if (!isValid.success) {
      return json({
        error: `Error al validar credenciales: ${isValid.error}`,
        success: false,
      });
    }

    const encryptedToken = encryptToken(configData.accessToken);
    const configDataToSave = { ...configData, accessToken: JSON.stringify(encryptedToken) };

    await db.whatsappBusinessConfig.upsert({
      where: { shop_id: shopId },
      update: {
        ...configDataToSave,
        isVerified: true,
        lastVerified: new Date(),
      },
      create: {
        shop_id: shopId,
        ...configDataToSave,
        isVerified: true,
        lastVerified: new Date(),
      },
    });

    SecurityAudit.log({
      shopId: session.shop,
      action: 'WHATSAPP_TOKEN_ENCRYPTED',
      success: true,
      details: { phoneNumberId: configData.phoneNumberId }
    });

    const decryptedToken = configData.accessToken;
    await setupMetaWebhook({
      accessToken: decryptedToken,
      phoneNumberId: configData.phoneNumberId,
      webhookToken: configData.webhookToken,
    });

    return json({
      success: true,
      message: "Configuración guardada exitosamente",
      phoneNumber: isValid.phoneNumber,
    });
  }

  if (action === "test_connection") {
    const config = await db.whatsappBusinessConfig.findUnique({
      where: { shop_id: shopId },
    });

    if (!config) {
      return json({ error: "No hay configuración guardada" });
    }

    const test = await testWhatsAppConnection(config);
    return json({ testResult: test });
  }

  return json({ error: "Acción no válida" });
}

function generateWebhookToken() {
  return `webhook_${Math.random().toString(36).substring(2, 15)}_${Date.now()}`;
}

function getDefaultPrompt() {
  return `Eres un asistente de ventas amigable y profesional. Ayudas con consultas sobre productos, precios, disponibilidad y pedidos. Usa emojis ocasionalmente para ser más cercano. Responde en español y mantén las respuestas concisas pero útiles.`;
}

async function setupMetaWebhook(config: {
  accessToken: string;
  phoneNumberId: string;
  webhookToken: string;
}) {
  const webhookUrl = `${process.env.APP_URL}/api/whatsapp/webhook`;

  try {
    await fetch(
      `https://graph.facebook.com/v18.0/${config.phoneNumberId}/webhooks`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          webhook_url: webhookUrl,
          events: ["messages"],
          verify_token: config.webhookToken,
        }),
      },
    );
  } catch (error) {
    console.error("Error configurando webhook:", error);
  }
}

async function testWhatsAppConnection(config: any) {
  let decryptedToken = config.accessToken;
  try {
    const parsed = JSON.parse(config.accessToken);
    if (parsed.encrypted && parsed.iv && parsed.tag) {
      decryptedToken = decryptToken(parsed);
    }
  } catch (e) {}
  try {
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${config.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${decryptedToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: config.phoneNumberId,
          type: "text",
          text: { body: "Test de conexión - configuración exitosa ✅" },
        }),
      },
    );

    return { success: response.ok, status: response.status };
  } catch (error) {
    return { success: false, error: "Error en test de conexión" };
  }
}

async function validateMetaCredentials(config: {
  accessToken: string;
  phoneNumberId: string;
  businessAccountId: string;
}) {
  let decryptedToken = config.accessToken;
  try {
    const parsed = JSON.parse(config.accessToken);
    if (parsed.encrypted && parsed.iv && parsed.tag) {
      decryptedToken = decryptToken(parsed);
    }
  } catch (e) {}
  try {
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${config.phoneNumberId}`,
      {
        headers: {
          Authorization: `Bearer ${decryptedToken}`,
        },
      },
    );

    if (!response.ok) {
      const error = await response.json();
      return {
        success: false,
        error: error.error?.message || "Token inválido",
      };
    }

    const data = await response.json();
    return {
      success: true,
      phoneNumber: data.display_phone_number,
    };
  } catch (error) {
    return { success: false, error: "Error de conexión con Meta" };
  }
}

export default function WhatsAppDashboard() {
  const { config, shopDomain, appUrl, metaAppId } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();

  const [showMetaEmbed, setShowMetaEmbed] = useState(false);
  const [isConfiguring, setIsConfiguring] = useState(false);
  const [selectedTab, setSelectedTab] = useState(0);
  const [manualAccessToken, setManualAccessToken] = useState("");
  const [manualPhoneNumberId, setManualPhoneNumberId] = useState("");
  const [manualBusinessAccountId, setManualBusinessAccountId] = useState("");

  const tabs = [
    {
      id: "automatic",
      content: "Configuración Automática",
      panelID: "automatic-panel",
    },
    {
      id: "manual",
      content: "Configuración Manual",
      panelID: "manual-panel",
    },
  ];

  useEffect(() => {
    const handleMetaMessage = (event: MessageEvent) => {
      if (
        !event.origin.includes("facebook.com") &&
        !event.origin.includes("meta.com")
      ) {
        return;
      }

      if (event.data.type === "whatsapp_business_configured") {
        console.log("Configuración recibida de Meta:", event.data);
        setIsConfiguring(true);

        const formData = new FormData();
        formData.append("action", "save_meta_config");
        formData.append("metaData", JSON.stringify(event.data.config));

        submit(formData, { method: "post" });
        setShowMetaEmbed(false);

        setTimeout(() => setIsConfiguring(false), 3000);
      }
    };

    window.addEventListener("message", handleMetaMessage);
    return () => window.removeEventListener("message", handleMetaMessage);
  }, [submit]);

  const handleTestConnection = () => {
    const formData = new FormData();
    formData.append("action", "test_connection");
    submit(formData, { method: "post" });
  };

  const handleManualSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsConfiguring(true);
    submit(event.currentTarget, { method: "post" });
    setTimeout(() => setIsConfiguring(false), 2000);
  };

  return (
    <Page
      title="Configuración de WhatsApp Business"
      subtitle="Conecta tu número de WhatsApp Business para atención automatizada"
    >
      <Layout>
        <Layout.Section>
          {actionData && "error" in actionData && actionData.error && (
            <Banner tone="critical" title="Error">
              <p>{actionData.error}</p>
            </Banner>
          )}

          {actionData && "success" in actionData && actionData.success && (
            <Banner tone="success" title="¡Configuración exitosa!">
              <p>{actionData.message}</p>
              {"phoneNumber" in actionData &&
                typeof actionData.phoneNumber === "string" &&
                actionData.phoneNumber && (
                  <p>
                    Número conectado: <strong>{actionData.phoneNumber}</strong>
                  </p>
                )}
            </Banner>
          )}

          {isConfiguring && (
            <Banner tone="info" title="Configurando WhatsApp...">
              <InlineStack gap="200">
                <Spinner size="small" />
                <Text as="span">
                  Guardando configuración y configurando webhooks...
                </Text>
              </InlineStack>
            </Banner>
          )}

          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between">
                <Text variant="headingMd" as="span">
                  Estado de WhatsApp Business
                </Text>
                {config && (
                  <InlineStack gap="200">
                    <Badge tone={config.isVerified ? "success" : "attention"}>
                      {config.isVerified ? "Conectado" : "Pendiente"}
                    </Badge>
                    <Badge tone={config.isActive ? "success" : "critical"}>
                      {config.isActive ? "Activo" : "Inactivo"}
                    </Badge>
                  </InlineStack>
                )}
              </InlineStack>

              {config ? (
                <InlineStack gap="200" align="space-between">
                  <Text as="span" tone="subdued">
                    Última verificación:{" "}
                    {config.lastVerified
                      ? new Date(config.lastVerified).toLocaleString("es-PE")
                      : "Nunca"}
                  </Text>
                  <Button onClick={handleTestConnection} size="slim">
                    Probar Conexión
                  </Button>
                </InlineStack>
              ) : (
                <Text tone="subdued" as="span">
                  WhatsApp Business no configurado. Elige una opción de
                  configuración abajo.
                </Text>
              )}
            </BlockStack>
          </Card>

          {!config && (
            <Card>
              <Tabs
                tabs={tabs}
                selected={selectedTab}
                onSelect={setSelectedTab}
              >
                <div style={{ padding: "16px 0" }}>
                  {selectedTab === 0 && (
                    <BlockStack gap="400">
                      <Text variant="headingMd" as="p">
                        Conectar WhatsApp Business (Automático)
                      </Text>

                      <Text as="p" tone="subdued">
                        Conecta tu cuenta de Meta Business automáticamente. Más
                        fácil y rápido.
                      </Text>

                      <InlineStack gap="200">
                        <Button
                          variant="primary"
                          onClick={() => setShowMetaEmbed(true)}
                          loading={isConfiguring}
                        >
                          📱 Conectar WhatsApp Business
                        </Button>

                        <Button
                          url="https://business.facebook.com"
                          external
                          target="_blank"
                          variant="plain"
                        >
                          ¿No tienes WhatsApp Business?
                        </Button>
                      </InlineStack>
                    </BlockStack>
                  )}

                  {selectedTab === 1 && (
                    <form onSubmit={handleManualSubmit}>
                      <FormLayout>
                        <BlockStack gap="400">
                          <Text variant="headingMd" as="p">
                            Configuración Manual
                          </Text>
                          <Text as="p" tone="subdued">
                            Ingresa las credenciales de tu Meta Business
                            Account.
                          </Text>
                        </BlockStack>
                        <Banner tone="info" title="Credenciales necesarias">
                          <Text as="p">
                            Obtén estas credenciales en{" "}
                            <Link
                              url="https://developers.facebook.com/apps"
                              external
                              target="_blank"
                            >
                              Meta for Developers
                            </Link>
                          </Text>
                        </Banner>
                        <TextField
                          label="Access Token"
                          name="accessToken"
                          type="password"
                          value={manualAccessToken}
                          onChange={setManualAccessToken}
                          helpText="Token permanente de tu aplicación de Meta Business"
                          placeholder="EAAxxxxxxxxxxxxxxxx"
                          requiredIndicator
                          autoComplete="off"
                        />
                        <TextField
                          label="Phone Number ID"
                          name="phoneNumberId"
                          value={manualPhoneNumberId}
                          onChange={setManualPhoneNumberId}
                          helpText="ID del número de WhatsApp Business en Meta"
                          placeholder="730124743510095"
                          requiredIndicator
                          autoComplete="off"
                        />
                        <TextField
                          label="Business Account ID"
                          name="businessAccountId"
                          value={manualBusinessAccountId}
                          onChange={setManualBusinessAccountId}
                          helpText="ID de tu cuenta de WhatsApp Business"
                          placeholder="714739614507408"
                          requiredIndicator
                          autoComplete="off"
                        />
                        <input
                          type="hidden"
                          name="action"
                          value="save_manual_config"
                        />
                        <Button
                          submit
                          variant="primary"
                          loading={isConfiguring}
                        >
                          Guardar Configuración
                        </Button>
                      </FormLayout>
                    </form>
                  )}
                </div>
              </Tabs>
            </Card>
          )}

          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">
                Información Técnica
              </Text>
              <Text tone="subdued" as="span">
                <strong>Webhook URL:</strong> {appUrl}/api/whatsapp/webhook
              </Text>
              <Text tone="subdued" as="span">
                <strong>Tienda ID:</strong> {shopDomain}
              </Text>
              {config && (
                <Text tone="subdued" as="span">
                  <strong>Phone Number ID:</strong> {config.phoneNumberId}
                </Text>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>

      <Modal
        open={showMetaEmbed}
        onClose={() => setShowMetaEmbed(false)}
        title="Conectar WhatsApp Business"
      >
        <Modal.Section>
          <div
            style={{
              height: "600px",
              border: "1px solid #E1E3E5",
              borderRadius: "8px",
            }}
          >
            <iframe
              src={`https://business.facebook.com/embed/whatsapp_business?app_id=${metaAppId}&redirect_uri=${encodeURIComponent(appUrl + "/app/whatsapp")}`}
              width="100%"
              height="100%"
              style={{ border: "none", borderRadius: "8px" }}
              title="Meta Business WhatsApp Setup"
            />
          </div>

          <BlockStack gap="300" inlineAlign="center">
            <Text as="p" tone="subdued" alignment="center">
              Una vez que completes la configuración en Meta Business,
              automáticamente se guardará en tu tienda.
            </Text>

            <Button onClick={() => setShowMetaEmbed(false)}>Cerrar</Button>
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
