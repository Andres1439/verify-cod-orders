import { describe, test, expect } from "vitest";
import { encryptToken, decryptToken } from "../app/utils/encryption.server";
import { TokenValidator } from "../app/utils/token-validator.server";

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

describe('Token Encryption Security Tests', () => {
  const testToken = "EAAabc123def456ghi789jkl012mno345pqr678stu901vwx234yz567";

  test('Token encryption produces different output each time', () => {
    const encrypted1 = encryptToken(testToken);
    const encrypted2 = encryptToken(testToken);
    expect(encrypted1.iv).not.toBe(encrypted2.iv);
    expect(encrypted1.encrypted).not.toBe(encrypted2.encrypted);
    expect(decryptToken(encrypted1)).toBe(testToken);
    expect(decryptToken(encrypted2)).toBe(testToken);
  });

  test('Decryption of tampered data should fail', () => {
    const encrypted = encryptToken(testToken);
    const tamperedData = {
      ...encrypted,
      tag: encrypted.tag.slice(0, -2) + "00"
    };
    expect(() => decryptToken(tamperedData)).toThrow();
  });

  test('Token format validation', () => {
    const validTokens = [
      "EAAabc123def456ghi789jkl012mno345pqr678stu901vwx234yz567",
      "EAA" + "x".repeat(100)
    ];
    const invalidTokens = [
      "invalid_token",
      "EAA", // Muy corto
      "", // Vacío
      "ABC123" // No empieza con EAA
    ];
    validTokens.forEach(token => {
      expect(() => encryptToken(token)).not.toThrow();
      expect(TokenValidator.validateMetaAccessToken(token).valid).toBe(true);
    });
    invalidTokens.forEach(token => {
      expect(TokenValidator.validateMetaAccessToken(token).valid).toBe(false);
    });
  });
}); 