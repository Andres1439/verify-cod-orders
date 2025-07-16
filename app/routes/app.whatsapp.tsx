// app/routes/app.whatsapp.tsx - VERSIÓN FINAL LIMPIA
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
  Icon,
  Divider,
  Spinner,
} from "@shopify/polaris";
import {
  CheckCircleIcon,
  StoreIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import db from "../db.server";

// Tipos manuales para evitar problemas con Prisma
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

    // Ahora podemos usar include con la nueva relación
    const shop: any = await db.shop.findUnique({
      where: { shop_domain: session.shop },
      include: {
        chatbot_configuration: true,
        whatsAppNumbers: {
          where: { status: 'ACTIVE' }
        }
      }
    });

    if (!shop) {
      throw new Error("Tienda no encontrada");
    }

    // El número asignado viene de la relación
    const assignedNumber = shop.whatsAppNumbers?.[0] || null;

    const responseData: LoaderData = {
      shop: {
        id: shop.id,
        domain: shop.shop_domain,
        subscriptionPlan: shop.subscription_plan,
        // Forzar usar el dominio transformado en lugar del bot_name "Verify"
        storeName: shop.shop_domain.replace('.myshopify.com', '').replace(/-/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()),
      },
      assignedNumber: assignedNumber ? {
        id: assignedNumber.id,
        phoneNumber: assignedNumber.phone_number,
        displayName: assignedNumber.display_name,
        status: String(assignedNumber.status),
        assignedAt: assignedNumber.updated_at instanceof Date ? assignedNumber.updated_at.toISOString() : String(assignedNumber.updated_at),
        countryCode: assignedNumber.country_code,
        webhookUrl: assignedNumber.webhook_url,
        businessAccountId: assignedNumber.business_account_id,
      } : null,
    };

    return json(responseData);
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("❌ Error cargando datos WhatsApp:", error);
    throw new Error("Error cargando datos de WhatsApp");
  }
}

export async function action({ request }: ActionFunctionArgs) {
  try {
    const { session } = await authenticate.admin(request);
    const formData = await request.formData();
    const actionType = formData.get("actionType") as string;

    const shop: any = await db.shop.findUnique({
      where: { shop_domain: session.shop },
    });

    if (!shop) {
      throw new Error("Tienda no encontrada");
    }

    if (actionType === "activate_whatsapp") {
      if (shop.subscription_plan === 'FREE') {
        throw new Error("Plan BASIC o superior requerido");
      }

      const existingNumber: any = await db.whatsAppNumber.findFirst({
        where: { 
          default_shop_id: shop.id,
          status: 'ACTIVE'
        }
      });

      if (existingNumber) {
        throw new Error("Ya tienes un número WhatsApp asignado");
      }

      const availableInstance: any = await db.whatsAppNumber.findFirst({
        where: { 
          status: 'ACTIVE',
          default_shop_id: null
        },
        orderBy: { created_at: 'asc' }
      });

      if (!availableInstance) {
        throw new Error("No hay números WhatsApp disponibles en este momento");
      }

      await db.whatsAppNumber.update({
        where: { id: availableInstance.id },
        data: { 
          default_shop_id: shop.id,
          updated_at: new Date()
        }
      });

      return redirect("/app/whatsapp");
    }

    if (actionType === "deactivate_whatsapp") {
      const assignedInstance: any = await db.whatsAppNumber.findFirst({
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
          detection_rules: {},
          updated_at: new Date()
        }
      });

      return redirect("/app/whatsapp");
    }

    throw new Error("Acción no válida");
  } catch (error) {
    console.error("Error en action WhatsApp:", error);
    throw new Error(error instanceof Error ? error.message : "Error interno del servidor");
  }
}

export default function WhatsAppDashboard() {
  const data = useLoaderData<LoaderData>();
  const submit = useSubmit();
  const navigation = useNavigation();
  
  const [showDeactivateModal, setShowDeactivateModal] = useState(false);

  const isActivating = navigation.state === "submitting" && 
                      navigation.formData?.get("actionType") === "activate_whatsapp";
  const isDeactivating = navigation.state === "submitting" && 
                        navigation.formData?.get("actionType") === "deactivate_whatsapp";

  const handleActivateWhatsApp = () => {
    const formData = new FormData();
    formData.append("actionType", "activate_whatsapp");
    submit(formData, { method: "post" });
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
  
  const serviceStatus = data.assignedNumber ? "connected" : "disconnected";
  const statusColor = serviceStatus === "connected" ? "success" : "critical";
  const statusText = serviceStatus === "connected" ? "WhatsApp Activo" : "WhatsApp Inactivo";

  // Generar link único para esta tienda
  const generateUniqueLink = () => {
    if (!data.assignedNumber) return null;
    
    const storeName = data.shop.domain.replace('.myshopify.com', '').toLowerCase();
    const cleanNumber = data.assignedNumber.phoneNumber.replace(/[^0-9]/g, '');
    const code = `start_${storeName}`;
    return `https://wa.me/${cleanNumber}?text=${encodeURIComponent(code)}`;
  };

  const uniqueLink = generateUniqueLink();

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
        <Spinner accessibilityLabel="Asignando número WhatsApp..." size="large" />
        <Text variant="headingSm" as="p">
          Asignando número WhatsApp para {data.shop.storeName}...
        </Text>
        <Text as="p" tone="subdued">
          Esto puede tomar unos segundos
        </Text>
      </div>
    );
  }

  return (
    <Page
      title="WhatsApp Business"
      subtitle="Conecta WhatsApp Business con tu tienda y atiende a tus clientes con inteligencia artificial"
      primaryAction={
        data.assignedNumber ? {
          content: "Liberar Número",
          destructive: true,
          onAction: () => setShowDeactivateModal(true),
          loading: isDeactivating,
        } : {
          content: "Asignar Número WhatsApp",
          variant: "primary",
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
                title="Upgrade Requerido para WhatsApp Business"
                tone="info"
                action={{
                  content: "Ver Planes",
                  url: "/app/pricing",
                }}
              >
                <p>
                  Necesitas un plan <strong>BASIC</strong> o superior para acceder a 
                  WhatsApp Business con agente de IA integrado.
                </p>
              </Banner>
            )}

            {/* Estado Principal */}
            {data.assignedNumber ? (
              // ✅ MOSTRAR WHATSAPP ACTIVO CON INFORMACIÓN DE TIENDA
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between">
                    <BlockStack gap="200">
                      <InlineStack gap="200" align="start">
                        <Text variant="headingLg" as="h2">
                          📱 WhatsApp Business - {data.shop.storeName}
                        </Text>
                      </InlineStack>
                      <InlineStack gap="200" align="start">
                        <Badge tone={statusColor}>{statusText}</Badge>
                        <Badge tone="success">Agente IA: Activo</Badge>
                        <Badge tone="info">Respuestas: 24/7</Badge>
                        <Badge tone="attention">Tienda Asignada</Badge>
                      </InlineStack>
                    </BlockStack>
                  </InlineStack>

                  <Divider />

                  {/* Información del Número Asignado */}
                  <BlockStack gap="300">
                    <Text variant="headingMd" as="h3">
                      📞 Información del Número Asignado
                    </Text>
                    
                    <Layout>
                      <Layout.Section>
                        <BlockStack gap="200">
                          <Text as="p">
                            <strong>Número WhatsApp:</strong>{" "}
                            <Text as="span" tone="subdued" variant="bodyLg">
                              {data.assignedNumber.phoneNumber}
                            </Text>
                          </Text>
                          <Text as="p">
                            <strong>Tienda Asignada:</strong>{" "}
                            <Badge>{data.shop.storeName}</Badge>
                          </Text>
                        </BlockStack>
                      </Layout.Section>

                      <Layout.Section>
                        <BlockStack gap="200">
                          <Text as="p">
                            <strong>Estado:</strong> <Badge tone="success">Conectado</Badge>
                          </Text>
                          <Text as="p">
                            <strong>Asignado:</strong> {new Date(data.assignedNumber.assignedAt).toLocaleDateString('es-PE')}
                          </Text>
                        </BlockStack>
                      </Layout.Section>
                    </Layout>
                  </BlockStack>

                  {/* Link Único para esta Tienda */}
                  {uniqueLink && (
                    <>
                      <Divider />
                      <BlockStack gap="300">
                        <Text variant="headingSm" as="h3">
                          🔗 Link Único de tu Tienda
                        </Text>
                        
                        <Banner tone="success" title="¡Tu link personalizado está listo!">
                          <BlockStack gap="200">
                            <Text as="p">
                              Comparte este link único para que los clientes contacten directamente a <strong>{data.shop.storeName}</strong>:
                            </Text>
                            
                            <Card background="bg-surface-secondary">
                              <Text as="p" variant="bodyMd" fontWeight="medium">
                                {uniqueLink}
                              </Text>
                            </Card>
                            
                            <InlineStack gap="200">
                              <Button
                                onClick={() => navigator.clipboard.writeText(uniqueLink)}
                              >
                                📋 Copiar Link
                              </Button>
                              <Button
                                url={uniqueLink}
                                target="_blank"
                                variant="plain"
                              >
                                🧪 Probar Link
                              </Button>
                            </InlineStack>
                          </BlockStack>
                        </Banner>

                        <Text as="p" tone="subdued">
                          💡 <strong>Cómo usar:</strong> Cuando un cliente haga clic en este link, 
                          automáticamente será dirigido a tu tienda específica con el agente IA 
                          configurado para {data.shop.storeName}.
                        </Text>
                      </BlockStack>
                    </>
                  )}
                </BlockStack>
              </Card>
            ) : (
              // ❌ MOSTRAR OPCIÓN PARA ACTIVAR WHATSAPP
              <Card>
                <BlockStack gap="400">
                  <InlineStack gap="200" align="start">
                    <Text variant="headingMd" as="h2">
                      🚀 Activa WhatsApp Business para {data.shop.storeName}
                    </Text>
                  </InlineStack>
                </BlockStack>
                
                <BlockStack gap="300">
                  <Text as="p">
                    Obtén un <strong>número</strong> y brinda atención automática 
                    a tus clientes las 24 horas del día con inteligencia artificial.
                  </Text>

                  {/* Estado del servicio */}
                  {canActivateWhatsApp && (
                    <Banner tone="success" title="🟢 Servicio Disponible">
                      <Text as="p">
                        Tu tienda <strong>{data.shop.storeName}</strong> está elegible para 
                        WhatsApp Business. Al activar obtendrás un link único.
                      </Text>
                    </Banner>
                  )}
                  {!canActivateWhatsApp && (
                    <Banner tone="warning" title="🔒 Plan requerido">
                      <p>
                        Tu tienda <strong>{data.shop.storeName}</strong> necesita actualizar a un plan{" "}
                        <strong>BASIC</strong> o superior para acceder a WhatsApp Business con IA.
                      </p>
                    </Banner>
                  )}

                  <BlockStack gap="200">
                    <Text variant="headingSm" as="h4">
                      ✨ Qué obtendrás al activar
                    </Text>
                    <InlineStack gap="100" wrap>
                      <Badge>🤖 Agente IA personalizado</Badge>
                      <Badge>⚡ Respuestas automáticas 24/7</Badge>
                      <Badge>🛍️ Gestión de pedidos COD</Badge>
                    </InlineStack>
                  </BlockStack>

                  <BlockStack gap="200">
                    <Text variant="headingSm" as="h4">
                      🎯 Perfecto para tu tienda:
                    </Text>
                    <Text as="p" tone="subdued">
                      • Recibir consultas específicas de productos de <strong>{data.shop.storeName}</strong><br/>
                      • Gestionar pedidos con la identidad de tu marca<br/>
                      • Link único para marketing<br/>
                      • Agente IA entrenado con el catálogo de tu tienda
                    </Text>
                  </BlockStack>
                </BlockStack>
              </Card>
            )}
          </BlockStack>
        </Layout.Section>
      </Layout>

      {/* Modal de Confirmación para Liberar Número */}
      <Modal
        open={showDeactivateModal}
        onClose={() => setShowDeactivateModal(false)}
        title={`¿Liberar número WhatsApp de ${data.shop.storeName}?`}
        primaryAction={{
          content: isDeactivating ? "Liberando..." : "Liberar Número",
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
              ¿Estás seguro de que quieres liberar el número WhatsApp{" "}
              <strong>{data.assignedNumber?.phoneNumber || ""}</strong> asignado a{" "}
              <strong>{data.shop.storeName}</strong>?
            </Text>

            <Banner tone="critical" title="⚠️ Esta acción liberará:">
              <BlockStack gap="100">
                <Text as="p">• El número WhatsApp asignado a {data.shop.storeName}</Text>
                <Text as="p">• El agente de IA se desactivará para esta tienda</Text>
                <Text as="p">• El link único dejará de funcionar</Text>
                <Text as="p">• Los clientes no podrán contactar a esta tienda por WhatsApp</Text>
              </BlockStack>
            </Banner>

            <Text as="p" tone="subdued">
              El número estará disponible para ser asignado a otra tienda. Podrás obtener 
              un nuevo número más tarde, pero perderás la configuración actual de{" "}
              <strong>{data.shop.storeName}</strong>.
            </Text>
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}