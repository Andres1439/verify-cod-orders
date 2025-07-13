// app/routes/api.products.tsx - VERSIÓN CORREGIDA CON EXTRACCIÓN DE IDs
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import db from "../db.server";
import { decryptToken } from "../utils/encryption.server";

// ✅ FUNCIÓN CRÍTICA: Extraer solo el número del ID GraphQL
function extractNumericId(graphqlId: string): string {
  if (!graphqlId) return "";

  // Si es un ID GraphQL (gid://shopify/ProductVariant/44787807060156)
  if (graphqlId.includes("gid://shopify/")) {
    const parts = graphqlId.split("/");
    const numericId = parts[parts.length - 1];
    return numericId || graphqlId;
  }

  // Si ya es un número, devolverlo tal como está
  return graphqlId;
}

// Tipos TypeScript basados en Shopify GraphQL 2025-04
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

interface ProductEdge {
  cursor: string;
  node: ProductNode;
}

// ✅ FORMATO CORREGIDO: variant_id y product_id como números puros
interface FormattedProduct {
  // ✅ IDs CRÍTICOS para N8N: Solo números
  variant_id: string; // "44787807060156"
  product_id: string; // "8801569996988"
  product_name: string; // "The Archived Snowboard"
  price: string; // "629.95"
  inventory_quantity: number; // 5

  // Información adicional
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
    variant_id: string; // ✅ También números puros en variantes
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

  // ✅ IDs completos para referencia si se necesitan
  graphql_variant_id: string;
  graphql_product_id: string;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  console.log("--- [API Products] Iniciando consulta ---");

  // Headers CORS estándar
  const headers = new Headers();
  headers.append("Access-Control-Allow-Origin", "*");
  headers.append("Access-Control-Allow-Methods", "GET, OPTIONS");
  headers.append("Access-Control-Allow-Headers", "Content-Type, Authorization");
  headers.append("Content-Type", "application/json");

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 200, headers });
  }

  try {
    // Extraer y validar parámetros
    const url = new URL(request.url);
    const shopDomain = url.searchParams.get("shop");
    const search = url.searchParams.get("search") || "";
    const first = Math.min(
      parseInt(url.searchParams.get("first") || "50"),
      250,
    );
    const sortKey = url.searchParams.get("sortKey") || "UPDATED_AT";
    const reverse = url.searchParams.get("reverse") === "true";

    console.log(`[API Products] Parámetros:`, {
      shopDomain,
      search: search || "búsqueda general",
      first,
      sortKey,
      reverse,
    });

    // Validación requerida
    if (!shopDomain) {
      return json(
        {
          success: false,
          error: "El parámetro 'shop' es requerido.",
          code: "MISSING_SHOP_DOMAIN",
        },
        { status: 400, headers },
      );
    }

    // Buscar tienda en base de datos
    const shop = await db.shop.findUnique({
      where: { shop_domain: shopDomain },
      select: {
        id: true,
        shop_domain: true,
        access_token: true,
      },
    });

    if (!shop?.access_token) {
      return json(
        {
          success: false,
          error: "Tienda no encontrada o no autorizada.",
          code: "SHOP_NOT_FOUND",
        },
        { status: 404, headers },
      );
    }

    // Descifrar access token
    let accessToken = shop.access_token;
    try {
      const parsed = JSON.parse(shop.access_token);
      if (parsed.encrypted && parsed.iv && parsed.tag) {
        accessToken = decryptToken(parsed);
      }
    } catch (e) {
      // Token no está cifrado, usar tal como viene
    }

    console.log(`[API Products] Tienda autorizada: ${shop.shop_domain}`);

    // Query GraphQL estándar Shopify 2025-04
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

    // Construir query de búsqueda Shopify
    let shopifyQuery: string | null = null;
    if (search && search.trim() !== "") {
      const searchTerm = search.trim().toLowerCase();

      // Mapeo inteligente de términos de búsqueda
      if (searchTerm.includes("pantalon")) {
        shopifyQuery = `title:*pantalon*`;
      } else if (searchTerm.includes("camiseta")) {
        shopifyQuery = `title:*camiseta*`;
      } else if (searchTerm.includes("zapato")) {
        shopifyQuery = `title:*zapato*`;
      } else if (searchTerm.includes("snowboard")) {
        shopifyQuery = `title:*snowboard*`;
      } else {
        // Para otros términos, usar búsqueda directa
        shopifyQuery = `title:*${searchTerm}*`;
      }
    }

    console.log(
      `[API Products] Query Shopify: ${shopifyQuery || "catálogo completo"}`,
    );

    // Petición a Shopify Admin API
    const adminApiUrl = `https://${shopDomain}/admin/api/2025-04/graphql.json`;

    const response = await fetch(adminApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
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

    if (!response.ok) {
      throw new Error(
        `Shopify API error: ${response.status} ${response.statusText}`,
      );
    }

    const data = await response.json();

    // Verificar errores GraphQL
    if (data.errors) {
      console.error("[API Products] GraphQL errors:", data.errors);
      return json(
        {
          success: false,
          error: "Error al consultar productos en Shopify",
          details: data.errors,
          code: "GRAPHQL_ERROR",
        },
        { status: 400, headers },
      );
    }

    const rawProducts = data.data.products.edges;
    console.log(
      `[API Products] Productos encontrados en Shopify: ${rawProducts.length}`,
    );

    // ✅ PROCESAMIENTO CORREGIDO: Extraer IDs numéricos
    const productsWithStock: FormattedProduct[] = rawProducts
      .map((edge: ProductEdge) => {
        const node = edge.node;

        // Procesar todas las variantes
        const allVariants = node.variants.edges.map((variantEdge) => {
          const variant = variantEdge.node;
          return {
            id: variant.id,
            variant_id: extractNumericId(variant.id), // ✅ EXTRAER NÚMERO PURO
            title: variant.title,
            price: parseFloat(variant.price),
            available: variant.availableForSale,
            inventory_quantity: variant.inventoryQuantity || 0,
            sku: variant.sku,
            options: variant.selectedOptions,
          };
        });

        // Filtrar variantes disponibles con stock
        const availableVariants = allVariants.filter(
          (variant) => variant.available && variant.inventory_quantity > 0,
        );

        // Solo procesar productos que tienen al menos una variante con stock
        if (availableVariants.length === 0) {
          return null;
        }

        // Usar la primera variante disponible como principal
        const primaryVariant = availableVariants[0];

        // ✅ LOG PARA VERIFICAR EXTRACCIÓN DE IDs
        console.log(`[API Products] Procesando producto:`, {
          original_product_id: node.id,
          extracted_product_id: extractNumericId(node.id),
          original_variant_id: primaryVariant.id,
          extracted_variant_id: extractNumericId(primaryVariant.id),
          product_name: node.title,
          price: primaryVariant.price,
        });

        return {
          // ✅ IDs CRÍTICOS: Solo números puros
          variant_id: extractNumericId(primaryVariant.id), // "44787807060156"
          product_id: extractNumericId(node.id), // "8801569996988"
          product_name: node.title, // "The Archived Snowboard"
          price: primaryVariant.price.toString(), // "629.95"
          inventory_quantity: primaryVariant.inventory_quantity, // 5

          // ✅ Información completa (mantener para compatibilidad)
          id: node.id,
          title: node.title,
          handle: node.handle,
          description: node.description || "",
          status: node.status,

          // Imagen destacada
          featuredImage: node.featuredMedia?.preview?.image
            ? {
                id: node.featuredMedia.preview.image.id,
                url: node.featuredMedia.preview.image.url,
                altText: node.featuredMedia.preview.image.altText,
              }
            : null,

          // Precios
          priceRange: {
            min: parseFloat(node.priceRangeV2.minVariantPrice.amount),
            max: parseFloat(node.priceRangeV2.maxVariantPrice.amount),
            currency: node.priceRangeV2.minVariantPrice.currencyCode,
          },

          // Stock
          available: primaryVariant.available,
          hasStock: true,

          // Información de variante principal
          variant_title: primaryVariant.title,
          sku: primaryVariant.sku,

          // ✅ Todas las variantes con IDs numéricos
          variants: availableVariants,

          // Opciones del producto
          options: node.options,

          // Metadata
          tags: node.tags,
          productType: node.productType,
          vendor: node.vendor,
          totalInventory: node.totalInventory,
          tracksInventory: node.tracksInventory,

          // Timestamps
          createdAt: node.createdAt,
          updatedAt: node.updatedAt,

          // Paginación
          cursor: edge.cursor,

          // ✅ IDs completos GraphQL para referencia
          graphql_variant_id: primaryVariant.id,
          graphql_product_id: node.id,
        };
      })
      .filter(
        (product: FormattedProduct | null): product is FormattedProduct =>
          product !== null,
      );

    // ✅ LOG FINAL para verificar el primer producto
    if (productsWithStock.length > 0) {
      const firstProduct = productsWithStock[0];
      console.log(`[API Products] Primer producto procesado:`, {
        variant_id: firstProduct.variant_id,
        product_name: firstProduct.product_name,
        price: firstProduct.price,
        inventory_quantity: firstProduct.inventory_quantity,
        is_variant_id_numeric: /^\d+$/.test(firstProduct.variant_id),
        is_product_name_string:
          typeof firstProduct.product_name === "string" &&
          !firstProduct.product_name.includes("gid://"),
      });
    }

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
        api_version: "2025-04",
        timestamp: new Date().toISOString(),
      },
      // Información de costo de GraphQL si está disponible
      ...(data.extensions?.cost && {
        queryInfo: {
          cost: data.extensions.cost.actualQueryCost,
          throttleStatus: data.extensions.cost.throttleStatus,
        },
      }),
    };

    console.log(
      `[API Products] Respuesta final: ${productsWithStock.length} productos con stock`,
    );
    return json(result, { headers });
  } catch (error) {
    console.error("[API Products] Error:", error);
    return json(
      {
        success: false,
        error: "Error interno del servidor",
        message: error instanceof Error ? error.message : "Error desconocido",
        code: "INTERNAL_ERROR",
        timestamp: new Date().toISOString(),
      },
      { status: 500, headers },
    );
  }
};

// Manejo de preflight CORS
export async function OPTIONS() {
  const headers = new Headers();
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  headers.set("Access-Control-Max-Age", "86400"); // 24 horas

  return new Response(null, { status: 204, headers });
}
