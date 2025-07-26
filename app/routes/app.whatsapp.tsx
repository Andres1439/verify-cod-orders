// app/routes/app.whatsapp.tsx - VERSIÓN CORREGIDA SIN ERRORES TS
import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Button,
  Banner,
  Text,
  BlockStack,
  InlineStack,
  Badge,
  Modal,
  Divider,
  Spinner,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { logger } from "../utils/logger.server";

// Tipos específicos para evitar errores de TypeScript
interface ShopData {
  id: string;
  domain: string;
  subscriptionPlan: string | null;
  storeName: string;
}

interface AssignedNumberData {
  id: string;
  phoneNumber: string;
  displayName: string | null;
  status: string;
  assignedAt: string;
  countryCode: string;
  webhookUrl: string | null;
  businessAccountId: string | null;
}

interface LoaderData {
  shop: ShopData;
  assignedNumber: AssignedNumberData | null;
}

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const { session } = await authenticate.admin(request);

    const shop = await db.shop.findUnique({
      where: { shop_domain: session.shop },
      include: {
        chatbot_configuration: true,
        whatsAppNumbers: {
          where: { 
            status: 'ACTIVE',
            default_shop_id: { not: null }
          }
        }
      }
    });

    if (!shop) {
      throw new Error("Tienda no encontrada");
    }

    const assignedNumber = shop.whatsAppNumbers?.[0] || null;

    const responseData: LoaderData = {
      shop: {
        id: shop.id,
        domain: shop.shop_domain,
        subscriptionPlan: shop.subscription_plan,
        storeName: shop.shop_domain.replace('.myshopify.com', '').replace(/-/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()),
      },
      assignedNumber: assignedNumber ? {
        id: assignedNumber.id,
        phoneNumber: assignedNumber.phone_number,
        displayName: assignedNumber.display_name,
        status: String(assignedNumber.status),
        assignedAt: assignedNumber.assigned_at ? 
          (assignedNumber.assigned_at instanceof Date ? 
            assignedNumber.assigned_at.toISOString() : 
            String(assignedNumber.assigned_at)
          ) : 
          (assignedNumber.updated_at instanceof Date ? 
            assignedNumber.updated_at.toISOString() : 
            String(assignedNumber.updated_at)
          ),
        countryCode: assignedNumber.country_code,
        webhookUrl: assignedNumber.webhook_url,
        businessAccountId: assignedNumber.business_account_id,
      } : null,
    };

    return json(responseData);
  } catch (error) {
    if (error instanceof Response) throw error;
    logger.error("Error cargando datos WhatsApp", { error });
    throw new Error("Error cargando datos de WhatsApp");
  }
}

export async function action({ request }: ActionFunctionArgs) {
  try {
    const { session } = await authenticate.admin(request);
    const formData = await request.formData();
    const actionType = formData.get("actionType") as string;

    const shop = await db.shop.findUnique({
      where: { shop_domain: session.shop },
    });

    if (!shop) {
      throw new Error("Tienda no encontrada");
    }

    if (actionType === "activate_whatsapp") {
      if (shop.subscription_plan === 'FREE') {
        throw new Error("Plan BASIC o superior requerido");
      }

      const existingNumber = await db.whatsAppNumber.findFirst({
        where: { 
          default_shop_id: shop.id,
          status: 'ACTIVE'
        }
      });

      if (existingNumber) {
        throw new Error("Ya tienes un número WhatsApp asignado");
      }

      const availableInstance = await db.whatsAppNumber.findFirst({
        where: { 
          status: 'ACTIVE',
          assignment_status: 'AVAILABLE'
        },
        orderBy: { created_at: 'asc' }
      });

      if (!availableInstance) {
        // RESPONDER CON JSON DE ERROR EN VEZ DE LANZAR ERROR
        return json({ error: "NO_WHATSAPP_NUMBER_AVAILABLE" }, { status: 200 });
      }

      await db.whatsAppNumber.update({
        where: { id: availableInstance.id },
        data: { 
          default_shop_id: shop.id,
          assignment_status: 'ASSIGNED',
          assigned_at: new Date(),
          updated_at: new Date()
        }
      });

      return redirect("/app/whatsapp");
    }

    if (actionType === "deactivate_whatsapp") {
      const assignedInstance = await db.whatsAppNumber.findFirst({
        where: { 
          default_shop_id: shop.id,
          status: 'ACTIVE'
        }
      });

      if (!assignedInstance) {
        throw new Error("No tienes número WhatsApp asignado");
      }

      await db.whatsAppNumber.update({
        where: { id: assignedInstance.id },
        data: { 
          default_shop_id: null,
          assignment_status: 'AVAILABLE',
          assigned_at: null,
          detection_rules: undefined,
          updated_at: new Date()
        }
      });

      return redirect("/app/whatsapp");
    }

    throw new Error("Acción no válida");
  } catch (error) {
    logger.error("Error en action WhatsApp", { error });
    throw new Error(error instanceof Error ? error.message : "Error interno del servidor");
  }
}

export default function WhatsAppDashboard() {
  const data = useLoaderData<LoaderData>();
  const submit = useSubmit();
  const navigation = useNavigation();
  
  const [showDeactivateModal, setShowDeactivateModal] = useState(false);
  const [showNoNumbersModal, setShowNoNumbersModal] = useState(false);

  const isActivating = navigation.state === "submitting" && 
                      navigation.formData?.get("actionType") === "activate_whatsapp";
  const isDeactivating = navigation.state === "submitting" && 
                        navigation.formData?.get("actionType") === "deactivate_whatsapp";

  const handleActivateWhatsApp = async () => {
    const formData = new FormData();
    formData.append("actionType", "activate_whatsapp");
    const response = await fetch("/api/whatsapp-activate", {
      method: "post",
      body: formData,
    });
    const data = await response.json();
    if (data?.error === "NO_WHATSAPP_NUMBER_AVAILABLE") {
      setShowNoNumbersModal(true);
    } else if (data?.success) {
      window.location.reload();
    }
  };

  const handleDeactivateWhatsApp = () => {
    const formData = new FormData();
    formData.append("actionType", "deactivate_whatsapp");
    submit(formData, { method: "post" });
    setShowDeactivateModal(false);
  };

  const canActivateWhatsApp = Boolean(
    data.shop.subscriptionPlan && data.shop.subscriptionPlan !== "FREE"
  );

  const phoneNumber = data.assignedNumber?.phoneNumber || "";

  // Loading completo cuando está activando
  if (isActivating) {
    return (
      <div style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "16px",
        background: "#ffffff"
      }}>
        <Spinner accessibilityLabel="Configurando WhatsApp..." size="large" />
        <Text variant="headingSm" as="p">
          Configurando WhatsApp Business para {data.shop.storeName}
        </Text>
      </div>
    );
  }

  return (
    <Page
      title="🌐 WhatsApp Business"
      subtitle="Atención automática con inteligencia artificial"
      primaryAction={
        data.assignedNumber ? {
          content: "Desconectar",
          destructive: true,
          onAction: () => setShowDeactivateModal(true),
          loading: isDeactivating,
        } : {
          content: "Conectar WhatsApp",
          disabled: !canActivateWhatsApp,
          onAction: handleActivateWhatsApp,
        }
      }
    >
      
      <Layout>
        <Layout.Section>
          <BlockStack gap="500">
            {/* Banner de Upgrade si es necesario */}
            {!canActivateWhatsApp && (
              <Banner
                title="Plan requerido"
                tone="info"
                action={{
                  content: "Ver planes",
                  url: "/app/pricing",
                }}
              >
                <p>
                  Necesitas un plan BASIC o superior para WhatsApp Business.
                </p>
              </Banner>
            )}

            {/* Estado Principal */}
            {data.assignedNumber ? (
              // ✅ WHATSAPP CONECTADO - DISEÑO MINIMALISTA
              <Card>
                <BlockStack gap="500">
                  {/* Header simple */}
                  <InlineStack align="space-between" blockAlign="start">
                    <BlockStack gap="200">
                      <Text as="p" variant="headingLg">
                        Conectado para {data.shop.storeName}
                      </Text>
                    </BlockStack>
                    <Badge tone="success">Activo</Badge>
                  </InlineStack>

                  <Divider />

                  {/* Información del número - Layout limpio */}
                  <BlockStack gap="400">
                    <InlineStack gap="400" align="space-between">
                      <BlockStack gap="100">
                        <Text variant="bodySm" as="p" tone="subdued">
                          Número asignado
                        </Text>
                        <Text variant="headingMd" as="p">
                          {data.assignedNumber.phoneNumber}
                        </Text>
                      </BlockStack>
                      <BlockStack gap="100">
                        <Text variant="bodySm" as="p" tone="subdued">
                          Conectado
                        </Text>
                        <Text variant="bodyMd" as="p">
                          {new Date(data.assignedNumber.assignedAt).toLocaleDateString('es-PE')}
                        </Text>
                      </BlockStack>
                    </InlineStack>

                    {/* Sección de acciones - Minimalista */}
                    <Card background="bg-surface-secondary">
                      <BlockStack gap="300">
                        <Text variant="headingSm" as="h3">
                          Número exclusivo
                        </Text>
                        <Text as="p" tone="subdued">
                          Los clientes pueden escribir directamente a este número para recibir atención automatizada.
                        </Text>
                        
                        <InlineStack gap="200">
                          <Button
                            onClick={() => navigator.clipboard.writeText(phoneNumber)}
                            size="medium"
                          >
                            Copiar número
                          </Button>
                          <Button
                            url={`https://wa.me/${phoneNumber.replace(/[^0-9]/g, '')}`}
                            target="_blank"
                            variant="plain"
                            size="medium"
                          >
                            Abrir WhatsApp
                          </Button>
                        </InlineStack>
                      </BlockStack>
                    </Card>
                  </BlockStack>
                </BlockStack>
              </Card>
            ) : (
              // ❌ WHATSAPP NO CONECTADO - DISEÑO MINIMALISTA
              <Card>
                <BlockStack gap="400">
                  <BlockStack gap="200">
                    <Text variant="headingLg" as="h2">
                      Conectate
                    </Text>
                    <Text as="p" tone="subdued">
                      Obtén un número exclusivo para {data.shop.storeName} y brinda atención automática 24/7.
                    </Text>
                  </BlockStack>

                  {canActivateWhatsApp && (
                    <Banner tone="success" title="Servicio disponible">
                      <Text as="p">
                        Tu tienda puede conectar WhatsApp Business ahora.
                      </Text>
                    </Banner>
                  )}

                  <BlockStack gap="300">
                    <Text variant="headingSm" as="h4">
                      Qué incluye:
                    </Text>
                    <BlockStack gap="100">
                      <Text as="p">• Número WhatsApp exclusivo</Text>
                      <Text as="p">• Agente IA personalizado</Text>
                      <Text as="p">• Respuestas automáticas</Text>
                      <Text as="p">• Gestión de pedidos</Text>
                    </BlockStack>
                  </BlockStack>
                </BlockStack>
              </Card>
            )}
          </BlockStack>
        </Layout.Section>
      </Layout>

      {/* Modal de confirmación - Simplificado */}
      <Modal
        open={showDeactivateModal}
        onClose={() => setShowDeactivateModal(false)}
        title="Desconectar WhatsApp"
        primaryAction={{
          content: isDeactivating ? "Desconectando..." : "Desconectar",
          onAction: handleDeactivateWhatsApp,
          destructive: true,
          loading: isDeactivating,
        }}
        secondaryActions={[
          {
            content: "Cancelar",
            onAction: () => setShowDeactivateModal(false),
            disabled: isDeactivating,
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <Text as="p">
              ¿Desconectar el número {phoneNumber} de {data.shop.storeName}?
            </Text>

            <Banner tone="warning" title="Esto desactivará:">
              <BlockStack gap="100">
                <Text as="p">• El número WhatsApp de {data.shop.storeName}</Text>
                <Text as="p">• Las respuestas automáticas</Text>
                <Text as="p">• La atención por IA</Text>
              </BlockStack>
            </Banner>

            <Text as="p" tone="subdued">
              El número estará disponible para otras tiendas. Puedes conectar uno nuevo más tarde.
            </Text>
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* Modal de error: No hay números disponibles */}
      <Modal
        open={showNoNumbersModal}
        onClose={() => setShowNoNumbersModal(false)}
        title="Sin números disponibles"
        primaryAction={undefined}
        secondaryActions={[
          {
            content: "Cerrar",
            onAction: () => setShowNoNumbersModal(false),
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <Text as="p">
              No hay números de WhatsApp disponibles en este momento.<br />
              Por favor, contacta a nuestro equipo de soporte para más información.
            </Text>
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}