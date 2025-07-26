/* eslint-disable @typescript-eslint/no-unused-vars */
import { PassThrough } from "stream";
import { renderToPipeableStream, renderToString } from "react-dom/server";
import { RemixServer } from "@remix-run/react";
import {
  createReadableStreamFromReadable,
  type EntryContext,
} from "@remix-run/node";
import { isbot } from "isbot";
import { addDocumentResponseHeaders } from "./shopify.server";

export const streamTimeout = 5000;

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  remixContext: EntryContext,
) {
  addDocumentResponseHeaders(request, responseHeaders);
  const userAgent = request.headers.get("user-agent");
  const callbackName = isbot(userAgent ?? "") ? "onAllReady" : "onShellReady";

  const markup = renderToString(
    <RemixServer context={remixContext} url={request.url} />,
  );

  responseHeaders.set("Content-Type", "text/html");

  // Headers de seguridad para producción
  if (process.env.NODE_ENV === "production") {
    responseHeaders.set("X-Content-Type-Options", "nosniff");
    responseHeaders.set("X-Frame-Options", "DENY");
    responseHeaders.set("X-XSS-Protection", "1; mode=block");
    responseHeaders.set("Referrer-Policy", "strict-origin-when-cross-origin");
    responseHeaders.set(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()",
    );
  }

  return new Promise((resolve, reject) => {
    const { pipe, abort } = renderToPipeableStream(
      <RemixServer context={remixContext} url={request.url} />,
      {
        [callbackName]: () => {
          const body = new PassThrough();
          const stream = createReadableStreamFromReadable(body);

          responseHeaders.set("Content-Type", "text/html");
          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode,
            }),
          );
          pipe(body);
        },
        onShellError(error) {
          reject(error);
        },
        onError(error) {
          responseStatusCode = 500;
          console.error(error);
        },
      },
    );

    // Automatically timeout the React renderer after 6 seconds, which ensures
    // React has enough time to flush down the rejected boundary contents
    setTimeout(abort, streamTimeout + 1000);
  });
}
