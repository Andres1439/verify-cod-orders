/* eslint-disable @typescript-eslint/no-unused-vars */
// app/routes/app.whatsapp.tsx - VERSIÓN CON TIPOS CORREGIDOS
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useActionData, Form } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import db from "../db.server";

import {
  Page,
  Card,
  Button,
  BlockStack,
  Grid,
  Text,
  TextField,
  Badge,
  Banner,
  Icon,
  InlineStack,
  Select,
  Checkbox,
  Divider,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import {
  ChatIcon,
  PhoneIcon,
  CheckIcon,
  CalendarIcon,
  InfoIcon,
} from "@shopify/polaris-icons";

// 🔧 TIPOS PARA LAS RESPUESTAS
type SuccessResponse = {
  success: true;
  message: string;
  type: string;
  phoneNumber?: string;
  assignedAt?: string;
  welcomeMessage?: string;
};

type ErrorResponse = {
  error: string;
  type?: string;
  currentNumber?: string;
};

type ActionResponse = SuccessResponse | ErrorResponse;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const { shop } = session;

  const shopData = await db.shop.findUnique({
    where: { shop_domain: shop },
    include: {
      whatsapp_configuration: true,
      twilio_number: true,
    },
  });

  if (!shopData) {
    throw new Error("Tienda no encontrada");
  }

  return json({
    shop: shopData,
    hasWhatsAppNumber: !!shopData.twilio_number,
    whatsappConfig: shopData.whatsapp_configuration,
    assignedNumber: shopData.twilio_number,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const { shop } = session;

  const formData = await request.formData();
  const action = formData.get("_action") as string;

  const shopData = await db.shop.findUnique({
    where: { shop_domain: shop },
  });

  if (!shopData) {
    return json<ErrorResponse>(
      { error: "Tienda no encontrada" },
      { status: 404 },
    );
  }

  try {
    if (action === "request_number") {
      console.log(`🎯 Solicitud de número para: ${shop}`);

      try {
        // 🔥 Llamar al API para asignar número
        const baseUrl = new URL(request.url).origin;
        const response = await fetch(`${baseUrl}/api/whatsapp-info`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "assign_number",
            shop_domain: shop,
          }),
        });

        const result = await response.json();

        if (!response.ok) {
          console.log(`❌ Error asignando: ${result.error}`);

          if (result.current_number) {
            // Ya tiene número asignado
            return json<ErrorResponse>(
              {
                error: `Ya tienes el número ${result.current_number} asignado`,
                type: "already_assigned",
                currentNumber: result.current_number,
              },
              { status: 400 },
            );
          }

          // No hay números disponibles
          return json<ErrorResponse>(
            {
              error:
                result.error ||
                "Servicio temporalmente no disponible. Contacta soporte.",
              type: "no_numbers",
            },
            { status: response.status },
          );
        }

        // ✅ Asignación exitosa
        console.log(
          `✅ Número asignado exitosamente: ${result.data?.phoneNumber}`,
        );

        return json<SuccessResponse>({
          success: true,
          message: `¡Número WhatsApp asignado! Tu número ${result.data?.phoneNumber} ya está funcionando.`,
          type: "number_assigned",
          phoneNumber: result.data?.phoneNumber,
          assignedAt: result.data?.assignedAt,
          welcomeMessage: result.data?.welcomeMessage,
        });
      } catch (error) {
        console.error("❌ Error llamando API:", error);
        return json<ErrorResponse>(
          { error: "Error interno del servidor", type: "server_error" },
          { status: 500 },
        );
      }
    }

    if (action === "update_config") {
      const welcomeMessage = formData.get("welcome_message") as string;
      const businessHoursOpen = formData.get("business_hours_open") as string;
      const businessHoursClose = formData.get("business_hours_close") as string;
      const enabled = formData.get("enabled") === "on";

      const updatedConfig = await db.whatsAppConfiguration.upsert({
        where: { shop_id: shopData.id },
        update: {
          welcome_message: welcomeMessage,
          enabled: enabled,
          business_hours: {
            open: businessHoursOpen,
            close: businessHoursClose,
          },
        },
        create: {
          shop_id: shopData.id,
          welcome_message: welcomeMessage,
          enabled: enabled,
          business_hours: {
            open: businessHoursOpen,
            close: businessHoursClose,
          },
        },
      });

      // Notificar cambios a N8N (opcional)
      if (process.env.N8N_WEBHOOK_URL) {
        fetch(process.env.N8N_WEBHOOK_URL + "/config-updated", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "config_updated",
            shopId: shopData.id,
            shopDomain: shopData.shop_domain,
            config: updatedConfig,
          }),
        }).catch(console.error);
      }

      return json<SuccessResponse>({
        success: true,
        message: "Configuración actualizada exitosamente",
        type: "config_updated",
      });
    }

    return json<ErrorResponse>(
      { error: "Acción no válida", type: "invalid_action" },
      { status: 400 },
    );
  } catch (error) {
    console.error("Error en WhatsApp action:", error);
    return json<ErrorResponse>(
      { error: "Error interno del servidor", type: "server_error" },
      { status: 500 },
    );
  }
};

export default function WhatsAppPage() {
  const { shop, hasWhatsAppNumber, whatsappConfig, assignedNumber } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<ActionResponse>();

  const businessHours = whatsappConfig?.business_hours as any;

  // 🔧 Helper functions para type guards
  const isSuccessResponse = (data: ActionResponse): data is SuccessResponse => {
    return "success" in data && data.success === true;
  };

  const isErrorResponse = (data: ActionResponse): data is ErrorResponse => {
    return "error" in data;
  };

  return (
    <Page>
      <TitleBar title="WhatsApp" />

      <BlockStack gap="500">
        {/* Banner de estado */}
        {actionData && isSuccessResponse(actionData) && (
          <Banner tone="success">
            {actionData.message}
            {actionData.type === "number_assigned" &&
              actionData.phoneNumber && (
                <div style={{ marginTop: "8px" }}>
                  <Text as="p" variant="bodySm">
                    🎉 ¡Tu número {actionData.phoneNumber} está listo para
                    recibir mensajes!
                  </Text>
                  <Text as="p" variant="bodySm">
                    📱 Compártelo con tus clientes para que puedan contactarte
                    directamente.
                  </Text>
                </div>
              )}
          </Banner>
        )}

        {actionData && isErrorResponse(actionData) && (
          <Banner tone="critical">
            {actionData.error}
            {actionData.type === "no_numbers" && (
              <div style={{ marginTop: "8px" }}>
                <Text as="p" variant="bodySm">
                  📧 Contacta a soporte técnico para obtener un número WhatsApp.
                </Text>
              </div>
            )}
            {actionData.type === "already_assigned" &&
              actionData.currentNumber && (
                <div style={{ marginTop: "8px" }}>
                  <Text as="p" variant="bodySm">
                    📱 Tu número asignado es: {actionData.currentNumber}
                  </Text>
                </div>
              )}
          </Banner>
        )}

        {/* Card principal - Estado del número */}
        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between">
              <Text as="h2" variant="headingLg">
                WhatsApp para tu Tienda
              </Text>
              {hasWhatsAppNumber && (
                <Badge icon={CheckIcon} tone="success">
                  Activo
                </Badge>
              )}
            </InlineStack>

            {hasWhatsAppNumber ? (
              <BlockStack gap="400">
                <Text as="p" variant="bodyMd">
                  Tu número de WhatsApp está activo y funcionando. Los clientes
                  pueden escribir directamente para consultas automáticas.
                </Text>

                {/* Información del número asignado */}
                <Card background="bg-surface-success">
                  <BlockStack gap="300">
                    <InlineStack gap="200" align="center">
                      <Icon source={PhoneIcon} tone="base" />
                      <Text as="h3" variant="headingLg">
                        {assignedNumber?.phone_number}
                      </Text>
                    </InlineStack>

                    <Divider />

                    <Grid>
                      <Grid.Cell
                        columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}
                      >
                        <InlineStack gap="100" align="center">
                          <Icon source={CalendarIcon} tone="base" />
                          <BlockStack gap="050">
                            <Text as="p" variant="bodySm" tone="subdued">
                              Número asignado el:
                            </Text>
                            <Text as="p" variant="bodyMd">
                              {assignedNumber?.assigned_at
                                ? new Date(
                                    assignedNumber.assigned_at,
                                  ).toLocaleDateString("es-ES", {
                                    year: "numeric",
                                    month: "long",
                                    day: "numeric",
                                  })
                                : "No disponible"}
                            </Text>
                          </BlockStack>
                        </InlineStack>
                      </Grid.Cell>

                      <Grid.Cell
                        columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}
                      >
                        <InlineStack gap="100" align="center">
                          <Icon source={InfoIcon} tone="base" />
                          <BlockStack gap="050">
                            <Text as="p" variant="bodySm" tone="subdued">
                              Estado:
                            </Text>
                            <Text as="p" variant="bodyMd">
                              {assignedNumber?.status === "ASSIGNED"
                                ? "Funcionando"
                                : assignedNumber?.status}
                            </Text>
                          </BlockStack>
                        </InlineStack>
                      </Grid.Cell>
                    </Grid>
                  </BlockStack>
                </Card>

                {/* Información para compartir con clientes */}
                <Card background="bg-surface-info">
                  <BlockStack gap="300">
                    <Text as="h3" variant="headingMd">
                      📢 Comparte este número con tus clientes
                    </Text>
                    <Text as="p" variant="bodyMd">
                      Tus clientes pueden escribir a{" "}
                      <strong>{assignedNumber?.phone_number}</strong> para:
                    </Text>
                    <Text as="p" variant="bodyMd">
                      • <strong>Consultar el estado</strong> de sus pedidos
                      <br />• <strong>Crear nuevas órdenes</strong> directamente
                      por WhatsApp
                      <br />• <strong>Obtener información</strong> sobre
                      productos disponibles
                      <br />• <strong>Resolver dudas</strong> sobre envíos y
                      pagos
                      <br />• <strong>Soporte general</strong> de la tienda
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      💡 Las respuestas son automáticas usando inteligencia
                      artificial, disponible 24/7
                    </Text>
                  </BlockStack>
                </Card>

                <Text as="p" variant="bodySm" tone="subdued">
                  Widget de WhatsApp para tu tienda: Próximamente disponible
                </Text>
              </BlockStack>
            ) : (
              <BlockStack gap="300">
                <Text as="p" variant="bodyMd">
                  Solicita tu número de WhatsApp para que tus clientes puedan
                  contactarte directamente y obtener información automática
                  sobre sus pedidos.
                </Text>

                <Card background="bg-surface">
                  <BlockStack gap="300">
                    <Text as="h3" variant="headingMd">
                      🚀 ¿Qué obtienes con tu número WhatsApp?
                    </Text>
                    <Text as="p" variant="bodyMd">
                      <strong>Para tus clientes:</strong>
                      <br />
                      • Consultas de pedidos instantáneas 24/7
                      <br />
                      • Creación de órdenes por WhatsApp
                      <br />
                      • Información de productos automática
                      <br />
                      • Soporte inmediato sin esperas
                      <br />
                      <br />
                      <strong>Para tu negocio:</strong>
                      <br />
                      • Número dedicado exclusivo
                      <br />
                      • Respuestas automáticas inteligentes
                      <br />
                      • Reduce consultas por otros canales
                      <br />
                      • Mejora la satisfacción del cliente
                      <br />• Sin configuración técnica adicional
                    </Text>
                  </BlockStack>
                </Card>

                <Form method="post">
                  <input type="hidden" name="_action" value="request_number" />
                  <Button variant="primary" size="large" icon={ChatIcon} submit>
                    Solicitar Número WhatsApp
                  </Button>
                </Form>

                <Text as="p" variant="bodySm" tone="subdued">
                  ✅ Incluido en tu plan actual • ✅ Asignación inmediata • ✅
                  Sin costos adicionales
                </Text>
              </BlockStack>
            )}
          </BlockStack>
        </Card>

        {/* Card de configuración - solo si tiene número */}
        {hasWhatsAppNumber && (
          <Card>
            <BlockStack gap="500">
              <Text as="h2" variant="headingLg">
                ⚙️ Configuración de Respuestas
              </Text>

              <Form method="post">
                <input type="hidden" name="_action" value="update_config" />

                <BlockStack gap="400">
                  <Checkbox
                    label="Activar respuestas automáticas"
                    name="enabled"
                    checked={whatsappConfig?.enabled}
                    helpText="La IA responderá automáticamente a consultas de pedidos, productos y soporte"
                  />

                  <TextField
                    label="Mensaje de Bienvenida"
                    name="welcome_message"
                    value={
                      whatsappConfig?.welcome_message ||
                      "¡Hola! ¿En qué puedo ayudarte?"
                    }
                    helpText="Primer mensaje que verán los clientes al escribir"
                    autoComplete="off"
                    multiline
                  />

                  <Text as="h3" variant="headingSm">
                    Horario de Atención (Opcional)
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Fuera de este horario, se informará a los clientes que
                    responderás pronto
                  </Text>

                  <Grid>
                    <Grid.Cell
                      columnSpan={{ xs: 6, sm: 3, md: 3, lg: 6, xl: 6 }}
                    >
                      <Select
                        label="Hora de apertura"
                        name="business_hours_open"
                        options={[
                          {
                            label: "24/7 (Siempre disponible)",
                            value: "00:00",
                          },
                          { label: "07:00 AM", value: "07:00" },
                          { label: "08:00 AM", value: "08:00" },
                          { label: "09:00 AM", value: "09:00" },
                          { label: "10:00 AM", value: "10:00" },
                        ]}
                        value={businessHours?.open || "09:00"}
                      />
                    </Grid.Cell>

                    <Grid.Cell
                      columnSpan={{ xs: 6, sm: 3, md: 3, lg: 6, xl: 6 }}
                    >
                      <Select
                        label="Hora de cierre"
                        name="business_hours_close"
                        options={[
                          {
                            label: "24/7 (Siempre disponible)",
                            value: "23:59",
                          },
                          { label: "17:00 PM", value: "17:00" },
                          { label: "18:00 PM", value: "18:00" },
                          { label: "19:00 PM", value: "20:00" },
                          { label: "19:00 PM", value: "19:00" },
                          { label: "20:00 PM", value: "20:00" },
                          { label: "21:00 PM", value: "21:00" },
                        ]}
                        value={businessHours?.close || "18:00"}
                      />
                    </Grid.Cell>
                  </Grid>

                  <Button variant="primary" submit>
                    💾 Guardar Configuración
                  </Button>
                </BlockStack>
              </Form>
            </BlockStack>
          </Card>
        )}

        {/* Card de vista previa - solo si tiene número */}
        {hasWhatsAppNumber && (
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingLg">
                📱 Ejemplo de Conversación
              </Text>

              <Text as="p" variant="bodyMd" tone="subdued">
                Así es como se verá una conversación típica con tus clientes:
              </Text>

              <Card background="bg-surface-secondary">
                <BlockStack gap="300">
                  {/* Mensaje del cliente */}
                  <div
                    style={{
                      padding: "12px 16px",
                      backgroundColor: "#e3f2fd",
                      borderRadius: "18px 18px 4px 18px",
                      marginLeft: "auto",
                      maxWidth: "75%",
                      border: "1px solid #bbdefb",
                    }}
                  >
                    <Text as="p" variant="bodyMd">
                      Hola, quiero consultar mi pedido #1234
                    </Text>
                  </div>

                  {/* Respuesta automática */}
                  <div
                    style={{
                      padding: "12px 16px",
                      backgroundColor: "#25d366",
                      color: "white",
                      borderRadius: "18px 18px 18px 4px",
                      maxWidth: "85%",
                    }}
                  >
                    <Text as="p" variant="bodyMd" tone="inherit">
                      📦 <strong>Pedido #1234</strong>
                      <br />
                      Estado: En tránsito 🚚
                      <br />
                      Total: $99.99
                      <br />
                      Fecha estimada: Mañana
                      <br />
                      Tracking: TRK123456789
                    </Text>
                  </div>

                  {/* Otro mensaje del cliente */}
                  <div
                    style={{
                      padding: "12px 16px",
                      backgroundColor: "#e3f2fd",
                      borderRadius: "18px 18px 4px 18px",
                      marginLeft: "auto",
                      maxWidth: "70%",
                      border: "1px solid #bbdefb",
                    }}
                  >
                    <Text as="p" variant="bodyMd">
                      ¿Qué productos nuevos tienen?
                    </Text>
                  </div>

                  {/* Respuesta de productos */}
                  <div
                    style={{
                      padding: "12px 16px",
                      backgroundColor: "#25d366",
                      color: "white",
                      borderRadius: "18px 18px 18px 4px",
                      maxWidth: "85%",
                    }}
                  >
                    <Text as="p" variant="bodyMd" tone="inherit">
                      🛍️ <strong>Productos Nuevos:</strong>
                      <br />
                      • Smartphone Pro Max - $899
                      <br />
                      • Auriculares Wireless - $199
                      <br />
                      • Tablet Ultra - $499
                      <br />
                      <br />
                      ¿Te interesa alguno? Puedo ayudarte a crear un pedido.
                    </Text>
                  </div>
                </BlockStack>
              </Card>

              <Text as="p" variant="bodySm" tone="subdued">
                💡 Las respuestas se generan automáticamente usando los datos
                reales de tu tienda Shopify
              </Text>
            </BlockStack>
          </Card>
        )}
      </BlockStack>
    </Page>
  );
}
