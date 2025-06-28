// app/routes/api.whatsapp-info.tsx
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import db from "../db.server";

// 🔍 GET: Para N8N - Obtener info de la tienda por número de WhatsApp
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

    console.log("🔍 N8N consultando info para número:", phoneNumber);

    // Normalizar número (quitar espacios y caracteres especiales)
    const normalizedPhone = phoneNumber.replace(/[^\d+]/g, "");

    // Buscar información de la tienda por número
    const numberInfo = await db.twilioNumber.findFirst({
      where: {
        OR: [{ phone_number: phoneNumber }, { phone_number: normalizedPhone }],
        status: "ASSIGNED", // Solo números asignados
      },
      include: {
        shop: {
          include: {
            whatsapp_configuration: true,
          },
        },
      },
    });

    if (!numberInfo || !numberInfo.shop) {
      console.log("❌ Número no encontrado o no asignado:", phoneNumber);
      return json(
        {
          error: "Número no encontrado o no asignado",
          message: `El número ${phoneNumber} no está registrado en nuestro sistema`,
        },
        { status: 404, headers },
      );
    }

    const shop = numberInfo.shop;
    const config = shop.whatsapp_configuration;

    console.log("✅ Tienda encontrada:", shop.shop_domain);

    // Información que N8N necesita para responder
    return json(
      {
        success: true,
        shopInfo: {
          id: shop.id,
          shop_domain: shop.shop_domain, // Consistente con N8N
          access_token: shop.access_token,
          subscription_plan: shop.subscription_plan,
        },
        whatsappConfig: {
          enabled: config?.enabled || true,
          welcome_message:
            config?.welcome_message || "¡Hola! ¿En qué puedo ayudarte?",
          business_hours: config?.business_hours || {
            open: "09:00",
            close: "18:00",
          },
          auto_responses: config?.auto_responses || {},
        },
        numberInfo: {
          phoneNumber: numberInfo.phone_number,
          twilioSid: numberInfo.twilio_sid,
          status: numberInfo.status,
          assigned_at: numberInfo.assigned_at,
        },
      },
      { headers },
    );
  } catch (error) {
    console.error("❌ Error en API WhatsApp info:", error);
    return json(
      { error: "Error interno del servidor" },
      { status: 500, headers },
    );
  }
};

// 🎯 POST: Para Dashboard - Asignar número a una tienda
export const action = async ({ request }: ActionFunctionArgs) => {
  const headers = new Headers();
  headers.append("Access-Control-Allow-Origin", "*");
  headers.append("Content-Type", "application/json");

  try {
    const { action, shop_domain } = await request.json();

    if (action !== "assign_number" || !shop_domain) {
      return json(
        { error: "Acción o shop_domain faltante" },
        { status: 400, headers },
      );
    }

    console.log(`🎯 Asignando número para: ${shop_domain}`);

    // 1. Buscar la tienda
    const shop = await db.shop.findUnique({
      where: { shop_domain },
      include: { twilio_number: true },
    });

    if (!shop) {
      console.log(`❌ Tienda no encontrada: ${shop_domain}`);
      return json({ error: "Tienda no encontrada" }, { status: 404, headers });
    }

    // 2. Verificar si ya tiene número
    if (shop.twilio_number) {
      console.log(`⚠️ Ya tiene número: ${shop.twilio_number.phone_number}`);
      return json(
        {
          success: false,
          error: "Ya tienes un número WhatsApp asignado",
          current_number: shop.twilio_number.phone_number,
          assigned_at: shop.twilio_number.assigned_at,
        },
        { status: 400, headers },
      );
    }

    // 3. Buscar primer número disponible
    const availableNumber = await db.twilioNumber.findFirst({
      where: {
        status: "AVAILABLE",
        shop_id: null,
      },
      orderBy: { created_at: "asc" },
    });

    if (!availableNumber) {
      console.log("❌ No hay números disponibles");
      return json(
        {
          success: false,
          error: "No hay números WhatsApp disponibles en este momento",
          message: "Contacta a soporte técnico para obtener un número",
        },
        { status: 503, headers },
      );
    }

    console.log(
      `✅ Número disponible encontrado: ${availableNumber.phone_number}`,
    );

    // 4. Asignar número en transacción
    const [assignedNumber, whatsappConfig] = await db.$transaction(
      async (tx) => {
        // Asignar número
        const assigned = await tx.twilioNumber.update({
          where: { id: availableNumber.id },
          data: {
            shop_id: shop.id,
            status: "ASSIGNED",
            assigned_at: new Date(),
          },
        });

        // Crear configuración WhatsApp por defecto
        const config = await tx.whatsAppConfiguration.create({
          data: {
            shop_id: shop.id,
            enabled: true,
            welcome_message: `¡Hola! Gracias por contactar ${shop_domain.replace(".myshopify.com", "")}. ¿En qué puedo ayudarte? 🛍️`,
            business_hours: {
              open: "09:00",
              close: "18:00",
              timezone: "America/Lima",
            },
            auto_responses: {
              out_of_hours:
                "Estamos fuera del horario de atención. Te responderemos en horario comercial (9 AM - 6 PM).",
              escalation_keywords: ["humano", "persona", "agente", "soporte"],
            },
          },
        });

        return [assigned, config];
      },
    );

    console.log(
      `✅ Número ${assignedNumber.phone_number} asignado exitosamente a ${shop_domain}`,
    );

    return json(
      {
        success: true,
        message: `Número ${assignedNumber.phone_number} asignado exitosamente`,
        data: {
          phoneNumber: assignedNumber.phone_number,
          twilioSid: assignedNumber.twilio_sid,
          assignedAt: assignedNumber.assigned_at,
          shop_domain: shop.shop_domain,
          welcomeMessage: whatsappConfig.welcome_message,
          businessHours: whatsappConfig.business_hours,
        },
      },
      { headers },
    );
  } catch (error) {
    console.error("❌ Error asignando número:", error);
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

// 🔧 OPTIONS: Para CORS
export const options = async () => {
  const headers = new Headers();
  headers.append("Access-Control-Allow-Origin", "*");
  headers.append("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.append("Access-Control-Allow-Headers", "Content-Type, Authorization");

  return new Response(null, { status: 200, headers });
};
