// app/routes/app.call-monitoring.tsx - Dashboard de Monitoreo de Llamadas Vonage
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useRevalidator } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { useEffect, useState } from "react";
import {
  Page,
  Layout,
  Card,
  DataTable,
  Badge,
  Text,
  Button,
  Pagination,
  EmptyState,
} from "@shopify/polaris";
import { RefreshIcon } from "@shopify/polaris-icons";

// 📊 LOADER - Obtener datos de llamadas
export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const { shop } = session;

  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = 10; // Fixed limit of 10 calls per page
  const offset = (page - 1) * limit;

  try {
    // Construir filtros para la tienda actual
    const whereClause: any = {
      shop: {
        shop_domain: shop
      }
    };

    // Obtener total de llamadas para paginación
    const totalCalls = await db.orderConfirmation.count({
      where: whereClause
    });

    // Obtener llamadas con información completa
    const calls = await db.orderConfirmation.findMany({
      where: whereClause,
      include: {
        shop: {
          select: {
            shop_domain: true
          }
        }
      },
      orderBy: {
        created_at: 'desc'
      },
      take: limit,
      skip: offset
    });

    // Procesar datos para el frontend
    const processedCalls = calls.map(call => {
      // Procesar productos
      let products: Array<{title: string, quantity: number, price: number}> = [];
      if (call.order_items) {
        try {
          const items = typeof call.order_items === 'string' 
            ? JSON.parse(call.order_items) 
            : call.order_items;
          if (Array.isArray(items)) {
            products = items.map(item => ({
              title: item.title || item.name || 'Producto',
              quantity: item.quantity || 1,
              price: item.price || 0
            }));
          }
        } catch (error) {
        }
      }

      // Procesar dirección
      let address = "No disponible";
      if (call.shipping_address) {
        try {
          const addr = typeof call.shipping_address === 'string'
            ? JSON.parse(call.shipping_address)
            : call.shipping_address;
          
          if (addr && typeof addr === 'object') {
            const parts = [
              addr.address1,
              addr.city,
              addr.province,
              addr.country
            ].filter(Boolean);
            address = parts.join(', ') || "Dirección incompleta";
          }
        } catch (error) {
          address = "Error procesando dirección";
        }
      }

      return {
        id: call.id,
        internal_order_number: call.internal_order_number,
        shopify_order_name: call.shopify_order_name,
        shopify_order_id: call.shopify_order_id,
        customer_name: call.customer_name || "Sin nombre",
        customer_phone: call.customer_phone,
        customer_email: call.customer_email || "Sin email",
        address,
        products,
        order_total: call.order_total,
        shop_currency: call.shop_currency,
        status: call.status,
        call_status: call.call_status,
        dtmf_response: call.dtmf_response,
        vonage_call_uuid: call.vonage_call_uuid,
        created_at: call.created_at,
        confirmed_at: call.confirmed_at,
        declined_at: call.declined_at,
        last_event_at: call.last_event_at,
        // Calcular tiempo transcurrido
        hours_old: Math.floor((Date.now() - new Date(call.created_at).getTime()) / (1000 * 60 * 60))
      };
    });

    // Calcular estadísticas globales (no solo de la página actual)
    const allCalls = await db.orderConfirmation.findMany({
      where: whereClause,
      select: {
        status: true
      }
    });

    const stats = {
      total: allCalls.length,
      confirmed: allCalls.filter(c => c.status === 'CONFIRMED').length,
      declined: allCalls.filter(c => c.status === 'DECLINED').length,
      no_answer: allCalls.filter(c => c.status === 'NO_ANSWER').length,
      pending: allCalls.filter(c => c.status === 'PENDING_CALL').length
    };

    const totalPages = Math.ceil(totalCalls / limit);

    return json({
      calls: processedCalls,
      stats,
      pagination: {
        currentPage: page,
        totalPages,
        totalCalls,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1
      }
    });

  } catch (error) {
    return json({
      calls: [],
      stats: { total: 0, confirmed: 0, declined: 0, no_answer: 0, pending: 0 },
      pagination: {
        currentPage: 1,
        totalPages: 1,
        totalCalls: 0,
        hasNextPage: false,
        hasPreviousPage: false
      },
      error: 'Error cargando datos'
    });
  }
}

// 🎨 COMPONENTE PRINCIPAL
export default function CallMonitoring() {
  const { calls, stats, pagination } = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();

  // Auto-refresh cada 30 segundos (siempre habilitado)
  useEffect(() => {
    const interval = setInterval(() => {
      revalidator.revalidate();
    }, 30000);

    return () => clearInterval(interval);
  }, [revalidator]);

  // 🏷️ Función para obtener badge de status simplificado
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'CONFIRMED':
        return <Badge tone="success">Confirmado</Badge>;
      case 'DECLINED':
        return <Badge tone="critical">Cancelado</Badge>;
      case 'NO_ANSWER':
      case 'EXPIRED':
      case 'PENDING_CALL':
      default:
        return <Badge tone="warning">Sin respuesta</Badge>;
    }
  };

  // 📱 Función para formatear contacto
  const formatContact = (phone: string, email: string) => {
    const formattedPhone = phone?.replace(/^\+51/, '') || '';
    const formattedEmail = email || '';
    
    if (formattedPhone && formattedEmail) {
      return `${formattedPhone} | ${formattedEmail}`;
    } else if (formattedPhone) {
      return formattedPhone;
    } else if (formattedEmail) {
      return formattedEmail;
    }
    return 'Sin contacto';
  };

  // 💰 Función para formatear precio
  const formatPrice = (amount: number, currency: string) => {
    return `${amount?.toFixed(2) || '0.00'} ${currency || 'PEN'}`;
  };

  // 📋 Preparar datos para la tabla
  const tableHeadings = [
    'Orden',
    'Cliente', 
    'Productos',
    'Dirección',
    'Contacto',
    'Estado'
  ];

  const tableRows = calls.map(call => [
    // Orden - Solo número de Shopify
    <div key={`order-${call.id}`}>
      <Text as="p" variant="bodyMd" fontWeight="medium">
        {call.shopify_order_name || `#${call.internal_order_number}`}
      </Text>
    </div>,

    // Cliente - Solo nombre
    <div key={`customer-${call.id}`}>
      <Text as="p" variant="bodyMd" fontWeight="medium">
        {call.customer_name}
      </Text>
    </div>,

    // Productos - Solo cantidad y total
    <div key={`products-${call.id}`}>
      <Text as="p" variant="bodySm">
        {call.products.length > 0 ? `${call.products.length} producto${call.products.length > 1 ? 's' : ''}` : 'Sin productos'}
      </Text>
      <Text as="p" variant="bodyMd" fontWeight="medium" tone="success">
        Total: {formatPrice(Number(call.order_total) || 0, call.shop_currency || 'PEN')}
      </Text>
    </div>,

    // Dirección
    <div key={`address-${call.id}`}>
      <Text as="p" variant="bodySm">
        {call.address}
      </Text>
    </div>,

    // Contacto - Teléfono y email
    <div key={`contact-${call.id}`}>
      <Text as="p" variant="bodySm">
        {formatContact(call.customer_phone, call.customer_email)}
      </Text>
    </div>,

    // Estado - Simplificado
    <div key={`status-${call.id}`}>
      {getStatusBadge(call.status)}
    </div>
  ]);



  return (
    <Page
      title="📞 Monitoreo de Llamadas Vonage"
      subtitle="Dashboard en tiempo real de confirmaciones telefónicas"
      primaryAction={{
        content: "Refresh",
        onAction: () => {
          revalidator.revalidate();
        },
        icon: RefreshIcon
      }}
    >
      <Layout>
        {/* 📊 ESTADÍSTICAS RÁPIDAS */}
        <Layout.Section>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px' }}>
            <Card>
              <div style={{ textAlign: 'center' }}>
                <Text as="h3" variant="headingLg">{stats.total}</Text>
                <Text as="p" variant="bodySm">Total Llamadas</Text>
              </div>
            </Card>
            <Card>
              <div style={{ textAlign: 'center' }}>
                <Text as="h3" variant="headingLg">{stats.confirmed}</Text>
                <Text as="p" variant="bodySm">✅ Confirmadas</Text>
              </div>
            </Card>
            <Card>
              <div style={{ textAlign: 'center' }}>
                <Text as="h3" variant="headingLg">{stats.declined}</Text>
                <Text as="p" variant="bodySm">❌ Canceladas</Text>
              </div>
            </Card>
            <Card>
              <div style={{ textAlign: 'center' }}>
                <Text as="h3" variant="headingLg">{stats.no_answer}</Text>
                <Text as="p" variant="bodySm">📞 Sin respuesta</Text>
              </div>
            </Card>
          </div>
        </Layout.Section>

        {/* 📋 TABLA DE LLAMADAS */}
        <Layout.Section>
          <Card>
            {calls.length > 0 ? (
              <>
                <DataTable
                  columnContentTypes={[
                    'text',
                    'text', 
                    'text',
                    'text',
                    'text',
                    'text'
                  ]}
                  headings={tableHeadings}
                  rows={tableRows}
                  footerContent={`Mostrando ${calls.length} de ${pagination.totalCalls} llamadas`}
                />
                
                {/* Paginación */}
                <div style={{ padding: '16px', display: 'flex', justifyContent: 'center' }}>
                  <Pagination
                    hasPrevious={pagination.hasPreviousPage}
                    onPrevious={() => {
                      const url = new URL(window.location.href);
                      url.searchParams.set('page', String(pagination.currentPage - 1));
                      window.location.href = url.toString();
                    }}
                    hasNext={pagination.hasNextPage}
                    onNext={() => {
                      const url = new URL(window.location.href);
                      url.searchParams.set('page', String(pagination.currentPage + 1));
                      window.location.href = url.toString();
                    }}
                    label={`Página ${pagination.currentPage} de ${pagination.totalPages}`}
                  />
                </div>
              </>
            ) : (
              <EmptyState
                heading="No hay llamadas registradas"
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>Cuando se realicen llamadas de confirmación, aparecerán aquí.</p>
              </EmptyState>
            )}
          </Card>
        </Layout.Section>


      </Layout>
    </Page>
  );
}
