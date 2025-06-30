// app/routes/api.whatsapp-info.tsx - VERSIÓN META BUSINESS
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import db from "../db.server";

// 🔍 GET: Para N8N - Obtener info de la tienda por Phone Number ID de Meta
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const headers = new Headers();
  headers.append("Access-Control-Allow-Origin", "*");
  headers.append("Content-Type", "application/json");

  try {
    const url = new URL(request.url);
    const phoneNumberId = url.searchParams.get("phoneNumberId");

    if (!phoneNumberId) {
      return json(
        { error: "Parámetro 'phoneNumberId' requerido" },
        { status: 400, headers },
      );
    }

    console.log("🔍 N8N consultando info para Phone Number ID:", phoneNumberId);

    // Buscar configuración WhatsApp por phoneNumberId
    const whatsappConfig = await db.whatsappBusinessConfig.findFirst({
      where: {
        phoneNumberId: phoneNumberId,
        isActive: true,
        isVerified: true
      },
      include: {
        shop: {
          select: {
            id: true,
            shop_domain: true,
            access_token: true,
            subscription_plan: true,
          }
        }
      }
    });

    if (!whatsappConfig) {
      console.log("❌ Phone Number ID no encontrado:", phoneNumberId);
      
      return json(
        {
          error: "Phone Number ID no encontrado o no configurado",
          message: `El Phone Number ID ${phoneNumberId} no está registrado en nuestro sistema`,
          phoneNumberId
        },
        { status: 404, headers },
      );
    }

    // ✅ CONFIGURACIÓN ENCONTRADA
    const shop = whatsappConfig.shop;

    console.log("✅ Phone Number ID encontrado:", phoneNumberId);
    console.log("✅ Tienda:", shop.shop_domain);
    console.log("✅ Verificado:", whatsappConfig.isVerified);

    // Preparar respuesta para N8N
    const response = {
      success: true,
      shopInfo: {
        id: shop.id,
        shop_domain: shop.shop_domain,
        access_token: shop.access_token,
        subscription_plan: shop.subscription_plan || "BASIC",
      },
      whatsappConfig: {
        enabled: whatsappConfig.enabled,
        welcome_message: whatsappConfig.welcome_message,
        business_hours: whatsappConfig.business_hours || {
          open: "00:00",
          close: "00:00",
        },
        auto_responses: whatsappConfig.auto_responses || {},
        businessName: whatsappConfig.businessName,
        agentPrompt: whatsappConfig.agentPrompt,
      },
      metaInfo: {
        phoneNumberId: whatsappConfig.phoneNumberId,
        businessAccountId: whatsappConfig.businessAccountId,
        isVerified: whatsappConfig.isVerified,
        lastVerified: whatsappConfig.lastVerified,
      },
      // Información adicional para N8N
      context: {
        timestamp: new Date().toISOString(),
        source: "meta_business_api"
      }
    };

    return json(response, { headers });

  } catch (error) {
    console.error("❌ Error en API WhatsApp info:", error);
    return json(
      { 
        error: "Error interno del servidor",
        details: error instanceof Error ? error.message : "Error desconocido"
      },
      { status: 500, headers },
    );
  }
};

// 🎯 POST: Para Dashboard - Configurar WhatsApp Business con Meta
export const action = async ({ request }: ActionFunctionArgs) => {
  const headers = new Headers();
  headers.append("Access-Control-Allow-Origin", "*");
  headers.append("Content-Type", "application/json");

  try {
    const { action, shop_domain, metaConfig } = await request.json();

    if (action === "configure_whatsapp" && shop_domain && metaConfig) {
      console.log(`🎯 Configurando WhatsApp para: ${shop_domain}`);

      // 1. Buscar la tienda
      const shop = await db.shop.findUnique({
        where: { shop_domain },
        include: { whatsapp_configuration: true },
      });

      if (!shop) {
        console.log(`❌ Tienda no encontrada: ${shop_domain}`);
        return json({ error: "Tienda no encontrada" }, { status: 404, headers });
      }

      // 2. Validar credenciales de Meta Business
      const validation = await validateMetaCredentials({
        accessToken: metaConfig.accessToken,
        phoneNumberId: metaConfig.phoneNumberId,
      });

      if (!validation.success) {
        return json(
          { 
            error: "Credenciales de Meta Business inválidas",
            details: validation.error 
          },
          { status: 400, headers }
        );
      }

      // 3. Guardar/actualizar configuración
      const whatsappConfig = await db.whatsappBusinessConfig.upsert({
        where: { shop_id: shop.id },
        update: {
          accessToken: metaConfig.accessToken,
          phoneNumberId: metaConfig.phoneNumberId,
          businessAccountId: metaConfig.businessAccountId,
          webhookToken: metaConfig.webhookToken || generateWebhookToken(),
          businessName: metaConfig.businessName || shop.shop_domain.replace('.myshopify.com', ''),
          agentPrompt: metaConfig.agentPrompt || getDefaultPrompt(),
          welcome_message: metaConfig.welcomeMessage || `¡Hola! Gracias por contactar ${shop.shop_domain.replace('.myshopify.com', '')}. ¿En qué puedo ayudarte? 🛍️`,
          isVerified: true,
          isActive: true,
          lastVerified: new Date(),
        },
        create: {
          shop_id: shop.id,
          accessToken: metaConfig.accessToken,
          phoneNumberId: metaConfig.phoneNumberId,
          businessAccountId: metaConfig.businessAccountId,
          webhookToken: metaConfig.webhookToken || generateWebhookToken(),
          businessName: metaConfig.businessName || shop.shop_domain.replace('.myshopify.com', ''),
          agentPrompt: metaConfig.agentPrompt || getDefaultPrompt(),
          welcome_message: metaConfig.welcomeMessage || `¡Hola! Gracias por contactar ${shop.shop_domain.replace('.myshopify.com', '')}. ¿En qué puedo ayudarte? 🛍️`,
          enabled: true,
          isVerified: true,
          isActive: true,
          lastVerified: new Date(),
        },
      });

      // 4. Configurar webhook en Meta automáticamente
      await setupMetaWebhook({
        accessToken: metaConfig.accessToken,
        phoneNumberId: metaConfig.phoneNumberId,
        webhookToken: whatsappConfig.webhookToken as string,
      });

      console.log(`✅ WhatsApp configurado exitosamente para ${shop_domain}`);

      return json(
        {
          success: true,
          message: `WhatsApp Business configurado exitosamente`,
          data: {
            phoneNumberId: whatsappConfig.phoneNumberId,
            businessName: whatsappConfig.businessName,
            shop_domain: shop.shop_domain,
            displayPhoneNumber: validation.phoneNumber,
            verifiedAt: whatsappConfig.lastVerified,
          },
        },
        { headers },
      );
    }

    return json(
      { error: "Acción no válida o parámetros faltantes" },
      { status: 400, headers }
    );

  } catch (error) {
    console.error("❌ Error configurando WhatsApp:", error);
    return json(
      {
        success: false,
        error: "Error interno del servidor",
        details: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500, headers },
    );
  }
};

// 🔧 Función para validar credenciales de Meta Business
async function validateMetaCredentials({
  accessToken,
  phoneNumberId,
}: {
  accessToken: string;
  phoneNumberId: string;
}) {
  try {
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${phoneNumberId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
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
    
    if (data.status !== 'CONNECTED') {
      return {
        success: false,
        error: `Número no conectado. Estado: ${data.status}`,
      };
    }

    return {
      success: true,
      phoneNumber: data.display_phone_number,
      verifiedName: data.verified_name,
      status: data.status,
    };
  } catch (error) {
    return { 
      success: false, 
      error: "Error de conexión con Meta Business API" 
    };
  }
}

// 🔧 Función para configurar webhook en Meta
async function setupMetaWebhook({
  accessToken,
  phoneNumberId,
  webhookToken,
}: {
  accessToken: string;
  phoneNumberId: string;
  webhookToken: string;
}) {
  try {
    const webhookUrl = `${process.env.APP_URL}/api/whatsapp/webhook`;

    const response = await fetch(
      `https://graph.facebook.com/v18.0/${phoneNumberId}/webhooks`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          webhook_url: webhookUrl,
          events: ["messages"],
          verify_token: webhookToken,
        }),
      },
    );

    if (!response.ok) {
      const error = await response.json();
      console.error("❌ Error configurando webhook:", error);
    } else {
      console.log("✅ Webhook configurado correctamente");
    }
  } catch (error) {
    console.error("❌ Error configurando webhook:", error);
  }
}

// 🔧 Función para generar token webhook
function generateWebhookToken() {
  return `webhook_${Math.random().toString(36).substring(2, 15)}_${Date.now()}`;
}

// 🔧 Prompt por defecto
function getDefaultPrompt() {
  return `Eres un asistente virtual de atención al cliente para una tienda en línea. 
Características:
- Responde de manera amigable y profesional
- Usa emojis ocasionalmente 
- Ayuda con consultas sobre productos, precios y pedidos
- Si no sabes algo, deriva a atención humana
- Responde en español peruano
- Mantén las respuestas concisas pero útiles`;
}

// 🔧 OPTIONS: Para CORS
export const options = async () => {
  const headers = new Headers();
  headers.append("Access-Control-Allow-Origin", "*");
  headers.append("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.append("Access-Control-Allow-Headers", "Content-Type, Authorization");

  return new Response(null, { status: 200, headers });
};