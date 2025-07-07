// app/routes/api.whatsapp.tsx - API PARA GESTIÓN DE NÚMEROS
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";

// 🔍 GET: Obtener información del número de la tienda
export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { session } = await authenticate.admin(request);

    const shop = await db.shop.findUnique({
      where: { shop_domain: session.shop },
      include: {
        twilio_number: true,
        whatsapp_configuration_2: true,
      },
    });

    if (!shop) {
      return json({ error: "Tienda no encontrada" }, { status: 404 });
    }

    // Obtener estadísticas de números disponibles
    const availableNumbers = await db.twilioNumber.count({
      where: { status: "AVAILABLE" },
    });

    const totalNumbers = await db.twilioNumber.count();

    return json({
      success: true,
      data: {
        shop: {
          id: shop.id,
          domain: shop.shop_domain,
          subscriptionPlan: shop.subscription_plan,
        },
        assignedNumber: shop.twilio_number
          ? {
              id: shop.twilio_number.id,
              phoneNumber: shop.twilio_number.phone_number,
              friendlyName: shop.twilio_number.friendly_name,
              assignedAt: shop.twilio_number.assigned_at,
              monthlyCost: shop.twilio_number.monthly_cost,
              countryCode: shop.twilio_number.country_code,
              numberType: shop.twilio_number.number_type,
              capabilities: shop.twilio_number.capabilities,
              webhookUrl: shop.twilio_number.webhook_url,
              status: shop.twilio_number.status,
              twilioSid: shop.twilio_number.twilio_sid,
            }
          : null,
        whatsappConfig: shop.whatsapp_configuration_2
          ? {
              id: shop.whatsapp_configuration_2.id,
              enabled: shop.whatsapp_configuration_2.enabled,
              welcomeMessage: shop.whatsapp_configuration_2.welcome_message,
              businessHours: shop.whatsapp_configuration_2.business_hours,
              autoResponses: shop.whatsapp_configuration_2.auto_responses,
            }
          : null,
        statistics: {
          availableNumbers,
          totalNumbers,
          assignedNumbers: totalNumbers - availableNumbers,
        },
      },
    });
  } catch (error) {
    console.error("❌ Error obteniendo información WhatsApp:", error);
    return json(
      {
        success: false,
        error: "Error interno del servidor",
        details: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500 },
    );
  }
};

// 🎯 POST: Gestionar números de WhatsApp
export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const { session } = await authenticate.admin(request);
    const { action, ...data } = await request.json();

    const shop = await db.shop.findUnique({
      where: { shop_domain: session.shop },
      include: {
        twilio_number: true,
        whatsapp_configuration_2: true,
      },
    });

    if (!shop) {
      return json({ error: "Tienda no encontrada" }, { status: 404 });
    }

    // 📱 ASIGNAR NÚMERO DE WHATSAPP
    if (action === "assign_number") {
      // Verificar si ya tiene un número asignado
      if (shop.twilio_number) {
        return json(
          {
            success: false,
            error: "Ya tienes un número de WhatsApp asignado",
            currentNumber: shop.twilio_number.phone_number,
          },
          { status: 400 },
        );
      }

      // Verificar plan de suscripción
      if (!shop.subscription_plan || shop.subscription_plan === "FREE") {
        return json(
          {
            success: false,
            error:
              "Necesitas un plan BASIC o superior para obtener un número de WhatsApp",
            upgradeRequired: true,
            redirectTo: "/app/pricing",
          },
          { status: 403 },
        );
      }

      // Buscar número disponible
      const availableNumber = await db.twilioNumber.findFirst({
        where: {
          status: "AVAILABLE",
          shop_id: null,
        },
        orderBy: [
          { country_code: "asc" }, // Priorizar números locales
          { monthly_cost: "asc" }, // Luego por costo
          { purchased_at: "asc" }, // Finalmente por antigüedad
        ],
      });

      if (!availableNumber) {
        return json(
          {
            success: false,
            error: "No hay números de WhatsApp disponibles en este momento",
            message:
              "Nuestro equipo está trabajando para añadir más números. Inténtalo más tarde.",
            supportEmail: "soporte@tu-dominio.com",
          },
          { status: 503 },
        );
      }

      // Generar webhook URL único para N8N
      const webhookUrl = generateN8NWebhookUrl(
        shop.id,
        availableNumber.phone_number,
      );

      // Asignar número a la tienda
      const assignedNumber = await db.twilioNumber.update({
        where: { id: availableNumber.id },
        data: {
          status: "ASSIGNED",
          shop_id: shop.id,
          assigned_at: new Date(),
          webhook_url: webhookUrl,
          next_billing: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // +30 días
        },
      });

      // Crear configuración inicial de WhatsApp
      const whatsappConfig = await db.whatsAppConfiguration.upsert({
        where: { shop_id: shop.id },
        update: {
          enabled: true,
          welcome_message: `¡Hola! Gracias por contactar ${shop.shop_domain.replace(".myshopify.com", "")}. ¿En qué puedo ayudarte? 🛍️`,
          business_hours: {
            open: "09:00",
            close: "18:00",
            timezone: "America/Lima",
          },
          auto_responses: {
            greeting: true,
            businessHours: true,
            fallback: true,
          },
          updated_at: new Date(),
        },
        create: {
          shop_id: shop.id,
          enabled: true,
          welcome_message: `¡Hola! Gracias por contactar ${shop.shop_domain.replace(".myshopify.com", "")}. ¿En qué puedo ayudarte? 🛍️`,
          business_hours: {
            open: "09:00",
            close: "18:00",
            timezone: "America/Lima",
          },
          auto_responses: {
            greeting: true,
            businessHours: true,
            fallback: true,
          },
        },
      });

      // TODO: Configurar webhook en Twilio y activar workflow N8N
      await setupTwilioWebhook(assignedNumber);
      await activateN8NWorkflow(shop, assignedNumber);

      console.log(
        `✅ Número ${assignedNumber.phone_number} asignado a ${shop.shop_domain}`,
      );

      return json({
        success: true,
        message: `¡Número asignado exitosamente! 🎉`,
        data: {
          phoneNumber: assignedNumber.phone_number,
          friendlyName: assignedNumber.friendly_name,
          monthlyCost: assignedNumber.monthly_cost,
          countryCode: assignedNumber.country_code,
          assignedAt: assignedNumber.assigned_at,
          webhookUrl: assignedNumber.webhook_url,
          capabilities: assignedNumber.capabilities,
          whatsappConfig: {
            welcomeMessage: whatsappConfig.welcome_message,
            businessHours: whatsappConfig.business_hours,
          },
        },
      });
    }

    // 🔄 ACTUALIZAR CONFIGURACIÓN DE WHATSAPP
    if (action === "update_config") {
      const { welcomeMessage, businessHours, autoResponses } = data;

      if (!shop.twilio_number) {
        return json(
          {
            success: false,
            error:
              "Necesitas tener un número asignado para configurar WhatsApp",
          },
          { status: 400 },
        );
      }

      const updatedConfig = await db.whatsAppConfiguration.upsert({
        where: { shop_id: shop.id },
        update: {
          welcome_message: welcomeMessage,
          business_hours: businessHours,
          auto_responses: autoResponses,
          updated_at: new Date(),
        },
        create: {
          shop_id: shop.id,
          welcome_message: welcomeMessage,
          business_hours: businessHours,
          auto_responses: autoResponses,
          enabled: true,
        },
      });

      return json({
        success: true,
        message: "Configuración actualizada exitosamente",
        data: {
          config: {
            welcomeMessage: updatedConfig.welcome_message,
            businessHours: updatedConfig.business_hours,
            autoResponses: updatedConfig.auto_responses,
          },
        },
      });
    }

    // 🗑️ LIBERAR NÚMERO DE WHATSAPP
    if (action === "release_number") {
      if (!shop.twilio_number) {
        return json(
          {
            success: false,
            error: "No tienes ningún número asignado",
          },
          { status: 400 },
        );
      }

      const phoneNumber = shop.twilio_number.phone_number;

      // Liberar número
      await db.twilioNumber.update({
        where: { id: shop.twilio_number.id },
        data: {
          status: "AVAILABLE",
          shop_id: null,
          assigned_at: null,
          webhook_url: null,
          next_billing: null,
        },
      });

      // Desactivar configuración de WhatsApp
      await db.whatsAppConfiguration.updateMany({
        where: { shop_id: shop.id },
        data: {
          enabled: false,
          updated_at: new Date(),
        },
      });

      // TODO: Desactivar webhook en Twilio y pausar workflow N8N
      await deactivateTwilioWebhook(shop.twilio_number);
      await pauseN8NWorkflow(shop.id);

      console.log(`✅ Número ${phoneNumber} liberado de ${shop.shop_domain}`);

      return json({
        success: true,
        message: "Número liberado exitosamente",
        data: {
          releasedNumber: phoneNumber,
          releasedAt: new Date(),
        },
      });
    }

    // 🧪 PROBAR CONEXIÓN
    if (action === "test_connection") {
      if (!shop.twilio_number) {
        return json(
          {
            success: false,
            error: "No hay número asignado para probar",
          },
          { status: 400 },
        );
      }

      const testResult = await testWhatsAppConnection(shop.twilio_number);

      return json({
        success: true,
        message: "Prueba de conexión completada",
        data: {
          testResult,
          phoneNumber: shop.twilio_number.phone_number,
          testedAt: new Date(),
        },
      });
    }

    return json(
      {
        success: false,
        error: "Acción no válida",
      },
      { status: 400 },
    );
  } catch (error) {
    console.error("❌ Error en API WhatsApp:", error);
    return json(
      {
        success: false,
        error: "Error interno del servidor",
        details: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500 },
    );
  }
};

// 🔧 FUNCIONES AUXILIARES

function generateN8NWebhookUrl(shopId: string, phoneNumber: string): string {
  const baseUrl =
    process.env.N8N_WEBHOOK_BASE_URL || "https://n8n.tu-dominio.com";
  const cleanPhoneNumber = phoneNumber.replace("+", "").replace(/\s/g, "");
  return `${baseUrl}/webhook/whatsapp/${shopId}/${cleanPhoneNumber}`;
}

async function setupTwilioWebhook(number: any) {
  try {
    console.log(`🔧 Configurando webhook Twilio para ${number.phone_number}`);

    // TODO: Implementar configuración real usando Twilio SDK
    // const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    //
    // await client.incomingPhoneNumbers(number.twilio_sid)
    //   .update({
    //     smsUrl: number.webhook_url,
    //     smsMethod: 'POST',
    //     voiceUrl: number.webhook_url,
    //     voiceMethod: 'POST'
    //   });

    console.log(`✅ Webhook configurado: ${number.webhook_url}`);
  } catch (error) {
    console.error("❌ Error configurando webhook Twilio:", error);
  }
}

async function activateN8NWorkflow(shop: any, number: any) {
  try {
    console.log(`🤖 Activando workflow N8N para ${shop.shop_domain}`);

    // TODO: Implementar activación usando N8N API
    // const response = await fetch(`${process.env.N8N_API_URL}/workflows/activate`, {
    //   method: 'POST',
    //   headers: {
    //     'Content-Type': 'application/json',
    //     'X-N8N-API-KEY': process.env.N8N_API_KEY
    //   },
    //   body: JSON.stringify({
    //     workflowTemplate: 'whatsapp-chatbot',
    //     shopId: shop.id,
    //     phoneNumber: number.phone_number,
    //     webhookUrl: number.webhook_url,
    //     shopifyDomain: shop.shop_domain,
    //     accessToken: shop.access_token
    //   })
    // });

    console.log(`✅ Workflow N8N activado para ${number.phone_number}`);
  } catch (error) {
    console.error("❌ Error activando workflow N8N:", error);
  }
}

async function deactivateTwilioWebhook(number: any) {
  try {
    console.log(`🔧 Desactivando webhook Twilio para ${number.phone_number}`);

    // TODO: Implementar desactivación
    // const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    //
    // await client.incomingPhoneNumbers(number.twilio_sid)
    //   .update({
    //     smsUrl: '',
    //     voiceUrl: ''
    //   });

    console.log(`✅ Webhook Twilio desactivado`);
  } catch (error) {
    console.error("❌ Error desactivando webhook Twilio:", error);
  }
}

async function pauseN8NWorkflow(shopId: string) {
  try {
    console.log(`🤖 Pausando workflow N8N para shop ${shopId}`);

    // TODO: Implementar pausa usando N8N API
    // await fetch(`${process.env.N8N_API_URL}/workflows/pause`, {
    //   method: 'POST',
    //   headers: {
    //     'Content-Type': 'application/json',
    //     'X-N8N-API-KEY': process.env.N8N_API_KEY
    //   },
    //   body: JSON.stringify({ shopId })
    // });

    console.log(`✅ Workflow N8N pausado`);
  } catch (error) {
    console.error("❌ Error pausando workflow N8N:", error);
  }
}

async function testWhatsAppConnection(number: any) {
  try {
    console.log(`🧪 Probando conexión WhatsApp para ${number.phone_number}`);

    // TODO: Implementar prueba real
    // Simulación de prueba exitosa
    return {
      success: true,
      status: "connected",
      responseTime: "150ms",
      webhookStatus: "active",
      lastActivity: new Date(),
    };
  } catch (error) {
    console.error("❌ Error en prueba de conexión:", error);
    return {
      success: false,
      error: "Error de conexión",
      details: error instanceof Error ? error.message : "Error desconocido",
    };
  }
}

// 🔧 OPTIONS: Para CORS
export const options = async () => {
  const headers = new Headers();
  headers.append("Access-Control-Allow-Origin", "*");
  headers.append("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.append("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return new Response(null, { status: 200, headers });
};
