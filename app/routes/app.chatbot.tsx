// app/routes/app.chatbot.tsx (COMPLETO CON NÚMEROS DE TICKETS REALES)
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
  Checkbox,
} from "@shopify/polaris";
import {
  SearchIcon,
  CheckIcon,
  InfoIcon,
  ChatIcon,
  ViewIcon,
  PersonIcon,
  SettingsIcon,
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
import { logger } from "../utils/logger.server";

// 🎯 FUNCIÓN HELPER PARA NÚMEROS DE TICKET
const getTicketNumber = (ticketId: string): string => {
  if (!ticketId) return "TICKET-INVALID";
  const shortId = ticketId.split("-")[0];
  return `TICKET-${shortId.toUpperCase()}`;
};

const getShortTicketId = (ticketId: string): string => {
  if (!ticketId) return "INVALID";
  return ticketId.split("-")[0].toUpperCase();
};

/*
 * Loader para obtener datos iniciales
 */
export const loader = async ({ request }: { request: Request }) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);

  // Parámetros de paginación
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = 15;
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
        personality: "",
        required_fields: {
          nombre: true,
          numero: false,
          correo: true,
          direccion: false,
          ciudad: false,
          provincia: false,
          pais: false,
        },
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
  const chatbotConfigRaw = await db.chatbotConfiguration.findFirst({
    where: {
      shop_id: shop.id,
    },
  });

  // Configuración por defecto con tipos seguros
  const defaultRequiredFields = {
    nombre: true,
    numero: true, // ✅ SIEMPRE TRUE POR DEFECTO
    correo: true,
    direccion: false,
    ciudad: false,
    provincia: false,
    pais: false,
  };

  const chatbotConfig = {
    bot_name: chatbotConfigRaw?.bot_name || "",
    welcome_message: chatbotConfigRaw?.welcome_message || "",
    personality:
      chatbotConfigRaw?.personality ||
      "Chatbot amigable que usa emojis y responde de manera casual",
    required_fields: chatbotConfigRaw?.required_fields
      ? typeof chatbotConfigRaw.required_fields === "object"
        ? (chatbotConfigRaw.required_fields as Record<string, boolean>)
        : defaultRequiredFields
      : defaultRequiredFields,
    is_active: chatbotConfigRaw?.is_active ?? true,
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

  // 🎯 TRANSFORMAR TICKETS CON NÚMEROS REALES
  const formattedTickets = tickets.map((ticket) => ({
    id: ticket.id,
    ticketNumber: getTicketNumber(ticket.id), // TICKET-9BB77C9F
    shortId: getShortTicketId(ticket.id), // 9BB77C9F
    customerName: ticket.customerName || "Sin nombre",
    customerEmail: ticket.customer_email,
    customerPhone: ticket.customerPhone || "Sin teléfono",
    subject: ticket.subject,
    message: ticket.message,
    date: ticket.created_at.toLocaleDateString("es-ES", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
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

  logger.info("Action recibida en chatbot", { action: action as string });

  // Obtener la tienda
  const shop = await db.shop.findUnique({
    where: {
      shop_domain: session.shop,
    },
  });

  if (!shop) {
    logger.error("Tienda no encontrada", { shop: session.shop });
    return json(
      { success: false, error: "Tienda no encontrada" },
      { status: 404 },
    );
  }

  logger.info("Tienda encontrada", { shopId: shop.id });

  if (action === "updateChatbotConfig") {
    const botName = formData.get("botName") ?? "";
    const welcomeMessage = formData.get("welcomeMessage") ?? "";
    const personality = formData.get("personality") ?? "";
    const isActive = formData.get("isActive") === "true";

    // Obtener campos requeridos del FormData
    const requiredFields = {
      nombre: formData.get("required_nombre") === "true",
      numero: formData.get("required_numero") === "true",
      correo: formData.get("required_correo") === "true",
      direccion: formData.get("required_direccion") === "true",
      ciudad: formData.get("required_ciudad") === "true",
      provincia: formData.get("required_provincia") === "true",
      pais: formData.get("required_pais") === "true",
    };

    logger.info("Guardando configuración del chatbot", {
      shopId: shop.id,
      botName,
      personality,
      requiredFields,
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
          personality: typeof personality === "string" ? personality : "",
          required_fields: requiredFields,
          is_active: isActive,
          updated_at: new Date(),
        },
        create: {
          shop_id: shop.id,
          bot_name: typeof botName === "string" ? botName : "",
          welcome_message:
            typeof welcomeMessage === "string" ? welcomeMessage : "",
          personality: typeof personality === "string" ? personality : "",
          required_fields: requiredFields,
          is_active: isActive,
        },
      });

      logger.info("Configuración guardada", {
        shopId: shop.id,
        configId: chatbotConfig.id,
      });

      return json({
        success: true,
        message: "Configuración actualizada correctamente",
        config: chatbotConfig,
      });
    } catch (error) {
      logger.error("Error guardando configuración", {
        shopId: shop.id,
        error: error instanceof Error ? error.message : "Unknown error",
      });

      return json(
        { success: false, error: "Error al guardar la configuración" },
        { status: 500 },
      );
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
            shop_id: shop.id,
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

  return json({ success: false, error: "Acción no válida" }, { status: 400 });
};

/*
 * Tipos para el componente
 */
type RequiredFields = {
  nombre: boolean;
  numero: boolean;
  correo: boolean;
  direccion: boolean;
  ciudad: boolean;
  provincia: boolean;
  pais: boolean;
};

type LoaderData = {
  chatbotConfig: {
    bot_name: string;
    welcome_message: string;
    personality: string;
    required_fields: RequiredFields;
    is_active: boolean;
  };
  tickets: Array<{
    id: string;
    ticketNumber: string;
    shortId: string;
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
  const { chatbotConfig, tickets } = useLoaderData<LoaderData>();
  const navigation = useNavigation();
  const submit = useSubmit();
  const actionData = useActionData<any>();

  // Estados del componente
  const [activeTab, setActiveTab] = useState(0);
  const [config, setConfig] = useState({
    bot_name: chatbotConfig.bot_name || "",
    welcome_message: chatbotConfig.welcome_message || "",
    personality: chatbotConfig.personality || "",
    required_fields: chatbotConfig.required_fields || {
      nombre: true,
      numero: true, // ✅ INTERNO - NO VISIBLE EN UI
      correo: true,
      direccion: false,
      ciudad: false,
      provincia: false,
      pais: false,
    },
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

  // Función de guardado actualizada
  const handleSaveConfig = () => {
    console.log("💾 Enviando configuración:", config);

    const formData = new FormData();
    formData.append("action", "updateChatbotConfig");
    formData.append("botName", config.bot_name);
    formData.append("welcomeMessage", config.welcome_message);
    formData.append("personality", config.personality);
    formData.append("isActive", config.is_active.toString());

    // Agregar campos requeridos
    Object.entries(config.required_fields).forEach(([field, value]) => {
      // Fuerza "numero" a true siempre
      formData.append(
        `required_${field}`,
        field === "numero" ? "true" : value.toString(),
      );
    });

    submit(formData, { method: "post" });
  };

  // Actualizar el estado local cuando se recarga la página
  useEffect(() => {
    setConfig({
      bot_name: chatbotConfig.bot_name || "",
      welcome_message: chatbotConfig.welcome_message || "",
      personality: chatbotConfig.personality || "",
      required_fields: chatbotConfig.required_fields
        ? {
            ...chatbotConfig.required_fields,
            numero: true, // ✅ ASEGURAR QUE NÚMERO SIEMPRE ESTÉ TRUE
          }
        : {
            nombre: true,
            numero: true, // ✅ SIEMPRE TRUE POR DEFECTO
            correo: true,
            direccion: false,
            ciudad: false,
            provincia: false,
            pais: false,
          },
      is_active: chatbotConfig.is_active ?? true,
    });
  }, [chatbotConfig]);

  const toggleBotStatus = () => {
    setConfig((prevConfig) => ({
      ...prevConfig,
      is_active: !prevConfig.is_active,
    }));
  };

  // Función para manejar cambios en campos requeridos
  const handleRequiredFieldChange = (
    field: keyof RequiredFields,
    checked: boolean,
  ) => {
    setConfig((prevConfig) => ({
      ...prevConfig,
      required_fields: {
        ...prevConfig.required_fields,
        [field]: checked,
        numero: true, // Siempre true
      },
    }));
  };

  // Función para obtener badge de estado
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

  // Función para actualizar estado del ticket en el modal
  const updateTicketStatus = (ticketId: string, newStatus: string) => {
    const formData = new FormData();
    formData.append("action", "updateTicketStatus");
    formData.append("ticketId", ticketId);
    formData.append("status", newStatus);
    submit(formData, { method: "post" });
  };

  // Función para abrir modal con detalles
  const viewTicketDetails = (ticket: any) => {
    setSelectedTicket(ticket);
    setIsModalOpen(true);
  };

  // Función para cerrar modal
  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedTicket(null);
  };

  // 🎯 FILTRAR TICKETS CON NÚMEROS REALES
  const filteredTickets = tickets.filter(
    (ticket) =>
      ticket.ticketNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ticket.shortId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ticket.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ticket.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ticket.customerEmail.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  // Estado de guardado basado en navigation
  const isSaving =
    navigation.state === "submitting" &&
    navigation.formData?.get("action") === "updateChatbotConfig";

  // Variable para validar campos (número siempre estará marcado)
  const hasAtLeastOneField = Object.values(config.required_fields).some(
    Boolean,
  );

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

                    {/* Mensajes de resultado */}
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

                    {/* 🎯 CONFIGURACIÓN EN DOS COLUMNAS */}
                    <Layout>
                      <Layout.Section variant="oneHalf">
                        <Card>
                          <BlockStack gap="400">
                            <InlineStack gap="200" blockAlign="center">
                              <Icon source={SettingsIcon} />
                              <Text as="h3" variant="headingMd">
                                Configuración Básica
                              </Text>
                            </InlineStack>

                            <TextField
                              label="Nombre del bot"
                              value={config.bot_name}
                              onChange={(value) =>
                                setConfig((prev) => ({
                                  ...prev,
                                  bot_name: value,
                                }))
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
                              multiline={2}
                              autoComplete="off"
                              helpText="Este será el primer mensaje que vean tus clientes"
                            />
                          </BlockStack>
                        </Card>
                      </Layout.Section>

                      <Layout.Section variant="oneHalf">
                        <Card>
                          <BlockStack gap="400">
                            <InlineStack gap="200" blockAlign="center">
                              <Icon source={PersonIcon} />
                              <Text as="h3" variant="headingMd">
                                Personalización del Chatbot
                              </Text>
                            </InlineStack>

                            <TextField
                              label="Personalidad del chatbot"
                              value={config.personality}
                              onChange={(value) =>
                                setConfig((prev) => ({
                                  ...prev,
                                  personality: value,
                                }))
                              }
                              multiline={7}
                              autoComplete="off"
                              placeholder="Chatbot amigable que usa emojis, responde de manera casual y ayuda con consultas de productos..."
                              helpText="Describe cómo quieres que se comporte tu chatbot con los clientes"
                            />
                          </BlockStack>
                        </Card>
                      </Layout.Section>
                    </Layout>

                    {/* 📋 CAMPOS REQUERIDOS */}
                    <Card>
                      <BlockStack gap="400">
                        <Text as="h3" variant="headingMd">
                          Información requerida del cliente
                        </Text>
                        <Text as="p" tone="subdued">
                          Selecciona qué información debe solicitar el chatbot a
                          los clientes. El número de teléfono siempre es
                          obligatorio.
                        </Text>

                        {/* ⚠️ BANNER DE VALIDACIÓN */}
                        {!hasAtLeastOneField && (
                          <Banner tone="critical">
                            <p>
                              ⚠️ Debes seleccionar al menos un campo obligatorio
                              para poder crear órdenes.
                            </p>
                          </Banner>
                        )}

                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns:
                              "repeat(auto-fit, minmax(200px, 1fr))",
                            gap: "16px",
                          }}
                        >
                          {Object.entries(config.required_fields)
                            .filter(([field]) => field !== "numero") // Oculta el checkbox de número
                            .map(([field, checked]) => {
                              const fieldLabels: Record<string, string> = {
                                nombre: "Nombre completo",
                                numero: "Número de teléfono",
                                correo: "Correo electrónico",
                                direccion: "Dirección",
                                ciudad: "Ciudad",
                                provincia: "Provincia/Estado",
                                pais: "País",
                              };

                              return (
                                <Checkbox
                                  key={field}
                                  label={fieldLabels[field]}
                                  checked={checked}
                                  onChange={(value) =>
                                    handleRequiredFieldChange(
                                      field as keyof RequiredFields,
                                      value,
                                    )
                                  }
                                />
                              );
                            })}
                        </div>

                        {/* 📝 EXPLICACIÓN DEL FUNCIONAMIENTO */}
                        <div
                          style={{
                            backgroundColor: "#f0f9ff",
                            padding: "16px",
                            borderRadius: "8px",
                            border: "1px solid #bae6fd",
                          }}
                        >
                          <BlockStack gap="200">
                            <Text as="p" variant="bodyMd" fontWeight="medium">
                              📋 ¿Cómo funciona?
                            </Text>
                            <Text as="p" variant="bodySm" tone="subdued">
                              • <strong>Número obligatorio:</strong> El chatbot
                              siempre solicitará el número de teléfono
                              (requerido para verificación COD)
                            </Text>
                            <Text as="p" variant="bodySm" tone="subdued">
                              • <strong>Campos adicionales:</strong> Solo
                              solicitará los campos que marques como
                              obligatorios
                            </Text>
                            <Text as="p" variant="bodySm" tone="subdued">
                              • <strong>Ejemplo:</strong> Si marcas "Nombre" y
                              "Correo", el chatbot pedirá: teléfono, nombre y
                              correo
                            </Text>
                          </BlockStack>
                        </div>

                        <div
                          style={{
                            backgroundColor: "#f6f6f7",
                            padding: "12px",
                            borderRadius: "8px",
                            marginTop: "16px",
                          }}
                        >
                          <Text as="p" variant="bodySm" tone="subdued">
                            💡 Campos obligatorios:{" "}
                            {
                              Object.values(config.required_fields).filter(
                                Boolean,
                              ).length
                            }{" "}
                            de {Object.keys(config.required_fields).length}{" "}
                            (incluyendo teléfono)
                          </Text>
                        </div>
                      </BlockStack>
                    </Card>

                    {/* 💾 BOTÓN DE GUARDAR */}
                    <Card>
                      <Button
                        variant="primary"
                        size="large"
                        loading={isSaving}
                        onClick={handleSaveConfig}
                        fullWidth
                      >
                        {isSaving
                          ? "Guardando configuración..."
                          : "Guardar configuración"}
                      </Button>
                    </Card>

                    {/* 🎫 TICKETS RECIENTES CON NÚMEROS REALES */}
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
                              "Ticket",
                              "Cliente",
                              "Motivo",
                              "Fecha",
                              "Acción",
                            ]}
                            rows={tickets.slice(0, 3).map((ticket) => [
                              ticket.ticketNumber, // TICKET-9BB77C9F
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
                          placeholder="Buscar por ticket, cliente, motivo..."
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
                          "Ticket",
                          "Cliente",
                          "Motivo",
                          "Fecha",
                          "Acción",
                        ]}
                        rows={filteredTickets.map((ticket) => [
                          ticket.ticketNumber, // TICKET-9BB77C9F
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

        {/* 🎫 MODAL CON NÚMEROS DE TICKETS REALES */}
        <Modal
          open={isModalOpen}
          onClose={closeModal}
          title={
            selectedTicket
              ? `Detalles del ${selectedTicket.ticketNumber}`
              : "Detalles del Ticket"
          }
          primaryAction={{
            content: "Cerrar",
            onAction: closeModal,
          }}
          size="large"
        >
          <Modal.Section>
            {selectedTicket && (
              <BlockStack gap="400">
                {/* Información del ticket con número real */}
                <InlineStack gap="200" blockAlign="center">
                  <Text as="h3" variant="headingMd">
                    {selectedTicket.ticketNumber}
                  </Text>
                  {getStatusBadge(selectedTicket.status)}
                </InlineStack>

                {/* ID interno para referencia */}
                <Text as="p" variant="bodySm" tone="subdued">
                  ID interno: {selectedTicket.id}
                </Text>

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
