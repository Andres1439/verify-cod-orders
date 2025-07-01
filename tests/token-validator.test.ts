import { describe, test, expect } from "vitest";
import { TokenValidator } from "../app/utils/token-validator.server";

describe('TokenValidator', () => {
  test('validateMetaAccessToken - válido', () => {
    const valid = "EAA" + "x".repeat(100);
    expect(TokenValidator.validateMetaAccessToken(valid).valid).toBe(true);
  });
  test('validateMetaAccessToken - inválido', () => {
    const invalids = ["", "EAA", "ABC123", "EAA@#%$", "EAA1234", "EAA" + "x".repeat(10)];
    invalids.forEach(token => {
      expect(TokenValidator.validateMetaAccessToken(token).valid).toBe(false);
    });
  });
  test('validatePhoneNumberId', () => {
    expect(TokenValidator.validatePhoneNumberId("1234567890").valid).toBe(true);
    expect(TokenValidator.validatePhoneNumberId("123").valid).toBe(false);
    expect(TokenValidator.validatePhoneNumberId("abc1234567").valid).toBe(false);
  });
  test('validateBusinessAccountId', () => {
    expect(TokenValidator.validateBusinessAccountId("1234567890").valid).toBe(true);
    expect(TokenValidator.validateBusinessAccountId("123").valid).toBe(false);
    expect(TokenValidator.validateBusinessAccountId("abc1234567").valid).toBe(false);
  });
}); 