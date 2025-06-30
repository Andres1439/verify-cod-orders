// app/routes/app.whatsapp.tsx - VERSIÓN CON META EMBEDDING
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
  Divider,
  Modal,
  Spinner,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);

  // Buscar el shop por dominio
  const shop = await db.shop.findUnique({
    where: { shop_domain: session.shop },
  });
  if (!shop) throw new Error("Tienda no encontrada");

  // Obtener configuración actual si existe
  const config = await db.whatsappBusinessConfig.findUnique({
    where: { shop_id: shop.id },
  });

  return json({ 
    config, 
    shopDomain: session.shop,
    appUrl: process.env.APP_URL,
    metaAppId: process.env.META_APP_ID // Necesitarás crear esta variable
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const action = formData.get("action");

  // Buscar el shop por dominio
  const shop = await db.shop.findUnique({
    where: { shop_domain: session.shop },
  });
  if (!shop) return json({ error: "Tienda no encontrada" });

  if (action === "save_meta_config") {
    // Datos que vienen del Meta Embedding
    const metaData = JSON.parse(formData.get("metaData") as string);
    
    const config = await db.whatsappBusinessConfig.upsert({
      where: { shop_id: shop.id },
      update: {
        accessToken: metaData.accessToken,
        phoneNumberId: metaData.phoneNumberId,
        businessAccountId: metaData.businessAccountId,
        businessName: metaData.businessName || "Mi Negocio",
        agentPrompt: metaData.agentPrompt || getDefaultPrompt(),
        welcome_message: metaData.welcomeMessage || "¡Hola! ¿En qué puedo ayudarte?",
        webhookToken: generateWebhookToken(),
        isVerified: true,
        isActive: true,
        lastVerified: new Date()
      },
      create: {
        shop_id: shop.id,
        accessToken: metaData.accessToken,
        phoneNumberId: metaData.phoneNumberId,
        businessAccountId: metaData.businessAccountId,
        businessName: metaData.businessName || "Mi Negocio",
        agentPrompt: metaData.agentPrompt || getDefaultPrompt(),
        welcome_message: metaData.welcomeMessage || "¡Hola! ¿En qué puedo ayudarte?",
        webhookToken: generateWebhookToken(),
        isVerified: true,
        isActive: true,
        lastVerified: new Date()
      }
    });

    // Configurar webhook automáticamente
    await setupMetaWebhook({
      accessToken: metaData.accessToken,
      phoneNumberId: metaData.phoneNumberId,
      webhookToken: config.webhookToken as string
    });

    return json({ 
      success: true, 
      message: "WhatsApp Business configurado exitosamente",
      phoneNumber: metaData.displayPhoneNumber 
    });
  }

  if (action === "update_agent_config") {
    const config = await db.whatsappBusinessConfig.findUnique({
      where: { shop_id: shop.id },
    });

    if (!config) {
      return json({ error: "No hay configuración de WhatsApp" });
    }

    await db.whatsappBusinessConfig.update({
      where: { shop_id: shop.id },
      data: {
        businessName: formData.get("businessName") as string,
        agentPrompt: formData.get("agentPrompt") as string,
        welcome_message: formData.get("welcomeMessage") as string,
      }
    });

    return json({ 
      success: true, 
      message: "Configuración del agente actualizada" 
    });
  }

  if (action === "test_connection") {
    const config = await db.whatsappBusinessConfig.findUnique({
      where: { shop_id: shop.id },
    });

    if (!config) {
      return json({ error: "No hay configuración guardada" });
    }

    const test = await testWhatsAppConnection(config);
    return json({ testResult: test });
  }

  return json({ error: "Acción no válida" });
}

// Generar token webhook aleatorio
function generateWebhookToken() {
  return `webhook_${Math.random().toString(36).substring(2, 15)}_${Date.now()}`;
}

// Prompt por defecto
function getDefaultPrompt() {
  return `Eres un asistente de ventas amigable y profesional. Ayudas con consultas sobre productos, precios, disponibilidad y pedidos. Usa emojis ocasionalmente para ser más cercano. Responde en español y mantén las respuestas concisas pero útiles.`;
}

// Configurar webhook en Meta (tu función existente)
async function setupMetaWebhook(config: {
  accessToken: string;
  phoneNumberId: string;
  webhookToken: string;
}) {
  const webhookUrl = `${process.env.APP_URL}/api/whatsapp/webhook`;

  try {
    await fetch(`https://graph.facebook.com/v18.0/${config.phoneNumberId}/webhooks`, {
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
    });
  } catch (error) {
    console.error("Error configurando webhook:", error);
  }
}

// Test de conexión (tu función existente)
async function testWhatsAppConnection(config: any) {
  try {
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${config.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
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

export default function WhatsAppDashboard() {
  const { config, shopDomain, appUrl, metaAppId } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  
  const [showMetaEmbed, setShowMetaEmbed] = useState(false);
  const [isConfiguring, setIsConfiguring] = useState(false);
  const [agentFormData, setAgentFormData] = useState({
    businessName: config?.businessName || "",
    welcome_message: config?.welcome_message || "",
    agentPrompt: config?.agentPrompt || ""
  });

  // Escuchar mensajes del iframe de Meta
  useEffect(() => {
    const handleMetaMessage = (event: MessageEvent) => {
      // Verificar origen por seguridad
      if (!event.origin.includes('facebook.com') && !event.origin.includes('meta.com')) {
        return;
      }

      if (event.data.type === 'whatsapp_business_configured') {
        console.log('Configuración recibida de Meta:', event.data);
        
        setIsConfiguring(true);
        
        // Enviar datos a tu backend
        const formData = new FormData();
        formData.append("action", "save_meta_config");
        formData.append("metaData", JSON.stringify(event.data.config));
        
        submit(formData, { method: "post" });
        setShowMetaEmbed(false);
        
        setTimeout(() => setIsConfiguring(false), 3000);
      }
    };

    window.addEventListener('message', handleMetaMessage);
    return () => window.removeEventListener('message', handleMetaMessage);
  }, [submit]);

  const handleTestConnection = () => {
    const formData = new FormData();
    formData.append("action", "test_connection");
    submit(formData, { method: "post" });
  };

  const handleUpdateAgentConfig = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData();
    formData.append("action", "update_agent_config");
    formData.append("businessName", agentFormData.businessName);
    formData.append("welcomeMessage", agentFormData.welcome_message);
    formData.append("agentPrompt", agentFormData.agentPrompt);
    
    submit(formData, { method: "post" });
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
              {('phoneNumber' in actionData) && typeof actionData.phoneNumber === 'string' && actionData.phoneNumber && (
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
                <Text as="span">Guardando configuración y configurando webhooks...</Text>
              </InlineStack>
            </Banner>
          )}

          {/* Estado actual */}
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
                    Última verificación: {config.lastVerified ? new Date(config.lastVerified).toLocaleString('es-PE') : "Nunca"}
                  </Text>
                  <Button onClick={handleTestConnection} size="slim">
                    Probar Conexión
                  </Button>
                </InlineStack>
              ) : (
                <Text tone="subdued" as="span">
                  WhatsApp Business no configurado. Usa el botón de abajo para conectar.
                </Text>
              )}
            </BlockStack>
          </Card>

          {/* Configuración de WhatsApp */}
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="p">
                {config ? "Reconectar" : "Conectar"} WhatsApp Business
              </Text>
              
              <Text as="p" tone="subdued">
                {config ? 
                  "Si necesitas cambiar tu configuración, puedes reconectar tu cuenta de WhatsApp Business." :
                  "Conecta tu cuenta de Meta Business para habilitar WhatsApp en tu tienda."
                }
              </Text>

              <InlineStack gap="200">
                <Button 
                  variant="primary" 
                  onClick={() => setShowMetaEmbed(true)}
                  loading={isConfiguring}
                >
                  {config ? "🔄 Reconectar WhatsApp" : "📱 Conectar WhatsApp Business"}
                </Button>
                
                {!config && (
                  <Button 
                    url="https://business.facebook.com" 
                    external
                    variant="plain"
                  >
                    ¿No tienes WhatsApp Business?
                  </Button>
                )}
              </InlineStack>
            </BlockStack>
          </Card>

          {/* Configuración del Agente (solo si ya está conectado) */}
          {config && (
            <Card>
              <form onSubmit={handleUpdateAgentConfig}>
                <FormLayout>
                  <BlockStack gap="400">
                    <Text variant="headingMd" as="p">
                      Configuración del Agente IA
                    </Text>
                    <Text as="p" tone="subdued">
                      Personaliza cómo se comporta tu asistente virtual con los clientes.
                    </Text>
                  </BlockStack>

                  <TextField
                    label="Nombre del Negocio"
                    value={agentFormData.businessName}
                    onChange={(value) => setAgentFormData({...agentFormData, businessName: value})}
                    helpText="Cómo se identificará tu asistente"
                    placeholder="Mi Tienda"
                    requiredIndicator
                    autoComplete="off"
                  />

                  <TextField
                    label="Mensaje de Bienvenida"
                    value={agentFormData.welcome_message}
                    onChange={(value) => setAgentFormData({...agentFormData, welcome_message: value})}
                    helpText="Primer mensaje que verán los clientes"
                    placeholder="¡Hola! 👋 Bienvenido a nuestra tienda. ¿En qué puedo ayudarte?"
                    autoComplete="off"
                  />

                  <TextField
                    label="Instrucciones para el Agente"
                    multiline={4}
                    value={agentFormData.agentPrompt}
                    onChange={(value) => setAgentFormData({...agentFormData, agentPrompt: value})}
                    helpText="Cómo debe comportarse tu asistente de IA"
                    placeholder="Eres un asistente de ventas amigable..."
                    autoComplete="off"
                  />

                  <Button submit variant="primary">
                    Actualizar Configuración del Agente
                  </Button>
                </FormLayout>
              </form>
            </Card>
          )}

          {/* Información técnica */}
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

      {/* Modal con Meta Embedding */}
      <Modal
        open={showMetaEmbed}
        onClose={() => setShowMetaEmbed(false)}
        title="Conectar WhatsApp Business"
      >
        <Modal.Section>
          <div style={{ height: '600px', border: '1px solid #E1E3E5', borderRadius: '8px' }}>
            <iframe
              src={`https://business.facebook.com/embed/whatsapp_business?app_id=${metaAppId}&redirect_uri=${encodeURIComponent(appUrl + '/app/whatsapp')}`}
              width="100%"
              height="100%"
              style={{ border: 'none', borderRadius: '8px' }}
              title="Meta Business WhatsApp Setup"
            />
          </div>
          
          <BlockStack gap="300" inlineAlign="center">
            <Text as="p" tone="subdued" alignment="center">
              Una vez que completes la configuración en Meta Business, 
              automáticamente se guardará en tu tienda.
            </Text>
            
            <Button onClick={() => setShowMetaEmbed(false)}>
              Cerrar
            </Button>
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}