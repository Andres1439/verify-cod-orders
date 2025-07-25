// ===== SISTEMA DE CACHE INTELIGENTE =====
// Cache optimizado para consultas frecuentes con invalidación automática

import { logger } from "./logger.server";
import { CONFIG } from "./common.server";

// ===== TIPOS DE CACHE =====
export enum CacheType {
  PRODUCTS = 'products',
  ORDERS = 'orders',
  CUSTOMERS = 'customers',
  SHOP_CONFIG = 'shop_config',
  VONAGE_CONFIG = 'vonage_config',
  CHATBOT_CONFIG = 'chatbot_config',
  WHATSAPP_CONFIG = 'whatsapp_config',
  API_RESPONSE = 'api_response'
}

// ===== INTERFAZ DE ENTRADA DE CACHE =====
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expires: number;
  hits: number;
  lastAccessed: number;
  tags: string[];
  size: number;
}

// ===== CONFIGURACIÓN DE CACHE POR TIPO =====
const CACHE_CONFIG = {
  [CacheType.PRODUCTS]: {
    ttl: 300,        // 5 minutos
    maxSize: 100,    // 100 entradas máximo
    priority: 1      // Alta prioridad
  },
  [CacheType.ORDERS]: {
    ttl: 180,        // 3 minutos
    maxSize: 50,
    priority: 2
  },
  [CacheType.CUSTOMERS]: {
    ttl: 600,        // 10 minutos
    maxSize: 200,
    priority: 1
  },
  [CacheType.SHOP_CONFIG]: {
    ttl: 3600,       // 1 hora
    maxSize: 50,
    priority: 3      // Baja prioridad (cambia poco)
  },
  [CacheType.VONAGE_CONFIG]: {
    ttl: 1800,       // 30 minutos
    maxSize: 50,
    priority: 2
  },
  [CacheType.CHATBOT_CONFIG]: {
    ttl: 1800,       // 30 minutos
    maxSize: 50,
    priority: 2
  },
  [CacheType.WHATSAPP_CONFIG]: {
    ttl: 1800,       // 30 minutos
    maxSize: 50,
    priority: 2
  },
  [CacheType.API_RESPONSE]: {
    ttl: 60,         // 1 minuto
    maxSize: 200,
    priority: 1
  }
} as const;

// ===== CLASE PRINCIPAL DE CACHE =====
export class IntelligentCache {
  private static cache = new Map<string, CacheEntry<any>>();
  private static stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    totalSize: 0
  };

  /**
   * Obtiene valor del cache
   */
  static get<T>(key: string, type: CacheType): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Verificar expiración
    if (Date.now() > entry.expires) {
      this.cache.delete(key);
      this.stats.misses++;
      this.stats.evictions++;
      return null;
    }

    // Actualizar estadísticas de acceso
    entry.hits++;
    entry.lastAccessed = Date.now();
    this.stats.hits++;

    logger.debug(`Cache hit para ${key}`, {
      type,
      hits: entry.hits,
      age: Date.now() - entry.timestamp
    });

    return entry.data as T;
  }

  /**
   * Guarda valor en cache
   */
  static set<T>(key: string, data: T, type: CacheType, customTTL?: number, tags: string[] = []): void {
    const config = CACHE_CONFIG[type];
    const ttl = customTTL || config.ttl;
    const now = Date.now();

    // Calcular tamaño aproximado
    const size = this.calculateSize(data);

    const entry: CacheEntry<T> = {
      data,
      timestamp: now,
      expires: now + (ttl * 1000),
      hits: 0,
      lastAccessed: now,
      tags: [...tags, type],
      size
    };

    // Verificar límites antes de agregar
    this.enforceLimit(type, config.maxSize);

    this.cache.set(key, entry);
    this.stats.totalSize += size;

    logger.debug(`Cache set para ${key}`, {
      type,
      ttl,
      size,
      totalEntries: this.cache.size
    });
  }

  /**
   * Elimina entrada específica del cache
   */
  static delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (entry) {
      this.stats.totalSize -= entry.size;
      this.cache.delete(key);
      return true;
    }
    return false;
  }

  /**
   * Invalida cache por tags
   */
  static invalidateByTag(tag: string): number {
    let invalidated = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.tags.includes(tag)) {
        this.stats.totalSize -= entry.size;
        this.cache.delete(key);
        invalidated++;
      }
    }

    if (invalidated > 0) {
      logger.info(`Cache invalidado por tag ${tag}`, { invalidated });
    }

    return invalidated;
  }

  /**
   * Invalida cache por patrón de clave
   */
  static invalidateByPattern(pattern: RegExp): number {
    let invalidated = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (pattern.test(key)) {
        this.stats.totalSize -= entry.size;
        this.cache.delete(key);
        invalidated++;
      }
    }

    if (invalidated > 0) {
      logger.info(`Cache invalidado por patrón`, { pattern: pattern.toString(), invalidated });
    }

    return invalidated;
  }

  /**
   * Limpia cache expirado
   */
  static cleanup(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expires) {
        this.stats.totalSize -= entry.size;
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug(`Cache cleanup completado`, { cleaned });
    }

    return cleaned;
  }

  /**
   * Obtiene estadísticas del cache
   */
  static getStats() {
    const hitRate = this.stats.hits + this.stats.misses > 0 
      ? (this.stats.hits / (this.stats.hits + this.stats.misses)) * 100 
      : 0;

    return {
      ...this.stats,
      hitRate: Math.round(hitRate * 100) / 100,
      entries: this.cache.size,
      averageSize: this.cache.size > 0 ? Math.round(this.stats.totalSize / this.cache.size) : 0
    };
  }

  /**
   * Limpia todo el cache
   */
  static clear(): void {
    this.cache.clear();
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      totalSize: 0
    };
    logger.info("Cache completamente limpiado");
  }

  /**
   * Aplica límites de tamaño por tipo
   */
  private static enforceLimit(type: CacheType, maxSize: number): void {
    const entries = Array.from(this.cache.entries())
      .filter(([_, entry]) => entry.tags.includes(type))
      .sort((a, b) => {
        // Ordenar por prioridad (hits y recencia)
        const scoreA = a[1].hits * 0.7 + (Date.now() - a[1].lastAccessed) * -0.3;
        const scoreB = b[1].hits * 0.7 + (Date.now() - b[1].lastAccessed) * -0.3;
        return scoreB - scoreA;
      });

    // Eliminar entradas menos utilizadas si excede el límite
    while (entries.length >= maxSize) {
      const [key, entry] = entries.pop()!;
      this.stats.totalSize -= entry.size;
      this.cache.delete(key);
      this.stats.evictions++;
    }
  }

  /**
   * Calcula tamaño aproximado del objeto
   */
  private static calculateSize(data: any): number {
    try {
      return JSON.stringify(data).length;
    } catch {
      return 1000; // Tamaño por defecto si no se puede serializar
    }
  }
}

// ===== UTILIDADES ESPECÍFICAS DE CACHE =====
export class CacheKeys {
  /**
   * Clave para productos de una tienda
   */
  static products(shopDomain: string, query?: string, first?: number): string {
    return `products:${shopDomain}:${query || 'all'}:${first || 50}`;
  }

  /**
   * Clave para orden específica
   */
  static order(shopDomain: string, orderId: string): string {
    return `order:${shopDomain}:${orderId}`;
  }

  /**
   * Clave para customer específico
   */
  static customer(shopDomain: string, customerId: string): string {
    return `customer:${shopDomain}:${customerId}`;
  }

  /**
   * Clave para configuración de tienda
   */
  static shopConfig(shopDomain: string): string {
    return `shop_config:${shopDomain}`;
  }

  /**
   * Clave para configuración de Vonage
   */
  static vonageConfig(shopDomain: string): string {
    return `vonage_config:${shopDomain}`;
  }

  /**
   * Clave para configuración de chatbot
   */
  static chatbotConfig(shopDomain: string): string {
    return `chatbot_config:${shopDomain}`;
  }

  /**
   * Clave para configuración de WhatsApp
   */
  static whatsappConfig(shopDomain: string): string {
    return `whatsapp_config:${shopDomain}`;
  }

  /**
   * Clave para respuesta de API externa
   */
  static apiResponse(service: string, endpoint: string, params: string): string {
    return `api_response:${service}:${endpoint}:${params}`;
  }
}

// ===== DECORADOR PARA CACHE AUTOMÁTICO =====
export function withCache<T extends any[], R>(
  type: CacheType,
  keyGenerator: (...args: T) => string,
  ttl?: number
) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;

    descriptor.value = async function (...args: T): Promise<R> {
      const key = keyGenerator(...args);
      
      // Intentar obtener del cache
      const cached = IntelligentCache.get<R>(key, type);
      if (cached !== null) {
        return cached;
      }

      // Ejecutar método original
      const result = await method.apply(this, args);
      
      // Guardar en cache
      IntelligentCache.set(key, result, type, ttl);
      
      return result;
    };

    return descriptor;
  };
}

// ===== MIDDLEWARE DE CACHE PARA RESPUESTAS HTTP =====
export class CacheMiddleware {
  /**
   * Middleware para cachear respuestas de API
   */
  static async withResponseCache<T>(
    key: string,
    type: CacheType,
    producer: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    // Intentar obtener del cache
    const cached = IntelligentCache.get<T>(key, type);
    if (cached !== null) {
      return cached;
    }

    // Ejecutar producer
    const result = await producer();
    
    // Guardar en cache
    IntelligentCache.set(key, result, type, ttl);
    
    return result;
  }

  /**
   * Headers de cache para respuestas HTTP
   */
  static getCacheHeaders(maxAge: number = 300): Record<string, string> {
    return {
      'Cache-Control': `public, max-age=${maxAge}`,
      'ETag': `"${Date.now()}"`,
      'Last-Modified': new Date().toUTCString()
    };
  }
}

// ===== LIMPIEZA AUTOMÁTICA =====
// Ejecutar limpieza cada 5 minutos
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    IntelligentCache.cleanup();
  }, 5 * 60 * 1000);
}

// ===== EXPORTACIONES =====
export {
  IntelligentCache as Cache,
  CacheKeys as Keys,
  CacheMiddleware as Middleware
};
