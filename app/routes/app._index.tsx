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
  ViewIcon,
  EmailIcon,
  SettingsIcon,
} from "@shopify/polaris-icons";
import { encryptToken, decryptToken } from "../utils/encryption.server";

// ===========================================================================
// LOADER DEFINITIVO CON TIPOS DE TYPESCRIPT
// ===========================================================================
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const { shop, accessToken } = session;

  // Cifrar el accessToken antes de guardar
  const encryptedToken = encryptToken(accessToken ?? "");

  let shopData = await db.shop.findUnique({
    where: { shop_domain: shop },
  });

  if (!shopData) {
    shopData = await db.shop.create({
      data: {
        shop_domain: shop,
        access_token: JSON.stringify(encryptedToken),
        chatbot_configuration: { create: {} },
      },
    });
  }

  // Descifrar el accessToken antes de devolverlo (si es necesario)
  let decryptedAccessToken = accessToken ?? "";
  try {
    if (typeof shopData.access_token === "string") {
      const parsed = JSON.parse(shopData.access_token);
      if (parsed.encrypted && parsed.iv && parsed.tag) {
        decryptedAccessToken = decryptToken(parsed);
      }
    }
  } catch (e) {}

  return json({ shop: { ...shopData, access_token: decryptedAccessToken } });
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
                    <div style={{ padding: "1.5rem", textAlign: "center", height: "clamp(260px, 30vh, 300px)", display: "flex", alignItems: "center" }}>
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
                          <Icon source={EmailIcon} tone="success" />
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
                    <div style={{ padding: "1.5rem", textAlign: "center", height: "clamp(260px, 30vh, 300px)", display: "flex", alignItems: "center" }}>
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
                          <Icon source={ChatIcon} tone="info" />
                        </div>
                        <Text as="h3" variant="headingMd">
                          WhatsApp
                        </Text>
                        <Text as="p" variant="bodyMd" tone="subdued">
                          Configura comunicación directa con clientes
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
                    <div style={{ padding: "1.5rem", textAlign: "center", height: "clamp(260px, 30vh, 300px)", display: "flex", alignItems: "center" }}>
                      <BlockStack gap="300">
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
                          <Icon source={ViewIcon} tone="warning" />
                        </div>
                        <Text as="h3" variant="headingMd">
                          Monitoreo de llamadas
                        </Text>
                        <Text as="p" variant="bodyMd" tone="subdued">
                          Supervisa y analiza las llamadas de verificación
                        </Text>
                        <Button fullWidth url="/app/call-monitoring">
                          Monitorear
                        </Button>
                      </BlockStack>
                    </div>
                  </Card>
                </Grid.Cell>

                <Grid.Cell columnSpan={{ xs: 6, sm: 3, md: 3, lg: 3, xl: 3 }}>
                  <Card>
                    <div style={{ padding: "1.5rem", textAlign: "center", height: "clamp(260px, 30vh, 300px)", display: "flex", alignItems: "center" }}>
                      <BlockStack gap="300">
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
                          <Icon source={PhoneIcon} tone="magic" />
                        </div>
                        <Text as="h3" variant="headingMd">
                          Contacto
                        </Text>
                        <Text as="p" variant="bodyMd" tone="subdued">
                          Gestiona la comunicación con tus clientes
                        </Text>
                        <Button fullWidth url="/app/contact">
                          Configurar
                        </Button>
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
                    <div style={{ padding: "2rem", minHeight: "280px", display: "flex", alignItems: "stretch" }}>
                      <div style={{ width: "100%" }}>
                        <BlockStack gap="300">
                          <InlineStack align="space-between">
                            <Icon source={EmailIcon} tone="info" />
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
                            background: "rgb(220, 236, 243)",
                            marginBlock: "1rem",
                            padding: "1rem",
                            borderRadius: "8px",
                            border: "1px solid rgb(175, 197, 207)",
                            }}
                          >
                            <Text as="p" variant="bodySm" tone="subdued">
                              ✓ Respuestas automáticas ✓ Gestión de tickets ✓
                              Personalizable
                            </Text>
                          </div>
                        </BlockStack>
                      </div>
                    </div>
                  </Card>
                </Grid.Cell>

                <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}>
                  <Card>
                    <div style={{ padding: "2rem", minHeight: "280px", display: "flex", alignItems: "stretch" }}>
                      <div style={{ width: "100%" }}>
                        <BlockStack gap="300">
                          <InlineStack align="space-between">
                            <Icon source={ChatIcon} tone="magic" />
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
                            background: "rgb(213, 241, 230)",
                            padding: "1rem",
                            borderRadius: "8px",
                            border: "1px solid gb(213, 241, 230)",
                            }}
                          >
                            <Text as="p" variant="bodySm" tone="subdued">
                              ✓ Número directo ✓ Consultas rápidas ✓ Soporte
                              personalizado
                            </Text>
                          </div>
                        </BlockStack>
                      </div>
                    </div>
                  </Card>
                </Grid.Cell>

                <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}>
                  <Card>
                    <div style={{ padding: "2rem", minHeight: "280px", display: "flex", alignItems: "stretch" }}>
                      <div style={{ width: "100%" }}>
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
                            background: "rgb(224, 236, 196)",
                            padding: "1rem",
                            borderRadius: "8px",
                            border: "1px solid rgb(212, 230, 170)",
                            }}
                          >
                            <Text as="p" variant="bodySm" tone="subdued">
                              ✓ Verificación automática ✓ Voz con IA ✓ Personalización completa
                            </Text>
                          </div>
                        </BlockStack>
                      </div>
                    </div>
                  </Card>
                </Grid.Cell>

                <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}>
                  <Card>
                    <div style={{ padding: "2rem", minHeight: "280px", display: "flex", alignItems: "stretch" }}>
                      <div style={{ width: "100%" }}>
                        <BlockStack gap="300">
                        <InlineStack align="space-between">
                          <Icon source={SettingsIcon} tone="success" />
                          <Badge tone="info">Activo</Badge>
                        </InlineStack>
                        <Text as="h3" variant="headingMd">
                          🔧 Herramientas de Gestión
                        </Text>
                        <Text as="p" variant="bodyMd">
                          Suite completa de herramientas para personalizar tu chatbot,
                          registrar llamadas y gestionar actualizaciones del sistema
                          de manera eficiente.
                        </Text>
                        <div
                          style={{
                            background: "rgb(238, 207, 211)",
                            padding: "1rem",
                            borderRadius: "8px",
                            border: "1px solid rgb(221, 152, 167)",
                          }}
                        >
                          <Text as="p" variant="bodySm" tone="subdued">
                            ✓ Personalización de chatbot ✓ Registro de llamadas ✓
                            Actualizaciones automáticas
                          </Text>
                        </div>
                        </BlockStack>
                      </div>
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
