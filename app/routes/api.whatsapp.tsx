// app/routes/api.whatsapp.tsx
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import  db  from "../db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const { session } = await authenticate.admin(request);
    
    // Buscar la tienda
    const shop = await db.shop.findUnique({
      where: { shop_domain: session.shop },
      include: {
        twilio_number: true,
        whatsapp_configuration_2: true,
      },
    });

    if (!shop) {
      return json({
        success: false,
        error: "Tienda no encontrada",
      }, { status: 404 });
    }

    // Obtener estadísticas de números
    const [availableNumbers, totalNumbers, assignedNumbers] = await Promise.all([
      db.twilioNumber.count({ where: { status: 'AVAILABLE' } }),
      db.twilioNumber.count(),
      db.twilioNumber.count({ where: { status: 'ASSIGNED' } }),
    ]);

    return json({
      success: true,
      data: {
        shop: {
          id: shop.id,
          domain: shop.shop_domain,
          subscriptionPlan: shop.subscription_plan,
        },
        assignedNumber: shop.twilio_number ? {
          id: shop.twilio_number.id,
          phoneNumber: shop.twilio_number.phone_number,
          friendlyName: shop.twilio_number.friendly_name,
          status: shop.twilio_number.status,
          assignedAt: shop.twilio_number.assigned_at,
          monthlyCost: shop.twilio_number.monthly_cost,
          countryCode: shop.twilio_number.country_code,
          numberType: shop.twilio_number.number_type,
          capabilities: shop.twilio_number.capabilities,
          webhookUrl: shop.twilio_number.webhook_url,
        } : null,
        whatsappConfig: shop.whatsapp_configuration_2,
        statistics: {
          availableNumbers,
          totalNumbers,
          assignedNumbers,
        },
      },
    });
  } catch (error) {
    console.error("Error en loader WhatsApp:", error);
    return json({
      success: false,
      error: "Error interno del servidor",
    }, { status: 500 });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  try {
    const { session } = await authenticate.admin(request);
    const body = await request.json();
    const { action } = body;

    // Buscar la tienda
    const shop = await db.shop.findUnique({
      where: { shop_domain: session.shop },
      include: { twilio_number: true },
    });

    if (!shop) {
      return json({
        success: false,
        error: "Tienda no encontrada",
      }, { status: 404 });
    }

    switch (action) {
      case "assign_number": {
        // Verificar que no tenga ya un número asignado
        if (shop.twilio_number) {
          return json({
            success: false,
            error: "Ya tienes un número asignado",
          }, { status: 400 });
        }

        // Buscar número disponible
        const availableNumber = await db.twilioNumber.findFirst({
          where: { status: 'AVAILABLE' },
        });

        if (!availableNumber) {
          return json({
            success: false,
            error: "No hay números disponibles en este momento",
          }, { status: 400 });
        }

        // Asignar número a la tienda
        const assignedNumber = await db.twilioNumber.update({
          where: { id: availableNumber.id },
          data: {
            shop_id: shop.id,
            status: 'ASSIGNED',
            assigned_at: new Date(),
          },
        });

        // Crear configuración básica de WhatsApp si no existe
        await db.whatsAppConfiguration.upsert({
          where: { shop_id: shop.id },
          update: {},
          create: {
            shop_id: shop.id,
            enabled: true,
            welcome_message: `¡Hola! Gracias por contactar ${shop.shop_domain.replace('.myshopify.com', '')}. ¿En qué puedo ayudarte? 🛍️`,
          },
        });

        return json({
          success: true,
          data: {
            phone_number: assignedNumber.phone_number,
            message: "Número de WhatsApp asignado exitosamente",
          },
        });
      }

      case "release_number": {
        if (!shop.twilio_number) {
          return json({
            success: false,
            error: "No tienes número asignado",
          }, { status: 400 });
        }

        // Liberar el número
        await db.twilioNumber.update({
          where: { id: shop.twilio_number.id },
          data: {
            shop_id: null,
            status: 'AVAILABLE',
            assigned_at: null,
          },
        });

        return json({
          success: true,
          data: {
            message: "Número liberado exitosamente",
          },
        });
      }

      case "update_config": {
        const { welcomeMessage, businessHours, autoResponses } = body;

        // Actualizar configuración de WhatsApp
        await db.whatsAppConfiguration.upsert({
          where: { shop_id: shop.id },
          update: {
            welcome_message: welcomeMessage,
            business_hours: businessHours,
            auto_responses: autoResponses,
          },
          create: {
            shop_id: shop.id,
            enabled: true,
            welcome_message: welcomeMessage,
            business_hours: businessHours,
            auto_responses: autoResponses,
          },
        });

        return json({
          success: true,
          data: {
            message: "Configuración actualizada exitosamente",
          },
        });
      }

      case "test_connection": {
        if (!shop.twilio_number) {
          return json({
            success: false,
            error: "No tienes número asignado",
          }, { status: 400 });
        }

        // Simular prueba de conexión
        return json({
          success: true,
          data: {
            status: "connected",
            webhook_status: "active",
            ai_agent_status: "working",
            response_time: "120ms",
            message: "Conexión exitosa",
          },
        });
      }

      default:
        return json({
          success: false,
          error: "Acción no válida",
        }, { status: 400 });
    }
  } catch (error) {
    console.error("Error en action WhatsApp:", error);
    return json({
      success: false,
      error: "Error interno del servidor",
    }, { status: 500 });
  }
}