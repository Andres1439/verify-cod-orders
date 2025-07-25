// ===== MIDDLEWARE DE MANEJO DE ERRORES CENTRALIZADO =====
// Manejo consistente de errores con logging y respuestas estandarizadas

import { logger } from "./logger.server";
import { Response as ResponseUtils } from "./common.server";
import { json } from "@remix-run/node";

// ===== TIPOS DE ERROR =====
export enum ErrorType {
  VALIDATION = 'VALIDATION_ERROR',
  AUTHENTICATION = 'AUTHENTICATION_ERROR',
  AUTHORIZATION = 'AUTHORIZATION_ERROR',
  NOT_FOUND = 'NOT_FOUND_ERROR',
  RATE_LIMIT = 'RATE_LIMIT_ERROR',
  EXTERNAL_API = 'EXTERNAL_API_ERROR',
  DATABASE = 'DATABASE_ERROR',
  INTERNAL = 'INTERNAL_ERROR',
  SHOPIFY_API = 'SHOPIFY_API_ERROR',
  VONAGE_API = 'VONAGE_API_ERROR',
  WEBHOOK = 'WEBHOOK_ERROR'
}

// ===== INTERFAZ DE ERROR PERSONALIZADO =====
export interface AppError {
  type: ErrorType;
  message: string;
  statusCode: number;
  details?: any;
  requestId?: string;
  shopDomain?: string;
  userId?: string;
  timestamp: string;
  stack?: string;
}

// ===== CLASE DE ERROR PERSONALIZADA =====
export class CustomError extends Error {
  public readonly type: ErrorType;
  public readonly statusCode: number;
  public readonly details?: any;
  public readonly requestId?: string;
  public readonly shopDomain?: string;
  public readonly userId?: string;
  public readonly timestamp: string;

  constructor(
    type: ErrorType,
    message: string,
    statusCode: number = 500,
    details?: any,
    requestId?: string,
    shopDomain?: string,
    userId?: string
  ) {
    super(message);
    this.name = 'CustomError';
    this.type = type;
    this.statusCode = statusCode;
    this.details = details;
    this.requestId = requestId;
    this.shopDomain = shopDomain;
    this.userId = userId;
    this.timestamp = new Date().toISOString();
    
    // Mantener stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, CustomError);
    }
  }

  toJSON(): AppError {
    return {
      type: this.type,
      message: this.message,
      statusCode: this.statusCode,
      details: this.details,
      requestId: this.requestId,
      shopDomain: this.shopDomain,
      userId: this.userId,
      timestamp: this.timestamp,
      stack: this.stack
    };
  }
}

// ===== FACTORY DE ERRORES COMUNES =====
export class ErrorFactory {
  static validation(message: string, details?: any, requestId?: string): CustomError {
    return new CustomError(ErrorType.VALIDATION, message, 400, details, requestId);
  }

  static authentication(message: string = "No autorizado", requestId?: string): CustomError {
    return new CustomError(ErrorType.AUTHENTICATION, message, 401, undefined, requestId);
  }

  static authorization(message: string = "Acceso denegado", requestId?: string): CustomError {
    return new CustomError(ErrorType.AUTHORIZATION, message, 403, undefined, requestId);
  }

  static notFound(resource: string, requestId?: string): CustomError {
    return new CustomError(ErrorType.NOT_FOUND, `${resource} no encontrado`, 404, undefined, requestId);
  }

  static rateLimit(message: string = "Límite de solicitudes excedido", resetTime?: number, requestId?: string): CustomError {
    return new CustomError(ErrorType.RATE_LIMIT, message, 429, { resetTime }, requestId);
  }

  static shopifyAPI(message: string, statusCode: number = 500, details?: any, requestId?: string, shopDomain?: string): CustomError {
    return new CustomError(ErrorType.SHOPIFY_API, message, statusCode, details, requestId, shopDomain);
  }

  static vonageAPI(message: string, details?: any, requestId?: string): CustomError {
    return new CustomError(ErrorType.VONAGE_API, message, 500, details, requestId);
  }

  static database(message: string, details?: any, requestId?: string): CustomError {
    return new CustomError(ErrorType.DATABASE, message, 500, details, requestId);
  }

  static webhook(message: string, details?: any, requestId?: string): CustomError {
    return new CustomError(ErrorType.WEBHOOK, message, 500, details, requestId);
  }

  static internal(message: string = "Error interno del servidor", details?: any, requestId?: string): CustomError {
    return new CustomError(ErrorType.INTERNAL, message, 500, details, requestId);
  }

  static externalAPI(service: string, message: string, statusCode: number = 500, details?: any, requestId?: string): CustomError {
    return new CustomError(ErrorType.EXTERNAL_API, `Error en ${service}: ${message}`, statusCode, details, requestId);
  }
}

// ===== HANDLER PRINCIPAL DE ERRORES =====
export class ErrorHandler {
  /**
   * Maneja errores y genera respuesta apropiada
   */
  static handle(error: unknown, requestId?: string, shopDomain?: string): Response {
    let appError: AppError;

    if (error instanceof CustomError) {
      appError = error.toJSON();
    } else if (error instanceof Error) {
      appError = {
        type: ErrorType.INTERNAL,
        message: error.message,
        statusCode: 500,
        requestId,
        shopDomain,
        timestamp: new Date().toISOString(),
        stack: error.stack
      };
    } else {
      appError = {
        type: ErrorType.INTERNAL,
        message: "Error desconocido",
        statusCode: 500,
        requestId,
        shopDomain,
        timestamp: new Date().toISOString()
      };
    }

    // Log del error
    this.logError(appError);

    // Generar respuesta
    return this.generateResponse(appError);
  }

  /**
   * Maneja errores específicos de Shopify API
   */
  static handleShopifyError(error: any, requestId?: string, shopDomain?: string): CustomError {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;
      
      switch (status) {
        case 401:
          return ErrorFactory.authentication("Token de Shopify inválido o expirado", requestId);
        case 403:
          return ErrorFactory.authorization("Permisos insuficientes en Shopify", requestId);
        case 404:
          return ErrorFactory.notFound("Recurso de Shopify", requestId);
        case 429:
          return ErrorFactory.rateLimit("Límite de API de Shopify excedido", undefined, requestId);
        default:
          return ErrorFactory.shopifyAPI(
            data?.errors?.[0]?.message || "Error en API de Shopify",
            status,
            data,
            requestId,
            shopDomain
          );
      }
    }

    return ErrorFactory.shopifyAPI(
      error.message || "Error de conexión con Shopify",
      500,
      error,
      requestId,
      shopDomain
    );
  }

  /**
   * Maneja errores de base de datos
   */
  static handleDatabaseError(error: any, requestId?: string): CustomError {
    // Errores comunes de Prisma
    if (error.code === 'P2002') {
      return ErrorFactory.validation("Violación de restricción única", error.meta, requestId);
    }
    
    if (error.code === 'P2025') {
      return ErrorFactory.notFound("Registro de base de datos", requestId);
    }

    if (error.code === 'P2003') {
      return ErrorFactory.validation("Violación de clave foránea", error.meta, requestId);
    }

    return ErrorFactory.database(
      error.message || "Error de base de datos",
      { code: error.code, meta: error.meta },
      requestId
    );
  }

  /**
   * Maneja errores de validación
   */
  static handleValidationError(field: string, value: any, reason: string, requestId?: string): CustomError {
    return ErrorFactory.validation(
      `Validación fallida para ${field}: ${reason}`,
      { field, value, reason },
      requestId
    );
  }

  /**
   * Wrapper para funciones async con manejo de errores
   */
  static async withErrorHandling<T>(
    fn: () => Promise<T>,
    requestId?: string,
    shopDomain?: string
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      throw this.handle(error, requestId, shopDomain);
    }
  }

  /**
   * Log del error con contexto
   */
  private static logError(error: AppError): void {
    const logData = {
      type: error.type,
      message: error.message,
      statusCode: error.statusCode,
      requestId: error.requestId,
      shopDomain: error.shopDomain,
      userId: error.userId,
      timestamp: error.timestamp,
      details: error.details
    };

    // Log según severidad
    if (error.statusCode >= 500) {
      logger.error("Error interno del servidor", logData);
    } else if (error.statusCode >= 400) {
      logger.warn("Error del cliente", logData);
    } else {
      logger.info("Error manejado", logData);
    }

    // En desarrollo, mostrar stack trace
    if (process.env.NODE_ENV === 'development' && error.stack) {
      logger.debug("Stack trace", { stack: error.stack });
    }
  }

  /**
   * Genera respuesta HTTP apropiada
   */
  private static generateResponse(error: AppError): Response {
    const responseBody = {
      success: false,
      error: {
        type: error.type,
        message: error.message,
        ...(error.requestId && { requestId: error.requestId }),
        timestamp: error.timestamp
      }
    };

    // En desarrollo, incluir más detalles
    if (process.env.NODE_ENV === 'development') {
      responseBody.error = {
        ...responseBody.error,
        ...(error.details && { details: error.details }),
        ...(error.stack && { stack: error.stack })
      };
    }

    return new Response(JSON.stringify(responseBody), {
      status: error.statusCode,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      }
    });
  }
}

// ===== MIDDLEWARE PARA REMIX =====
export function withErrorBoundary<T extends any[]>(
  fn: (...args: T) => Promise<Response>,
  requestId?: string,
  shopDomain?: string
) {
  return async (...args: T): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (error) {
      return ErrorHandler.handle(error, requestId, shopDomain);
    }
  };
}

// ===== UTILIDADES DE VALIDACIÓN CON ERRORES =====
export class ValidationWithErrors {
  static validateRequired(value: any, fieldName: string, requestId?: string): void {
    if (!value || (typeof value === 'string' && value.trim() === '')) {
      throw ErrorFactory.validation(`${fieldName} es requerido`, { field: fieldName, value }, requestId);
    }
  }

  static validateEmail(email: string, requestId?: string): void {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw ErrorFactory.validation("Formato de email inválido", { email }, requestId);
    }
  }

  static validatePhone(phone: string, requestId?: string): void {
    const cleanPhone = phone.replace(/[^0-9+]/g, '');
    if (cleanPhone.length < 8 || cleanPhone.length > 15) {
      throw ErrorFactory.validation("Formato de teléfono inválido", { phone }, requestId);
    }
  }

  static validateShopifyDomain(domain: string, requestId?: string): void {
    if (!domain.endsWith('.myshopify.com')) {
      throw ErrorFactory.validation("Dominio de Shopify inválido", { domain }, requestId);
    }
  }

  static validateUUID(uuid: string, fieldName: string, requestId?: string): void {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(uuid)) {
      throw ErrorFactory.validation(`${fieldName} debe ser un UUID válido`, { field: fieldName, value: uuid }, requestId);
    }
  }

  static validatePositiveNumber(value: number, fieldName: string, requestId?: string): void {
    if (typeof value !== 'number' || value <= 0) {
      throw ErrorFactory.validation(`${fieldName} debe ser un número positivo`, { field: fieldName, value }, requestId);
    }
  }

  static validateStringLength(value: string, fieldName: string, minLength: number, maxLength: number, requestId?: string): void {
    if (value.length < minLength || value.length > maxLength) {
      throw ErrorFactory.validation(
        `${fieldName} debe tener entre ${minLength} y ${maxLength} caracteres`,
        { field: fieldName, value, minLength, maxLength },
        requestId
      );
    }
  }
}

// ===== EXPORTACIONES =====
export {
  ErrorHandler as Handler,
  ErrorFactory as Factory,
  ValidationWithErrors as ValidateWithErrors
};
