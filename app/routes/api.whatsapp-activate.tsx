import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export async function action({ request }: ActionFunctionArgs) {
  try {
    const { session } = await authenticate.admin(request);
    const formData = await request.formData();

    const shop = await db.shop.findUnique({
      where: { shop_domain: session.shop },
    });

    if (!shop) {
      return json({ error: "TIENDA_NO_ENCONTRADA" });
    }

    if (shop.subscription_plan === "FREE") {
      return json({ error: "PLAN_REQUERIDO" });
    }

    const existingNumber = await db.whatsAppNumber.findFirst({
      where: {
        default_shop_id: shop.id,
        status: "ACTIVE",
      },
    });

    if (existingNumber) {
      return json({ error: "YA_ASIGNADO" });
    }

    const availableInstance = await db.whatsAppNumber.findFirst({
      where: {
        status: "ACTIVE",
        assignment_status: "AVAILABLE",
      },
      orderBy: { created_at: "asc" },
    });

    if (!availableInstance) {
      return json({ error: "NO_WHATSAPP_NUMBER_AVAILABLE" });
    }

    await db.whatsAppNumber.update({
      where: { id: availableInstance.id },
      data: {
        default_shop_id: shop.id,
        assignment_status: "ASSIGNED",
        assigned_at: new Date(),
        updated_at: new Date(),
      },
    });

    return json({ success: true });
  } catch (error) {
    return json({ error: "ERROR_INTERNO" });
  }
} 