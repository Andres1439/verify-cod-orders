import { createReadableStreamFromReadable } from "@remix-run/node";
import type { ActionFunctionArgs } from "@remix-run/node";

/**
 * Middleware para manejar raw body en webhooks de Shopify
 * Basado en la documentación oficial: https://shopify.dev/docs/apps/build/webhooks/subscribe/https#step-5-verify-the-webhook
 */
export async function getRawBody(request: Request): Promise<Buffer> {
  if (request.body) {
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    
    let done = false;
    while (!done) {
      const { value, done: readerDone } = await reader.read();
      done = readerDone;
      if (value) {
        chunks.push(value);
      }
    }
    
    // Concatenar todos los chunks en un solo buffer
    const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    
    return Buffer.from(result);
  }
  
  return Buffer.alloc(0);
}

/**
 * Crea una nueva Request con el raw body preservado
 * Esto es necesario porque Remix consume el stream automáticamente
 */
export function createRequestWithRawBody(originalRequest: Request, rawBody: Buffer): Request {
  // Validar que la URL original existe, usar fallback para tests
  const url = originalRequest.url || 'https://test.example.com/webhook';
  
  return new Request(url, {
    method: originalRequest.method,
    headers: originalRequest.headers,
    body: rawBody.length > 0 ? rawBody : null,
  });
}

/**
 * Wrapper para actions que necesitan raw body para validación HMAC
 */
export async function withRawBody<T>(
  args: ActionFunctionArgs,
  handler: (args: ActionFunctionArgs & { rawBody: Buffer }) => Promise<T>
): Promise<T> {
  const rawBody = await getRawBody(args.request);
  
  // Crear nueva request con el raw body
  const newRequest = createRequestWithRawBody(args.request, rawBody);
  
  // Llamar al handler con la nueva request y el raw body
  return handler({
    ...args,
    request: newRequest,
    rawBody,
  });
}
