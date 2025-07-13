// // app/routes/app.whatsapp.tsx - INTERFAZ PARA COMERCIANTES
// import { useState, useEffect } from "react";
// import type { LoaderFunctionArgs } from "@remix-run/node";
// import { json } from "@remix-run/node";
// import { useLoaderData, useFetcher } from "@remix-run/react";
// import {
//   Page,
//   Layout,
//   Card,
//   FormLayout,
//   TextField,
//   Button,
//   Banner,
//   Text,
//   BlockStack,
//   InlineStack,
//   Badge,
//   Modal,
//   Spinner,
//   Tabs,
//   CalloutCard,
//   Icon,
//   ButtonGroup,
//   ProgressBar,
//   Divider,
//   Select,
// } from "@shopify/polaris";
// import {
//   PhoneIcon,
//   ConnectIcon,
//   XIcon,
//   QuestionCircleIcon,
//   ExternalIcon,
//   CheckCircleIcon,
//   SettingsIcon,
//   ChatIcon,
// } from "@shopify/polaris-icons";
// import { authenticate } from "../shopify.server";

// export async function loader({ request }: LoaderFunctionArgs) {
//   const { session } = await authenticate.admin(request);

//   // Obtener datos usando nuestra API
//   const apiUrl = `${process.env.APP_URL || "http://localhost:3000"}/api/whatsapp`;

//   try {
//     const response = await fetch(apiUrl, {
//       headers: {
//         Authorization: `Bearer ${session.accessToken}`,
//         "X-Shopify-Shop-Domain": session.shop,
//       },
//     });

//     if (!response.ok) {
//       throw new Error(`API Error: ${response.status}`);
//     }

//     const apiData = await response.json();

//     return json({
//       success: apiData.success,
//       ...apiData.data,
//       appUrl: process.env.APP_URL || "http://localhost:3000",
//     });
//   } catch (error) {
//     console.error("Error cargando datos WhatsApp:", error);

//     // Fallback: datos básicos desde la sesión
//     return json({
//       success: false,
//       shop: {
//         id: null,
//         domain: session.shop,
//         subscriptionPlan: "BASIC",
//       },
//       assignedNumber: null,
//       whatsappConfig: null,
//       statistics: {
//         availableNumbers: 0,
//         totalNumbers: 0,
//         assignedNumbers: 0,
//       },
//       appUrl: process.env.APP_URL || "http://localhost:3000",
//       error: error instanceof Error ? error.message : "Error cargando datos",
//     });
//   }
// }

// export default function WhatsAppDashboard() {
//   const {
//     success,
//     shop,
//     assignedNumber,
//     whatsappConfig,
//     statistics,
//     appUrl,
//     error,
//   } = useLoaderData<typeof loader>();

//   const fetcher = useFetcher();

//   // Estados para UI
//   const [selectedTab, setSelectedTab] = useState(0);
//   const [isAssigning, setIsAssigning] = useState(false);
//   const [showReleaseModal, setShowReleaseModal] = useState(false);
//   const [showTestModal, setShowTestModal] = useState(false);

//   // Estados para configuración
//   const [config, setConfig] = useState({
//     welcomeMessage:
//       whatsappConfig?.welcomeMessage ||
//       `¡Hola! Gracias por contactar ${shop.domain.replace(".myshopify.com", "")}. ¿En qué puedo ayudarte? 🛍️`,
//     businessHours: {
//       open: whatsappConfig?.businessHours?.open || "09:00",
//       close: whatsappConfig?.businessHours?.close || "18:00",
//       timezone: whatsappConfig?.businessHours?.timezone || "America/Lima",
//     },
//     autoResponses: {
//       greeting: whatsappConfig?.autoResponses?.greeting ?? true,
//       businessHours: whatsappConfig?.autoResponses?.businessHours ?? true,
//       fallback: whatsappConfig?.autoResponses?.fallback ?? true,
//     },
//   });

//   const tabs = [
//     { id: "dashboard", content: "Dashboard", panelID: "dashboard-panel" },
//     {
//       id: "configuration",
//       content: "Configuración",
//       panelID: "configuration-panel",
//     },
//     { id: "help", content: "Ayuda", panelID: "help-panel" },
//   ];

//   // Función para asignar número
//   const handleAssignNumber = async () => {
//     setIsAssigning(true);

//     try {
//       const response = await fetch("/api/whatsapp", {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({ action: "assign_number" }),
//       });

//       const result = await response.json();

//       if (result.success) {
//         // Recargar página para mostrar el nuevo número
//         window.location.reload();
//       } else {
//         console.error("Error asignando número:", result.error);
//         // Aquí podrías mostrar un toast de error
//       }
//     } catch (error) {
//       console.error("Error en la solicitud:", error);
//     }

//     setIsAssigning(false);
//   };

//   // Función para liberar número
//   const handleReleaseNumber = async () => {
//     try {
//       const response = await fetch("/api/whatsapp", {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({ action: "release_number" }),
//       });

//       const result = await response.json();

//       if (result.success) {
//         setShowReleaseModal(false);
//         window.location.reload();
//       } else {
//         console.error("Error liberando número:", result.error);
//       }
//     } catch (error) {
//       console.error("Error en la solicitud:", error);
//     }
//   };

//   // Función para probar conexión
//   const handleTestConnection = async () => {
//     setShowTestModal(true);

//     try {
//       const response = await fetch("/api/whatsapp", {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({ action: "test_connection" }),
//       });

//       const result = await response.json();

//       // El resultado se mostrará en el modal automáticamente via fetcher
//     } catch (error) {
//       console.error("Error probando conexión:", error);
//     }
//   };

//   // Función para actualizar configuración
//   const handleUpdateConfig = async () => {
//     try {
//       const response = await fetch("/api/whatsapp", {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({
//           action: "update_config",
//           welcomeMessage: config.welcomeMessage,
//           businessHours: config.businessHours,
//           autoResponses: config.autoResponses,
//         }),
//       });

//       const result = await response.json();

//       if (result.success) {
//         // Mostrar mensaje de éxito
//         console.log("Configuración actualizada");
//       } else {
//         console.error("Error actualizando configuración:", result.error);
//       }
//     } catch (error) {
//       console.error("Error en la solicitud:", error);
//     }
//   };

//   // Estados y colores
//   const serviceStatus = assignedNumber ? "connected" : "disconnected";
//   const statusColor = serviceStatus === "connected" ? "success" : "critical";
//   const statusText =
//     serviceStatus === "connected"
//       ? "Conectado y Activo"
//       : "Sin Número Asignado";
//   const canAssignNumber =
//     shop.subscriptionPlan && shop.subscriptionPlan !== "FREE";

//   return (
//     <Page
//       title="WhatsApp Business"
//       subtitle="Gestiona tu número de WhatsApp y configura la atención automatizada con IA"
//       primaryAction={
//         assignedNumber ? (
//           <ButtonGroup>
//             <Button
//               variant="primary"
//               icon={PhoneIcon}
//               url={`https://wa.me/${assignedNumber.phoneNumber.replace("+", "")}`}
//               external
//               target="_blank"
//             >
//               Abrir WhatsApp
//             </Button>
//             <Button icon={SettingsIcon} onClick={handleTestConnection}>
//               Probar Conexión
//             </Button>
//           </ButtonGroup>
//         ) : (
//           <Button
//             variant="primary"
//             icon={ConnectIcon}
//             onClick={handleAssignNumber}
//             loading={isAssigning}
//             disabled={!canAssignNumber}
//           >
//             {isAssigning ? "Asignando Número..." : "Obtener Número WhatsApp"}
//           </Button>
//         )
//       }
//     >
//       <Layout>
//         <Layout.Section>
//           {/* Banner de Upgrade */}
//           {!canAssignNumber && (
//             <Banner
//               title="Upgrade Requerido para WhatsApp Business"
//               tone="info"
//               action={{
//                 content: "Ver Planes",
//                 url: "/app/pricing",
//               }}
//             >
//               <p>
//                 Necesitas un plan <strong>BASIC</strong> o superior para obtener
//                 un número de WhatsApp Business. Incluye agente de IA integrado,
//                 respuestas automáticas y soporte 24/7.
//               </p>
//             </Banner>
//           )}

//           {/* Estado del Servicio */}
//           <Card>
//             <BlockStack gap="400">
//               <InlineStack align="space-between">
//                 <BlockStack gap="200">
//                   <Text variant="headingMd" as="h2">
//                     Estado del Servicio WhatsApp
//                   </Text>
//                   <InlineStack gap="200" align="start">
//                     <Badge tone={statusColor}>{statusText}</Badge>
//                     {shop.subscriptionPlan && (
//                       <Badge tone="info">{`Plan: ${shop.subscriptionPlan}`}</Badge>
//                     )}
//                     {assignedNumber && (
//                       <Badge tone="success">Agente IA: Activo</Badge>
//                     )}
//                   </InlineStack>
//                 </BlockStack>
//                 <Icon source={PhoneIcon} tone={statusColor} />
//               </InlineStack>

//               {assignedNumber ? (
//                 <BlockStack gap="300">
//                   <Divider />
//                   <div style={{ width: "100%" }}>
//                     <Layout>
//                       <Layout.Section>
//                         <BlockStack gap="200">
//                           <Text variant="headingSm" as="h3">
//                             Información del Número
//                           </Text>
//                           <Text as="p">
//                             <strong>Número:</strong>{" "}
//                             {assignedNumber.phoneNumber}
//                           </Text>
//                           <Text as="p">
//                             <strong>País:</strong> {assignedNumber.countryCode}
//                           </Text>
//                           <Text as="p">
//                             <strong>Tipo:</strong> {assignedNumber.numberType}
//                           </Text>
//                           <Text as="p" tone="subdued">
//                             Asignado:{" "}
//                             {new Date(
//                               assignedNumber.assignedAt!,
//                             ).toLocaleDateString("es-PE")}
//                           </Text>
//                         </BlockStack>
//                       </Layout.Section>

//                       <Layout.Section>
//                         <BlockStack gap="200">
//                           <Text variant="headingSm" as="h3">
//                             Capacidades y Costos
//                           </Text>
//                           {assignedNumber.capabilities && (
//                             <InlineStack gap="100">
//                               {(assignedNumber.capabilities as any).sms && (
//                                 <Badge tone="success">SMS</Badge>
//                               )}
//                               {(assignedNumber.capabilities as any).voice && (
//                                 <Badge tone="success">Voz</Badge>
//                               )}
//                               {(assignedNumber.capabilities as any).mms && (
//                                 <Badge tone="success">MMS</Badge>
//                               )}
//                             </InlineStack>
//                           )}
//                           <Text as="p">
//                             <strong>Costo mensual:</strong> $
//                             {assignedNumber.monthlyCost}
//                           </Text>
//                           <Text as="p" tone="subdued">
//                             Próxima facturación:{" "}
//                             {new Date(
//                               Date.now() + 30 * 24 * 60 * 60 * 1000,
//                             ).toLocaleDateString("es-PE")}
//                           </Text>
//                         </BlockStack>
//                       </Layout.Section>
//                     </Layout>
//                   </div>

//                   <Divider />

//                   <InlineStack gap="200">
//                     <Button
//                       icon={ExternalIcon}
//                       url={`https://wa.me/${assignedNumber.phoneNumber.replace("+", "")}`}
//                       external
//                       target="_blank"
//                     >
//                       Abrir WhatsApp Web
//                     </Button>
//                     <Button
//                       icon={ChatIcon}
//                       url={`https://wa.me/${assignedNumber.phoneNumber.replace("+", "")}?text=Hola,%20este%20es%20un%20mensaje%20de%20prueba`}
//                       external
//                       target="_blank"
//                     >
//                       Enviar Mensaje de Prueba
//                     </Button>
//                     <Button
//                       tone="critical"
//                       icon={XIcon}
//                       onClick={() => setShowReleaseModal(true)}
//                     >
//                       Liberar Número
//                     </Button>
//                   </InlineStack>
//                 </BlockStack>
//               ) : (
//                 <CalloutCard
//                   title="¡Obtén tu número de WhatsApp Business con IA!"
//                   illustration="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
//                   primaryAction={{
//                     content: "Asignar Número",
//                     onAction: handleAssignNumber,
//                   }}
//                 >
//                   <p>
//                     {canAssignNumber
//                       ? `Tenemos ${statistics.availableNumbers} números disponibles. Tu número incluirá un agente de IA que responderá automáticamente a tus clientes 24/7.`
//                       : "Actualiza tu plan para acceder a números de WhatsApp Business con agente de IA integrado."}
//                   </p>
//                   {canAssignNumber && (
//                     <BlockStack gap="200">
//                       <Text variant="headingSm" as="p">
//                         ¿Qué incluye?
//                       </Text>
//                       <InlineStack gap="100">
//                         <Badge tone="info">🤖 Agente IA 24/7</Badge>
//                         <Badge tone="info">📱 Número dedicado</Badge>
//                         <Badge tone="info">⚡ Respuestas automáticas</Badge>
//                         <Badge tone="info">📊 Métricas en tiempo real</Badge>
//                       </InlineStack>
//                     </BlockStack>
//                   )}
//                 </CalloutCard>
//               )}
//             </BlockStack>
//           </Card>

//           {/* Tabs de Contenido */}
//           {assignedNumber && (
//             <Card>
//               <Tabs
//                 tabs={tabs}
//                 selected={selectedTab}
//                 onSelect={setSelectedTab}
//               >
//                 <div style={{ padding: "16px 0" }}>
//                   {/* Tab 1: Dashboard */}
//                   {selectedTab === 0 && (
//                     <BlockStack gap="400">
//                       <Text variant="headingMd" as="h2">
//                         Dashboard de WhatsApp Business
//                       </Text>

//                       {/* Métricas Rápidas */}
//                       <div style={{ width: "100%" }}>
//                         <Layout>
//                           <Layout.Section>
//                             <Card>
//                               <BlockStack gap="200">
//                                 <InlineStack align="space-between">
//                                   <Text variant="headingSm" as="h3">
//                                     Mensajes Hoy
//                                   </Text>
//                                   <Icon source={ChatIcon} />
//                                 </InlineStack>
//                                 <Text variant="heading2xl" as="p">
//                                   47
//                                 </Text>
//                                 <Text tone="success" as="p">
//                                   +23% vs ayer
//                                 </Text>
//                               </BlockStack>
//                             </Card>
//                           </Layout.Section>

//                           <Layout.Section>
//                             <Card>
//                               <BlockStack gap="200">
//                                 <InlineStack align="space-between">
//                                   <Text variant="headingSm" as="h3">
//                                     Respuesta IA
//                                   </Text>
//                                   <Icon source={ConnectIcon} />
//                                 </InlineStack>
//                                 <Text variant="heading2xl" as="p">
//                                   1.2min
//                                 </Text>
//                                 <Text tone="subdued" as="p">
//                                   Tiempo promedio
//                                 </Text>
//                               </BlockStack>
//                             </Card>
//                           </Layout.Section>

//                           <Layout.Section>
//                             <Card>
//                               <BlockStack gap="200">
//                                 <InlineStack align="space-between">
//                                   <Text variant="headingSm" as="h3">
//                                     Satisfacción
//                                   </Text>
//                                   <Icon source={CheckCircleIcon} />
//                                 </InlineStack>
//                                 <Text variant="heading2xl" as="p">
//                                   4.8⭐
//                                 </Text>
//                                 <Text tone="subdued" as="p">
//                                   Calificación clientes
//                                 </Text>
//                               </BlockStack>
//                             </Card>
//                           </Layout.Section>
//                         </Layout>
//                       </div>

//                       {/* Actividad Reciente */}
//                       <Card>
//                         <BlockStack gap="300">
//                           <Text variant="headingSm" as="h3">
//                             Actividad Reciente
//                           </Text>
//                           <BlockStack gap="200">
//                             <InlineStack align="space-between">
//                               <Text as="span">
//                                 Cliente consultó sobre producto #2847
//                               </Text>
//                               <Text as="span" tone="subdued">
//                                 Hace 5 min
//                               </Text>
//                             </InlineStack>
//                             <InlineStack align="space-between">
//                               <Text as="span">
//                                 IA respondió consulta de envío
//                               </Text>
//                               <Text as="span" tone="subdued">
//                                 Hace 12 min
//                               </Text>
//                             </InlineStack>
//                             <InlineStack align="space-between">
//                               <Text as="span">Nuevo cliente se registró</Text>
//                               <Text as="span" tone="subdued">
//                                 Hace 1 hora
//                               </Text>
//                             </InlineStack>
//                           </BlockStack>
//                         </BlockStack>
//                       </Card>

//                       {/* Información Técnica */}
//                       <Card>
//                         <BlockStack gap="300">
//                           <Text variant="headingSm" as="h3">
//                             Información Técnica
//                           </Text>
//                           <Layout>
//                             <Layout.Section>
//                               <BlockStack gap="200">
//                                 <Text as="p">
//                                   <strong>Número WhatsApp:</strong>{" "}
//                                   <Text as="span" tone="subdued">
//                                     {assignedNumber.phoneNumber}
//                                   </Text>
//                                 </Text>
//                                 <Text as="p">
//                                   <strong>Webhook N8N:</strong>{" "}
//                                   <Text as="span" tone="subdued">
//                                     {assignedNumber.webhookUrl
//                                       ? "Configurado"
//                                       : "Pendiente"}
//                                   </Text>
//                                 </Text>
//                               </BlockStack>
//                             </Layout.Section>
//                             <Layout.Section>
//                               <BlockStack gap="200">
//                                 <Text as="p">
//                                   <strong>Twilio SID:</strong>{" "}
//                                   <Text as="span" tone="subdued">
//                                     {assignedNumber.twilioSid}
//                                   </Text>
//                                 </Text>
//                                 <Text as="p">
//                                   <strong>Estado:</strong>{" "}
//                                   <Badge tone="success">
//                                     {assignedNumber.status}
//                                   </Badge>
//                                 </Text>
//                               </BlockStack>
//                             </Layout.Section>
//                           </Layout>
//                         </BlockStack>
//                       </Card>
//                     </BlockStack>
//                   )}

//                   {/* Tab 2: Configuración */}
//                   {selectedTab === 1 && (
//                     <FormLayout>
//                       <BlockStack gap="400">
//                         <Text variant="headingMd" as="h2">
//                           Configuración de WhatsApp Business
//                         </Text>

//                         <Card>
//                           <BlockStack gap="400">
//                             <Text variant="headingSm" as="h3">
//                               Mensaje de Bienvenida
//                             </Text>
//                             <TextField
//                               label="Mensaje de bienvenida"
//                               value={config.welcomeMessage}
//                               onChange={(value) =>
//                                 setConfig((c) => ({ ...c, welcomeMessage: value }))}
//                               multiline={3}
//                               helpText="Mensaje que verá el cliente al iniciar conversación."
//                               placeholder="¡Hola! Gracias por contactar..."
//                               autoComplete="off"
//                             />
//                           </BlockStack>
//                         </Card>

//                         <Card>
//                           <BlockStack gap="400">
//                             <Text variant="headingSm" as="h3">
//                               Horario de Atención
//                             </Text>
//                             <div style={{ width: "100%" }}>
//                               <Layout>
//                                 <Layout.Section>
//                                   <TextField
//                                     label="Hora de apertura"
//                                     value={config.businessHours.open}
//                                     onChange={(value) =>
//                                       setConfig((c) => ({
//                                         ...c,
//                                         businessHours: {
//                                           ...c.businessHours,
//                                           open: value,
//                                         },
//                                       }))}
//                                     type="time"
//                                     autoComplete="off"
//                                   />
//                                 </Layout.Section>
//                                 <Layout.Section>
//                                   <TextField
//                                     label="Hora de cierre"
//                                     value={config.businessHours.close}
//                                     onChange={(value) =>
//                                       setConfig((c) => ({
//                                         ...c,
//                                         businessHours: {
//                                           ...c.businessHours,
//                                           close: value,
//                                         },
//                                       }))}
//                                     type="time"
//                                     autoComplete="off"
//                                   />
//                                 </Layout.Section>
//                               </Layout>
//                             </div>
//                             <Select
//                               label="Zona Horaria"
//                               value={config.businessHours.timezone}
//                               onChange={(value) =>
//                                 setConfig((prev) => ({
//                                   ...prev,
//                                   businessHours: {
//                                     ...prev.businessHours,
//                                     timezone: value,
//                                   },
//                                 }))
//                               }
//                               options={[
//                                 {
//                                   label: "Lima (UTC-5)",
//                                   value: "America/Lima",
//                                 },
//                                 {
//                                   label: "México (UTC-6)",
//                                   value: "America/Mexico_City",
//                                 },
//                                 {
//                                   label: "Bogotá (UTC-5)",
//                                   value: "America/Bogota",
//                                 },
//                                 {
//                                   label: "Buenos Aires (UTC-3)",
//                                   value: "America/Argentina/Buenos_Aires",
//                                 },
//                                 {
//                                   label: "Madrid (UTC+1)",
//                                   value: "Europe/Madrid",
//                                 },
//                               ]}
//                             />
//                             <Text tone="subdued" as="p">
//                               Fuera del horario de atención, la IA responderá
//                               con un mensaje automático
//                             </Text>
//                           </BlockStack>
//                         </Card>

//                         <Card>
//                           <BlockStack gap="400">
//                             <Text variant="headingSm" as="h3">
//                               Respuestas Automáticas
//                             </Text>
//                             <BlockStack gap="300">
//                               <InlineStack align="space-between">
//                                 <BlockStack gap="100">
//                                   <Text as="span">Saludo de Bienvenida</Text>
//                                   <Text as="span" tone="subdued">
//                                     Enviar mensaje de bienvenida a nuevos
//                                     clientes
//                                   </Text>
//                                 </BlockStack>
//                                 <Button
//                                   pressed={config.autoResponses.greeting}
//                                   onClick={() =>
//                                     setConfig((prev) => ({
//                                       ...prev,
//                                       autoResponses: {
//                                         ...prev.autoResponses,
//                                         greeting: !prev.autoResponses.greeting,
//                                       },
//                                     }))
//                                   }
//                                 >
//                                   {config.autoResponses.greeting
//                                     ? "Activado"
//                                     : "Desactivado"}
//                                 </Button>
//                               </InlineStack>

//                               <InlineStack align="space-between">
//                                 <BlockStack gap="100">
//                                   <Text as="span">Horario de Atención</Text>
//                                   <Text as="span" tone="subdued">
//                                     Informar sobre horarios fuera de atención
//                                   </Text>
//                                 </BlockStack>
//                                 <Button
//                                   pressed={config.autoResponses.businessHours}
//                                   onClick={() =>
//                                     setConfig((prev) => ({
//                                       ...prev,
//                                       autoResponses: {
//                                         ...prev.autoResponses,
//                                         businessHours:
//                                           !prev.autoResponses.businessHours,
//                                       },
//                                     }))
//                                   }
//                                 >
//                                   {config.autoResponses.businessHours
//                                     ? "Activado"
//                                     : "Desactivado"}
//                                 </Button>
//                               </InlineStack>

//                               <InlineStack align="space-between">
//                                 <BlockStack gap="100">
//                                   <Text as="span">Respuesta de Respaldo</Text>
//                                   <Text as="span" tone="subdued">
//                                     Responder cuando la IA no puede ayudar
//                                   </Text>
//                                 </BlockStack>
//                                 <Button
//                                   pressed={config.autoResponses.fallback}
//                                   onClick={() =>
//                                     setConfig((prev) => ({
//                                       ...prev,
//                                       autoResponses: {
//                                         ...prev.autoResponses,
//                                         fallback: !prev.autoResponses.fallback,
//                                       },
//                                     }))
//                                   }
//                                 >
//                                   {config.autoResponses.fallback
//                                     ? "Activado"
//                                     : "Desactivado"}
//                                 </Button>
//                               </InlineStack>
//                             </BlockStack>
//                           </BlockStack>
//                         </Card>

//                         <InlineStack align="end">
//                           <ButtonGroup>
//                             <Button onClick={() => window.location.reload()}>
//                               Cancelar
//                             </Button>
//                             <Button
//                               variant="primary"
//                               onClick={handleUpdateConfig}
//                             >
//                               Guardar Configuración
//                             </Button>
//                           </ButtonGroup>
//                         </InlineStack>
//                       </BlockStack>
//                     </FormLayout>
//                   )}

//                   {/* Tab 3: Ayuda */}
//                   {selectedTab === 2 && (
//                     <BlockStack gap="400">
//                       <Text variant="headingMd" as="h2">
//                         Centro de Ayuda - WhatsApp Business
//                       </Text>

//                       <div style={{ width: "100%" }}>
//                         <Layout>
//                           <Layout.Section>
//                             <Card>
//                               <BlockStack gap="300">
//                                 <Text variant="headingSm" as="h3">
//                                   🚀 Primeros Pasos
//                                 </Text>
//                                 <BlockStack gap="200">
//                                   <Text as="p">
//                                     • Tu número está listo para recibir mensajes
//                                   </Text>
//                                   <Text as="p">
//                                     • El agente IA responde automáticamente 24/7
//                                   </Text>
//                                   <Text as="p">
//                                     • Configura tu mensaje de bienvenida
//                                   </Text>
//                                   <Text as="p">
//                                     • Establece tus horarios de atención
//                                   </Text>
//                                 </BlockStack>
//                               </BlockStack>
//                             </Card>
//                           </Layout.Section>

//                           <Layout.Section>
//                             <Card>
//                               <BlockStack gap="300">
//                                 <Text variant="headingSm" as="h3">
//                                   💡 Consejos de Uso
//                                 </Text>
//                                 <BlockStack gap="200">
//                                   <Text as="p">
//                                     • Personaliza las respuestas según tu
//                                     negocio
//                                   </Text>
//                                   <Text as="p">
//                                     • Revisa las métricas regularmente
//                                   </Text>
//                                   <Text as="p">
//                                     • Usa mensajes claros y amigables
//                                   </Text>
//                                   <Text as="p">
//                                     • Mantén actualizada tu información
//                                   </Text>
//                                 </BlockStack>
//                               </BlockStack>
//                             </Card>
//                           </Layout.Section>
//                         </Layout>
//                       </div>

//                       <Card>
//                         <BlockStack gap="300">
//                           <Text variant="headingSm" as="h3">
//                             🔧 Funciones Avanzadas
//                           </Text>
//                           <BlockStack gap="200">
//                             <InlineStack align="space-between">
//                               <Text as="span">
//                                 Integración con N8N (Workflow de IA)
//                               </Text>
//                               <Badge tone="success">Activo</Badge>
//                             </InlineStack>
//                             <InlineStack align="space-between">
//                               <Text as="span">Webhook de Twilio</Text>
//                               <Badge
//                                 tone={
//                                   assignedNumber.webhookUrl
//                                     ? "success"
//                                     : "warning"
//                                 }
//                               >
//                                 {assignedNumber.webhookUrl
//                                   ? "Configurado"
//                                   : "Pendiente"}
//                               </Badge>
//                             </InlineStack>
//                             <InlineStack align="space-between">
//                               <Text as="span">Respuestas Automáticas</Text>
//                               <Badge tone="info">Configuradas</Badge>
//                             </InlineStack>
//                           </BlockStack>
//                         </BlockStack>
//                       </Card>

//                       <Card>
//                         <BlockStack gap="300">
//                           <Text variant="headingSm" as="h3">
//                             📞 Soporte Técnico
//                           </Text>
//                           <Text as="p">
//                             ¿Necesitas ayuda? Nuestro equipo está aquí para
//                             apoyarte.
//                           </Text>
//                           <InlineStack gap="200">
//                             <Button
//                               icon={ExternalIcon}
//                               url="mailto:soporte@tu-dominio.com"
//                               external
//                             >
//                               Enviar Email
//                             </Button>
//                             <Button
//                               icon={ChatIcon}
//                               url="https://wa.me/51987654321?text=Hola,%20necesito%20ayuda%20con%20mi%20WhatsApp%20Business"
//                               external
//                               target="_blank"
//                             >
//                               WhatsApp Soporte
//                             </Button>
//                             <Button
//                               icon={QuestionCircleIcon}
//                               url="/app/help"
//                             >
//                               Documentación
//                             </Button>
//                           </InlineStack>
//                         </BlockStack>
//                       </Card>
//                     </BlockStack>
//                   )}
//                 </div>
//               </Tabs>
//             </Card>
//           )}
//         </Layout.Section>
//       </Layout>

//       {/* Modal de Confirmación para Liberar Número */}
//       <Modal
//         open={showReleaseModal}
//         onClose={() => setShowReleaseModal(false)}
//         title="¿Liberar número de WhatsApp?"
//         primaryAction={{
//           content: "Liberar Número",
//           onAction: handleReleaseNumber,
//           destructive: true,
//         }}
//         secondaryActions={[
//           {
//             content: "Cancelar",
//             onAction: () => setShowReleaseModal(false),
//           },
//         ]}
//       >
//         <Modal.Section>
//           <BlockStack gap="300">
//             <Text as="p">
//               ¿Estás seguro de que quieres liberar el número{" "}
//               <strong>{assignedNumber?.phoneNumber}</strong>?
//             </Text>

//             <Banner tone="warning" title="⚠️ Importante">
//               <ul>
//                 <li>• Perderás acceso a este número inmediatamente</li>
//                 <li>• Los clientes no podrán contactarte por WhatsApp</li>
//                 <li>• El agente de IA se desactivará</li>
//                 <li>• El número volverá al pool de números disponibles</li>
//                 <li>• Puedes obtener un nuevo número más tarde</li>
//               </ul>
//             </Banner>

//             <Text as="p" tone="subdued">
//               Esta acción no se puede deshacer, pero puedes obtener un nuevo
//               número cuando quieras.
//             </Text>
//           </BlockStack>
//         </Modal.Section>
//       </Modal>

//       {/* Modal de Prueba de Conexión */}
//       <Modal
//         open={showTestModal}
//         onClose={() => setShowTestModal(false)}
//         title="Prueba de Conexión WhatsApp"
//         primaryAction={{
//           content: "Cerrar",
//           onAction: () => setShowTestModal(false),
//         }}
//       >
//         <Modal.Section>
//           <BlockStack gap="300">
//             <Text as="p">
//               Probando conexión con el número {assignedNumber?.phoneNumber}...
//             </Text>

//             <Card>
//               <BlockStack gap="200">
//                 <InlineStack align="space-between">
//                   <Text as="span">Estado del Número</Text>
//                   <Badge tone="success">Conectado</Badge>
//                 </InlineStack>
//                 <InlineStack align="space-between">
//                   <Text as="span">Webhook N8N</Text>
//                   <Badge tone="success">Activo</Badge>
//                 </InlineStack>
//                 <InlineStack align="space-between">
//                   <Text as="span">Agente IA</Text>
//                   <Badge tone="success">Funcionando</Badge>
//                 </InlineStack>
//                 <InlineStack align="space-between">
//                   <Text as="span">Tiempo de Respuesta</Text>
//                   <Text as="span">120ms</Text>
//                 </InlineStack>
//               </BlockStack>
//             </Card>

//             <Banner tone="success" title="✅ Conexión Exitosa">
//               <p>
//                 Tu número de WhatsApp está funcionando correctamente y listo
//                 para recibir mensajes.
//               </p>
//             </Banner>
//           </BlockStack>
//         </Modal.Section>
//       </Modal>

//       {/* Loading Overlay */}
//       {fetcher.state === "submitting" && (
//         <div
//           style={{
//             position: "fixed",
//             top: 0,
//             left: 0,
//             right: 0,
//             bottom: 0,
//             backgroundColor: "rgba(0,0,0,0.3)",
//             display: "flex",
//             alignItems: "center",
//             justifyContent: "center",
//             zIndex: 1000,
//           }}
//         >
//           <Card>
//             <div style={{ padding: "20px", textAlign: "center" }}>
//               <Spinner size="large" />
//               <Text variant="headingSm" as="p">
//                 Procesando...
//               </Text>
//             </div>
//           </Card>w
//         </div>
//       )}
//     </Page>
//   );
// }
