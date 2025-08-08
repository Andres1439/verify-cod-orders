import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import {
  Page,
  Card,
  Layout,
  Text,
  BlockStack,
  Button,
  Banner,
  List,
  InlineStack,
  Icon,
  Divider,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import {
  SettingsIcon,
  ViewIcon,
  CheckIcon,
  InfoIcon,
} from "@shopify/polaris-icons";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const { shop } = session;

  // Construir deep link mejorado al theme editor
  // Este URL abre directamente la sección de App embeds con el chatbot preseleccionado
  const apiKey = '950673910c321ccfd22148631248c96c'; // Tu API key del shopify.app.toml
  const themeEditorUrl = `https://${shop}/admin/themes/current/editor?context=apps&template=index&activateAppId=${apiKey}/chatbot-verify&target=body`;
  
  // URL alternativo para abrir directamente App embeds
  const appEmbedsUrl = `https://${shop}/admin/themes/current/editor?template=index&addAppBlockId=chatbot-verify/chatbot&target=body`;

  return json({
    shop,
    themeEditorUrl,
    appEmbedsUrl,
  });
};

export default function SetupPage() {
  const { shop, themeEditorUrl } = useLoaderData<typeof loader>();

  const handleOpenThemeEditor = () => {
    // Abrir en nueva ventana/tab
    window.open(themeEditorUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <Page>
      <TitleBar title="Configuración del Widget" />
      
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingLg" as="h2">
                🚀 Activar el Widget de Verify COD Orders
              </Text>
              
              <Banner tone="info">
                <Text as="p">
                  Para que el widget de verificación COD aparezca en tu tienda, 
                  necesitas activarlo en el editor de temas de Shopify.
                </Text>
              </Banner>

              <Divider />

              <BlockStack gap="300">
                <Text variant="headingMd" as="h3">
                  📋 Instrucciones paso a paso:
                </Text>
                
                <List type="number">
                  <List.Item>
                    Haz clic en el botón "Abrir Editor de Temas" abajo
                  </List.Item>
                  <List.Item>
                    En el editor, busca la sección "App embeds" en el panel izquierdo
                  </List.Item>
                  <List.Item>
                    Encuentra "Chatbot (Verify App)" y actívalo
                  </List.Item>
                  <List.Item>
                    Configura la posición y tema del chatbot según tus preferencias
                  </List.Item>
                  <List.Item>
                    Haz clic en "Guardar" para aplicar los cambios
                  </List.Item>
                </List>
              </BlockStack>

              <Divider />

              <InlineStack align="center">
                <Button
                  variant="primary"
                  size="large"
                  onClick={handleOpenThemeEditor}
                  icon={SettingsIcon}
                >
                  Abrir Editor de Temas
                </Button>
              </InlineStack>

              <Banner tone="success">
                <BlockStack gap="200">
                  <Text variant="headingMd" as="h4">
                    ✅ ¿Qué sucede después?
                  </Text>
                  <List>
                    <List.Item>
                      El widget aparecerá en todas las páginas de tu tienda
                    </List.Item>
                    <List.Item>
                      Los clientes podrán hacer consultas sobre sus pedidos COD
                    </List.Item>
                    <List.Item>
                      Puedes personalizar el mensaje de bienvenida desde la sección "Chatbot"
                    </List.Item>
                  </List>
                </BlockStack>
              </Banner>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between">
                <Text variant="headingMd" as="h3">
                  🎨 Personalización
                </Text>
                <Icon source={ViewIcon} />
              </InlineStack>
              
              <Text as="p">
                Una vez activado el widget, puedes:
              </Text>
              
              <List>
                <List.Item>Cambiar el nombre del bot</List.Item>
                <List.Item>Personalizar el mensaje de bienvenida</List.Item>
                <List.Item>Configurar campos requeridos</List.Item>
                <List.Item>Ajustar la posición y tema</List.Item>
              </List>

              <Button url="/app/chatbot" variant="plain">
                Ir a Configuración del Chatbot →
              </Button>
            </BlockStack>
          </Card>

          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between">
                <Text variant="headingMd" as="h3">
                  📞 Verificación COD
                </Text>
                <Icon source={CheckIcon} />
              </InlineStack>
              
              <Text as="p">
                El sistema también incluye:
              </Text>
              
              <List>
                <List.Item>Llamadas automáticas de verificación</List.Item>
                <List.Item>Confirmación por DTMF (1 = Sí, 2 = No)</List.Item>
                <List.Item>Actualización automática en Shopify</List.Item>
                <List.Item>Monitoreo en tiempo real</List.Item>
              </List>

              <Button url="/app" variant="plain">
                Ver Dashboard →
              </Button>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
