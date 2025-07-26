// app/utils/decimal-utils.ts
// Utilidades para manejo consistente de conversiones Decimal/Prisma a string

import type { Decimal } from "@prisma/client/runtime/library";

/**
 * Convierte un valor Decimal de Prisma a string de manera segura
 * @param value - Valor Decimal, number, string o null/undefined
 * @param defaultValue - Valor por defecto si el input es null/undefined
 * @returns String representation del valor
 */
export const decimalToString = (
  value: Decimal | number | string | null | undefined,
  defaultValue: string = "0"
): string => {
  if (value === null || value === undefined) {
    return defaultValue;
  }

  // Si ya es string, devolverlo directamente
  if (typeof value === "string") {
    return value;
  }

  // Si es number, convertir a string
  if (typeof value === "number") {
    return value.toString();
  }

  // Si es Decimal de Prisma, usar toString()
  if (value && typeof value === "object" && "toString" in value) {
    return value.toString();
  }

  return defaultValue;
};

/**
 * Convierte un valor Decimal a string formateado como moneda
 * @param value - Valor Decimal, number, string o null/undefined
 * @param currency - Código de moneda (default: "USD")
 * @param defaultValue - Valor por defecto si el input es null/undefined
 * @returns String formateado como "$123.45 USD"
 */
export const decimalToCurrency = (
  value: Decimal | number | string | null | undefined,
  currency: string = "USD",
  defaultValue: string = "0"
): string => {
  const stringValue = decimalToString(value, defaultValue);
  const numericValue = parseFloat(stringValue);
  
  if (isNaN(numericValue)) {
    return `$${defaultValue} ${currency}`;
  }

  return `$${numericValue.toFixed(2)} ${currency}`;
};

/**
 * Convierte un valor Decimal a number de manera segura
 * @param value - Valor Decimal, number, string o null/undefined
 * @param defaultValue - Valor por defecto si el input es null/undefined o no es válido
 * @returns Number representation del valor
 */
export const decimalToNumber = (
  value: Decimal | number | string | null | undefined,
  defaultValue: number = 0
): number => {
  if (value === null || value === undefined) {
    return defaultValue;
  }

  if (typeof value === "number") {
    return value;
  }

  const stringValue = decimalToString(value, defaultValue.toString());
  const numericValue = parseFloat(stringValue);
  
  return isNaN(numericValue) ? defaultValue : numericValue;
};

/**
 * Valida si un valor puede ser convertido a Decimal válido
 * @param value - Valor a validar
 * @returns true si el valor es válido para conversión
 */
export const isValidDecimal = (
  value: Decimal | number | string | null | undefined
): boolean => {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === "number") {
    return !isNaN(value) && isFinite(value);
  }

  if (typeof value === "string") {
    const numericValue = parseFloat(value);
    return !isNaN(numericValue) && isFinite(numericValue);
  }

  // Para objetos Decimal de Prisma
  if (value && typeof value === "object" && "toString" in value) {
    try {
      const stringValue = value.toString();
      const numericValue = parseFloat(stringValue);
      return !isNaN(numericValue) && isFinite(numericValue);
    } catch {
      return false;
    }
  }

  return false;
};
