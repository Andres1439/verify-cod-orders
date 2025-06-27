// app/routes/api.whatsapp-info.tsx
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import db from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const headers = new Headers();
  headers.append("Access-Control-Allow-Origin", "*");
  headers.append("Content-Type", "application/json");

  try {
    const url = new URL(request.url);
    const phoneNumber = url.searchParams.get("phone");

    if (!phoneNumber) {
      return json(
        { error: "Parámetro 'phone' requerido" },
        { status: 400, headers },
      );
    }

    // Buscar información de la tienda por número
    const numberInfo = await db.twilioNumber.findUnique({
      where: { phone_number: phoneNumber },
      include: {
        shop: {
          include: {
            whatsapp_configuration: true,
          },
        },
      },
    });

    if (!numberInfo || !numberInfo.shop) {
      return json(
        { error: "Número no encontrado o no asignado" },
        { status: 404, headers },
      );
    }

    const shop = numberInfo.shop;
    const config = shop.whatsapp_configuration;

    // Información que N8N necesita para responder
    return json(
      {
        success: true,
        shopInfo: {
          id: shop.id,
          domain: shop.shop_domain,
          accessToken: shop.access_token, // Para consultar pedidos
        },
        whatsappConfig: {
          enabled: config?.enabled || false,
          welcomeMessage:
            config?.welcome_message || "¡Hola! ¿En qué puedo ayudarte?",
          businessHours: config?.business_hours || {
            open: "09:00",
            close: "18:00",
          },
        },
        numberInfo: {
          phoneNumber: numberInfo.phone_number,
          twilioSid: numberInfo.twilio_sid,
          status: numberInfo.status,
        },
      },
      { headers },
    );
  } catch (error) {
    console.error("Error en API WhatsApp info:", error);
    return json(
      { error: "Error interno del servidor" },
      { status: 500, headers },
    );
  }
};
