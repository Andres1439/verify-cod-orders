// ===== UTILIDADES COMUNES CENTRALIZADAS =====
// Consolidación de funciones duplicadas y utilidades compartidas

import { logger } from "./logger.server";

// ===== CONFIGURACIÓN CENTRALIZADA =====
export const CONFIG = {
  // API Configuration
  SHOPIFY_API_VERSION: "2025-04" as const,
  
  // Limits and Timeouts
  MAX_PRODUCTS: 250,
  DEFAULT_PRODUCTS: 50,
  CACHE_DURATION: 300, // 5 minutos
  REQUEST_TIMEOUT: 30000, // 30 segundos
  
  // Rate Limiting
  RATE_LIMIT_WINDOW: 60000, // 1 minuto
  RATE_LIMIT_MAX_REQUESTS: 100,
  
  // Phone and Country Codes
  PHONE_COUNTRY_CODES: {
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
    'UY': '598', // Uruguay
    'PY': '595', // Paraguay
    'BO': '591', // Bolivia
    'ES': '34',  // España
    'GT': '502', // Guatemala
    'HN': '504', // Honduras
    'SV': '503', // El Salvador
    'NI': '505', // Nicaragua
    'CR': '506', // Costa Rica
    'PA': '507', // Panamá
  } as Record<string, string>,
  
  // Vonage Configuration
  VONAGE: {
    MAX_CALL_DURATION: 7200, // 2 horas
    RINGING_TIMEOUT: 60,     // 60 segundos
    DTMF_TIMEOUT: 15,        // 15 segundos
    FALLBACK_TIMEOUT: 30,    // 30 segundos
  },
  
  // Database Configuration
  DB: {
    TRANSACTION_TIMEOUT: 30000, // 30 segundos
    CONNECTION_POOL_SIZE: 10,
    QUERY_TIMEOUT: 10000,      // 10 segundos
  }
} as const;

// ===== UTILIDADES DE VALIDACIÓN =====
export class ValidationUtils {
  /**
   * Valida formato de email
   */
  static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Valida formato de teléfono
   */
  static isValidPhone(phone: string): boolean {
    const cleanPhone = phone.replace(/[^0-9+]/g, '');
    return cleanPhone.length >= 8 && cleanPhone.length <= 15;
  }

  /**
   * Valida si una cadena es un UUID válido
   */
  static isValidUUID(uuid: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }

  /**
   * Valida si una cadena es un GID de Shopify válido
   */
  static isValidShopifyGID(gid: string): boolean {
    return gid.startsWith('gid://shopify/') && gid.length > 20;
  }

  /**
   * Valida formato de dominio de Shopify
   */
  static isValidShopifyDomain(domain: string): boolean {
    return domain.endsWith('.myshopify.com') && domain.length > 15;
  }
}

// ===== UTILIDADES DE FORMATO =====
export class FormatUtils {
  /**
   * Agrega código de país al teléfono
   */
  static addCountryCodeToPhone(phone: string, countryCode: string): string {
    const cleanPhone = phone.replace(/[^0-9]/g, "");
    const phoneCountryCode = CONFIG.PHONE_COUNTRY_CODES[countryCode] || '1';
    
    // Si ya tiene código de país, devolverlo con +
    if (cleanPhone.startsWith(phoneCountryCode)) {
      return `+${cleanPhone}`;
    }

    // Casos especiales por país
    if (countryCode === 'PE' && cleanPhone.startsWith('9') && cleanPhone.length === 9) {
      return `+51${cleanPhone}`;
    }
    
    if (countryCode === 'CO' && cleanPhone.startsWith('3') && cleanPhone.length === 10) {
      return `+57${cleanPhone}`;
    }

    // Caso general
    return `+${phoneCountryCode}${cleanPhone}`;
  }

  /**
   * Limpia y formatea precio
   */
  static formatPrice(price: string | number): string {
    const numPrice = typeof price === 'string' ? parseFloat(price) : price;
    return numPrice.toFixed(2);
  }

  /**
   * Formatea dominio de Shopify
   */
  static formatShopifyDomain(domain: string): string {
    return domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
  }

  /**
   * Genera ID único para requests
   */
  static generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// ===== UTILIDADES DE TIEMPO =====
export class TimeUtils {
  /**
   * Verifica si está en horario de llamadas (9 AM - 8 PM)
   */
  static isValidCallTime(timezone: string = 'America/Lima'): boolean {
    try {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: '2-digit',
        hour12: false
      });
      const timeString = formatter.format(new Date());
      const hour = parseInt(timeString.replace(/\D/g, ''));
      
      return hour >= 9 && hour <= 20;
    } catch (error) {
      logger.warn(`Error procesando timezone ${timezone}`, { error });
      // Fallback a UTC
      const hour = new Date().getUTCHours();
      return hour >= 9 && hour <= 20;
    }
  }

  /**
   * Obtiene timestamp formateado
   */
  static getFormattedTimestamp(): string {
    return new Date().toISOString();
  }

  /**
   * Calcula diferencia en minutos entre dos fechas
   */
  static getMinutesDifference(date1: Date, date2: Date): number {
    return Math.abs(date1.getTime() - date2.getTime()) / (1000 * 60);
  }
}

// ===== UTILIDADES DE RESPUESTA HTTP =====
export class ResponseUtils {
  /**
   * Headers CORS estándar
   */
  static getCORSHeaders(): Headers {
    const headers = new Headers();
    headers.append("Access-Control-Allow-Origin", "*");
    headers.append("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    headers.append("Access-Control-Allow-Headers", "Content-Type, Authorization");
    headers.append("Content-Type", "application/json");
    return headers;
  }

  /**
   * Respuesta de error estándar
   */
  static errorResponse(message: string, status: number = 500, details?: any) {
    return Response.json({
      success: false,
      error: message,
      timestamp: TimeUtils.getFormattedTimestamp(),
      ...(details && { details })
    }, { 
      status, 
      headers: ResponseUtils.getCORSHeaders() 
    });
  }

  /**
   * Respuesta de éxito estándar
   */
  static successResponse(data: any, message?: string) {
    return Response.json({
      success: true,
      data,
      timestamp: TimeUtils.getFormattedTimestamp(),
      ...(message && { message })
    }, { 
      headers: ResponseUtils.getCORSHeaders() 
    });
  }
}

// ===== UTILIDADES DE CACHE =====
export class CacheUtils {
  private static cache = new Map<string, { data: any; expires: number }>();

  /**
   * Obtiene valor del cache
   */
  static get<T>(key: string): T | null {
    const cached = this.cache.get(key);
    if (!cached) return null;
    
    if (Date.now() > cached.expires) {
      this.cache.delete(key);
      return null;
    }
    
    return cached.data as T;
  }

  /**
   * Guarda valor en cache
   */
  static set(key: string, data: any, ttlSeconds: number = CONFIG.CACHE_DURATION): void {
    const expires = Date.now() + (ttlSeconds * 1000);
    this.cache.set(key, { data, expires });
  }

  /**
   * Elimina valor del cache
   */
  static delete(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Limpia todo el cache
   */
  static clear(): void {
    this.cache.clear();
  }

  /**
   * Genera clave de cache para productos
   */
  static getProductsCacheKey(shopDomain: string, query?: string): string {
    return `products:${shopDomain}:${query || 'all'}`;
  }

  /**
   * Genera clave de cache para órdenes
   */
  static getOrderCacheKey(shopDomain: string, orderId: string): string {
    return `order:${shopDomain}:${orderId}`;
  }
}

// ===== UTILIDADES DE SHOPIFY =====
export class ShopifyUtils {
  /**
   * Extrae ID numérico de GID de Shopify
   */
  static extractIdFromGID(gid: string): string {
    return gid.split('/').pop() || '';
  }

  /**
   * Construye GID de Shopify
   */
  static buildGID(resource: string, id: string): string {
    return `gid://shopify/${resource}/${id}`;
  }

  /**
   * Valida y limpia dominio de Shopify
   */
  static cleanShopifyDomain(domain: string): string {
    let cleanDomain = domain.toLowerCase().trim();
    
    // Remover protocolo si existe
    cleanDomain = cleanDomain.replace(/^https?:\/\//, '');
    
    // Remover trailing slash
    cleanDomain = cleanDomain.replace(/\/$/, '');
    
    // Si no termina en .myshopify.com, agregarlo
    if (!cleanDomain.endsWith('.myshopify.com')) {
      cleanDomain = `${cleanDomain}.myshopify.com`;
    }
    
    return cleanDomain;
  }

  /**
   * Construye URL de API de Shopify
   */
  static buildAPIUrl(shopDomain: string, endpoint: string): string {
    const cleanDomain = this.cleanShopifyDomain(shopDomain);
    return `https://${cleanDomain}/admin/api/${CONFIG.SHOPIFY_API_VERSION}/${endpoint}`;
  }
}

// ===== UTILIDADES DE RATE LIMITING =====
export class RateLimitUtils {
  private static requests = new Map<string, number[]>();

  /**
   * Verifica si una IP/usuario está dentro del límite
   */
  static isWithinLimit(identifier: string, maxRequests: number = CONFIG.RATE_LIMIT_MAX_REQUESTS): boolean {
    const now = Date.now();
    const windowStart = now - CONFIG.RATE_LIMIT_WINDOW;
    
    // Obtener requests existentes
    const userRequests = this.requests.get(identifier) || [];
    
    // Filtrar requests dentro de la ventana
    const recentRequests = userRequests.filter(timestamp => timestamp > windowStart);
    
    // Actualizar cache
    this.requests.set(identifier, recentRequests);
    
    return recentRequests.length < maxRequests;
  }

  /**
   * Registra una nueva request
   */
  static recordRequest(identifier: string): void {
    const now = Date.now();
    const userRequests = this.requests.get(identifier) || [];
    userRequests.push(now);
    this.requests.set(identifier, userRequests);
  }

  /**
   * Obtiene tiempo restante hasta que se resetee el límite
   */
  static getResetTime(identifier: string): number {
    const userRequests = this.requests.get(identifier) || [];
    if (userRequests.length === 0) return 0;
    
    const oldestRequest = Math.min(...userRequests);
    const resetTime = oldestRequest + CONFIG.RATE_LIMIT_WINDOW;
    
    return Math.max(0, resetTime - Date.now());
  }
}

// ===== EXPORTACIONES =====
export {
  ValidationUtils as Validate,
  FormatUtils as Format,
  TimeUtils as Time,
  ResponseUtils as Response,
  CacheUtils as Cache,
  ShopifyUtils as Shopify,
  RateLimitUtils as RateLimit
};
