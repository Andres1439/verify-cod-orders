import { describe, test, expect } from "vitest";
import crypto from 'crypto';

describe('Crypto module basic test', () => {
  test('crypto.randomBytes should return a buffer', () => {
    const buf = crypto.randomBytes(8);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBe(8);
  });
}); 