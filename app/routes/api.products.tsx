// app/routes/api.products.tsx
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import db from "../db.server";

// Tipos TypeScript para mayor seguridad
interface ProductVariant {
  id: string;
  title: string;
  price: string;
  availableForSale: boolean;
  inventoryQuantity: number;
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

interface FormattedProduct {
  id: string;
  legacyResourceId: string;
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
  variants: Array<{
    id: string;
    title: string;
    price: number;
    available: boolean;
    inventory_quantity: number;
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
  hasStock: boolean;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  console.log("--- [API Products] Petición recibida ---");

  // Headers CORS
  const headers = new Headers();
  headers.append("Access-Control-Allow-Origin", "*");
  headers.append("Content-Type", "application/json");

  try {
    // Extraer parámetros de la URL
    const url = new URL(request.url);
    const shopDomain = url.searchParams.get("shop");
    const search = url.searchParams.get("search") || "";
    const first = parseInt(url.searchParams.get("first") || "20");
    const sortKey = url.searchParams.get("sortKey") || "UPDATED_AT";
    const reverse = url.searchParams.get("reverse") === "true";

    console.log(`[API Products] Parámetros:`, {
      shopDomain,
      search,
      first,
      sortKey,
      reverse,
    });

    // Validar shop domain
    if (!shopDomain) {
      return json(
        { error: "El parámetro 'shop' es requerido." },
        { status: 400, headers },
      );
    }

    // Buscar la tienda en la base de datos
    const shop = await db.shop.findUnique({
      where: { shop_domain: shopDomain },
    });

    if (!shop || !shop.access_token) {
      return json(
        { error: "Tienda no encontrada o no autorizada." },
        { status: 404, headers },
      );
    }

    console.log(`[API Products] Tienda encontrada: ${shop.shop_domain}`);

    // Query GraphQL con featuredMedia actualizado
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
              variants(first: 10) {
                edges {
                  node {
                    id
                    title
                    price
                    availableForSale
                    inventoryQuantity
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

    // Hacer petición a Shopify Admin API
    const adminApiUrl = `https://${shopDomain}/admin/api/2025-04/graphql.json`;

    const response = await fetch(adminApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": shop.access_token,
      },
      body: JSON.stringify({
        query: graphqlQuery,
        variables: {
          first: Math.min(first, 250), // Shopify límite máximo
          query: search || null,
          sortKey: sortKey,
          reverse: reverse,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Shopify API error: ${response.status} ${response.statusText}`,
      );
    }

    const data = await response.json();

    // Verificar errores de GraphQL
    if (data.errors) {
      console.error("GraphQL errors:", data.errors);
      return json(
        {
          error: "Error al consultar productos",
          details: data.errors,
          extensions: data.extensions, // Incluir cost info si está disponible
        },
        { status: 400, headers },
      );
    }

    // Formatear respuesta para n8n/chatbot con tipado
    const products: FormattedProduct[] = data.data.products.edges
      .map((edge: ProductEdge): FormattedProduct => {
        const node = edge.node;

        // Solo incluir productos con al menos una variant disponible
        const availableVariants = node.variants.edges.filter(
          (variantEdge) =>
            variantEdge.node.availableForSale &&
            variantEdge.node.inventoryQuantity > 0,
        );

        return {
          // IDs
          id: node.id,
          legacyResourceId: node.id.split("/").pop() || "unknown", // Manejo seguro con fallback

          // Información básica
          title: node.title,
          handle: node.handle,
          description: node.description || "",
          status: node.status,

          // Media (campo actualizado)
          featuredImage: node.featuredMedia?.preview?.image
            ? {
                id: node.featuredMedia.preview.image.id,
                url: node.featuredMedia.preview.image.url,
                altText: node.featuredMedia.preview.image.altText,
              }
            : null,

          // Pricing
          priceRange: {
            min: parseFloat(node.priceRangeV2.minVariantPrice.amount),
            max: parseFloat(node.priceRangeV2.maxVariantPrice.amount),
            currency: node.priceRangeV2.minVariantPrice.currencyCode,
          },

          // Variants (solo las disponibles)
          variants: availableVariants.map((variantEdge) => {
            const variant = variantEdge.node;
            return {
              id: variant.id,
              title: variant.title,
              price: parseFloat(variant.price),
              available: variant.availableForSale,
              inventory_quantity: variant.inventoryQuantity, // CRÍTICO para n8n
              options: variant.selectedOptions,
            };
          }),

          // Options del producto
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

          // Para paginación
          cursor: edge.cursor,

          // Campo específico para el chatbot
          hasStock: availableVariants.length > 0,
        };
      })
      .filter((product: FormattedProduct) => product.hasStock); // Solo devolver productos con stock

    const result = {
      success: true,
      products: products,
      pageInfo: data.data.products.pageInfo,
      totalCount: products.length,
      // Incluir información de cost si está disponible
      ...(data.extensions?.cost && {
        queryInfo: {
          cost: data.extensions.cost.actualQueryCost,
          throttleStatus: data.extensions.cost.throttleStatus,
        },
      }),
    };

    console.log(
      `[API Products] Devolviendo ${products.length} productos CON STOCK para ${shopDomain}`,
    );
    return json(result, { headers });
  } catch (error) {
    console.error("[API Products] Error:", error);
    return json(
      {
        error: "Error interno del servidor al obtener productos.",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500, headers },
    );
  }
};

// Manejo de OPTIONS para CORS
export async function OPTIONS() {
  const headers = new Headers();
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

  return new Response(null, { status: 204, headers });
}
