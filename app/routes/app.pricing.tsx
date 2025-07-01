import {
  Card,
  Layout,
  List,
  Page,
  Text,
  BlockStack,
  Button,
  Badge,
  InlineStack,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";

export default function Pricing() {
  return (
    <Page>
      <TitleBar title="Planes de Suscripción" />
      <div
        style={{
          maxWidth: "1200px",
          margin: "2rem auto",
          padding: "0 2rem",
          marginBottom: "3rem",
        }}
      >
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="600">
                <div style={{ textAlign: "center" }}>
                  <Text as="h1" variant="headingXl">
                    Elige el plan perfecto para tu negocio
                  </Text>
                  <Text as="p" variant="bodyLg" tone="subdued">
                    Potencia tu atención al cliente con nuestro chatbot AI
                    inteligente
                  </Text>
                </div>

                <Layout>
                  {/* Plan Free */}
                  <Layout.Section variant="oneThird">
                    <Card>
                      <BlockStack gap="400">
                        <div style={{ textAlign: "center" }}>
                          <Text as="h3" variant="headingLg">
                            Free
                          </Text>
                          <Text as="p" variant="bodyMd" tone="subdued">
                            Perfecto para empezar
                          </Text>
                        </div>

                        <div style={{ textAlign: "center" }}>
                          <Text as="p" variant="heading2xl">
                            $0
                            <Text as="span" variant="bodyMd">
                              {" "}
                              / mes
                            </Text>
                          </Text>
                          <Text as="p" variant="bodySm" tone="subdued">
                            Para siempre
                          </Text>
                        </div>

                        <List>
                          <List.Item>Hasta 50 tickets por mes</List.Item>
                          <List.Item>
                            Funcionalidades básicas del chatbot
                          </List.Item>
                          <List.Item>Configuración limitada</List.Item>
                          <List.Item>Soporte por email</List.Item>
                          <List.Item>Almacenamiento básico</List.Item>
                        </List>

                        <Button fullWidth>Comenzar Gratis</Button>
                      </BlockStack>
                    </Card>
                  </Layout.Section>

                  {/* Plan Básico */}
                  <Layout.Section variant="oneThird">
                    <Card>
                      <BlockStack gap="400">
                        <div style={{ textAlign: "center" }}>
                          <InlineStack align="center" gap="200">
                            <Text as="h3" variant="headingLg">
                              Básico
                            </Text>
                            <Badge tone="info">Más Popular</Badge>
                          </InlineStack>
                          <Text as="p" variant="bodyMd" tone="subdued">
                            Todas las funcionalidades esenciales
                          </Text>
                        </div>

                        <div style={{ textAlign: "center" }}>
                          <Text as="p" variant="heading2xl">
                            $10
                            <Text as="span" variant="bodyMd">
                              {" "}
                              / mes
                            </Text>
                          </Text>
                          <Text as="p" variant="bodySm" tone="subdued">
                            Facturación mensual
                          </Text>
                        </div>

                        <List>
                          <List.Item>Tickets ilimitados</List.Item>
                          <List.Item>
                            Verificación de pedidos completa
                          </List.Item>
                          <List.Item>
                            Configuración avanzada del chatbot
                          </List.Item>
                          <List.Item>Métricas y reportes básicos</List.Item>
                          <List.Item>Soporte por chat</List.Item>
                          <List.Item>Personalización de mensajes</List.Item>
                          <List.Item>
                            Integración completa con Shopify
                          </List.Item>
                        </List>

                        <Button variant="primary" fullWidth>
                          Seleccionar Plan
                        </Button>
                      </BlockStack>
                    </Card>
                  </Layout.Section>

                  {/* Plan Pro */}
                  <Layout.Section variant="oneThird">
                    <Card>
                      <BlockStack gap="400">
                        <div style={{ textAlign: "center" }}>
                          <InlineStack align="center" gap="200">
                            <Text as="h3" variant="headingLg">
                              Pro
                            </Text>
                            <Badge tone="success">Premium</Badge>
                          </InlineStack>
                          <Text as="p" variant="bodyMd" tone="subdued">
                            Para negocios que buscan el máximo rendimiento
                          </Text>
                        </div>

                        <div style={{ textAlign: "center" }}>
                          <Text as="p" variant="heading2xl">
                            $50
                            <Text as="span" variant="bodyMd">
                              {" "}
                              / mes
                            </Text>
                          </Text>
                          <Text as="p" variant="bodySm" tone="subdued">
                            Facturación mensual
                          </Text>
                        </div>

                        <List>
                          <List.Item>
                            <strong>Todo del plan Básico, más:</strong>
                          </List.Item>
                          <List.Item>Análisis avanzado con IA</List.Item>
                          <List.Item>Automatizaciones inteligentes</List.Item>
                          <List.Item>Respuestas sugeridas por IA</List.Item>
                          <List.Item>
                            Integración con múltiples canales
                          </List.Item>
                          <List.Item>API personalizada</List.Item>
                          <List.Item>Soporte prioritario 24/7</List.Item>
                          <List.Item>Funcionalidades beta exclusivas</List.Item>
                          <List.Item>Reportes personalizados</List.Item>
                        </List>

                        <Button variant="primary" fullWidth>
                          Seleccionar Plan Pro
                        </Button>
                      </BlockStack>
                    </Card>
                  </Layout.Section>
                </Layout>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </div>
    </Page>
  );
}
