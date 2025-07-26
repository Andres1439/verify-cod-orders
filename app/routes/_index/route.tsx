import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";

import { login } from "../../shopify.server";

import styles from "./styles.module.css";

export const meta: MetaFunction = () => {
  return [
    { title: "Verify COD Orders - Optimiza tus pedidos COD con IA" },
    { 
      name: "description", 
      content: "Reduce devoluciones hasta 40% con nuestra solución de IA para pedidos Contra Entrega. Automatiza procesos y mejora la experiencia de tus clientes en Shopify." 
    },
    { name: "keywords", content: "COD, contra entrega, Shopify, inteligencia artificial, automatización, devoluciones" },
    { name: "robots", content: "index, follow" },
    { property: "og:title", content: "Verify COD Orders - Optimiza tus pedidos COD con IA" },
    { property: "og:description", content: "Reduce devoluciones hasta 40% con nuestra solución de IA para pedidos Contra Entrega." },
    { property: "og:type", content: "website" },
    { property: "og:url", content: "https://cod-orders.fly.dev" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "viewport", content: "width=device-width, initial-scale=1" },
    { name: "theme-color", content: "#00A96E" }
  ];
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

function FooterLegal() {
  return (
    <footer className={styles.footerLegal}>
      <div className={styles.footerContent}>
        <div className={styles.footerCopyright}>
          © {new Date().getFullYear()} Verify COD Orders
        </div>
        <div className={styles.footerLinks}>
          <a 
            href="https://andres1439.github.io/verify-cod-orders-legal/privacy_policy.html" 
            target="_blank" 
            rel="noopener noreferrer"
          >
            Política de Privacidad
          </a>
          <span className={styles.separator}>•</span>
          <a 
            href="https://andres1439.github.io/verify-cod-orders-legal/terms_of_service.html" 
            target="_blank" 
            rel="noopener noreferrer"
          >
            Términos de Servicio
          </a>
        </div>
        <div className={styles.footerSupport}>
          <span>Soporte: </span>
          <a href="mailto:victor.minas@unmsm.edu.pe">victor.minas@unmsm.edu.pe</a>
        </div>
      </div>
    </footer>
  );
}

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className={styles.container}>
      {/* Hero Section */}
      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <div className={styles.heroHeader}>
            <h1 className={styles.title}>
              Optimiza tus pedidos COD con
              <span className={styles.titleAccent}> Inteligencia Artificial</span>
            </h1>
            <p className={styles.subtitle}>
              Reduce devoluciones, automatiza procesos y mejora la experiencia de tus clientes 
              con nuestra solución completa para pedidos Contra Entrega
            </p>
          </div>
          
          <div className={styles.heroFeatures}>
            <div className={styles.featureTag}>
              <span className={styles.featureIcon}>📈</span>
              <span>+40% menos devoluciones</span>
            </div>
            <div className={styles.featureTag}>
              <span className={styles.featureIcon}>⚡</span>
              <span>Automatización completa</span>
            </div>
            <div className={styles.featureTag}>
              <span className={styles.featureIcon}>🎯</span>
              <span>Experiencia premium</span>
            </div>
          </div>
        </div>
      </section>

      {/* Login Form Section */}
      {showForm && (
        <section className={styles.loginSection}>
          <div className={styles.loginCard}>
            <div className={styles.loginHeader}>
              <h2 className={styles.loginTitle}>Conecta tu tienda Shopify</h2>
              <p className={styles.loginSubtitle}>
                Ingresa tu dominio para comenzar en menos de 2 minutos
              </p>
            </div>
            
            <Form className={styles.loginForm} method="post" action="/auth/login">
              <div className={styles.inputGroup}>
                <label className={styles.inputLabel}>
                  Dominio de tu tienda
                </label>
                <div className={styles.inputWrapper}>
                  <input 
                    className={styles.input} 
                    type="text" 
                    name="shop" 
                    placeholder="mi-tienda"
                    required
                  />
                  <span className={styles.inputSuffix}>.myshopify.com</span>
                </div>
                <span className={styles.inputHint}>
                  Solo necesitas el nombre de tu tienda, no la URL completa
                </span>
              </div>
              
              <button className={styles.loginButton} type="submit">
                <span>Comenzar ahora</span>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M6 12L10 8L6 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              
              <div className={styles.loginFooter}>
                <span className={styles.securityBadge}>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M7 1L10.5 2.5V6.5C10.5 9.5 7 12.5 7 12.5S3.5 9.5 3.5 6.5V2.5L7 1Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M5.5 7L6.5 8L8.5 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Conexión segura
                </span>
              </div>
            </Form>
          </div>
        </section>
      )}

      {/* Features Section */}
      <section className={styles.featuresSection}>
        <div className={styles.featuresHeader}>
          <h2 className={styles.featuresTitle}>Todo lo que necesitas en una sola plataforma</h2>
          <p className={styles.featuresSubtitle}>
            Herramientas potentes y fáciles de usar para maximizar tus conversiones COD
          </p>
        </div>
        
        <div className={styles.featuresGrid}>
          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <rect x="4" y="8" width="24" height="16" rx="4" stroke="currentColor" strokeWidth="2"/>
                <path d="M8 16H12M16 14H20M16 18H24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <circle cx="24" cy="8" r="4" fill="#10B981"/>
                <path d="M22 8L23 9L26 6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h3 className={styles.featureTitle}>Chatbot Inteligente</h3>
            <p className={styles.featureDescription}>
              Automatiza respuestas, gestiona tickets y brinda soporte 
              24/7 con nuestro asistente virtual powered by AI.
            </p>
            <div className={styles.featureBenefits}>
              <span className={styles.benefit}>• Respuestas automáticas</span>
              <span className={styles.benefit}>• Gestión de tickets</span>
              <span className={styles.benefit}>• Personalizable</span>
            </div>
          </div>

          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <path d="M28 6H4C2.9 6 2 6.9 2 8V24C2 25.1 2.9 26 4 26H28C29.1 26 30 25.1 30 24V8C30 6.9 29.1 6 28 6Z" stroke="currentColor" strokeWidth="2"/>
                <path d="M2 10L16 18L30 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="26" cy="10" r="3" fill="#3B82F6"/>
                <path d="M24.5 10L25.3 10.8L27.5 8.6" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h3 className={styles.featureTitle}>Contacto WhatsApp</h3>
            <p className={styles.featureDescription}>
              Permite a tus clientes contactarte directamente a través 
              de un número de WhatsApp para consultas y verificaciones rápidas.
            </p>
            <div className={styles.featureBenefits}>
              <span className={styles.benefit}>• Número directo</span>
              <span className={styles.benefit}>• Consultas rápidas</span>
              <span className={styles.benefit}>• Soporte personalizado</span>
            </div>
          </div>

          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <path d="M22 3H10C8.9 3 8 3.9 8 5V27C8 28.1 8.9 29 10 29H22C23.1 29 24 28.1 24 27V5C24 3.9 23.1 3 22 3Z" stroke="currentColor" strokeWidth="2"/>
                <path d="M8 7H24M8 11H24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                <circle cx="12" cy="16" r="1.5" fill="#8B5CF6"/>
                <circle cx="16" cy="20" r="1.5" fill="#8B5CF6"/>
                <circle cx="20" cy="24" r="1.5" fill="#8B5CF6"/>
              </svg>
            </div>
            <h3 className={styles.featureTitle}>Llamadas con IA</h3>
            <p className={styles.featureDescription}>
              Verifica pedidos automáticamente mediante llamadas 
              inteligentes que entienden y responden como un humano.
            </p>
            <div className={styles.featureBenefits}>
              <span className={styles.benefit}>• Verificación automática</span>
              <span className={styles.benefit}>• Voz con IA</span>
              <span className={styles.benefit}>• Respuestas naturales</span>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className={styles.pricingSection}>
        <div className={styles.pricingHeader}>
          <h2 className={styles.pricingTitle}>Planes diseñados para tu crecimiento</h2>
          <p className={styles.pricingSubtitle}>
            Comienza gratis y escala con tu negocio. Todos los cargos se facturan en USD cada 30 días.
          </p>
        </div>
        
        <div className={styles.pricingGrid}>
          <div className={styles.pricingCard}>
            <div className={styles.pricingHeader}>
              <h3 className={styles.planName}>Verify Básico</h3>
              <div className={styles.planPrice}>
                <span className={styles.price}>$10</span>
                <span className={styles.period}>al mes</span>
              </div>
            </div>
            
            <div className={styles.planFeatures}>
              <div className={styles.feature}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M13.5 4.5L6 12L2.5 8.5" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span>Configuración del chatbot</span>
              </div>
              <div className={styles.feature}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M13.5 4.5L6 12L2.5 8.5" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span>Gestión de órdenes</span>
              </div>
              <div className={styles.feature}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M13.5 4.5L6 12L2.5 8.5" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span>Soporte por chat</span>
              </div>
              <div className={styles.feature}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M13.5 4.5L6 12L2.5 8.5" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span>Funcionalidades beta</span>
              </div>
              <div className={styles.feature}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M13.5 4.5L6 12L2.5 8.5" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span>Tickets ilimitados</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className={styles.statsSection}>
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <div className={styles.statValue}>24/7</div>
            <div className={styles.statLabel}>Soporte automatizado</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue}>2 min</div>
            <div className={styles.statLabel}>Configuración rápida</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue}>7 días</div>
            <div className={styles.statLabel}>Prueba gratuita</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue}>IA</div>
            <div className={styles.statLabel}>Potenciado por IA</div>
          </div>
        </div>
      </section>

      <FooterLegal />
    </div>
  );
}