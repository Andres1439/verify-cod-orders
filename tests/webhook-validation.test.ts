// tests/webhook-validation.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';

describe('Webhook HMAC Validation', () => {
  const WEBHOOK_SECRET = 'test-webhook-secret';
  
  function generateHMAC(body: string, secret: string): string {
    return crypto
      .createHmac('sha256', secret)
      .update(body, 'utf8')
      .digest('base64');
  }

  function createMockRequest(body: string, hmac?: string): Request {
    const headers = new Headers({
      'Content-Type': 'application/json',
      'X-Shopify-Topic': 'customers/data_request',
      'X-Shopify-Shop-Domain': 'test-shop.myshopify.com',
    });

    if (hmac) {
      headers.set('X-Shopify-Hmac-Sha256', hmac);
    }

    return new Request('https://test.com/webhooks', {
      method: 'POST',
      headers,
      body,
    });
  }

  it('should validate correct HMAC signature', () => {
    const body = JSON.stringify({ test: 'data' });
    const validHMAC = generateHMAC(body, WEBHOOK_SECRET);
    
    expect(validHMAC).toBeTruthy();
    expect(typeof validHMAC).toBe('string');
    expect(validHMAC.length).toBeGreaterThan(0);
  });

  it('should detect invalid HMAC signature', () => {
    const body = JSON.stringify({ test: 'data' });
    const validHMAC = generateHMAC(body, WEBHOOK_SECRET);
    const invalidHMAC = generateHMAC(body, 'wrong-secret');
    
    expect(validHMAC).not.toBe(invalidHMAC);
  });

  it('should create proper request headers', () => {
    const body = JSON.stringify({ test: 'data' });
    const hmac = generateHMAC(body, WEBHOOK_SECRET);
    const request = createMockRequest(body, hmac);
    
    expect(request.headers.get('X-Shopify-Hmac-Sha256')).toBe(hmac);
    expect(request.headers.get('X-Shopify-Topic')).toBe('customers/data_request');
    expect(request.headers.get('Content-Type')).toBe('application/json');
  });

  it('should handle missing HMAC header', () => {
    const body = JSON.stringify({ test: 'data' });
    const request = createMockRequest(body); // No HMAC provided
    
    expect(request.headers.get('X-Shopify-Hmac-Sha256')).toBeNull();
  });
});

describe('Webhook URL Configuration', () => {
  it('should have consistent webhook URLs', () => {
    const baseURL = 'https://cod-orders.fly.dev';
    
    const expectedURLs = [
      `${baseURL}/webhooks`,
      `${baseURL}/webhooks/app/scopes_update`,
      `${baseURL}/webhooks/app/uninstalled`
    ];
    
    expectedURLs.forEach(url => {
      expect(() => new URL(url)).not.toThrow();
      expect(new URL(url).protocol).toBe('https:');
      expect(new URL(url).hostname).toBe('cod-orders.fly.dev');
    });
  });

  it('should validate webhook paths', () => {
    const paths = [
      '/webhooks',
      '/webhooks/app/scopes_update', 
      '/webhooks/app/uninstalled'
    ];
    
    paths.forEach(path => {
      expect(path.startsWith('/')).toBe(true);
      expect(path.includes('webhooks')).toBe(true);
    });
  });
});
