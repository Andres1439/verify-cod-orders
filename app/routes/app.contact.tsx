// app/routes/app.contact.tsx
import { TitleBar } from "@shopify/app-bridge-react";
import {
  Page,
  Card,
  Layout,
  Text,
  BlockStack,
  InlineStack,
  Icon,
  Button,
  Divider,
} from "@shopify/polaris";
import {
  EmailIcon,
  PhoneIcon,
  ChatIcon,
} from "@shopify/polaris-icons";

export default function ContactPage() {
  const handleEmailClick = () => {
    window.open("mailto:victor.minas@unmsm.edu.pe", "_blank");
  };

  const handlePhoneClick = () => {
    window.open("tel:+51982295611", "_blank");
  };

  const handleWhatsAppClick = () => {
    window.open("https://wa.me/51982295611", "_blank");
  };

  return (
    <div style={{ marginBottom: "2rem" }}>
      <Page
        title="👤 Contacto"
        subtitle="Estamos aquí para ayudarte con cualquier consulta"
      >
        <TitleBar title="Verify COD Orders" />

        <Layout>
          {/* Información de contacto principal */}
          <Layout.Section variant="oneHalf">
            <Card>
              <BlockStack gap="400">
                <Text as="h3" variant="headingMd">
                  Información de Contacto
                </Text>

                <Divider />

                {/* Email */}
                <InlineStack gap="150" blockAlign="start">
                  <div style={{ minWidth: "20px", paddingTop: "2px" }}>
                    <Icon source={EmailIcon} tone="subdued" />
                  </div>
                  <BlockStack gap="050">
                    <Text as="p" variant="bodyMd" fontWeight="medium">
                      Correo Electrónico
                    </Text>
                    <Button
                      variant="plain"
                      onClick={handleEmailClick}
                      textAlign="start"
                    >
                      victor.minas@unmsm.edu.pe
                    </Button>
                  </BlockStack>
                </InlineStack>

                {/* Teléfono */}
                <InlineStack gap="150" blockAlign="start">
                  <div style={{ minWidth: "20px", paddingTop: "2px" }}>
                    <Icon source={PhoneIcon} tone="subdued" />
                  </div>
                  <BlockStack gap="050">
                    <Text as="p" variant="bodyMd" fontWeight="medium">
                      Teléfono
                    </Text>
                    <Button
                      variant="plain"
                      onClick={handlePhoneClick}
                      textAlign="start"
                    >
                      +51 982 295 611
                    </Button>
                  </BlockStack>
                </InlineStack>

                {/* WhatsApp */}
                <InlineStack gap="150" blockAlign="start">
                  <div style={{ minWidth: "20px", paddingTop: "2px" }}>
                    <Icon source={ChatIcon} tone="subdued" />
                  </div>
                  <BlockStack gap="050">
                    <Text as="p" variant="bodyMd" fontWeight="medium">
                      WhatsApp
                    </Text>
                    <Button
                      variant="plain"
                      onClick={handleWhatsAppClick}
                      textAlign="start"
                    >
                      +51 982 295 611
                    </Button>
                  </BlockStack>
                </InlineStack>

                {/* Tiempo de respuesta */}
                <div
                  style={{
                    backgroundColor: "#f6f6f7",
                    padding: "16px",
                    borderRadius: "8px",
                    marginTop: "16px",
                  }}
                >
                  <BlockStack gap="200">
                    <Text as="p" variant="bodyMd" fontWeight="medium">
                      💬 Tiempo de Respuesta
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      • Email: Dentro de 24 horas
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued">
                      • WhatsApp: Dentro de 2-4 horas
                    </Text>
                  </BlockStack>
                </div>
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Información adicional */}
          <Layout.Section variant="oneHalf">
            <Card>
              <BlockStack gap="400">
                <Text as="h3" variant="headingMd">
                  ¿Necesitas Ayuda?
                </Text>

                <Text as="p" variant="bodyMd" tone="subdued">
                  Estamos aquí para ayudarte con la configuración de tu chatbot,
                  resolver problemas técnicos, o responder cualquier pregunta
                  sobre nuestros servicios.
                </Text>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                    gap: "16px",
                    marginTop: "16px",
                  }}
                >
                  <Button
                    variant="primary"
                    onClick={handleEmailClick}
                    icon={EmailIcon}
                  >
                    Enviar Email
                  </Button>

                  <Button
                    variant="secondary"
                    onClick={handleWhatsAppClick}
                    icon={ChatIcon}
                  >
                    Escribir por WhatsApp
                  </Button>
                </div>

                <div
                  style={{
                    backgroundColor: "#e3f2fd",
                    padding: "16px",
                    borderRadius: "8px",
                    marginTop: "20px",
                    border: "1px solid #bbdefb",
                  }}
                >
                  <BlockStack gap="200">
                    <Text as="p" variant="bodyMd" fontWeight="medium">
                      🚀 ¿Tienes un problema urgente?
                    </Text>
                    <Text as="p" variant="bodySm">
                      Para problemas críticos que afecten el funcionamiento de
                      tu chatbot, contáctanos por WhatsApp para una respuesta
                      más rápida.
                    </Text>
                  </BlockStack>
                </div>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
      <div style={{ marginTop: '2rem' }}>
        <div style={{
          margin: '2rem auto 0 auto',
          padding: '0.7rem 0.3rem',
          background: '#f6f6f7',
          borderRadius: '12px',
          color: '#6d7175',
          textAlign: 'center',
          fontSize: '0.82rem',
          maxWidth: 600,
          border: '1px solid #e1e3e5',
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
        }}>
          <div style={{ marginBottom: 1 }}>
            © {new Date().getFullYear()} Verify COD Orders
          </div>
          <div style={{ marginBottom: 1 }}>
            <a href="https://andres1439.github.io/verify-cod-orders-legal/privacy_policy.html" target="_blank" rel="noopener noreferrer" style={{ color: '#0077c2', textDecoration: 'underline', margin: '0 0.25rem' }}>
              Política de Privacidad
            </a>
            {" | "}
            <a href="https://andres1439.github.io/verify-cod-orders-legal/terms_of_service.html" target="_blank" rel="noopener noreferrer" style={{ color: '#0077c2', textDecoration: 'underline', margin: '0 0.25rem' }}>
              Términos de Servicio
            </a>
            {" | "}
            <a href="https://andres1439.github.io/verify-cod-orders-legal/faq.html" target="_blank" rel="noopener noreferrer" style={{ color: '#0077c2', textDecoration: 'underline', margin: '0 0.25rem' }}>
              Preguntas Frecuentes (FAQ)
            </a>
          </div>
          <div>
            Soporte: <a href="mailto:victor.minas@unmsm.edu.pe" style={{ color: '#0077c2', textDecoration: 'underline' }}>victor.minas@unmsm.edu.pe</a>
          </div>
        </div>
      </div>
    </div>
  );
}