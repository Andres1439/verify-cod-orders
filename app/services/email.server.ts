// app/services/email.server.ts

import { Resend } from "resend";

// Asegúrate de tener RESEND_API_KEY en tu archivo .env
if (!process.env.RESEND_API_KEY) {
  throw new Error("La variable de entorno RESEND_API_KEY no está configurada.");
}

const resend = new Resend(process.env.RESEND_API_KEY);

// IMPORTANTE: Cambia esto por un email de un dominio que hayas verificado en Resend.
const FROM_EMAIL = "onboarding@resend.dev";

// Definimos la estructura del reporte para tener un tipado más estricto
interface CustomerDataReport {
  requestDetails: {
    shopDomain: string;
    requestedAt: string;
    customerIdentifiers: {
      email?: string;
      phone?: string;
      shopifyCustomerId: number;
    };
  };
  dataFound: {
    tickets: any[];
    orderConfirmations: any[];
  };
}

export async function sendCustomerDataReportEmail({
  shopDomain,
  customerDataReport,
  merchantEmail,
}: {
  shopDomain: string;
  customerDataReport: CustomerDataReport;
  merchantEmail: string;
}) {
  const isDevelopment = process.env.NODE_ENV === "development";

  const toEmailForDelivery = isDevelopment
    ? process.env.MY_TEST_EMAIL
    : merchantEmail;

  if (!toEmailForDelivery) {
    console.error(
      "No hay un destinatario de email válido. Verifica tu variable MY_TEST_EMAIL en .env para desarrollo."
    );
    throw new Error("No hay un destinatario de email válido.");
  }



  try {
    const { data, error } = await resend.emails.send({
      from: `Verify COD Orders <${FROM_EMAIL}>`,
      to: [toEmailForDelivery],
      subject: `Reporte de Datos de Cliente para tu tienda: ${shopDomain}`,
      html: `
        <h2>Reporte de Datos de Cliente</h2>
        <p>Hola,</p>
        <p>Recibimos una solicitud de datos de uno de tus clientes para la tienda <strong>${shopDomain}</strong>. Adjunto encontrarás un archivo JSON con toda la información que nuestra aplicación ("Verify COD Orders") ha almacenado sobre este cliente.</p>
        <p>Este reporte se genera para cumplir con las normativas de privacidad como GDPR y CCPA.</p>
        <p>Gracias,</p>
        <p>El equipo de Verify COD Orders</p>
      `,
      attachments: [
        {
          filename: "customer_data_report.json",
          content: JSON.stringify(customerDataReport, null, 2),
        },
      ],
    });

    if (error) {
      throw new Error("Fallo al enviar el email del reporte.");
    }


    return data;
  } catch (exception) {
    throw exception;
  }
}
