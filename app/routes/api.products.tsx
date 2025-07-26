// app/routes/api.products.tsx - VERSIÓN MEJORADA
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import db from "../db.server";
import { authenticate } from "../shopify.server";
import { extractNumericId, isValidShopifyGID } from "../utils/common-utils";
import { decryptToken } from "../utils/encryption.server";

// Tipos TypeScript mejorados
interface ProductVariant {
  id: string;
  title: string;
  price: string;
  availableForSale: boolean;
  inventoryQuantity: number;
  sku?: string;
  selectedOptions: Array<{
    name: string;
    value: string;
  }>;
}

interface ProductNode {
  id: string;
  title: string;
  handle: string;
  description?: string;
  status: string;
  featuredMedia?: {
    preview?: {
      image?: {
        id: string;
        url: string;
        altText?: string;
      };
    };
  };
  priceRangeV2: {
    minVariantPrice: {
      amount: string;
      currencyCode: string;
    };
    maxVariantPrice: {
      amount: string;
      currencyCode: string;
    };
  };
  variants: {
    edges: Array<{
      node: ProductVariant;
    }>;
  };
  options: Array<{
    id: string;
    name: string;
    values: string[];
  }>;
  tags: string[];
  productType: string;
  vendor: string;
  totalInventory: number;
  tracksInventory: boolean;
  createdAt: string;
  updatedAt: string;
}

interface FormattedProduct {
  // IDs críticos para N8N
  variant_id: string;
  product_id: string;
  product_name: string;
  price: string;
  inventory_quantity: number;

  // Información completa
  id: string;
  title: string;
  handle: string;
  description: string;
  status: string;
  featuredImage: {
    id: string;
    url: string;
    altText?: string;
  } | null;
  priceRange: {
    min: number;
    max: number;
    currency: string;
  };
  available: boolean;
  hasStock: boolean;
  variant_title: string;
  sku?: string;
  variants: Array<{
    id: string;
    variant_id: string;
    title: string;
    price: number;
    available: boolean;
    inventory_quantity: number;
    sku?: string;
    options: Array<{
      name: string;
      value: string;
    }>;
  }>;
  options: Array<{
    id: string;
    name: string;
    values: string[];
  }>;
  tags: string[];
  productType: string;
  vendor: string;
  totalInventory: number;
  tracksInventory: boolean;
  createdAt: string;
  updatedAt: string;
  cursor: string;
  graphql_variant_id: string;
  graphql_product_id: string;
}

// Configuración de límites
const CONFIG = {
  MAX_PRODUCTS: 250 as number,
  DEFAULT_PRODUCTS: 50 as number,
  API_VERSION: "2025-07" as const,
  CACHE_DURATION: 300 as number, // 5 minutos
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const headers = new Headers({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Type": "application/json",
  });

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 200, headers });
  }

  try {
    // ✅ Validación mejorada de parámetros
    const url = new URL(request.url);
    const shopDomain = url.searchParams.get("shop")?.trim();
    const search = url.searchParams.get("search")?.trim() || "";
    const firstParam = url.searchParams.get("first");
    const sortKey = url.searchParams.get("sortKey") || "UPDATED_AT";
    const reverse = url.searchParams.get("reverse") === "true";

    // Validación de shop domain
    if (!shopDomain) {
      return json(
        {
          success: false,
          error: "El parámetro 'shop' es requerido",
          code: "MISSING_SHOP_DOMAIN",
          timestamp: new Date().toISOString(),
        },
        { status: 400, headers }
      );
    }

    // Validación de shop domain format
    if (!/^[a-zA-Z0-9-]+\.myshopify\.com$/.test(shopDomain)) {
      return json(
        {
          success: false,
          error: "Formato de dominio de tienda inválido",
          code: "INVALID_SHOP_DOMAIN",
          timestamp: new Date().toISOString(),
        },
        { status: 400, headers }
      );
    }

    // Validación del parámetro first
    let first = CONFIG.DEFAULT_PRODUCTS;
    if (firstParam) {
      const parsedFirst = parseInt(firstParam);
      if (isNaN(parsedFirst) || parsedFirst <= 0) {
        return json(
          {
            success: false,
            error: "El parámetro 'first' debe ser un número positivo",
            code: "INVALID_FIRST_PARAMETER",
            timestamp: new Date().toISOString(),
          },
          { status: 400, headers }
        );
      }
      first = Math.min(parsedFirst, CONFIG.MAX_PRODUCTS);
    }

    // Validación de sortKey
    const validSortKeys = [
      "TITLE", "UPDATED_AT", "CREATED_AT", "BEST_SELLING", 
      "PRICE", "ID", "RELEVANCE", "PRODUCT_TYPE", "VENDOR"
    ];
    if (!validSortKeys.includes(sortKey)) {
      return json(
        {
          success: false,
          error: `sortKey inválido. Valores permitidos: ${validSortKeys.join(", ")}`,
          code: "INVALID_SORT_KEY",
          timestamp: new Date().toISOString(),
        },
        { status: 400, headers }
      );
    }

    // ✅ Búsqueda de tienda con mejor manejo de errores
    const shop = await db.shop.findUnique({
      where: { shop_domain: shopDomain },
      select: {
        id: true,
        shop_domain: true,
        access_token: true,
      },
    });

    if (!shop) {
      return json(
        {
          success: false,
          error: "Tienda no encontrada",
          code: "SHOP_NOT_FOUND",
          timestamp: new Date().toISOString(),
        },
        { status: 404, headers }
      );
    }

    if (!shop.access_token) {
      return json(
        {
          success: false,
          error: "Tienda no tiene token de acceso válido",
          code: "MISSING_ACCESS_TOKEN",
          timestamp: new Date().toISOString(),
        },
        { status: 401, headers }
      );
    }

    // ✅ Desencriptación mejorada del token
    let accessToken = shop.access_token;
    try {
      const parsed = JSON.parse(shop.access_token);
      if (parsed.encrypted && parsed.iv && parsed.tag) {
        accessToken = decryptToken(parsed);
      }
    } catch (decryptError) {
      // Continuar con el token original si no se puede desencriptar
    }

    // ✅ Query GraphQL optimizada
    const graphqlQuery = `#graphql
      query getProducts($first: Int!, $query: String, $sortKey: ProductSortKeys, $reverse: Boolean) {
        products(first: $first, query: $query, sortKey: $sortKey, reverse: $reverse) {
          edges {
            cursor
            node {
              id
              title
              handle
              description
              status
              featuredMedia {
                preview {
                  image {
                    id
                    url
                    altText
                  }
                }
              }
              priceRangeV2 {
                minVariantPrice {
                  amount
                  currencyCode
                }
                maxVariantPrice {
                  amount
                  currencyCode
                }
              }
              variants(first: 100) {
                edges {
                  node {
                    id
                    title
                    price
                    availableForSale
                    inventoryQuantity
                    sku
                    selectedOptions {
                      name
                      value
                    }
                  }
                }
              }
              options {
                id
                name
                values
              }
              tags
              productType
              vendor
              totalInventory
              tracksInventory
              createdAt
              updatedAt
            }
          }
          pageInfo {
            hasNextPage
            hasPreviousPage
            startCursor
            endCursor
          }
        }
      }
    `;

    // ✅ Construcción mejorada de query de búsqueda
    let shopifyQuery: string | null = null;
    if (search) {
      const searchTerm = search.toLowerCase();
      
      // Mapeo más específico por categorías
      const categoryMappings: Record<string, string> = {
        pantalon: 'title:*pantalon* OR title:*pants* OR title:*jean*',
        camiseta: 'title:*camiseta* OR title:*shirt* OR title:*polo*',
        zapato: 'title:*zapato* OR title:*shoe* OR title:*boot*',
        snowboard: 'title:*snowboard* OR product_type:snowboard',
      };

      // Buscar coincidencia exacta primero
      const exactMatch = Object.keys(categoryMappings).find(key => 
        searchTerm.includes(key)
      );

      if (exactMatch) {
        shopifyQuery = categoryMappings[exactMatch];
      } else {
        // Búsqueda más amplia si no hay coincidencia exacta
        shopifyQuery = `title:*${searchTerm}* OR tag:*${searchTerm}* OR product_type:*${searchTerm}*`;
      }
    }

    // ✅ Petición a Shopify con mejor manejo de errores
    const adminApiUrl = `https://${shopDomain}/admin/api/${CONFIG.API_VERSION}/graphql.json`;
    
    const fetchResponse = await fetch(adminApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
        "User-Agent": "VerifyCODOrders/1.0",
      },
      body: JSON.stringify({
        query: graphqlQuery,
        variables: {
          first,
          query: shopifyQuery,
          sortKey,
          reverse,
        },
      }),
    });

    if (!fetchResponse.ok) {
      const errorText = await fetchResponse.text();
      
      return json(
        {
          success: false,
          error: "Error de comunicación con Shopify",
          code: `SHOPIFY_API_${fetchResponse.status}`,
          details: fetchResponse.statusText,
          timestamp: new Date().toISOString(),
        },
        { status: fetchResponse.status, headers }
      );
    }

    const data = await fetchResponse.json();

    // ✅ Verificación mejorada de errores GraphQL
    if (data.errors && data.errors.length > 0) {
      
      return json(
        {
          success: false,
          error: "Error en consulta GraphQL",
          code: "GRAPHQL_ERROR",
          details: data.errors.map((err: any) => ({
            message: err.message,
            locations: err.locations,
            path: err.path,
          })),
          timestamp: new Date().toISOString(),
        },
        { status: 400, headers }
      );
    }

    if (!data.data?.products) {
      return json(
        {
          success: false,
          error: "Respuesta inválida de Shopify",
          code: "INVALID_SHOPIFY_RESPONSE",
          timestamp: new Date().toISOString(),
        },
        { status: 500, headers }
      );
    }

    const rawProducts = data.data.products.edges;

    // ✅ Procesamiento mejorado con mejor manejo de errores
    const productsWithStock: FormattedProduct[] = rawProducts
      .map((edge: any) => {
        try {
          const node = edge.node;

          // Validar IDs de Shopify
          if (!isValidShopifyGID(node.id)) {
            return null;
          }

          // Procesar variantes con validación
          const allVariants = node.variants.edges
            .map((variantEdge: any) => {
              try {
                const variant = variantEdge.node;
                
                if (!isValidShopifyGID(variant.id)) {
                  return null;
                }

                return {
                  id: variant.id,
                  variant_id: extractNumericId(variant.id),
                  title: variant.title || "Sin título",
                  price: parseFloat(variant.price) || 0,
                  available: variant.availableForSale,
                  inventory_quantity: variant.inventoryQuantity || 0,
                  sku: variant.sku,
                  options: variant.selectedOptions || [],
                };
              } catch (variantError) {
                return null;
              }
            })
            .filter(Boolean);

          // Filtrar variantes disponibles con stock
          const availableVariants = allVariants.filter(
            (variant: any) => variant && variant.available && variant.inventory_quantity > 0
          );

          if (availableVariants.length === 0) {
            return null;
          }

          const primaryVariant = availableVariants[0];

          return {
            // IDs críticos
            variant_id: extractNumericId(primaryVariant.id),
            product_id: extractNumericId(node.id),
            product_name: node.title || "Sin nombre",
            price: primaryVariant.price.toString(),
            inventory_quantity: primaryVariant.inventory_quantity,

            // Información completa
            id: node.id,
            title: node.title || "Sin título",
            handle: node.handle || "",
            description: node.description || "",
            status: node.status || "UNKNOWN",
            
            featuredImage: node.featuredMedia?.preview?.image
              ? {
                  id: node.featuredMedia.preview.image.id,
                  url: node.featuredMedia.preview.image.url,
                  altText: node.featuredMedia.preview.image.altText,
                }
              : null,

            priceRange: {
              min: parseFloat(node.priceRangeV2.minVariantPrice.amount) || 0,
              max: parseFloat(node.priceRangeV2.maxVariantPrice.amount) || 0,
              currency: node.priceRangeV2.minVariantPrice.currencyCode || "USD",
            },

            available: primaryVariant.available,
            hasStock: true,
            variant_title: primaryVariant.title,
            sku: primaryVariant.sku,
            variants: availableVariants,
            options: node.options || [],
            tags: node.tags || [],
            productType: node.productType || "",
            vendor: node.vendor || "",
            totalInventory: node.totalInventory || 0,
            tracksInventory: node.tracksInventory || false,
            createdAt: node.createdAt,
            updatedAt: node.updatedAt,
            cursor: edge.cursor,
            graphql_variant_id: primaryVariant.id,
            graphql_product_id: node.id,
          };
        } catch (productError) {
          return null;
        }
      })
      .filter((product: FormattedProduct | null): product is FormattedProduct => product !== null);

    // ✅ Resultado final mejorado
    const result = {
      success: true,
      products: productsWithStock,
      count: productsWithStock.length,
      pageInfo: data.data.products.pageInfo,
      metadata: {
        search_term: search,
        shopify_query: shopifyQuery,
        total_found: rawProducts.length,
        with_stock: productsWithStock.length,
        api_version: CONFIG.API_VERSION,
        shop_domain: shopDomain,
        timestamp: new Date().toISOString(),
        filters_applied: {
          stock_only: true,
          available_only: true,
        },
      },
      queryInfo: data.extensions?.cost
        ? {
            cost: data.extensions.cost.actualQueryCost,
            throttleStatus: data.extensions.cost.throttleStatus,
          }
        : undefined,
    };

    // ✅ Headers de cache
    headers.set("Cache-Control", `public, max-age=${CONFIG.CACHE_DURATION}`);
    headers.set("X-Total-Count", productsWithStock.length.toString());

    return json(result, { headers });

  } catch (error) {
    
    return json(
      {
        success: false,
        error: "Error interno del servidor",
        code: "INTERNAL_ERROR",
        message: error instanceof Error ? error.message : "Error desconocido",
        timestamp: new Date().toISOString(),
      },
      { status: 500, headers }
    );
  }
};

export async function OPTIONS() {
  const headers = new Headers({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  });

  return new Response(null, { status: 204, headers });
}