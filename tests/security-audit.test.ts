import { describe, test, expect } from "vitest";
import { SecurityAudit } from "../app/utils/security-audit.server";

describe('SecurityAudit', () => {
  test('Registra y consulta eventos', () => {
    SecurityAudit.log({
      shopId: 'shop1',
      action: 'TEST_EVENT',
      success: true,
      details: { foo: 'bar' }
    });
    const events = SecurityAudit.getRecentEvents('shop1', 1);
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].action).toBe('TEST_EVENT');
    expect(events[0].shopId).toBe('shop1');
    expect(events[0].success).toBe(true);
    expect(events[0].details.foo).toBe('bar');
  });
}); 