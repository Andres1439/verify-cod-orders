// app/utils/ticket-utils.ts
// Utilidades para manejo consistente de números de ticket

/**
 * Genera un número de ticket visible para el cliente
 * basado en los primeros caracteres del UUID
 */
export const getTicketNumber = (ticketId: string): string => {
  if (!ticketId) return "TICKET-INVALID";

  const shortId = ticketId.split("-")[0];
  return `TICKET-${shortId.toUpperCase()}`;
};

/**
 * Extrae el ID corto del UUID completo
 */
export const getShortTicketId = (ticketId: string): string => {
  if (!ticketId) return "INVALID";

  return ticketId.split("-")[0].toUpperCase();
};

/**
 * Valida si un número de ticket tiene el formato correcto
 */
export const isValidTicketNumber = (ticketNumber: string): boolean => {
  const pattern = /^TICKET-[A-F0-9]{8}$/i;
  return pattern.test(ticketNumber);
};

/**
 * Busca un ticket por su número corto (TICKET-9bb77c9f)
 * Devuelve una query para Prisma
 */
export const getTicketSearchQuery = (ticketNumber: string) => {
  // Remover el prefijo TICKET- si existe
  const cleanNumber = ticketNumber.replace(/^TICKET-/i, "");

  return {
    id: {
      startsWith: cleanNumber.toLowerCase(),
    },
  };
};

/**
 * Formatea un ticket para mostrar en la UI
 */
export const formatTicketForDisplay = (ticket: any) => {
  return {
    ...ticket,
    ticketNumber: getTicketNumber(ticket.id),
    shortId: getShortTicketId(ticket.id),
    displayDate: new Date(ticket.created_at).toLocaleDateString("es-ES", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
};
