import { describe, test, expect, beforeEach } from "vitest";
import { RateLimiter } from "../app/utils/rate-limiter.server";

describe('RateLimiter', () => {
  beforeEach(() => {
    // Limpiar el cache antes de cada test
    // @ts-ignore
    RateLimiter.cache?.clear?.();
  });

  test('Permite hasta el límite', async () => {
    const id = "shop:test";
    for (let i = 0; i < 5; i++) {
      const res = await RateLimiter.checkLimit(id, 5, 1000, 1000);
      expect(res.allowed).toBe(true);
    }
  });

  test('Bloquea después del límite', async () => {
    const id = "shop:test2";
    for (let i = 0; i < 5; i++) {
      await RateLimiter.checkLimit(id, 5, 1000, 1000);
    }
    const res = await RateLimiter.checkLimit(id, 5, 1000, 1000);
    expect(res.allowed).toBe(false);
  });

  test('Resetea después del tiempo', async () => {
    const id = "shop:test3";
    for (let i = 0; i < 5; i++) {
      await RateLimiter.checkLimit(id, 5, 100, 100);
    }
    let res = await RateLimiter.checkLimit(id, 5, 100, 100);
    expect(res.allowed).toBe(false);
    // Esperar a que expire
    await new Promise(r => setTimeout(r, 120));
    res = await RateLimiter.checkLimit(id, 5, 100, 100);
    expect(res.allowed).toBe(true);
  });
}); 