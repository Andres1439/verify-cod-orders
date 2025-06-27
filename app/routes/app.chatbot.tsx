// app/routes/app.chatbot.tsx (ACTUALIZADO CON MODAL)
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
  Modal,
  Badge,
} from "@shopify/polaris";
import {
  SearchIcon,
  CheckIcon,
  InfoIcon,
  ChatIcon,
  ViewIcon,
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
  const url = new URL(request.url);

  // Parámetros de paginación
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = 15; // Máximo 15 tickets por página
  const skip = (page - 1) * limit;

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
      pagination: {
        currentPage: 1,
        totalPages: 0,
        totalTickets: 0,
        hasNext: false,
        hasPrev: false,
      },
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

  // Obtener el total de tickets para paginación
  const totalTickets = await db.ticket.count({
    where: {
      shop_id: shop.id,
    },
  });

  // Obtener los tickets con paginación
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
      customerName: true,
      customerPhone: true,
      subject: true,
      message: true,
      status: true,
      created_at: true,
    },
    skip: skip,
    take: limit,
  });

  // Transformar los tickets al formato esperado por la interfaz
  const formattedTickets = tickets.map((ticket) => ({
    id: ticket.id,
    customerName: ticket.customerName || "Sin nombre",
    customerEmail: ticket.customer_email,
    customerPhone: ticket.customerPhone || "Sin teléfono",
    subject: ticket.subject,
    message: ticket.message,
    date: ticket.created_at.toLocaleDateString(),
    status: ticket.status,
  }));

  // Calcular información de paginación
  const totalPages = Math.ceil(totalTickets / limit);
  const pagination = {
    currentPage: page,
    totalPages,
    totalTickets,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };

  return json({
    chatbotConfig,
    tickets: formattedTickets,
    pagination,
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
    customerName: string;
    customerEmail: string;
    customerPhone: string;
    subject: string;
    message: string;
    date: string;
    status: string;
  }>;
  pagination: {
    currentPage: number;
    totalPages: number;
    totalTickets: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
};

export default function ChatbotPage() {
  // Obtener datos del loader
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { chatbotConfig, tickets, pagination } = useLoaderData<LoaderData>();
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

  // Estados para el modal
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

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

  // ✅ Función para obtener badge de estado
  const getStatusBadge = (status: string) => {
    const statusConfig = {
      PENDING: { tone: "warning" as const, text: "Pendiente" },
      IN_PROGRESS: { tone: "info" as const, text: "En Progreso" },
      RESOLVED: { tone: "success" as const, text: "Resuelto" },
      CLOSED: { tone: "attention" as const, text: "Cerrado" },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || {
      tone: "attention" as const,
      text: status,
    };

    return <Badge tone={config.tone}>{config.text}</Badge>;
  };

  // ✅ Función para actualizar estado del ticket en el modal
  const updateTicketStatus = (ticketId: string, newStatus: string) => {
    const formData = new FormData();
    formData.append("action", "updateTicketStatus");
    formData.append("ticketId", ticketId);
    formData.append("status", newStatus);
    submit(formData, { method: "post" });
  };

  // ✅ Función para abrir modal con detalles
  const viewTicketDetails = (ticket: any) => {
    setSelectedTicket(ticket);
    setIsModalOpen(true);
  };

  // ✅ Función para navegar entre páginas
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const goToPage = (page: number) => {
    const url = new URL(window.location.href);
    url.searchParams.set("page", page.toString());
    window.location.href = url.toString();
  };

  // ✅ Función para cerrar modal
  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedTicket(null);
  };

  // ✅ Filtrar tickets solo para búsqueda (no afecta paginación)
  const filteredTickets = tickets.filter(
    (ticket) =>
      ticket.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ticket.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ticket.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ticket.customerEmail.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  // ✅ Estado de guardado basado en navigation
  const isSaving =
    navigation.state === "submitting" &&
    navigation.formData?.get("action") === "updateChatbotConfig";

  return (
    <div style={{ marginBottom: "2rem" }}>
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
                            No hay tickets aún. Los tickets aparecerán cuando
                            los clientes usen el chatbot.
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
                              "Acción",
                            ]}
                            rows={tickets.slice(0, 3).map((ticket) => [
                              ticket.id.substring(0, 6) + "...",
                              ticket.customerName,
                              ticket.subject,
                              ticket.date,
                              <Button
                                key={ticket.id}
                                size="micro"
                                onClick={() => viewTicketDetails(ticket)}
                                icon={ViewIcon}
                              >
                                Ver detalles
                              </Button>,
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
                        Tickets de soporte ({tickets.length})
                      </Text>
                      <div style={{ width: "300px" }}>
                        <TextField
                          label="Buscar tickets"
                          placeholder="Buscar por ID, cliente, motivo..."
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
                        <p>
                          {tickets.length === 0
                            ? "No hay tickets aún. Los tickets aparecerán cuando los clientes usen el chatbot."
                            : "Intenta ajustar tu búsqueda para encontrar tickets"}
                        </p>
                      </EmptyState>
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
                          "Acción",
                        ]}
                        rows={filteredTickets.map((ticket) => [
                          ticket.id.substring(0, 6) + "...",
                          ticket.customerName,
                          ticket.subject,
                          ticket.date,
                          <Button
                            key={ticket.id}
                            size="micro"
                            onClick={() => viewTicketDetails(ticket)}
                            icon={ViewIcon}
                          >
                            Ver detalles
                          </Button>,
                        ])}
                      />
                    )}
                  </BlockStack>
                </Card>
              </Layout.Section>
            )}
          </Layout>
        </Tabs>

        {/* ✅ MODAL PARA VER DETALLES DEL TICKET */}
        <Modal
          open={isModalOpen}
          onClose={closeModal}
          title="Detalles del Ticket"
          primaryAction={{
            content: "Cerrar",
            onAction: closeModal,
          }}
          size="large"
        >
          <Modal.Section>
            {selectedTicket && (
              <BlockStack gap="400">
                {/* ID del ticket */}
                <InlineStack gap="200" blockAlign="center">
                  <Text as="h3" variant="headingMd">
                    ID: {selectedTicket.id}
                  </Text>
                  {getStatusBadge(selectedTicket.status)}
                </InlineStack>

                {/* Información del cliente */}
                <Card>
                  <BlockStack gap="200">
                    <Text as="h4" variant="headingMd">
                      Información del Cliente
                    </Text>
                    <InlineStack gap="200">
                      <Text as="dt" variant="bodyMd" tone="subdued">
                        Nombre:
                      </Text>
                      <Text as="dd" variant="bodyMd">
                        {selectedTicket.customerName}
                      </Text>
                    </InlineStack>
                    <InlineStack gap="200">
                      <Text as="dt" variant="bodyMd" tone="subdued">
                        Email:
                      </Text>
                      <Text as="dd" variant="bodyMd">
                        {selectedTicket.customerEmail}
                      </Text>
                    </InlineStack>
                    <InlineStack gap="200">
                      <Text as="dt" variant="bodyMd" tone="subdued">
                        Teléfono:
                      </Text>
                      <Text as="dd" variant="bodyMd">
                        {selectedTicket.customerPhone}
                      </Text>
                    </InlineStack>
                  </BlockStack>
                </Card>

                {/* Información del ticket */}
                <Card>
                  <BlockStack gap="200">
                    <Text as="h4" variant="headingMd">
                      Información del Ticket
                    </Text>
                    <InlineStack gap="200">
                      <Text as="dt" variant="bodyMd" tone="subdued">
                        Motivo:
                      </Text>
                      <Text as="dd" variant="bodyMd">
                        {selectedTicket.subject}
                      </Text>
                    </InlineStack>
                    <InlineStack gap="200">
                      <Text as="dt" variant="bodyMd" tone="subdued">
                        Fecha:
                      </Text>
                      <Text as="dd" variant="bodyMd">
                        {selectedTicket.date}
                      </Text>
                    </InlineStack>
                    <BlockStack gap="200">
                      <Text as="dt" variant="bodyMd" tone="subdued">
                        Mensaje completo:
                      </Text>
                      <div
                        style={{
                          backgroundColor: "#f6f6f7",
                          padding: "12px",
                          borderRadius: "8px",
                          maxHeight: "200px",
                          overflowY: "auto",
                        }}
                      >
                        <Text as="dd" variant="bodyMd">
                          {selectedTicket.message}
                        </Text>
                      </div>
                    </BlockStack>
                  </BlockStack>
                </Card>

                {/* Cambiar estado */}
                <Card>
                  <BlockStack gap="200">
                    <Text as="h4" variant="headingMd">
                      Cambiar Estado
                    </Text>
                    <div style={{ width: "200px" }}>
                      <Select
                        label="Estado del ticket"
                        options={[
                          { label: "Pendiente", value: "PENDING" },
                          { label: "En Progreso", value: "IN_PROGRESS" },
                          { label: "Resuelto", value: "RESOLVED" },
                          { label: "Cerrado", value: "CLOSED" },
                        ]}
                        value={selectedTicket.status}
                        onChange={(value) => {
                          updateTicketStatus(selectedTicket.id, value);
                          setSelectedTicket({
                            ...selectedTicket,
                            status: value,
                          });
                        }}
                      />
                    </div>
                  </BlockStack>
                </Card>
              </BlockStack>
            )}
          </Modal.Section>
        </Modal>
      </Page>
    </div>
  );
}
