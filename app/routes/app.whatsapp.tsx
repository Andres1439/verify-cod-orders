// app/routes/app.whatsapp.tsx
import { useState } from "react";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
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
  Spinner,
  CalloutCard,
  Icon,
  ButtonGroup,
  Divider,
} from "@shopify/polaris";
import {
  PhoneIcon,
  ConnectIcon,
  XIcon,
  ExternalIcon,
  CheckCircleIcon,
  ChatIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);

  // Obtener datos usando nuestra API
  const apiUrl = `${process.env.APP_URL || "http://localhost:3000"}/api/whatsapp`;

  try {
    const response = await fetch(apiUrl, {
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        "X-Shopify-Shop-Domain": session.shop,
      },
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.status}`);
    }

    const apiData = await response.json();

    return json({
      success: apiData.success,
      ...apiData.data,
      appUrl: process.env.APP_URL || "http://localhost:3000",
    });
  } catch (error) {
    console.error("Error cargando datos WhatsApp:", error);

    // Fallback: datos básicos desde la sesión
    return json({
      success: false,
      shop: {
        id: null,
        domain: session.shop,
        subscriptionPlan: "BASIC",
      },
      assignedNumber: null,
      whatsappConfig: null,
      statistics: {
        availableNumbers: 0,
        totalNumbers: 0,
        assignedNumbers: 0,
      },
      appUrl: process.env.APP_URL || "http://localhost:3000",
      error: error instanceof Error ? error.message : "Error cargando datos",
    });
  }
}

export default function WhatsAppDashboard() {
  const {
    success,
    shop,
    assignedNumber,
    whatsappConfig,
    statistics,
    appUrl,
    error,
  } = useLoaderData<typeof loader>();

  const fetcher = useFetcher();

  // Estados para UI
  const [isAssigning, setIsAssigning] = useState(false);
  const [showReleaseModal, setShowReleaseModal] = useState(false);

  // Función para asignar número
  const handleAssignNumber = async () => {
    setIsAssigning(true);

    try {
      const response = await fetch("/api/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "assign_number" }),
      });

      const result = await response.json();

      if (result.success) {
        // Recargar página para mostrar el nuevo número
        window.location.reload();
      } else {
        console.error("Error asignando número:", result.error);
        // Aquí podrías mostrar un toast de error
      }
    } catch (error) {
      console.error("Error en la solicitud:", error);
    }

    setIsAssigning(false);
  };

  // Función para liberar número
  const handleReleaseNumber = async () => {
    try {
      const response = await fetch("/api/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "release_number" }),
      });

      const result = await response.json();

      if (result.success) {
        setShowReleaseModal(false);
        window.location.reload();
      } else {
        console.error("Error liberando número:", result.error);
      }
    } catch (error) {
      console.error("Error en la solicitud:", error);
    }
  };

  // Estados y colores
  const serviceStatus = assignedNumber ? "connected" : "disconnected";
  const statusColor = serviceStatus === "connected" ? "success" : "critical";
  const statusText =
    serviceStatus === "connected"
      ? "WhatsApp Conectado"
      : "Sin WhatsApp Activado";
  const canAssignNumber =
    shop.subscriptionPlan && shop.subscriptionPlan !== "FREE";

  return (
    <Page
      title="WhatsApp Business"
      subtitle="Conecta un número temporal de WhatsApp para atender a tus clientes con inteligencia artificial"
      primaryAction={
        assignedNumber ? (
          <ButtonGroup>
            <Button
              variant="primary"
              icon={PhoneIcon}
              url={`https://wa.me/${assignedNumber.phoneNumber.replace("+", "")}`}
              external
              target="_blank"
            >
              Abrir WhatsApp
            </Button>
            <Button 
              tone="critical" 
              icon={XIcon} 
              onClick={() => setShowReleaseModal(true)}
            >
              Liberar Número
            </Button>
          </ButtonGroup>
        ) : (
          <Button
            variant="primary"
            icon={ConnectIcon}
            onClick={handleAssignNumber}
            loading={isAssigning}
            disabled={!canAssignNumber}
          >
            {isAssigning ? "Activando..." : "Activar WhatsApp"}
          </Button>
        )
      }
    >
      <Layout>
        <Layout.Section>
          {/* Banner de Upgrade si es necesario */}
          {!canAssignNumber && (
            <Banner
              title="Upgrade Requerido para WhatsApp Business"
              tone="info"
              action={{
                content: "Ver Planes",
                url: "/app/pricing",
              }}
            >
              <p>
                Necesitas un plan <strong>BASIC</strong> o superior para obtener
                un número temporal de WhatsApp Business con agente de IA integrado.
              </p>
            </Banner>
          )}

          {/* Estado Principal */}
          {assignedNumber ? (
            // Mostrar información del número asignado
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <BlockStack gap="200">
                    <Text variant="headingMd" as="h2">
                      🎉 ¡WhatsApp Business Activado!
                    </Text>
                    <InlineStack gap="200" align="start">
                      <Badge tone={statusColor}>{statusText}</Badge>
                      <Badge tone="success">Agente IA: Activo</Badge>
                      <Badge tone="info">{`Plan: ${shop.subscriptionPlan}`}</Badge>
                    </InlineStack>
                  </BlockStack>
                  <Icon source={CheckCircleIcon} tone="success" />
                </InlineStack>

                <Divider />

                <BlockStack gap="300">
                  <Text variant="headingSm" as="h3">
                    Información de tu Número Temporal
                  </Text>
                  
                  <div style={{ width: "100%" }}>
                    <Layout>
                      <Layout.Section>
                        <BlockStack gap="200">
                          <Text as="p">
                            <strong>📱 Número WhatsApp:</strong>{" "}
                            <Text as="span" variant="bodyLg" tone="subdued">
                              {assignedNumber.phoneNumber}
                            </Text>
                          </Text>
                          <Text as="p">
                            <strong>🌍 País:</strong> {assignedNumber.countryCode}
                          </Text>
                          <Text as="p">
                            <strong>📊 Tipo:</strong> {assignedNumber.numberType}
                          </Text>
                          <Text as="p" tone="subdued">
                            ✅ Activado el:{" "}
                            {new Date(assignedNumber.assignedAt!).toLocaleDateString("es-PE")}
                          </Text>
                        </BlockStack>
                      </Layout.Section>

                      <Layout.Section>
                        <BlockStack gap="200">
                          <Text as="p">
                            <strong>🤖 Agente IA:</strong> Funcionando 24/7
                          </Text>
                          <Text as="p">
                            <strong>💬 Respuestas:</strong> Automáticas
                          </Text>
                          <Text as="p">
                            <strong>⚡ Estado:</strong> <Badge tone="success">Conectado</Badge>
                          </Text>
                          <Text as="p">
                            <strong>💰 Costo:</strong> ${assignedNumber.monthlyCost}/mes
                          </Text>
                        </BlockStack>
                      </Layout.Section>
                    </Layout>
                  </div>
                </BlockStack>

                <Divider />

                <BlockStack gap="300">
                  <Text variant="headingSm" as="h3">
                    🚀 ¿Qué puedes hacer ahora?
                  </Text>
                  
                  <InlineStack gap="200" wrap>
                    <Button
                      icon={ExternalIcon}
                      url={`https://wa.me/${assignedNumber.phoneNumber.replace("+", "")}`}
                      external
                      target="_blank"
                    >
                      Abrir WhatsApp Web
                    </Button>
                    <Button
                      icon={ChatIcon}
                      url={`https://wa.me/${assignedNumber.phoneNumber.replace("+", "")}?text=Hola,%20este%20es%20un%20mensaje%20de%20prueba%20desde%20mi%20tienda`}
                      external
                      target="_blank"
                    >
                      Enviar Mensaje de Prueba
                    </Button>
                  </InlineStack>

                  <Text as="p" tone="subdued">
                    💡 <strong>Tip:</strong> Comparte este número con tus clientes para que puedan hacer pedidos y consultas por WhatsApp. 
                    El agente de IA responderá automáticamente las 24 horas del día.
                  </Text>
                </BlockStack>
              </BlockStack>
            </Card>
          ) : (
            // Mostrar opción para activar WhatsApp
            <CalloutCard
              title="🚀 ¡Activa WhatsApp Business con IA para tu tienda!"
              illustration="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              primaryAction={{
                content: isAssigning ? "Activando..." : "Activar WhatsApp",
                onAction: isAssigning ? undefined : handleAssignNumber,
              }}
            >
              <BlockStack gap="300">
                <Text as="p">
                  Obtén un <strong>número temporal de WhatsApp</strong> para que tus clientes 
                  puedan contactarte directamente. Incluye un agente de inteligencia artificial 
                  que responderá automáticamente a sus consultas las 24 horas del día.
                </Text>

                <BlockStack gap="200">
                  <Text variant="headingSm" as="h4">
                    ✨ ¿Qué incluye tu número temporal?
                  </Text>
                  <InlineStack gap="100" wrap>
                    <Badge tone="info">🤖 Agente IA 24/7</Badge>
                    <Badge tone="info">📱 Número dedicado</Badge>
                    <Badge tone="info">⚡ Respuestas automáticas</Badge>
                    <Badge tone="info">🛍️ Gestión de pedidos</Badge>
                  </InlineStack>
                </BlockStack>

                <BlockStack gap="200">
                  <Text variant="headingSm" as="h4">
                    🎯 Perfecto para:
                  </Text>
                  <Text as="p" tone="subdued">
                    • Recibir consultas de productos<br/>
                    • Gestionar pedidos automáticamente<br/>
                    • Brindar soporte al cliente 24/7<br/>
                    • Aumentar tus ventas por WhatsApp<br/>
                    • Mejorar la experiencia del cliente
                  </Text>
                </BlockStack>

                {canAssignNumber && (
                  <Text as="p" tone="success">
                    📈 <strong>Disponibles:</strong> {statistics.availableNumbers} números listos para asignar
                  </Text>
                )}

                {!canAssignNumber && (
                  <Banner tone="warning" title="🔒 Plan requerido">
                    <p>
                      Necesitas actualizar a un plan <strong>BASIC</strong> o superior 
                      para acceder a WhatsApp Business con IA.
                    </p>
                  </Banner>
                )}
              </BlockStack>
            </CalloutCard>
          )}

          {/* Información adicional */}
          <Card>
            <BlockStack gap="300">
              <Text variant="headingSm" as="h3">
                📋 Información Importante
              </Text>
              
              <div style={{ width: "100%" }}>
                <Layout>
                  <Layout.Section>
                    <BlockStack gap="200">
                      <Text variant="bodyMd" as="h4">
                        🔄 Número Temporal
                      </Text>
                      <Text as="p" tone="subdued">
                        El número asignado es temporal y compartido inteligentemente 
                        entre múltiples tiendas. Nuestro sistema detecta automáticamente 
                        de qué tienda proviene cada mensaje.
                      </Text>
                    </BlockStack>
                  </Layout.Section>

                  <Layout.Section>
                    <BlockStack gap="200">
                      <Text variant="bodyMd" as="h4">
                        🔮 Próximas Actualizaciones
                      </Text>
                      <Text as="p" tone="subdued">
                        En nuestra próxima actualización podrás asociar tu propio 
                        número de WhatsApp Business para tener control total sobre 
                        tu canal de comunicación.
                      </Text>
                    </BlockStack>
                  </Layout.Section>
                </Layout>
              </div>

              <Divider />

              <BlockStack gap="200">
                <Text variant="bodyMd" as="h4">
                  ⚙️ Tecnología Utilizada
                </Text>
                <InlineStack gap="100" wrap>
                  <Badge>WhatsApp Business API</Badge>
                  <Badge>OpenAI Integration</Badge>
                  <Badge>Shopify Sync</Badge>
                  <Badge>Automation Engine</Badge>
                </InlineStack>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>

      {/* Modal de Confirmación para Liberar Número */}
      <Modal
        open={showReleaseModal}
        onClose={() => setShowReleaseModal(false)}
        title="¿Liberar número de WhatsApp?"
        primaryAction={{
          content: "Liberar Número",
          onAction: handleReleaseNumber,
          destructive: true,
        }}
        secondaryActions={[
          {
            content: "Cancelar",
            onAction: () => setShowReleaseModal(false),
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <Text as="p">
              ¿Estás seguro de que quieres liberar el número{" "}
              <strong>{assignedNumber?.phoneNumber}</strong>?
            </Text>

            <Banner tone="warning" title="⚠️ Importante">
              <BlockStack gap="100">
                <Text as="p">• Perderás acceso a este número inmediatamente</Text>
                <Text as="p">• Los clientes no podrán contactarte por WhatsApp</Text>
                <Text as="p">• El agente de IA se desactivará</Text>
                <Text as="p">• El número volverá al pool disponible</Text>
                <Text as="p">• Puedes obtener un nuevo número más tarde</Text>
              </BlockStack>
            </Banner>

            <Text as="p" tone="subdued">
              Esta acción no se puede deshacer, pero puedes obtener un nuevo
              número cuando quieras.
            </Text>
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* Loading Overlay */}
      {fetcher.state === "submitting" && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <Card>
            <div style={{ padding: "20px", textAlign: "center" }}>
              <Spinner size="large" />
              <Text variant="headingSm" as="p">
                Procesando...
              </Text>
            </div>
          </Card>
        </div>
      )}
    </Page>
  );
}