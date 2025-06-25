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
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import {
  ChatIcon,
  CircleLeftIcon,
  OrderIcon,
  PhoneIcon,
  ProductIcon,
  XCircleIcon,
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
    <Page>
      <TitleBar title="Verify COD Orders" />
      <BlockStack gap="500">
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingLg">
              Bienvenido a Verify COD Orders
            </Text>
            <Text as="p" variant="bodyMd">
              Optimiza la gestión de tus pedidos Contra Entrega (COD) y mejora
              la comunicación con tus clientes. Nuestra aplicación te ayuda a
              reducir devoluciones, agilizar el proceso de entrega y obtener
              información valiosa sobre tus operaciones.
            </Text>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="500">
            <Text as="h3" variant="headingMd">
              Acceso Rápido
            </Text>
            <Grid>
              <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}>
                <Button
                  fullWidth
                  size="large"
                  variant="primary"
                  url="/app/chatbot"
                  icon={ChatIcon}
                >
                  Chatbot
                </Button>
              </Grid.Cell>

              <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}>
                <Button
                  fullWidth
                  size="large"
                  variant="primary"
                  url="/app/pricing"
                  icon={XCircleIcon}
                >
                  Planes
                </Button>
              </Grid.Cell>
            </Grid>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="500">
            <Text as="h3" variant="headingMd">
              Características Clave
            </Text>
            <Grid>
              <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}>
                <BlockStack gap="200">
                  <Icon source={CircleLeftIcon} tone="base" />
                  <Text as="h4" variant="headingSm">
                    Análisis e Informes
                  </Text>
                  <Text as="p" variant="bodyMd">
                    Accede a métricas clave para entender el rendimiento de tus
                    operaciones COD.
                  </Text>
                </BlockStack>
              </Grid.Cell>

              <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}>
                <BlockStack gap="200">
                  <Icon source={ChatIcon} tone="base" />
                  <Text as="h4" variant="headingSm">
                    Chatbot de Soporte
                  </Text>
                  <Text as="p" variant="bodyMd">
                    Utiliza un chatbot para responder preguntas frecuentes y
                    gestionar tickets de clientes.
                  </Text>
                </BlockStack>
              </Grid.Cell>

              <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}>
                <BlockStack gap="200">
                  <Icon source={PhoneIcon} tone="base" />
                  <Text as="h4" variant="headingSm">
                    Llamadas con IA
                  </Text>
                  <Text as="p" variant="bodyMd">
                    Permite la verificación automática de pedidos mediante
                    llamadas potenciadas por inteligencia artificial.
                  </Text>
                </BlockStack>
              </Grid.Cell>

              <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}>
                <BlockStack gap="200">
                  <Icon
                    source={ChatIcon} // Reutilizando ChatIcon
                    tone="base"
                  />
                  <Text as="h4" variant="headingSm">
                    Atención por WhatsApp
                  </Text>
                  <Text as="p" variant="bodyMd">
                    Ofrece a tus clientes la opción de interactuar y verificar
                    pedidos directamente por WhatsApp.
                  </Text>
                </BlockStack>
              </Grid.Cell>
            </Grid>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}

<>
  <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}>
    <Button
      fullWidth
      size="large"
      variant="primary"
      url="/app/productos"
      icon={ProductIcon}
    >
      Productos
    </Button>
  </Grid.Cell>
  <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 6, lg: 6, xl: 6 }}>
    <Button
      fullWidth
      size="large"
      variant="primary"
      url="/app/ordenes"
      icon={OrderIcon}
    >
      Órdenes
    </Button>
  </Grid.Cell>
</>;
