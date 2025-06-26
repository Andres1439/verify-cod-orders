// app/routes/app.chatbot.tsx (CORREGIDO)
import type { ActionFunctionArgs } from "@remix-run/node";
import { useState, useEffect } from "react";
import { TitleBar } from "@shopify/app-bridge-react";
import {
  Page,
  Card,
  Layout,
  Text,
  BlockStack,
  TextField,
  Select,
  Tabs,
  Button,
  Icon,
  Banner,
  DataTable,
  Spinner,
  EmptyState,
  InlineStack,
} from "@shopify/polaris";
import {
  SearchIcon,
  CheckIcon,
  InfoIcon,
  ChatIcon,
} from "@shopify/polaris-icons";
import { json } from "@remix-run/node";
import {
  useLoaderData,
  useNavigation,
  useSubmit,
  useActionData,
} from "@remix-run/react";
import { authenticate } from "../shopify.server";
import db from "../db.server";

/*
 * Loader para obtener datos iniciales
 */
export const loader = async ({ request }: { request: Request }) => {
  const { session } = await authenticate.admin(request);

  // Primero obtener la tienda
  const shop = await db.shop.findUnique({
    where: {
      shop_domain: session.shop,
    },
  });

  if (!shop) {
    return json({
      chatbotConfig: {
        bot_name: "",
        welcome_message: "",
        is_active: true,
      },
      tickets: [],
    });
  }

  // Obtener la configuración del chatbot
  const chatbotConfig = (await db.chatbotConfiguration.findFirst({
    where: {
      shop_id: shop.id,
    },
  })) || {
    bot_name: "",
    welcome_message: "",
    is_active: true,
  };

  // Obtener los tickets de la base de datos
  const tickets = await db.ticket.findMany({
    where: {
      shop_id: shop.id,
    },
    orderBy: {
      created_at: "desc",
    },
    select: {
      id: true,
      customer_email: true,
      subject: true,
      status: true,
      created_at: true,
      message: true,
    },
  });

  // Transformar los tickets al formato esperado por la interfaz
  const formattedTickets = tickets.map((ticket) => ({
    id: ticket.id,
    customer: ticket.customer_email,
    email: ticket.customer_email,
    reason: ticket.subject,
    date: ticket.created_at.toISOString().split("T")[0],
    status: ticket.status,
  }));

  return json({
    chatbotConfig,
    tickets: formattedTickets,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const action = formData.get("action");

  console.log("🔧 Action recibida:", action);

  // Obtener la tienda
  const shop = await db.shop.findUnique({
    where: {
      shop_domain: session.shop,
    },
  });

  if (!shop) {
    console.log("❌ Tienda no encontrada:", session.shop);
    return json(
      { success: false, error: "Tienda no encontrada" },
      { status: 404 },
    );
  }

  console.log("✅ Tienda encontrada:", shop.id);

  if (action === "updateChatbotConfig") {
    const botName = formData.get("botName") ?? "";
    const welcomeMessage = formData.get("welcomeMessage") ?? "";
    const isActive = formData.get("isActive") === "true";

    console.log("💾 Guardando configuración:", {
      botName,
      welcomeMessage: welcomeMessage.toString().substring(0, 50) + "...",
      isActive,
    });

    try {
      // Actualizar o crear la configuración del chatbot
      const chatbotConfig = await db.chatbotConfiguration.upsert({
        where: {
          shop_id: shop.id,
        },
        update: {
          bot_name: typeof botName === "string" ? botName : "",
          welcome_message:
            typeof welcomeMessage === "string" ? welcomeMessage : "",
          is_active: isActive,
          updated_at: new Date(),
        },
        create: {
          shop_id: shop.id,
          bot_name: typeof botName === "string" ? botName : "",
          welcome_message:
            typeof welcomeMessage === "string" ? welcomeMessage : "",
          is_active: isActive,
        },
      });

      console.log("✅ Configuración guardada:", chatbotConfig.id);

      return json({
        success: true,
        chatbotConfig,
        message: "Configuración guardada exitosamente",
      });
    } catch (error) {
      console.error("💥 Error al guardar configuración:", error);
      return json({
        success: false,
        error: "Error al guardar la configuración",
      });
    }
  }

  if (action === "updateTicketStatus") {
    const ticketId = formData.get("ticketId");
    const newStatus = formData.get("status");

    if (typeof ticketId === "string" && typeof newStatus === "string") {
      try {
        await db.ticket.update({
          where: {
            id: ticketId,
            shop_id: shop.id, // Verificar que el ticket pertenece a la tienda
          },
          data: {
            status: newStatus as any,
            updated_at: new Date(),
          },
        });

        return json({
          success: true,
          message: "Estado del ticket actualizado",
        });
      } catch (error) {
        console.error("💥 Error al actualizar ticket:", error);
        return json({
          success: false,
          error: "Error al actualizar el ticket",
        });
      }
    }
  }

  return json({ success: false, error: "Acción no válida" });
};

/*
 * Componente principal de la página del chatbot
 */
type LoaderData = {
  chatbotConfig: {
    bot_name: string;
    welcome_message: string;
    is_active: boolean;
  };
  tickets: Array<{
    id: string;
    customer: string;
    email: string;
    reason: string;
    date: string;
    status: string;
  }>;
};

export default function ChatbotPage() {
  // Obtener datos del loader
  const { chatbotConfig, tickets } = useLoaderData<LoaderData>();
  const navigation = useNavigation();
  const submit = useSubmit();
  const actionData = useActionData<any>();

  // Estados del componente
  const [activeTab, setActiveTab] = useState(0);
  const [config, setConfig] = useState({
    bot_name: chatbotConfig.bot_name || "",
    welcome_message: chatbotConfig.welcome_message || "",
    is_active: chatbotConfig.is_active ?? true,
  });
  const [searchQuery, setSearchQuery] = useState("");

  const tabs = [
    {
      id: "configuration",
      content: "Configuración",
      panelID: "configuration-content",
    },
    {
      id: "tickets",
      content: "Tickets",
      panelID: "tickets-content",
    },
  ];

  // ✅ CORRECIÓN: Función de guardado simplificada
  const handleSaveConfig = () => {
    console.log("💾 Enviando configuración:", config);

    const formData = new FormData();
    formData.append("action", "updateChatbotConfig");
    formData.append("botName", config.bot_name);
    formData.append("welcomeMessage", config.welcome_message);
    formData.append("isActive", config.is_active.toString());

    submit(formData, { method: "post" });
  };

  // ✅ Actualizar el estado local cuando se recarga la página
  useEffect(() => {
    setConfig({
      bot_name: chatbotConfig.bot_name || "",
      welcome_message: chatbotConfig.welcome_message || "",
      is_active: chatbotConfig.is_active ?? true,
    });
  }, [chatbotConfig]);

  const toggleBotStatus = () => {
    setConfig((prevConfig) => ({
      ...prevConfig,
      is_active: !prevConfig.is_active,
    }));
  };

  const getStatusBadge = (status: string, ticketId: string) => {
    return (
      <Select
        label=""
        labelHidden
        options={getStatusOptions()}
        value={status}
        onChange={(value) => updateTicketStatus(ticketId, value)}
      />
    );
  };

  const getStatusOptions = () => {
    return [
      { label: "Pendiente", value: "PENDING" },
      { label: "En Progreso", value: "IN_PROGRESS" },
      { label: "Resuelto", value: "RESOLVED" },
      { label: "Cerrado", value: "CLOSED" },
    ];
  };

  const updateTicketStatus = (ticketId: string, newStatus: string) => {
    const formData = new FormData();
    formData.append("action", "updateTicketStatus");
    formData.append("ticketId", ticketId);
    formData.append("status", newStatus);
    submit(formData, { method: "post" });
  };

  const filteredTickets = tickets.filter(
    (ticket) =>
      ticket.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ticket.customer.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ticket.reason.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  // ✅ Estado de guardado basado en navigation
  const isSaving =
    navigation.state === "submitting" &&
    navigation.formData?.get("action") === "updateChatbotConfig";

  return (
    <Page
      title="Chatbot AI"
      subtitle="Configuración y análisis de tu asistente virtual"
    >
      <TitleBar title="Chatbot AI" />

      <Tabs tabs={tabs} selected={activeTab} onSelect={setActiveTab}>
        <Layout>
          {activeTab === 0 && (
            <>
              <Layout.Section>
                <BlockStack gap="400">
                  <Banner
                    title={`Chatbot ${config.is_active ? "activo" : "inactivo"}`}
                    icon={config.is_active ? CheckIcon : InfoIcon}
                    tone={config.is_active ? "success" : "warning"}
                    action={{
                      content: config.is_active ? "Desactivar" : "Activar",
                      onAction: toggleBotStatus,
                    }}
                  >
                    <p>
                      {config.is_active
                        ? "El chatbot está actualmente activo y disponible para tus clientes."
                        : "El chatbot está inactivo y no responderá a los clientes."}
                    </p>
                  </Banner>

                  {/* ✅ Mensajes de resultado mejorados */}
                  {actionData?.success && (
                    <Banner tone="success">
                      <p>{actionData.message || "Operación exitosa"}</p>
                    </Banner>
                  )}

                  {actionData?.error && (
                    <Banner tone="critical">
                      <p>{actionData.error}</p>
                    </Banner>
                  )}

                  <Card>
                    <BlockStack gap="400">
                      <TextField
                        label="Nombre del bot"
                        value={config.bot_name}
                        onChange={(value) =>
                          setConfig((prev) => ({ ...prev, bot_name: value }))
                        }
                        autoComplete="off"
                        helpText="Este nombre aparecerá en el título del chatbot"
                      />
                      <TextField
                        label="Mensaje de bienvenida"
                        value={config.welcome_message}
                        onChange={(value) =>
                          setConfig((prev) => ({
                            ...prev,
                            welcome_message: value,
                          }))
                        }
                        multiline={4}
                        autoComplete="off"
                        helpText="Este será el primer mensaje que vean tus clientes"
                      />
                      <Button
                        variant="primary"
                        loading={isSaving}
                        onClick={handleSaveConfig}
                      >
                        Guardar configuración
                      </Button>
                    </BlockStack>
                  </Card>

                  <Card>
                    <BlockStack gap="400">
                      <InlineStack align="space-between" blockAlign="center">
                        <Text as="h3" variant="headingMd">
                          Tickets recientes
                        </Text>
                        <Button
                          variant="plain"
                          onClick={() => setActiveTab(1)}
                          icon={ChatIcon}
                        >
                          Ver todos los tickets
                        </Button>
                      </InlineStack>
                      {tickets.length === 0 ? (
                        <Text as="p" tone="subdued">
                          No hay tickets aún. Los tickets aparecerán cuando los
                          clientes usen el chatbot.
                        </Text>
                      ) : (
                        <DataTable
                          columnContentTypes={[
                            "text",
                            "text",
                            "text",
                            "text",
                            "text",
                          ]}
                          headings={[
                            "ID",
                            "Cliente",
                            "Motivo",
                            "Fecha",
                            "Estado",
                          ]}
                          rows={tickets
                            .slice(0, 3)
                            .map((ticket) => [
                              ticket.id.substring(0, 8) + "...",
                              ticket.customer,
                              ticket.reason,
                              ticket.date,
                              getStatusBadge(ticket.status, ticket.id),
                            ])}
                        />
                      )}
                    </BlockStack>
                  </Card>
                </BlockStack>
              </Layout.Section>
            </>
          )}

          {activeTab === 1 && (
            <Layout.Section>
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h2" variant="headingMd">
                      Tickets de soporte
                    </Text>
                    <div style={{ width: "300px" }}>
                      <TextField
                        label="Buscar tickets"
                        placeholder="Buscar tickets..."
                        value={searchQuery}
                        onChange={setSearchQuery}
                        prefix={<Icon source={SearchIcon} />}
                        autoComplete="off"
                      />
                    </div>
                  </InlineStack>

                  {navigation.state === "loading" ? (
                    <div style={{ textAlign: "center", padding: "2rem" }}>
                      <Spinner size="large" />
                    </div>
                  ) : filteredTickets.length === 0 ? (
                    <EmptyState
                      heading="No se encontraron tickets"
                      image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                    >
                      <p>Intenta ajustar tu búsqueda o crear un nuevo ticket</p>
                    </EmptyState>
                  ) : (
                    <DataTable
                      columnContentTypes={[
                        "text",
                        "text",
                        "text",
                        "text",
                        "text",
                        "text",
                      ]}
                      headings={[
                        "ID",
                        "Cliente",
                        "Email",
                        "Motivo",
                        "Fecha",
                        "Estado",
                      ]}
                      rows={filteredTickets.map((ticket) => [
                        ticket.id.substring(0, 8) + "...",
                        ticket.customer,
                        ticket.email,
                        ticket.reason,
                        ticket.date,
                        getStatusBadge(ticket.status, ticket.id),
                      ])}
                      pagination={{
                        hasNext: true,
                        onNext: () => {},
                      }}
                    />
                  )}
                </BlockStack>
              </Card>
            </Layout.Section>
          )}
        </Layout>
      </Tabs>
    </Page>
  );
}
