// app/routes/api.create-ticket.tsx (CORREGIDA FINAL)
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
    const {
      shopId,
      shopDomain,
      customerEmail,
      customerName,
      customerPhone,
      subject,
      message,
    } = body;

    // Validación de parámetros requeridos - acepta shopId O shopDomain
    if ((!shopId && !shopDomain) || !customerEmail || !subject || !message) {
      console.log("❌ [API] Faltan parámetros:", {
        shopId: !!shopId,
        shopDomain: !!shopDomain,
        customerEmail: !!customerEmail,
        customerName: !!customerName,
        customerPhone: !!customerPhone,
        subject: !!subject,
        message: !!message,
      });
      return json(
        {
          success: false,
          error:
            "Faltan parámetros requeridos (shopId O shopDomain, customerEmail, subject, message)",
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

    // Verificar que la tienda existe - buscar por ID o dominio
    const shop = await db.shop.findUnique({
      where: shopId ? { id: shopId } : { shop_domain: shopDomain },
      select: { id: true, shop_domain: true },
    });

    if (!shop) {
      console.log("❌ [API] Tienda no encontrada:", shopId || shopDomain);
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

    // Crear el ticket CON LOS NUEVOS CAMPOS
    const newTicket = await db.ticket.create({
      data: {
        shop_id: shop.id, // ✅ Usar shop.id en lugar de shopId
        customer_email: customerEmail.trim().toLowerCase(),
        customerName: customerName ? customerName.trim() : null, // ✅ Agregar customerName
        customerPhone: customerPhone ? customerPhone.trim() : null, // ✅ Agregar customerPhone
        shopDomain: shop.shop_domain, // ✅ Agregar shopDomain
        subject: subject.trim(),
        message: message.trim(),
        status: "PENDING",
        // Los campos created_at y updated_at se manejan automáticamente
      },
      select: {
        id: true,
        customer_email: true,
        customerName: true, // ✅ Incluir en select
        customerPhone: true, // ✅ Incluir en select
        shopDomain: true, // ✅ Incluir en select
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
          customerName: newTicket.customerName, // ✅ Ahora existe en el objeto
          customerPhone: newTicket.customerPhone, // ✅ Ahora existe en el objeto
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

      // Log del error específico para debugging
      console.error("💥 [API] Error detallado:", error.message);
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
