import crypto from "crypto";

interface AuditEvent {
  timestamp: string;
  shopId: string;
  action: string;
  success: boolean;
  ipAddress?: string;
  userAgent?: string;
  details?: Record<string, any>;
}

export class SecurityAudit {
  private static events: AuditEvent[] = [];

  static log(event: Omit<AuditEvent, 'timestamp'>) {
    const auditEvent: AuditEvent = {
      ...event,
      timestamp: new Date().toISOString()
    };

    // En producción, enviar a sistema de logs seguro
    if (process.env.NODE_ENV === 'production') {
      this.sendToSecureLogging(auditEvent);
    } else {

    }

    this.events.push(auditEvent);
  }

  private static sendToSecureLogging(event: AuditEvent) {
    // Implementar envío a DataDog, CloudWatch, etc.
    // NO incluir tokens o datos sensibles
  }

  static getRecentEvents(shopId: string, hours = 24): AuditEvent[] {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
    return this.events.filter(
      event => event.shopId === shopId && 
      new Date(event.timestamp) > cutoff
    );
  }
} 