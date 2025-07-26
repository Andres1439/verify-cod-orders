// app/routes/api.create-ticket.tsx (ACTUALIZADA CON NÚMERO REAL)
import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import db from "../db.server";
import { SecurityAudit } from "../utils/security-audit.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const headers = new Headers();
  headers.append("Access-Control-Allow-Origin", "*");
  headers.append("Access-Control-Allow-Methods", "POST, OPTIONS");
  headers.append("Access-Control-Allow-Headers", "Content-Type");
  headers.append("Content-Type", "application/json");

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

    // Validación estricta
    if ((!shopId && !shopDomain) || !customerEmail || !subject || !message) {
      SecurityAudit.log({
        shopId: shopId || shopDomain || "unknown",
        action: "CREATE_TICKET_MISSING_PARAMS",
        success: false,
        details: { customerEmail, subject },
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

    // Validar formato del email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(customerEmail)) {
      if (process.env.NODE_ENV !== "production") {

      }
      SecurityAudit.log({
        shopId: shopId || shopDomain || "unknown",
        action: "CREATE_TICKET_INVALID_EMAIL",
        success: false,
        details: { customerEmail },
      });
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
      where: shopId ? { id: shopId } : { shop_domain: shopDomain },
      select: { id: true, shop_domain: true },
    });

    if (!shop) {
      if (process.env.NODE_ENV !== "production") {

      }
      SecurityAudit.log({
        shopId: shopId || shopDomain || "unknown",
        action: "CREATE_TICKET_SHOP_NOT_FOUND",
        success: false,
        details: { customerEmail },
      });
      return json(
        {
          success: false,
          error: "Tienda no encontrada",
        },
        { status: 404, headers },
      );
    }



    // Crear el ticket
    const newTicket = await db.ticket.create({
      data: {
        shop_id: shop.id,
        customer_email: customerEmail.trim().toLowerCase(),
        customerName: customerName ? customerName.trim() : null,
        customerPhone: customerPhone ? customerPhone.trim() : null,
        shopDomain: shop.shop_domain,
        subject: subject.trim(),
        message: message.trim(),
        status: "PENDING",
      },
      select: {
        id: true,
        customer_email: true,
        customerName: true,
        customerPhone: true,
        shopDomain: true,
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

    // 🎯 GENERAR NÚMERO DE TICKET BASADO EN UUID REAL
    const ticketShortId = newTicket.id.split("-")[0]; // Tomar parte antes del primer guión
    const ticketNumber = `TICKET-${ticketShortId}`;



    SecurityAudit.log({
      shopId: shop.id,
      action: "CREATE_TICKET_SUCCESS",
      success: true,
      details: { customerEmail, ticketId: newTicket.id, ticketNumber },
    });

    // 🎯 RESPUESTA CON NÚMERO DE TICKET REAL
    return json(
      {
        success: true,
        ticket: {
          id: newTicket.id,
          ticketNumber: ticketNumber, // TICKET-9bb77c9f
          ticketShortId: ticketShortId, // 9bb77c9f
          customerEmail: newTicket.customer_email,
          customerName: newTicket.customerName,
          customerPhone: newTicket.customerPhone,
          subject: newTicket.subject,
          status: newTicket.status,
          createdAt: newTicket.created_at,
          shopDomain: newTicket.shop.shop_domain,
        },
        message: `¡Tu ticket ha sido creado exitosamente! 🎫✨\nNúmero de ticket: ${ticketNumber}\nNuestro equipo se pondrá en contacto contigo pronto.`,
      },
      { headers },
    );
  } catch (error) {


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

export const loader = async () => {
  return json({
    message: "API de tickets funcionando correctamente",
    timestamp: new Date().toISOString(),
    version: "1.0",
  });
};
