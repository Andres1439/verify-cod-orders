// app/routes/api.create-ticket.tsx (MEJORADA)
import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import db from "../db.server";

// Esta función 'action' se ejecuta cuando recibe una petición POST
export const action = async ({ request }: ActionFunctionArgs) => {
  const headers = new Headers();
  headers.append("Access-Control-Allow-Origin", "*");
  headers.append("Access-Control-Allow-Methods", "POST, OPTIONS");
  headers.append("Access-Control-Allow-Headers", "Content-Type");
  headers.append("Content-Type", "application/json");

  // Manejar preflight OPTIONS request
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 200, headers });
  }

  try {
    const body = await request.json();
    const { shopId, customerEmail, subject, message } = body;

    // Validación de parámetros requeridos
    if (!shopId || !customerEmail || !subject || !message) {
      console.log("❌ [API] Faltan parámetros:", {
        shopId: !!shopId,
        customerEmail: !!customerEmail,
        subject: !!subject,
        message: !!message,
      });
      return json(
        {
          success: false,
          error:
            "Faltan parámetros requeridos (shopId, customerEmail, subject, message)",
        },
        { status: 400, headers },
      );
    }

    // Validar formato básico del email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(customerEmail)) {
      console.log("❌ [API] Email inválido:", customerEmail);
      return json(
        {
          success: false,
          error: "El formato del email no es válido",
        },
        { status: 400, headers },
      );
    }

    // Verificar que la tienda existe
    const shop = await db.shop.findUnique({
      where: { id: shopId },
      select: { id: true, shop_domain: true },
    });

    if (!shop) {
      console.log("❌ [API] Tienda no encontrada:", shopId);
      return json(
        {
          success: false,
          error: "Tienda no encontrada",
        },
        { status: 404, headers },
      );
    }

    // Generar número de ticket único y legible
    const ticketNumber = `TICKET-${Math.floor(10000 + Math.random() * 90000)}`;

    console.log("📝 [API] Creando ticket para tienda:", shop.shop_domain);

    // Crear el ticket
    const newTicket = await db.ticket.create({
      data: {
        shop_id: shopId,
        customer_email: customerEmail.trim().toLowerCase(),
        subject: subject.trim(),
        message: message.trim(),
        status: "PENDING",
        // Los campos created_at y updated_at se manejan automáticamente
      },
      select: {
        id: true,
        customer_email: true,
        subject: true,
        status: true,
        created_at: true,
        shop: {
          select: {
            shop_domain: true,
          },
        },
      },
    });

    console.log(
      `✅ [API] Ticket creado: ${newTicket.id} para la tienda ${shop.shop_domain}`,
    );

    // Respuesta exitosa con información del ticket
    return json(
      {
        success: true,
        ticket: {
          id: newTicket.id,
          ticketNumber: ticketNumber, // Para mostrar al cliente
          customerEmail: newTicket.customer_email,
          subject: newTicket.subject,
          status: newTicket.status,
          createdAt: newTicket.created_at,
          shopDomain: newTicket.shop.shop_domain,
        },
        message: "Ticket creado exitosamente",
      },
      { headers },
    );
  } catch (error) {
    console.error("💥 [API] Error al crear el ticket:", error);

    // Manejar errores específicos de Prisma
    if (error instanceof Error) {
      if (error.message.includes("Foreign key constraint")) {
        return json(
          {
            success: false,
            error: "La tienda especificada no existe",
          },
          { status: 400, headers },
        );
      }

      if (error.message.includes("Unique constraint")) {
        return json(
          {
            success: false,
            error: "Ya existe un ticket con estos datos",
          },
          { status: 409, headers },
        );
      }
    }

    return json(
      {
        success: false,
        error: "Error interno del servidor al crear el ticket.",
      },
      { status: 500, headers },
    );
  }
};

// Endpoint GET para verificar que la API funciona (opcional)
export const loader = async () => {
  return json({
    message: "API de tickets funcionando correctamente",
    timestamp: new Date().toISOString(),
    version: "1.0",
  });
};
