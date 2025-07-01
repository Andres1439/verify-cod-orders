export class TokenValidator {
  static validateMetaAccessToken(token: string): { valid: boolean; reason?: string } {
    if (!token || typeof token !== 'string') {
      return { valid: false, reason: 'Token vacío o inválido' };
    }
    if (!token.startsWith('EAA')) {
      return { valid: false, reason: 'Token no es de Meta Business' };
    }
    if (token.length < 50) {
      return { valid: false, reason: 'Token demasiado corto' };
    }
    if (!/^[A-Za-z0-9_-]+$/.test(token)) {
      return { valid: false, reason: 'Caracteres inválidos en token' };
    }
    return { valid: true };
  }

  static validatePhoneNumberId(phoneId: string): { valid: boolean; reason?: string } {
    if (!phoneId || typeof phoneId !== 'string') {
      return { valid: false, reason: 'Phone Number ID vacío' };
    }
    if (!/^\d{10,20}$/.test(phoneId)) {
      return { valid: false, reason: 'Formato de Phone Number ID inválido' };
    }
    return { valid: true };
  }

  static validateBusinessAccountId(businessId: string): { valid: boolean; reason?: string } {
    if (!businessId || typeof businessId !== 'string') {
      return { valid: false, reason: 'Business Account ID vacío' };
    }
    if (!/^\d{10,20}$/.test(businessId)) {
      return { valid: false, reason: 'Formato de Business Account ID inválido' };
    }
    return { valid: true };
  }
} 