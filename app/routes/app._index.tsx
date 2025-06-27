//app._index.tsx
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";

import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Text,
  Card,
  Button,
  BlockStack,
  Grid,
  Icon,
  InlineStack,
  Badge,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import {
  ChatIcon,
  ChartVerticalIcon,
  OrderIcon,
  PhoneIcon,
  ProductIcon,
  XCircleIcon,
  CheckIcon,
} from "@shopify/polaris-icons";

// ===========================================================================
// LOADER DEFINITIVO CON TIPOS DE TYPESCRIPT
// ===========================================================================
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const { shop, accessToken } = session;

  let shopData = await db.shop.findUnique({
    where: { shop_domain: shop },
  });

  if (!shopData) {
    shopData = await db.shop.create({
      data: {
        shop_domain: shop,
        access_token: accessToken,
        chatbot_configuration: { create: {} },
      },
    });
  }

  return json({ shop: shopData });
};

// ===========================================================================
// TU COMPONENTE FINAL CON TIPOS DE TYPESCRIPT
// ===========================================================================
export default function IndexPage() {
  useLoaderData<typeof loader>();

  return (
    <div style={{ marginBottom: "2rem" }}>
      <Page>
        <TitleBar title="Verify COD Orders" />
        <BlockStack gap="600">
          {/* Hero Section */}
          <Card>
            <div
              style={{
                background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                borderRadius: "12px",
                padding: "3rem 2rem",
                color: "white",
                textAlign: "center",
              }}
            >
              <BlockStack gap="400">
                <div>
                  <Text as="h1" variant="headingXl" tone="inherit">
                    ¡Bienvenido a Verify COD Orders! 🚀
                  </Text>
                  <div style={{ marginTop: "1rem" }}>
                    <Text as="p" variant="bodyLg" tone="inherit">
                      La solución completa para optimizar tus pedidos Contra
                      Entrega con IA
                    </Text>
                  </div>
                </div>

                <InlineStack align="center" gap="400">
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <Icon source={CheckIcon} tone="inherit" />
                    <Text as="span" variant="bodyMd" tone="inherit">
                      Reduce devoluciones
                    </Text>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <Icon source={CheckIcon} tone="inherit" />
                    <Text as="span" variant="bodyMd" tone="inherit">
                      Automatiza procesos
                    </Text>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <Icon source={CheckIcon} tone="inherit" />
                    <Text as="span" variant="bodyMd" tone="inherit">
                      Mejora experiencia
                    </Text>
                  </div>
                </InlineStack>
              </BlockStack>
            </div>
          </Card>

          {/* Quick Access Section */}
          <Card>
            <BlockStack gap="500">
              <div style={{ textAlign: "center" }}>
                <Text as="h2" variant="headingLg">
                  🎯 Acceso Rápido
                </Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  Gestiona tu negocio desde un solo lugar
                </Text>
              </div>

              <Grid>
                <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
                  <Card>
                    <div style={{ padding: "1.5rem", textAlign: "center" }}>
                      <BlockStack gap="300">
                        <div
                          style={{
                            background: "#e8f5e8",
                            borderRadius: "50%",
                            width: "60px",
                            height: "60px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            margin: "0 auto",
                          }}
                        >
                          <Icon source={ChatIcon} tone="success" />
                        </div>
                        <Text as="h3" variant="headingMd">
                          Chatbot AI
                        </Text>
                        <Text as="p" variant="bodyMd" tone="subdued">
                          Automatiza la atención al cliente 24/7
                        </Text>
                        <Button fullWidth variant="primary" url="/app/chatbot">
                          Configurar
                        </Button>
                      </BlockStack>
                    </div>
                  </Card>
                </Grid.Cell>

                <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
                  <Card>
                    <div style={{ padding: "1.5rem", textAlign: "center" }}>
                      <BlockStack gap="300">
                        <div
                          style={{
                            background: "#e8f4fd",
                            borderRadius: "50%",
                            width: "60px",
                            height: "60px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            margin: "0 auto",
                          }}
                        >
                          <Icon source={XCircleIcon} tone="info" />
                        </div>
                        <Text as="h3" variant="headingMd">
                          WhatsApp
                        </Text>
                        <Text as="p" variant="bodyMd" tone="subdued">
                          Proporciona un número de WhatsApp para contacto
                        </Text>
                        <Button fullWidth url="/app/whatsapp">
                          Integrar
                        </Button>
                      </BlockStack>
                    </div>
                  </Card>
                </Grid.Cell>

                <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
                  <Card>
                    <div style={{ padding: "1.5rem", textAlign: "center" }}>
                      <BlockStack gap="300">
                        <InlineStack align="center" gap="200">
                          <div
                            style={{
                              background: "#fef3e8",
                              borderRadius: "50%",
                              width: "60px",
                              height: "60px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              margin: "0 auto",
                            }}
                          >
                            <Icon source={ProductIcon} tone="warning" />
                          </div>
                          <Badge tone="attention">Próximamente</Badge>
                        </InlineStack>
                        <Text as="h3" variant="headingMd">
                          Productos
                        </Text>
                        <Text as="p" variant="bodyMd" tone="subdued">
                          Gestiona tu catálogo de productos
                        </Text>
                      </BlockStack>
                    </div>
                  </Card>
                </Grid.Cell>

                <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
                  <Card>
                    <div style={{ padding: "1.5rem", textAlign: "center" }}>
                      <BlockStack gap="300">
                        <InlineStack align="center" gap="200">
                          <div
                            style={{
                              background: "#f0e8ff",
                              borderRadius: "50%",
                              width: "60px",
                              height: "60px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              margin: "0 auto",
                            }}
                          >
                            <Icon source={OrderIcon} tone="magic" />
                          </div>
                          <Badge tone="attention">Próximamente</Badge>
                        </InlineStack>
                        <Text as="h3" variant="headingMd">
                          Órdenes
                        </Text>
                        <Text as="p" variant="bodyMd" tone="subdued">
                          Monitorea y gestiona tus pedidos
                        </Text>
                      </BlockStack>
                    </div>
                  </Card>
                </Grid.Cell>
              </Grid>
            </BlockStack>
          </Card>

          {/* Features Section */}
          <Card>
            <BlockStack gap="500">
              <div style={{ textAlign: "center" }}>
                <InlineStack align="center" gap="200">
                  <Text as="h2" variant="headingLg">
                    ⚡ Características Principales
                  </Text>
                  <Badge tone="success">Potenciado por IA</Badge>
                </InlineStack>
                <Text as="p" variant="bodyMd" tone="subdued">
                  Tecnología avanzada para revolucionar tu negocio
                </Text>
              </div>

              <Grid>
                <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}>
                  <Card>
                    <div style={{ padding: "2rem" }}>
                      <BlockStack gap="300">
                        <InlineStack align="space-between">
                          <Icon source={ChartVerticalIcon} tone="success" />
                          <Badge tone="attention">Próximamente</Badge>
                        </InlineStack>
                        <Text as="h3" variant="headingMd">
                          📊 Análisis Inteligente
                        </Text>
                        <Text as="p" variant="bodyMd">
                          Obtén insights profundos sobre el rendimiento de tus
                          operaciones COD con dashboards interactivos y reportes
                          automatizados.
                        </Text>
                        <div
                          style={{
                            background: "#f8fffe",
                            padding: "1rem",
                            borderRadius: "8px",
                            border: "1px solid #e1f5fe",
                          }}
                        >
                          <Text as="p" variant="bodySm" tone="subdued">
                            ✓ Métricas en tiempo real ✓ Predicciones IA ✓
                            Reportes personalizados
                          </Text>
                        </div>
                      </BlockStack>
                    </div>
                  </Card>
                </Grid.Cell>

                <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}>
                  <Card>
                    <div style={{ padding: "2rem" }}>
                      <BlockStack gap="300">
                        <InlineStack align="space-between">
                          <Icon source={ChatIcon} tone="info" />
                          <Badge tone="success">Popular</Badge>
                        </InlineStack>
                        <Text as="h3" variant="headingMd">
                          🤖 Chatbot Inteligente
                        </Text>
                        <Text as="p" variant="bodyMd">
                          Automatiza respuestas, gestiona tickets y brinda
                          soporte 24/7 con nuestro asistente virtual powered by
                          AI.
                        </Text>
                        <div
                          style={{
                            background: "#f0f9ff",
                            padding: "1rem",
                            borderRadius: "8px",
                            border: "1px solid #bfdbfe",
                          }}
                        >
                          <Text as="p" variant="bodySm" tone="subdued">
                            ✓ Respuestas automáticas ✓ Gestión de tickets ✓
                            Personalizable
                          </Text>
                        </div>
                      </BlockStack>
                    </div>
                  </Card>
                </Grid.Cell>

                <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}>
                  <Card>
                    <div style={{ padding: "2rem" }}>
                      <BlockStack gap="300">
                        <InlineStack align="space-between">
                          <Icon source={PhoneIcon} tone="warning" />
                          <Badge tone="info">Activo</Badge>
                        </InlineStack>
                        <Text as="h3" variant="headingMd">
                          📞 Llamadas con IA
                        </Text>
                        <Text as="p" variant="bodyMd">
                          Verifica pedidos automáticamente mediante llamadas
                          inteligentes que entienden y responden como un humano.
                        </Text>
                        <div
                          style={{
                            background: "#f0fdf4",
                            padding: "1rem",
                            borderRadius: "8px",
                            border: "1px solid #bbf7d0",
                          }}
                        >
                          <Text as="p" variant="bodySm" tone="subdued">
                            ✓ Verificación automática ✓ Voz con IA
                          </Text>
                        </div>
                      </BlockStack>
                    </div>
                  </Card>
                </Grid.Cell>

                <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}>
                  <Card>
                    <div style={{ padding: "2rem" }}>
                      <BlockStack gap="300">
                        <InlineStack align="space-between">
                          <Icon source={XCircleIcon} tone="magic" />
                          <Badge tone="info">Activo</Badge>
                        </InlineStack>
                        <Text as="h3" variant="headingMd">
                          💬 Contacto WhatsApp
                        </Text>
                        <Text as="p" variant="bodyMd">
                          Permite a tus clientes contactarte directamente a
                          través de un número de WhatsApp para consultas y
                          verificaciones rápidas.
                        </Text>
                        <div
                          style={{
                            background: "#f0fdf4",
                            padding: "1rem",
                            borderRadius: "8px",
                            border: "1px solid #bbf7d0",
                          }}
                        >
                          <Text as="p" variant="bodySm" tone="subdued">
                            ✓ Número directo ✓ Consultas rápidas ✓ Soporte
                            personalizado
                          </Text>
                        </div>
                      </BlockStack>
                    </div>
                  </Card>
                </Grid.Cell>
              </Grid>
            </BlockStack>
          </Card>
        </BlockStack>
      </Page>
    </div>
  );
}
