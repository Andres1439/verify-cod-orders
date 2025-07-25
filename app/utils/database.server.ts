// ===== UTILIDADES DE OPTIMIZACIÓN DE BASE DE DATOS =====
// Consultas optimizadas y transacciones mejoradas para mejor rendimiento

import { PrismaClient } from "@prisma/client";
import { logger } from "./logger.server";
import { CONFIG } from "./common.server";
import { ErrorFactory } from "./error-handler.server";
import { Cache, CacheType, Keys } from "./cache.server";

// ===== CLIENTE PRISMA OPTIMIZADO =====
export const db = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

// ===== CONFIGURACIÓN DE TRANSACCIONES =====
const TRANSACTION_CONFIG = {
  maxWait: CONFIG.DB.TRANSACTION_TIMEOUT,
  timeout: CONFIG.DB.TRANSACTION_TIMEOUT,
  isolationLevel: 'ReadCommitted' as const,
};

// ===== UTILIDADES DE CONSULTA OPTIMIZADA =====
export class DatabaseUtils {
  /**
   * Ejecuta consulta con cache automático
   */
  static async withCache<T>(
    key: string,
    cacheType: CacheType,
    query: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    // Intentar obtener del cache
    const cached = Cache.get<T>(key, cacheType);
    if (cached !== null) {
      return cached;
    }

    // Ejecutar consulta
    const startTime = Date.now();
    const result = await query();
    const duration = Date.now() - startTime;

    // Log de performance
    if (duration > 1000) {
      logger.warn(`Consulta lenta detectada`, { key, duration, cacheType });
    }

    // Guardar en cache
    Cache.set(key, result, cacheType, ttl);

    return result;
  }

  /**
   * Ejecuta transacción con retry automático
   */
  static async withTransaction<T>(
    operation: (tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>) => Promise<T>,
    maxRetries: number = 3
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const startTime = Date.now();
        
        const result = await db.$transaction(operation, TRANSACTION_CONFIG);
        
        const duration = Date.now() - startTime;
        logger.debug(`Transacción completada`, { attempt, duration });
        
        return result;
      } catch (error) {
        lastError = error as Error;
        
        // Log del intento fallido
        logger.warn(`Transacción fallida - intento ${attempt}/${maxRetries}`, {
          error: lastError.message,
          attempt
        });

        // Si no es el último intento, esperar antes de reintentar
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, attempt * 1000));
        }
      }
    }

    // Si llegamos aquí, todos los intentos fallaron
    throw ErrorFactory.database(
      `Transacción falló después de ${maxRetries} intentos: ${lastError?.message}`,
      { originalError: lastError }
    );
  }

  /**
   * Batch de operaciones para mejor rendimiento
   */
  static async batchOperation<T, R>(
    items: T[],
    operation: (item: T) => Promise<R>,
    batchSize: number = 10
  ): Promise<R[]> {
    const results: R[] = [];
    
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const batchResults = await Promise.all(batch.map(operation));
      results.push(...batchResults);
      
      // Pequeña pausa entre batches para no sobrecargar
      if (i + batchSize < items.length) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }
    
    return results;
  }
}

// ===== CONSULTAS OPTIMIZADAS ESPECÍFICAS =====
export class OptimizedQueries {
  /**
   * Obtiene configuración de tienda con cache
   */
  static async getShopConfig(shopDomain: string) {
    const cacheKey = Keys.shopConfig(shopDomain);
    
    return DatabaseUtils.withCache(
      cacheKey,
      CacheType.SHOP_CONFIG,
      async () => {
        return await db.shop.findUnique({
          where: { shop_domain: shopDomain },
          include: {
            chatbot_configuration: true,
            vonage_configuration: true,
            whatsAppNumbers: {
              where: { assignment_status: 'ASSIGNED' }
            }
          }
        });
      },
      3600 // 1 hora de cache
    );
  }

  /**
   * Obtiene configuración de Vonage con cache
   */
  static async getVonageConfig(shopId: string) {
    const cacheKey = Keys.vonageConfig(shopId);
    
    return DatabaseUtils.withCache(
      cacheKey,
      CacheType.VONAGE_CONFIG,
      async () => {
        return await db.vonageConfiguration.findUnique({
          where: { shop_id: shopId }
        });
      },
      1800 // 30 minutos de cache
    );
  }

  /**
   * Obtiene configuración de chatbot con cache
   */
  static async getChatbotConfig(shopId: string) {
    const cacheKey = Keys.chatbotConfig(shopId);
    
    return DatabaseUtils.withCache(
      cacheKey,
      CacheType.CHATBOT_CONFIG,
      async () => {
        return await db.chatbotConfiguration.findUnique({
          where: { shop_id: shopId }
        });
      },
      1800 // 30 minutos de cache
    );
  }

  /**
   * Busca tickets con paginación optimizada
   */
  static async getTicketsPaginated(
    shopId: string,
    page: number = 1,
    limit: number = 20,
    status?: string
  ) {
    const offset = (page - 1) * limit;
    
    const whereClause: any = {
      shop_id: shopId,
      ...(status && { status: status as any })
    };

    const [tickets, total] = await Promise.all([
      db.ticket.findMany({
        where: whereClause,
        orderBy: { created_at: 'desc' },
        skip: offset,
        take: limit,
        include: {
          shop: {
            select: { shop_domain: true }
          }
        }
      }),
      db.ticket.count({ where: whereClause })
    ]);

    return {
      tickets,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    };
  }

  /**
   * Busca órdenes con filtros optimizados
   */
  static async getOrdersWithFilters(
    shopId: string,
    filters: {
      status?: string;
      dateFrom?: Date;
      dateTo?: Date;
      phone?: string;
      email?: string;
    },
    page: number = 1,
    limit: number = 20
  ) {
    const offset = (page - 1) * limit;
    
    const whereClause: any = { shop_id: shopId };
    
    if (filters.status) {
      whereClause.status = filters.status;
    }
    
    if (filters.dateFrom || filters.dateTo) {
      whereClause.created_at = {};
      if (filters.dateFrom) whereClause.created_at.gte = filters.dateFrom;
      if (filters.dateTo) whereClause.created_at.lte = filters.dateTo;
    }
    
    if (filters.phone) {
      whereClause.phone = { contains: filters.phone };
    }
    
    if (filters.email) {
      whereClause.email = { contains: filters.email, mode: 'insensitive' };
    }

    const [orders, total] = await Promise.all([
      db.orderConfirmation.findMany({
        where: whereClause,
        orderBy: { created_at: 'desc' },
        skip: offset,
        take: limit,
        include: {
          shop: {
            select: { shop_domain: true }
          }
        }
      }),
      db.orderConfirmation.count({ where: whereClause })
    ]);

    return {
      orders,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    };
  }

  /**
   * Estadísticas de tienda optimizadas
   */
  static async getShopStats(shopId: string, days: number = 30) {
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - days);

    const [
      totalTickets,
      totalOrders,
      pendingTickets,
      confirmedOrders,
      recentActivity
    ] = await Promise.all([
      db.ticket.count({
        where: { shop_id: shopId }
      }),
      db.orderConfirmation.count({
        where: { shop_id: shopId }
      }),
      db.ticket.count({
        where: { 
          shop_id: shopId,
          status: 'PENDING'
        }
      }),
      db.orderConfirmation.count({
        where: { 
          shop_id: shopId,
          status: 'CONFIRMED'
        }
      }),
      db.ticket.count({
        where: {
          shop_id: shopId,
          created_at: { gte: dateFrom }
        }
      })
    ]);

    return {
      totalTickets,
      totalOrders,
      pendingTickets,
      confirmedOrders,
      recentActivity,
      period: days
    };
  }

  /**
   * Limpieza de datos antiguos
   */
  static async cleanupOldData(daysToKeep: number = 90) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    return DatabaseUtils.withTransaction(async (tx) => {
      const [deletedTickets, deletedOrders] = await Promise.all([
        tx.ticket.deleteMany({
          where: {
            created_at: { lt: cutoffDate },
            status: { in: ['RESOLVED', 'CLOSED'] }
          }
        }),
        tx.orderConfirmation.deleteMany({
          where: {
            created_at: { lt: cutoffDate },
            status: { in: ['CONFIRMED', 'DECLINED'] }
          }
        })
      ]);

      logger.info(`Limpieza de datos completada`, {
        deletedTickets: deletedTickets.count,
        deletedOrders: deletedOrders.count,
        cutoffDate
      });

      return {
        deletedTickets: deletedTickets.count,
        deletedOrders: deletedOrders.count
      };
    });
  }
}

// ===== INVALIDACIÓN DE CACHE AUTOMÁTICA =====
export class CacheInvalidation {
  /**
   * Invalida cache relacionado con una tienda
   */
  static invalidateShopCache(shopDomain: string) {
    const patterns = [
      new RegExp(`^shop_config:${shopDomain}`),
      new RegExp(`^vonage_config:.*${shopDomain}`),
      new RegExp(`^chatbot_config:.*${shopDomain}`),
      new RegExp(`^whatsapp_config:.*${shopDomain}`)
    ];

    let totalInvalidated = 0;
    patterns.forEach(pattern => {
      totalInvalidated += Cache.invalidateByPattern(pattern);
    });

    logger.debug(`Cache invalidado para tienda ${shopDomain}`, { totalInvalidated });
    return totalInvalidated;
  }

  /**
   * Invalida cache de productos
   */
  static invalidateProductsCache(shopDomain: string) {
    const pattern = new RegExp(`^products:${shopDomain}`);
    const invalidated = Cache.invalidateByPattern(pattern);
    
    logger.debug(`Cache de productos invalidado para ${shopDomain}`, { invalidated });
    return invalidated;
  }

  /**
   * Invalida cache de órdenes
   */
  static invalidateOrdersCache(shopDomain: string) {
    const pattern = new RegExp(`^order:${shopDomain}`);
    const invalidated = Cache.invalidateByPattern(pattern);
    
    logger.debug(`Cache de órdenes invalidado para ${shopDomain}`, { invalidated });
    return invalidated;
  }
}

// ===== MONITOREO DE PERFORMANCE =====
export class PerformanceMonitor {
  private static queryTimes: Array<{ query: string; duration: number; timestamp: number; success?: boolean }> = [];

  /**
   * Registra tiempo de consulta
   */
  static recordQuery(duration: number, queryType: string, success: boolean = true) {
    this.queryTimes.push({
      query: queryType,
      duration,
      timestamp: Date.now(),
      success
    });

    // Mantener solo las últimas 1000 consultas
    if (this.queryTimes.length > 1000) {
      this.queryTimes.shift();
    }

    // Log de consultas lentas
    if (duration > 2000) {
      logger.warn(`Consulta muy lenta detectada`, { query: queryType, duration });
    }
  }

  /**
   * Obtiene estadísticas de performance
   */
  static getStats() {
    if (this.queryTimes.length === 0) {
      return {
        totalQueries: 0,
        averageDuration: 0,
        slowQueries: 0,
        fastQueries: 0
      };
    }

    const durations = this.queryTimes.map(q => q.duration);
    const slowQueries = durations.filter(d => d > 1000).length;
    const fastQueries = durations.filter(d => d < 100).length;

    return {
      totalQueries: this.queryTimes.length,
      averageDuration: Math.round(durations.reduce((a, b) => a + b, 0) / durations.length),
      slowQueries,
      fastQueries,
      slowestQuery: Math.max(...durations),
      fastestQuery: Math.min(...durations)
    };
  }
}

// ===== HEALTH CHECK DE BASE DE DATOS =====
export class DatabaseHealth {
  /**
   * Verifica salud de la base de datos
   */
  static async checkHealth() {
    try {
      const startTime = Date.now();
      
      // Test de conexión simple
      await db.$queryRaw`SELECT 1`;
      
      const connectionTime = Date.now() - startTime;
      
      // Test de consulta más compleja
      const testStart = Date.now();
      const shopCount = await db.shop.count();
      const queryTime = Date.now() - testStart;

      return {
        status: 'healthy',
        connectionTime,
        queryTime,
        shopCount,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Database health check failed', { error });
      return {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      };
    }
  }
}

// ===== EXPORTACIONES =====
export {
  DatabaseUtils as Utils,
  OptimizedQueries as Queries,
  CacheInvalidation as Invalidation,
  PerformanceMonitor as Monitor,
  DatabaseHealth as Health
};

// Exportar cliente de base de datos por defecto
export default db;
