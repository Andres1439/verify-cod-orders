// La ruta para este archivo es: app/routes/api.create-ticket.tsx

import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import db from "../db.server";

// Esta función 'action' se ejecuta cuando recibe una petición POST
export const action = async ({ request }: ActionFunctionArgs) => {
  const headers = new Headers();
  headers.append("Access-Control-Allow-Origin", "*");
  headers.append("Content-Type", "application/json");

  try {
    const body = await request.json();
    const { shopId, customerEmail, subject, message } = body;

    if (!shopId || !customerEmail || !subject || !message) {
      return json(
        {
          error:
            "Faltan parámetros requeridos (shopId, customerEmail, subject, message)",
        },
        { status: 400, headers },
      );
    }

    // Generamos un número de ticket aleatorio y fácil de leer
    const ticketNumber = `TICKET-${Math.floor(10000 + Math.random() * 90000)}`;

    const newTicket = await db.ticket.create({
      data: {
        id: ticketNumber, // Usamos nuestro ID personalizado
        shop_id: shopId,
        customer_email: customerEmail,
        subject: subject,
        message: message,
        shop: { connect: { id: shopId } }, // Ajusta si tu relación es diferente
        // El estado por defecto es PENDING, como en tu schema
      },
    });

    console.log(
      `[API] Ticket creado: ${newTicket.id} para la tienda ${shopId}`,
    );
    // Devolvemos el ticket completo, incluyendo el número
    return json({ success: true, ticket: newTicket }, { headers });
  } catch (error) {
    console.error("[API] Error al crear el ticket:", error);
    return json(
      { error: "Error interno del servidor al crear el ticket." },
      { status: 500, headers },
    );
  }
};
