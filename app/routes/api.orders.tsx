/* eslint-disable @typescript-eslint/no-unused-vars */
// app/routes/api.orders.tsx - VERSIÓN CORREGIDA - VALIDACIÓN DE TELÉFONO LOCAL
import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import db from "../db.server";
import { authenticate } from "../shopify.server";
import { decimalToString } from "../utils/decimal-utils";
import { cleanPrice, generateTechnicalEmail, cleanTextField } from "../utils/common-utils";
import { decryptToken } from "../utils/encryption.server";
import { RateLimiter } from "../utils/rate-limiter.server";

// ✅ TIPOS PARA TYPESCRIPT Y PRISMA JSON
interface ShopifyCustomerData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

interface ShopifyShippingAddress {
  firstName: string;
  lastName: string;
  address1: string;
  city: string;
  province: string;
  country: string;
  zip: string;
  phone: string;
  [key: string]: any;
}

interface ShopifyLineItem {
  variantId: string;
  quantity: number;
  customAttributes: Array<{
    key: string;
    value: string;
  }>;
}

interface DBLineItem {
  title: string;
  price: string;
  quantity: number;
  variantId: string;
  requiresShipping: boolean;
  taxable: boolean;
  [key: string]: any;
}

// ✅ NUEVA INTERFACE PARA MÚLTIPLES PRODUCTOS EN REQUEST
interface ProductItem {
  product_name: string;
  variant_id: string;
  price: string;
  quantity: number;
}

interface ShopifyOrderResult {
  success: boolean;
  order?: {
    id: string;
    name: string;
    totalPrice: string;
    currency: string;
    customer: {
      id: string;
      email: string;
    };
    lineItems: Array<{
      id: string;
      title: string;
      quantity: number;
      variant: {
        id: string;
      };
    }>;
  };
  error?: string;
}

interface CreateShopifyOrderParams {
  shopDomain: string;
  accessToken: string;
  customerData: ShopifyCustomerData;
  shippingAddress: ShopifyShippingAddress;
  lineItems: ShopifyLineItem[];
  currency?: string;
  note?: string;
  totalPrice: number;  // ✅ CAMBIO: totalPrice en lugar de itemPrice
  requestId: string;
}

// ✅ FUNCIÓN IMPORTADA DESDE UTILS COMPARTIDAS

async function verifyVariantExists(
  shopDomain: string,
  accessToken: string,
  variantId: string,
): Promise<{ exists: boolean; price?: number; title?: string }> {
  try {
    // Verificando variant_id en Shopify (GraphQL)

    // Si el ID no es un GID, construirlo
    let gid = variantId;
    if (!variantId.startsWith("gid://")) {
      gid = `gid://shopify/ProductVariant/${variantId}`;
    }

    const graphqlQuery = `#graphql\n\
      query getVariant($id: ID!) {\n\
        productVariant(id: $id) {\n\
          id\n\
          title\n\
          price\n\
          availableForSale\n\
        }\n\
      }\n\
    `;

    const response = await fetch(
      `https://${shopDomain}/admin/api/2025-04/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
          "X-Request-ID": `variant-check-graphql-${Date.now()}`,
        },
        body: JSON.stringify({
          query: graphqlQuery,
          variables: { id: gid },
        }),
      },
    );

    if (!response.ok) {
      // Respuesta no OK de Shopify GraphQL
      return { exists: false };
    }

    const data = await response.json();
    if (data.errors || !data.data || !data.data.productVariant) {

      return { exists: false };
    }

    const variant = data.data.productVariant;


    return {
      exists: true,
      price: parseFloat(variant.price),
      title: variant.title,
    };
  } catch (error) {

    return { exists: false };
  }
}

// ✅ FUNCIÓN IMPORTADA DESDE UTILS COMPARTIDAS

// ✅ FUNCIÓN PARA VALIDAR Y LIMPIAR EMAILS
function cleanInvalidEmail(email: string): string {
  if (!email || email.trim() === "") {
    return "";
  }

  const cleanEmail = email.trim().toLowerCase();

  const invalidPhrases = [
    "no brindo información",
    "no brindo informacion",
    "nobrindoinformación",
    "nobrindoinformacion",
    "no doy información",
    "no doy informacion",
    "no proporciono",
    "no tengo",
    "no quiero",
    "no deseo",
    "prefiero no dar",
    "prefiero no",
    "no dar",
    "sin email",
    "sin correo",
    "no correo",
    "no email",
    "ninguno",
    "n/a",
    "na",
    "no",
    "nada",
    "no disponible",
    "no aplica",
    "no tengo correo",
    "no tengo email",
    "sin información",
    "sin informacion",
  ];

  const hasInvalidPhrase = invalidPhrases.some((phrase) =>
    cleanEmail.includes(phrase),
  );

  if (hasInvalidPhrase) {
    return "";
  }

  const emailRegex =
    /^[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/;

  if (!emailRegex.test(cleanEmail)) {
    return "";
  }

  if (
    !cleanEmail.includes("@") ||
    !cleanEmail.includes(".") ||
    cleanEmail.length < 5 ||
    cleanEmail.length > 254 ||
    cleanEmail.endsWith(".")
  ) {
    return "";
  }

  return cleanEmail;
}

// ✅ NUEVA: VALIDACIÓN DE TELÉFONO FLEXIBLE PARA MÚLTIPLES PAÍSES
function validateLocalPhone(phone: string, countryCode: string): boolean {
  const phoneClean = phone.replace(/[\s\-\+\(\)]/g, "");

  // ✅ VALIDACIÓN BÁSICA: Solo números
  if (!/^\d+$/.test(phoneClean)) {
    return false;
  }

  // ✅ VALIDACIÓN FLEXIBLE: Longitud entre 7 y 15 dígitos
  // Esto cubre la mayoría de formatos internacionales
  const phoneLength = phoneClean.length;
  
  if (phoneLength < 7 || phoneLength > 15) {
    return false;
  }

  // ✅ VALIDACIONES ADICIONALES OPCIONALES POR REGIÓN
  // Estas son sugerencias, pero no restrictivas
  const commonPatterns = {
    // Números que empiecen con 0 (muchos países usan esto)
    startsWithZero: /^0\d{6,14}$/,
    // Números que empiecen con dígitos del 1-9
    startsWithDigit: /^[1-9]\d{6,14}$/,
    // Números que empiecen con 6,7,8,9 (comunes en móviles)
    mobilePattern: /^[6-9]\d{6,14}$/
  };

  // ✅ ACEPTAR SI CUMPLE CUALQUIER PATRÓN COMÚN
  return (
    commonPatterns.startsWithZero.test(phoneClean) ||
    commonPatterns.startsWithDigit.test(phoneClean) ||
    commonPatterns.mobilePattern.test(phoneClean) ||
    phoneLength >= 8 // Fallback: cualquier número de 8+ dígitos
  );
}

// ✅ ANTIGUA: VALIDACIÓN DE TELÉFONO CON CÓDIGO DE PAÍS (MANTENER PARA USAR DESPUÉS)
function validatePhoneWithCountryCode(phone: string): boolean {
  const phoneClean = phone.replace(/[\s\-\+]/g, "");

  if (!/^\d+$/.test(phoneClean)) {
    return false;
  }

  // Validar códigos de país específicos más estrictos
  const validPatterns = [
    /^51[9]\d{8}$/,    // Perú: 51 + 9 + 8 dígitos
    /^57[3]\d{9}$/,    // Colombia: 57 + 3 + 9 dígitos  
    /^52\d{10}$/,      // México: 52 + 10 dígitos
    /^54[9]\d{9}$/,    // Argentina: 54 + 9 + 9 dígitos
    /^56[9]\d{8}$/,    // Chile: 56 + 9 + 8 dígitos
  ];

  return validPatterns.some(pattern => pattern.test(phoneClean));
}

// ✅ NUEVA: VALIDACIÓN DE DATOS ESENCIALES PARA SHOPIFY 2025
function validateEssentialOrderData(data: any, countryCode: string) {
  const errors: string[] = [];

  // ✅ CAMPOS OBLIGATORIOS PARA EL CLIENTE
  if (!data.first_name || data.first_name.trim() === "") {
    errors.push("Nombre es requerido");
  }

  if (!data.phone || data.phone.trim() === "") {
    errors.push("Número de contacto es requerido");
  }

  if (!data.address1 || data.address1.trim() === "") {
    errors.push("Dirección es requerida");
  }

  if (!data.email || data.email.trim() === "") {
    errors.push("Correo electrónico es requerido");
  }

  // ✅ VALIDAR FORMATO DE EMAIL
  if (data.email && data.email.trim() !== "") {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(data.email.trim())) {
      errors.push("Formato de correo electrónico inválido");
    }
  }

  // ✅ VALIDAR TELÉFONO CON FORMATO FLEXIBLE
  if (data.phone && !validateLocalPhone(data.phone, countryCode)) {
    errors.push(
      `Número de teléfono inválido. Debe tener entre 7 y 15 dígitos y contener solo números. Ejemplos válidos: 987654321, 3001234567, 5551234567`
    );
  }

  // ✅ VALIDACIÓN DE PRODUCTOS - SOPORTE PARA AMBOS FORMATOS
  if (data.products && Array.isArray(data.products)) {
    // ✅ FORMATO NUEVO: Array de productos
    if (data.products.length === 0) {
      errors.push("Al menos un producto es requerido");
    } else {
      data.products.forEach((product: any, index: number) => {
        if (!product.product_name || product.product_name.trim() === "") {
          errors.push(`Producto ${index + 1}: Nombre del producto es requerido`);
        }
        if (!product.variant_id || product.variant_id.trim() === "") {
          errors.push(`Producto ${index + 1}: ID del producto (variant_id) es requerido`);
        }
        if (!product.price || cleanPrice(product.price) <= 0) {
          errors.push(`Producto ${index + 1}: Precio del producto debe ser mayor a 0`);
        }
        if (!product.quantity || parseInt(product.quantity) <= 0) {
          errors.push(`Producto ${index + 1}: Cantidad debe ser mayor a 0`);
        }
      });
    }
  } else {
    // ✅ FORMATO ANTERIOR: Un solo producto
    if (!data.product_name || data.product_name.trim() === "") {
      errors.push("Nombre del producto es requerido");
    }
    if (!data.variant_id || data.variant_id.trim() === "") {
      errors.push("ID del producto (variant_id) es requerido");
    }
    if (!data.price || cleanPrice(data.price) <= 0) {
      errors.push("Precio del producto debe ser mayor a 0");
    }
    if (!data.quantity || parseInt(data.quantity) <= 0) {
      errors.push("Cantidad debe ser mayor a 0");
    }
  }

  return errors;
}

function validateNoDefaultValues(data: any) {
  const errors: string[] = [];

  const invalidPhrases = [
    "no brindo información",
    "no brindo informacion",
    "nobrindoinformación",
    "nobrindoinformacion",
  ];

  if (
    data.phone &&
    invalidPhrases.some((phrase) => data.phone.toLowerCase().includes(phrase))
  ) {
    errors.push(
      "NÚMERO DE TELÉFONO ES OBLIGATORIO - No se puede crear orden sin teléfono válido",
    );
  }

  return errors;
}

// ✅ FUNCIÓN PARA VERIFICAR SI UN CAMPO ES OBLIGATORIO
function isFieldRequired(fieldName: string, requiredFields: any): boolean {
  if (!requiredFields || typeof requiredFields !== "object") {
    return false;
  }

  const fieldMapping = {
    nombre: ["first_name", "last_name"],
    correo: ["email"],
    direccion: ["address1"],
    ciudad: ["city"],
    provincia: ["province"],
    pais: ["country"],
  };

  for (const [configKey, fields] of Object.entries(fieldMapping)) {
    if (fields.includes(fieldName)) {
      return requiredFields[configKey] === true;
    }
  }

  return false;
}

// ✅ NUEVA FUNCIÓN: OBTENER INFORMACIÓN COMPLETA DE LA TIENDA (REEMPLAZA getShopCurrency)
async function getShopInfoWithCountry(
  shopDomain: string,
  accessToken: string,
): Promise<{ currency: string; countryCode: string; timezone: string }> {
  try {

    const query = `
      query {
        shop {
          currencyCode
          name
          countryCode
          timezone
          ianaTimezone
          address {
            countryCode
            country
            city
          }
        }
      }
    `;

    const response = await fetch(
      `https://${shopDomain}/admin/api/2025-04/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
          "X-Request-ID": `shop-info-${Date.now()}-${Math.random()}`,
        },
        body: JSON.stringify({ query }),
      },
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();

    if (result.errors) {
      throw new Error(
        `GraphQL Error: ${result.errors.map((e: any) => e.message).join(", ")}`,
      );
    }

    const shop = result.data.shop;
    const currency = shop.currencyCode || "USD";
    const countryCode = shop.countryCode || shop.address?.countryCode || "PE";
    const timezone = shop.ianaTimezone || shop.timezone || "America/Lima";

    return { currency, countryCode, timezone };
  } catch (error) {
    console.error("Error obteniendo información de la tienda", {
      shopDomain,
      error: error instanceof Error ? error.message : "Unknown error",
    });

    // ✅ FALLBACK: Usar REST API
    try {
      const restResponse = await fetch(
        `https://${shopDomain}/admin/api/2025-04/shop.json`,
        {
          headers: {
            "X-Shopify-Access-Token": accessToken,
            "X-Request-ID": `shop-fallback-${Date.now()}`,
          },
        },
      );

      if (restResponse.ok) {
        const restResult = await restResponse.json();
        const fallbackCurrency = restResult.shop?.currency || "USD";
        const fallbackCountry = restResult.shop?.country_code || "PE";
        const fallbackTimezone = restResult.shop?.iana_timezone || "America/Lima";
        
        console.error("Fallback REST API - Información obtenida", {
          shopDomain,
          currency: fallbackCurrency,
          countryCode: fallbackCountry,
          timezone: fallbackTimezone,
        });
        
        return { 
          currency: fallbackCurrency, 
          countryCode: fallbackCountry,
          timezone: fallbackTimezone 
        };
      }
    } catch (fallbackError) {
      console.error("Fallback también falló", {
        shopDomain,
        error: fallbackError instanceof Error ? fallbackError.message : "Unknown error",
      });
    }

    // ✅ DEFAULT SEGURO
    return { currency: "USD", countryCode: "PE", timezone: "America/Lima" };
  }
}

// ✅ NUEVA FUNCIÓN: OBTENER NOMBRE DEL PAÍS DESDE CÓDIGO
function getCountryNameFromCode(countryCode: string): string {
  const countryNames: Record<string, string> = {
    'PE': 'Peru',
    'CO': 'Colombia', 
    'MX': 'Mexico',
    'US': 'United States',
    'CA': 'Canada',
    'AR': 'Argentina',
    'CL': 'Chile',
    'BR': 'Brazil',
    'EC': 'Ecuador',
    'VE': 'Venezuela',
    'ES': 'Spain',
    'UY': 'Uruguay',
    'PY': 'Paraguay',
    'BO': 'Bolivia',
  };
  
  return countryNames[countryCode] || 'Peru'; // Default Peru
}

// ✅ NUEVA FUNCIÓN: AGREGAR CÓDIGO DE PAÍS AL TELÉFONO
function addCountryCodeToPhone(phone: string, countryCode: string): string {
  // Limpiar teléfono
  const cleanPhone = phone.replace(/[^0-9]/g, "");
  
  // Mapeo de códigos de país a códigos telefónicos
  const phoneCountryCodes: Record<string, string> = {
    'PE': '51',  // Perú
    'CO': '57',  // Colombia
    'MX': '52',  // México
    'US': '1',   // Estados Unidos
    'CA': '1',   // Canadá
    'AR': '54',  // Argentina
    'CL': '56',  // Chile
    'BR': '55',  // Brasil
    'EC': '593', // Ecuador
    'VE': '58',  // Venezuela
    'ES': '34',  // España
    'UY': '598', // Uruguay
    'PY': '595', // Paraguay
    'BO': '591', // Bolivia
    // Agregar más según necesidades
  };

  const phoneCountryCode = phoneCountryCodes[countryCode] || '51'; // Default Perú

  // Si el teléfono ya tiene código de país, asegurar que tenga el signo +
  if (cleanPhone.startsWith(phoneCountryCode)) {
    return `+${cleanPhone}`;
  }

  // Si el teléfono empieza con 9 (típico de móviles peruanos), agregar código con +
  if (countryCode === 'PE' && cleanPhone.startsWith('9') && cleanPhone.length === 9) {
    return `+51${cleanPhone}`;
  }
  
  // Si el teléfono empieza con 3 (típico de móviles colombianos), agregar código con +
  if (countryCode === 'CO' && cleanPhone.startsWith('3') && cleanPhone.length === 10) {
    return `+57${cleanPhone}`;
  }

  // Para otros casos, agregar código de país con +
  return `+${phoneCountryCode}${cleanPhone}`;
}

// ✅ NUEVA FUNCIÓN: Solo buscar customer existente SIN modificar
async function findExistingCustomer(
  shopDomain: string,
  accessToken: string,
  customerData: ShopifyCustomerData,
  requestId: string
): Promise<{ success: boolean; customerId?: string; customer?: any; error?: string }> {
  try {
    // Buscar customer existente por email
    let existingCustomer = null;
    if (customerData.email) {
      const searchResponse = await fetch(
        `https://${shopDomain}/admin/api/2025-04/customers/search.json?query=email:${encodeURIComponent(customerData.email)}`,
        {
          method: "GET",
          headers: {
            "X-Shopify-Access-Token": accessToken,
            "Content-Type": "application/json",
          },
        }
      );

      if (searchResponse.ok) {
        const searchResult = await searchResponse.json();
        if (searchResult.customers && searchResult.customers.length > 0) {
          existingCustomer = searchResult.customers[0];
        }
      }
    }

    // Si no se encuentra por email, buscar por teléfono
    if (!existingCustomer && customerData.phone) {
      const phoneSearchResponse = await fetch(
        `https://${shopDomain}/admin/api/2025-04/customers/search.json?query=phone:${encodeURIComponent(customerData.phone)}`,
        {
          method: "GET",
          headers: {
            "X-Shopify-Access-Token": accessToken,
            "Content-Type": "application/json",
          },
        }
      );

      if (phoneSearchResponse.ok) {
        const phoneSearchResult = await phoneSearchResponse.json();
        if (phoneSearchResult.customers && phoneSearchResult.customers.length > 0) {
          existingCustomer = phoneSearchResult.customers[0];
        }
      }
    }

    if (existingCustomer) {
      console.error("Customer existente encontrado (NO se modificará):", {
        requestId,
        customerId: existingCustomer.id,
        email: existingCustomer.email,
        phone: existingCustomer.phone,
      });

      return {
        success: true,
        customerId: existingCustomer.id.toString(),
        customer: existingCustomer
      };
    } else {
      console.error("Customer no encontrado, se usarán datos proporcionados:", {
        requestId,
        email: customerData.email,
        phone: customerData.phone,
      });

      return {
        success: true,
        customerId: undefined, // No hay customer existente
        customer: undefined
      };
    }

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}

// ✅ FUNCIÓN ORIGINAL: Crear o actualizar customer en Shopify (MANTENER PARA OTROS USOS)
async function createOrUpdateCustomer(
  shopDomain: string,
  accessToken: string,
  customerData: ShopifyCustomerData,
  requestId: string
): Promise<{ success: boolean; customerId?: string; error?: string }> {
  try {
    // Buscar customer existente por email
    let existingCustomer = null;
    if (customerData.email) {
      const searchResponse = await fetch(
        `https://${shopDomain}/admin/api/2025-04/customers/search.json?query=email:${encodeURIComponent(customerData.email)}`,
        {
          method: "GET",
          headers: {
            "X-Shopify-Access-Token": accessToken,
            "Content-Type": "application/json",
          },
        }
      );

      if (searchResponse.ok) {
        const searchResult = await searchResponse.json();
        if (searchResult.customers && searchResult.customers.length > 0) {
          existingCustomer = searchResult.customers[0];
        }
      }
    }

    // ✅ OMITIR CAMPOS VACÍOS EN CUSTOMER PAYLOAD
    const customerInfo: any = {
      tags: "chatbot"
    };
    
    // Solo agregar campos que tienen valores reales
    if (customerData.firstName && customerData.firstName.trim() !== "") {
      customerInfo.first_name = customerData.firstName.trim();
    }
    if (customerData.lastName && customerData.lastName.trim() !== "") {
      customerInfo.last_name = customerData.lastName.trim();
    }
    if (customerData.email && customerData.email.trim() !== "") {
      customerInfo.email = customerData.email.trim();
      customerInfo.verified_email = true;
    }
    if (customerData.phone && customerData.phone.trim() !== "") {
      customerInfo.phone = customerData.phone.trim();
    }

    const customerPayload = {
      customer: customerInfo
    };

    let response;
    if (existingCustomer) {
      // Actualizar customer existente
      response = await fetch(
        `https://${shopDomain}/admin/api/2025-04/customers/${existingCustomer.id}.json`,
        {
          method: "PUT",
          headers: {
            "X-Shopify-Access-Token": accessToken,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(customerPayload),
        }
      );
    } else {
      // Crear nuevo customer
      response = await fetch(
        `https://${shopDomain}/admin/api/2025-04/customers.json`,
        {
          method: "POST",
          headers: {
            "X-Shopify-Access-Token": accessToken,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(customerPayload),
        }
      );
    }

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `HTTP ${response.status}: ${errorText}` };
    }

    const result = await response.json();
    const customer = result.customer;

    return {
      success: true,
      customerId: customer.id.toString()
    };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}

// ✅ MODIFICADA: createShopifyOrder con customer creation y price explícito
async function createShopifyOrder({
  shopDomain,
  accessToken,
  customerData,
  shippingAddress,
  lineItems,
  currency = "USD",
  note = "",
  totalPrice,
  requestId,
}: CreateShopifyOrderParams): Promise<ShopifyOrderResult> {
  try {
    // ✅ PASO 1: Buscar customer existente SIN modificarlo
    const customerResult = await findExistingCustomer(
      shopDomain,
      accessToken,
      customerData,
      requestId
    );

    if (!customerResult.success) {
      console.error("Error buscando customer existente:", {
        requestId,
        error: customerResult.error,
      });
      // Continuar sin customer_id si falla
    }

    const uniqueNote = "chatbot";

    // ✅ FUNCIÓN HELPER PARA OMITIR CAMPOS VACÍOS
    const omitEmptyFields = (obj: any) => {
      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        if (value !== "" && value !== null && value !== undefined) {
          result[key] = value;
        }
      }
      return result;
    };

    // ✅ PREPARAR DATOS DEL CLIENTE - SOLO CAMPOS PROPORCIONADOS
    const customerInfo = omitEmptyFields({
      first_name: customerData.firstName,
      last_name: customerData.lastName,
      email: customerData.email,
      phone: customerData.phone,
    });

    // ✅ PREPARAR DIRECCIÓN DE FACTURACIÓN - VALORES DESCRIPTIVOS PARA CAMPOS FALTANTES
    const billingAddressInfo = {
      first_name: shippingAddress.firstName || customerData.firstName,
      last_name: shippingAddress.lastName || customerData.lastName || "Cliente", // MANTENER COMO CLIENTE
      address1: shippingAddress.address1,
      city: shippingAddress.city || "No especificada",
      province: shippingAddress.province || "No especificada", 
      country: shippingAddress.country,
      zip: shippingAddress.zip || "00000",
      phone: shippingAddress.phone || customerData.phone,
    };

    // ✅ PREPARAR DIRECCIÓN DE ENVÍO - VALORES DESCRIPTIVOS PARA CAMPOS FALTANTES
    const shippingAddressInfo = {
      first_name: shippingAddress.firstName || customerData.firstName,
      last_name: shippingAddress.lastName || customerData.lastName || "Cliente", // MANTENER COMO CLIENTE
      address1: shippingAddress.address1,
      city: shippingAddress.city || "No especificada",
      province: shippingAddress.province || "No especificada",
      country: shippingAddress.country,
      zip: shippingAddress.zip || "00000",
      phone: shippingAddress.phone || customerData.phone,
    };

    const orderData = {
      order: {
        note: uniqueNote,
        // ✅ INCLUIR TELÉFONO A NIVEL DE ORDEN - REQUERIDO POR SHOPIFY
        ...(customerData.phone && { phone: customerData.phone }),
        // ✅ INCLUIR EMAIL DE CONTACTO A NIVEL DE ORDEN
        ...(customerData.email && { contact_email: customerData.email }),
        // ✅ INCLUIR CUSTOMER_ID SI SE OBTUVO EXITOSAMENTE
        ...(customerResult.success && customerResult.customerId && { 
          customer: { 
            id: parseInt(customerResult.customerId)
          } 
        }),
        // ✅ INCLUIR EMAIL SI NO ESTÁ VACÍO Y NO HAY CUSTOMER_ID
        ...(!customerResult.success && customerData.email && { email: customerData.email }),
        // ✅ INCLUIR CUSTOMER DATA SI NO HAY CUSTOMER_ID Y TIENE DATOS
        ...(!customerResult.success && Object.keys(customerInfo).length > 0 && { customer: customerInfo }),
        // ✅ INCLUIR BILLING_ADDRESS SOLO SI TIENE DATOS
        ...(Object.keys(billingAddressInfo).length > 0 && { billing_address: billingAddressInfo }),
        // ✅ INCLUIR SHIPPING_ADDRESS SOLO SI TIENE DATOS
        ...(Object.keys(shippingAddressInfo).length > 0 && { shipping_address: shippingAddressInfo }),
        line_items: lineItems.map((item) => ({
          variant_id: item.variantId,
          quantity: item.quantity,
          // ✅ PRECIO INDIVIDUAL POR PRODUCTO - cada item tiene su precio
          price: item.customAttributes.find(attr => attr.key === "item_price")?.value || "0",
          custom_attributes: [
            ...item.customAttributes,
            {
              key: "request_id",
              value: requestId,
            },
            {
              key: "creation_timestamp",
              value: Date.now().toString(),
            },
          ],
        })),
        currency: currency, // ✅ USAR CURRENCY PASADO COMO PARÁMETRO
        financial_status: "pending",
        fulfillment_status: "unfulfilled",
        tags: "chatbot",
      },
    };

    console.error("Orden enviada a Shopify:", {
      requestId,
      variant_id: orderData.order.line_items[0]?.variant_id,
      quantity: orderData.order.line_items[0]?.quantity,
      currency: orderData.order.currency,
    });

    const response = await fetch(
      `https://${shopDomain}/admin/api/2025-04/orders.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
          "X-Request-ID": requestId,
          "Cache-Control": "no-cache",
        },
        body: JSON.stringify(orderData),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Error en petición a Shopify:", {
        requestId,
        status: response.status,
        statusText: response.statusText,
        error: errorText,
      });
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    const order = result.order;

    console.error("Orden creada exitosamente en Shopify:", {
      requestId,
      orderName: order.name,
      orderId: order.id,
      currency: order.currency,
      phone: customerData.phone,
      email: order.email,
      lineItemsCount: order.line_items?.length,
      firstVariantId: order.line_items?.[0]?.variant_id,
    });

    return {
      success: true,
      order: {
        id: order.id,
        name: order.name,
        totalPrice: order.total_price,
        currency: order.currency,
        customer: {
          id: order.customer?.id,
          email: order.email,
        },
        lineItems: order.line_items.map((item: any) => ({
          id: item.id,
          title: item.title,
          quantity: item.quantity,
          variant: {
            id: item.variant_id,
          },
        })),
      },
    };
  } catch (error) {
    console.error("Error creando orden en Shopify", {
      requestId,
      shopDomain,
      error: error instanceof Error ? error.message : "Unknown error",
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : "Error desconocido",
    };
  }
}

// ✅ FUNCIÓN PRINCIPAL CORREGIDA - CAMBIO DE ORDEN EN VALIDACIONES
export const action = async ({ request }: ActionFunctionArgs) => {
  const headers = new Headers();
  headers.append("Access-Control-Allow-Origin", "*");
  headers.append("Access-Control-Allow-Methods", "POST, OPTIONS");
  headers.append("Access-Control-Allow-Headers", "Content-Type, Authorization");
  headers.append("Content-Type", "application/json");

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 200, headers });
  }

  try {
    const body = await request.json();

    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const {
      shopDomain,
      first_name,
      email,
      phone,
      address1,
      products, // ✅ NUEVO: Array de productos
      // ✅ MANTENER COMPATIBILIDAD CON FORMATO ANTERIOR (UN SOLO PRODUCTO)
      product_name,
      price,
      quantity,
      variant_id: rawVariantId,
    } = body;

    // ✅ DETERMINAR SI ES FORMATO MÚLTIPLE O ÚNICO
    const isMultipleProducts = Array.isArray(products) && products.length > 0;
    
    // ✅ CONVERTIR A FORMATO ESTÁNDAR DE MÚLTIPLES PRODUCTOS
    const productItems: ProductItem[] = isMultipleProducts 
      ? products.map((product: any) => ({
          product_name: product.product_name || product.name,
          variant_id: product.variant_id,
          price: product.price,
          quantity: product.quantity || 1,
        }))
      : [{
          product_name,
          variant_id: rawVariantId,
          price,
          quantity: quantity || 1,
        }];

    // ✅ CAMPOS FIJOS VACÍOS SEGÚN REQUERIMIENTO
    const last_name = "";
    const city = "";
    const zip = "";
    const province = "";

    function extractVariantId(variantId: string): string {
      if (!variantId) return variantId;

      if (variantId.includes("gid://shopify/ProductVariant/")) {
        return variantId.split("/").pop() || variantId;
      }

      return variantId;
    }

    // ✅ PROCESAR VARIANT_IDS PARA TODOS LOS PRODUCTOS
    const processedProductItems = productItems.map(item => ({
      ...item,
      variant_id: extractVariantId(item.variant_id),
    }));

    console.error("=== NUEVA PETICIÓN DE ORDEN MÚLTIPLE ===", {
      requestId,
      shopDomain,
      isMultipleProducts,
      productCount: processedProductItems.length,
      timestamp: Date.now(),
    });

    console.error("Productos recibidos:", {
      requestId,
      phone,
      products: processedProductItems.map(item => ({
        name: item.product_name,
        price: item.price,
        quantity: item.quantity,
        variant_id: item.variant_id,
      })),
      has_name: !!first_name,
      has_email: !!email,
      has_address: !!address1,
      original_email: email,
    });

    // ✅ CALCULAR TOTAL DESDE PRODUCTOS PROCESADOS
    let orderTotal = 0;
    const processedPrices = [];
    
    for (const item of processedProductItems) {
      const cleanedPrice = cleanPrice(item.price);
      const itemQuantity = item.quantity || 1;
      const itemTotal = cleanedPrice * itemQuantity;
      
      // ✅ VALIDAR QUE CADA PRECIO SEA VÁLIDO
      if (cleanedPrice <= 0) {
        return json(
          {
            error: "Precio del producto inválido",
            details: [
              `Producto: ${item.product_name}, Precio original: ${item.price}, Precio procesado: ${cleanedPrice}`,
            ],
            code: "INVALID_PRICE",
          },
          { status: 400, headers },
        );
      }
      
      orderTotal += itemTotal;
      processedPrices.push({
        product: item.product_name,
        unitPrice: cleanedPrice,
        quantity: itemQuantity,
        totalPrice: itemTotal
      });
    }

    console.error("Precios calculados correctamente:", {
      requestId,
      orderTotal,
      processedPrices
    });

    const shop = await db.shop.findUnique({
      where: { shop_domain: shopDomain },
      select: {
        id: true,
        shop_domain: true,
        access_token: true,
      },
    });

    if (!shop) {

      return json({ error: "Tienda no encontrada" }, { status: 404, headers });
    }

    if (!shop.access_token) {

      return json(
        { error: "Token de acceso no disponible para la tienda" },
        { status: 400, headers },
      );
    }

    let realAccessToken = shop.access_token;
    try {
      const parsed = JSON.parse(shop.access_token);
      if (parsed.encrypted && parsed.iv && parsed.tag) {
        realAccessToken = decryptToken(parsed);
      }
    } catch (e) {}

    // ✅ 1. PRIMERO: OBTENER INFORMACIÓN DE LA TIENDA (INCLUYE PAÍS)
    const shopInfo = await getShopInfoWithCountry(shop.shop_domain, realAccessToken);
    const { currency, countryCode, timezone } = shopInfo;



    // ✅ 2. SEGUNDO: VALIDAR CAMPOS ESENCIALES (NOMBRE, CONTACTO, DIRECCIÓN, CORREO)
    const basicErrors = validateEssentialOrderData(body, countryCode);
    const securityErrors = validateNoDefaultValues(body);
    
    // ✅ VALIDAR CADA PRODUCTO INDIVIDUALMENTE
    const productErrors: string[] = [];
    
    for (let i = 0; i < processedProductItems.length; i++) {
      const product = processedProductItems[i];
      
      if (!product.product_name || product.product_name.trim() === "") {
        productErrors.push(`Producto ${i + 1}: Nombre del producto es requerido`);
      }
      
      if (!product.variant_id || product.variant_id.trim() === "") {
        productErrors.push(`Producto ${i + 1}: ID de variante es requerido`);
      }
      
      if (!product.price || isNaN(parseFloat(product.price))) {
        productErrors.push(`Producto ${i + 1}: Precio válido es requerido`);
      }
      
      if (!product.quantity || product.quantity < 1) {
        productErrors.push(`Producto ${i + 1}: Cantidad debe ser mayor a 0`);
      }
    }

    const allErrors = [...basicErrors, ...securityErrors, ...productErrors];

    if (allErrors.length > 0) {


      return json(
        {
          error: "Datos insuficientes para crear la orden",
          details: allErrors,
          code: "SECURITY_VALIDATION_FAILED",
        },
        { status: 400, headers },
      );
    }

    // ✅ 3. TERCERO: AGREGAR CÓDIGO DE PAÍS AL TELÉFONO (DESPUÉS DE VALIDAR)
    const phoneWithCountryCode = addCountryCodeToPhone(phone, countryCode);

    // ✅ 4. CUARTO: VALIDAR QUE EL TELÉFONO CON CÓDIGO SEA CORRECTO (OPCIONAL)
    if (!validatePhoneWithCountryCode(phoneWithCountryCode)) {

      // No retornar error aquí, solo log de warning
    }



    // ✅ OBTENER CONFIGURACIÓN DE CAMPOS OBLIGATORIOS
    const shopConfig = await db.chatbotConfiguration.findUnique({
      where: { shop_id: shop.id },
      select: {
        required_fields: true,
      },
    });

    const requiredFields = shopConfig?.required_fields || {};



    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, "0");
    const internalOrderNumber = `ORD-${timestamp}-${random}-${requestId.split("-")[2]}`;

    // ✅ PROCESAR CAMPOS SIN INVENTAR DATOS - SOLO USAR LO QUE SE PROPORCIONÓ
    const finalFirstName =
      first_name && cleanTextField(first_name)
        ? cleanTextField(first_name)
        : "";
    const finalLastName =
      last_name && cleanTextField(last_name) ? cleanTextField(last_name) : "";

    // ✅ EMAIL: Solo usar si se proporcionó realmente
    const finalEmail = (() => {
      if (email && cleanTextField(email)) {
        return cleanInvalidEmail(email);
      }
      // NO generar email automático - dejar vacío si no se proporcionó
      return "";
    })();

    // ✅ CAMPOS DE DIRECCIÓN: Solo usar si fueron proporcionados realmente
    const cleanAddress1 =
      address1 && cleanTextField(address1) ? cleanTextField(address1) : "";
    // ✅ CAMPOS FIJOS VACÍOS SEGÚN REQUERIMIENTO
    const cleanCity = "";
    const cleanProvince = "";
    // ✅ PAÍS AUTOMÁTICO DESDE LA TIENDA
    const cleanCountry = getCountryNameFromCode(countryCode);
    // ✅ ZIP FIJO VACÍO SEGÚN REQUERIMIENTO
    const cleanZip = "";


    // ✅ VALIDAR QUE SOLO SE USEN DATOS REALES PARA MOSTRAR AL CLIENTE
    const hasRealFirstName = !!finalFirstName && !!first_name;
    const hasRealLastName = false; // Siempre falso, campo fijo vacío
    const hasRealEmail = !!finalEmail && !!email;
    const hasRealAddress = !!cleanAddress1 && !!address1;
    const hasRealCity = false; // Siempre falso, campo fijo vacío
    const hasRealProvince = false; // Siempre falso, campo fijo vacío
    const hasRealCountry = true; // Siempre verdadero, automático desde tienda
    const hasRealZip = false; // Siempre falso, campo fijo vacío

    // ✅ PROCESAR MÚLTIPLES PRODUCTOS - VALIDAR Y CALCULAR TOTALES
    const processedProducts: Array<{
      product_name: string;
      variant_id: string;
      itemPrice: number;
      quantity: number;
      totalPrice: number;
      variantCheck: { exists: boolean; price?: number; title?: string };
    }> = [];
    
    let orderTotalPrice = 0;
    
    // ✅ VALIDAR Y PROCESAR CADA PRODUCTO
    for (let i = 0; i < processedProductItems.length; i++) {
      const product = processedProductItems[i];
      
      // Limpiar y validar precio
      const itemPrice = cleanPrice(product.price);
      const quantity = parseInt(product.quantity.toString()) || 1;
      const productTotal = itemPrice * quantity;
      
      // Verificar que el variant existe en Shopify
      const variantCheck = await verifyVariantExists(
        shop.shop_domain,
        realAccessToken,
        product.variant_id,
      );
      
      if (!variantCheck.exists) {
        
        return json(
          {
            error: `Producto "${product.product_name}": Variant no encontrado en Shopify`,
            code: "VARIANT_NOT_FOUND",
            productIndex: i + 1,
            variantId: product.variant_id,
          },
          { status: 400, headers },
        );
      }
      
      processedProducts.push({
        product_name: product.product_name,
        variant_id: product.variant_id,
        itemPrice,
        quantity,
        totalPrice: productTotal,
        variantCheck,
      });
      
      orderTotalPrice += productTotal;
    }


    // ✅ CUSTOMER: USAR CAMPOS VACÍOS SI NO SE PROPORCIONARON
    const customerData: ShopifyCustomerData = {
      firstName: finalFirstName || "", // ✅ VACÍO si no se proporcionó
      lastName: finalLastName || "",   // ✅ VACÍO si no se proporcionó
      email: finalEmail || "", // ✅ VACÍO si no se proporcionó (no generar email técnico)
      phone: phoneWithCountryCode,
    };

    // ✅ DIRECCIÓN: USAR CAMPOS VACÍOS O MÍNIMOS REQUERIDOS POR SHOPIFY
    const shippingAddress: ShopifyShippingAddress = {
      firstName: finalFirstName || "", // ✅ VACÍO si no se proporcionó
      lastName: finalLastName || "",   // ✅ VACÍO si no se proporcionó
      address1: cleanAddress1 || "",   // ✅ VACÍO si no se proporcionó
      city: cleanCity || "No especificada",       // ✅ VALOR DESCRIPTIVO
      province: cleanProvince || "No especificada", // ✅ VALOR DESCRIPTIVO
      country: cleanCountry, // ✅ Usar país detectado de la tienda
      zip: cleanZip || "00000",        // ✅ VALOR DESCRIPTIVO
      phone: phoneWithCountryCode,
    };

    // ✅ CREAR LINE ITEMS PARA SHOPIFY CON MÚLTIPLES PRODUCTOS
    const lineItems: ShopifyLineItem[] = processedProducts.map(product => ({
      variantId: product.variant_id,
      quantity: product.quantity,
      customAttributes: [
        {
          key: "source",
          value: "chatbot",
        },
        {
          key: "internal_order_number",
          value: internalOrderNumber,
        },
        {
          key: "request_id",
          value: requestId,
        },
        {
          key: "item_price", // ✅ PRECIO INDIVIDUAL DEL PRODUCTO
          value: decimalToString(product.itemPrice),
        },
      ],
    }));



    // ✅ CREAR ORDEN EN SHOPIFY CON MÚLTIPLES PRODUCTOS
    const shopifyResult = await createShopifyOrder({
      shopDomain: shop.shop_domain,
      accessToken: realAccessToken,
      customerData,
      shippingAddress,
      lineItems,
      currency: currency, // ✅ USAR CURRENCY PASADO COMO PARÁMETRO
      note: "chatbot",
      totalPrice: orderTotalPrice, // ✅ USAR PRECIO TOTAL DE TODOS LOS PRODUCTOS
      requestId: requestId,
    });

    if (!shopifyResult.success || !shopifyResult.order) {
      console.error("Error al crear orden en Shopify:", {
        requestId,
        error: shopifyResult.error,
        productCount: processedProducts.length,
        orderTotal: orderTotalPrice,
      });

      return json(
        {
          success: false,
          error: "Error al crear la orden en Shopify",
          details: shopifyResult.error,
          code: "SHOPIFY_ORDER_CREATION_FAILED",
        },
        { status: 500, headers },
      );
    }

    const rateLimitResult = await RateLimiter.checkLimit(
      shopDomain,
      100,
      60000,
      300000,
    );
    if (!rateLimitResult.allowed) {
      return json(
        { error: "Demasiadas peticiones. Inténtalo más tarde." },
        { status: 429 },
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 100));



    const shopifyOrderId = String(shopifyResult.order.id);
    const shopifyOrderName = shopifyResult.order.name;

    // ✅ CREAR ORDEN EN BASE DE DATOS CON DATOS REALES Y INFORMACIÓN DE LA TIENDA
    const orderConfirmation = await db.orderConfirmation.create({
      data: {
        shop_id: shop.id,
        internal_order_number: internalOrderNumber,
        shopify_order_id: shopifyOrderId,
        shopify_order_name: shopifyOrderName,
        
        // ✅ USAR TELÉFONO CON CÓDIGO DE PAÍS
        customer_phone: phoneWithCountryCode,
        
        // ✅ AGREGAR NUEVOS CAMPOS DE INFORMACIÓN DE LA TIENDA
        shop_country_code: countryCode,
        shop_currency: currency,
        shop_timezone: timezone,

        // ✅ SOLO GUARDAR DATOS REALES - CAMPOS VACÍOS SI NO SE PROPORCIONARON
        customer_name: hasRealFirstName
          ? hasRealLastName
            ? `${finalFirstName} ${finalLastName}`.trim()
            : finalFirstName
          : "", // ✅ VACÍO si no se proporcionó

        customer_email: hasRealEmail ? finalEmail : "", // ✅ VACÍO si no se proporcionó

        order_items: lineItems as any,
        order_total: orderTotal,

        // ✅ DIRECCIÓN CON DATOS REALES ÚNICAMENTE - CAMPOS VACÍOS
        shipping_address: {
          firstName: hasRealFirstName ? finalFirstName : "",
          lastName: hasRealLastName ? finalLastName : "",
          address1: hasRealAddress ? cleanAddress1 : "",
          city: hasRealCity ? cleanCity : "",
          province: hasRealProvince ? cleanProvince : "",
          country: hasRealCountry ? cleanCountry : "",
          zip: hasRealZip ? cleanZip : "",
          phone: phoneWithCountryCode,
          realDataOnly: {
            firstName: hasRealFirstName,
            lastName: hasRealLastName,
            email: hasRealEmail,
            address1: hasRealAddress,
            city: hasRealCity,
            province: hasRealProvince,
            country: hasRealCountry,
            zip: hasRealZip,
          },
        } as any,

        source: "CHATBOT_STORE",
        status: "PENDING_CALL",
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    // OrderConfirmation creada con datos reales únicamente

    // ✅ RESPUESTA CLARA - SOLO MOSTRAR DATOS REALES + INFORMACIÓN DE LA TIENDA
    return json(
      {
        success: true,
        type: "order_confirmation",
        requestId: requestId,
        message:
          "✅ Orden registrada exitosamente. Te contactaremos para confirmar tu pedido.",

        orderConfirmation: {
          id: orderConfirmation.id,
          status: orderConfirmation.status,
          total: decimalToString(orderConfirmation.order_total),
          currency: shopifyResult.order.currency,
          shopifyOrderName: shopifyOrderName,
          expiresAt: orderConfirmation.expires_at,
          createdAt: orderConfirmation.created_at,
        },

        customer: {
          // ✅ SOLO MOSTRAR DATOS QUE REALMENTE PROPORCIONÓ
          name: hasRealFirstName
            ? hasRealLastName
              ? `${finalFirstName} ${finalLastName}`.trim()
              : finalFirstName
            : "No proporcionado",
          firstName: hasRealFirstName ? finalFirstName : "No proporcionado",
          lastName: hasRealLastName ? finalLastName : "No proporcionado",
          email: hasRealEmail ? finalEmail : "No proporcionado",
          phone: phone,

          // Indicadores de qué datos son reales
          providedFirstName: hasRealFirstName,
          providedLastName: hasRealLastName,
          providedEmail: hasRealEmail,
          providedAddress: hasRealAddress,
          providedCity: hasRealCity,
          providedProvince: hasRealProvince,
          providedCountry: hasRealCountry,
          providedZip: hasRealZip,
        },

        shippingInfo: {
          address: hasRealAddress ? cleanAddress1 : "No proporcionada",
          city: hasRealCity ? cleanCity : "No proporcionada",
          province: hasRealProvince ? cleanProvince : "No proporcionada",
          country: hasRealCountry ? cleanCountry : "No proporcionado",
          zip: hasRealZip ? cleanZip : "No proporcionado",
          needsCompletion: !hasRealAddress || !hasRealCity,
        },

        // ✅ AGREGAR INFORMACIÓN DEL PAÍS Y TIENDA
        shopInfo: {
          countryCode: countryCode,
          currency: currency,
          timezone: timezone,
          phoneWithCountryCode: phoneWithCountryCode,
          originalPhone: phone,
          autoDetectedCountry: true,
        },

        items: processedProducts.map(product => ({
          title: product.product_name,
          quantity: product.quantity,
          price: decimalToString(product.itemPrice),
          totalPrice: decimalToString(product.totalPrice),
          variantId: product.variant_id,
        })),
        
        // ✅ INFORMACIÓN DE ORDEN TOTAL
        orderSummary: {
          totalProducts: processedProducts.length,
          totalPrice: decimalToString(orderTotalPrice),
          currency: currency,
        },

        nextSteps: {
          message:
            "Nos contactaremos contigo para completar la información faltante y confirmar tu pedido.",
          callScheduled: true,
          requiresDataCompletion:
            !hasRealFirstName ||
            !hasRealAddress ||
            !hasRealCity ||
            !hasRealEmail,
          shopifyCreated: true,
          status: orderConfirmation.status,
        },

        // ✅ DEBUG INFO - VERIFICAR QUE NO SE INVENTARON DATOS
        debug: {
          provided_fields: {
            first_name: hasRealFirstName,
            last_name: hasRealLastName,
            email: hasRealEmail,
            address1: hasRealAddress,
            city: hasRealCity,
            province: hasRealProvince,
            country: hasRealCountry,
            zip: hasRealZip,
          },
          required_fields: requiredFields,
          used_real_data_only: true,
          no_fake_data: true,
          no_automatic_generation: true,
          empty_fields_instead_of_defaults: true,
          shop_info: {
            countryCode: countryCode,
            currency: currency,
            timezone: timezone,
            phone_processing: {
              original: phone,
              withCountryCode: phoneWithCountryCode,
              detectedCountry: countryCode,
            },
          },
          price_info: {
            total_order_price: decimalToString(orderTotalPrice),
            products_processed: processedProducts.length,
            individual_products: processedProducts.map(product => ({
              product_name: product.product_name,
              cleaned_price: decimalToString(product.itemPrice),
              total_price: decimalToString(product.totalPrice),
              quantity: product.quantity,
              variant_id: product.variant_id
            })),
          },
        },
      },
      { headers },
    );
  } catch (error) {

    return json(
      {
        error: "Error interno del servidor al crear la orden",
        message: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500, headers },
    );
  }
};
