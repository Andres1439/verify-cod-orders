import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";

import { login } from "../../shopify.server";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        {/* Hero Section */}
        <div className={styles.hero}>
          <h1 className={styles.heading}>
            ¡Bienvenido a Verify COD Orders! 🚀
          </h1>
          <p className={styles.text}>
            La solución completa para optimizar tus pedidos Contra Entrega con Inteligencia Artificial
          </p>
          
          {/* Features */}
          <div className={styles.features}>
            <div className={styles.feature}>
              <span className={styles.featureIcon}>✅</span>
              <span>Reduce devoluciones</span>
            </div>
            <div className={styles.feature}>
              <span className={styles.featureIcon}>⚡</span>
              <span>Automatiza procesos</span>
            </div>
            <div className={styles.feature}>
              <span className={styles.featureIcon}>🎯</span>
              <span>Mejora experiencia</span>
            </div>
          </div>
        </div>

        {/* Login Form */}
        {showForm && (
          <div className={styles.formContainer}>
            <div className={styles.formCard}>
              <h2 className={styles.formTitle}>🎯 Acceso a tu Tienda</h2>
              <p className={styles.formSubtitle}>
                Ingresa el dominio de tu tienda Shopify para comenzar
              </p>
              <Form className={styles.form} method="post" action="/auth/login">
                <label className={styles.label}>
                  <span className={styles.labelText}>Dominio de la tienda</span>
                  <input 
                    className={styles.input} 
                    type="text" 
                    name="shop" 
                    placeholder="mi-tienda.myshopify.com"
                  />
                  <span className={styles.helpText}>Ejemplo: mi-tienda.myshopify.com</span>
                </label>
                <button className={styles.button} type="submit">
                  Iniciar Sesión
                </button>
              </Form>
            </div>
          </div>
        )}

        {/* Product Features */}
        <div className={styles.featuresSection}>
          <h2 className={styles.sectionTitle}>🚀 Características Principales</h2>
          <ul className={styles.list}>
            <li className={styles.listItem}>
              <div className={styles.itemIcon}>🤖</div>
              <div className={styles.itemContent}>
                <strong>Chatbot AI Inteligente</strong>
                <p>Automatiza la atención al cliente 24/7 con respuestas inteligentes y personalizadas.</p>
              </div>
            </li>
            <li className={styles.listItem}>
              <div className={styles.itemIcon}>📱</div>
              <div className={styles.itemContent}>
                <strong>Integración WhatsApp</strong>
                <p>Proporciona un número de WhatsApp para contacto directo con tus clientes.</p>
              </div>
            </li>
            <li className={styles.listItem}>
              <div className={styles.itemIcon}>📊</div>
              <div className={styles.itemContent}>
                <strong>Análisis Avanzado</strong>
                <p>Obtén insights detallados sobre tus pedidos y comportamiento de clientes.</p>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
