// scripts/validate-chatbot-config.js
// Script para validar y verificar la configuración del chatbot

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function validateChatbotConfig() {
  try {
    console.log('🔍 VALIDANDO CONFIGURACIÓN DEL CHATBOT...\n');

    // 1. Obtener todas las tiendas
    const shops = await prisma.shop.findMany({
      include: {
        chatbot_configuration: true
      }
    });

    console.log(`📊 Total de tiendas encontradas: ${shops.length}\n`);

    for (const shop of shops) {
      console.log(`🏪 TIENDA: ${shop.shop_domain}`);
      console.log(`   ID: ${shop.id}`);
      console.log(`   Plan: ${shop.subscription_plan}`);
      console.log(`   Creada: ${shop.created_at}`);

      if (shop.chatbot_configuration) {
        console.log('   ✅ CONFIGURACIÓN ENCONTRADA:');
        console.log(`      Bot Name: "${shop.chatbot_configuration.bot_name}"`);
        console.log(`      Welcome Message: "${shop.chatbot_configuration.welcome_message}"`);
        console.log(`      Input Placeholder: "${shop.chatbot_configuration.input_placeholder}"`);
        console.log(`      Personality: "${shop.chatbot_configuration.personality}"`);
        console.log(`      Is Active: ${shop.chatbot_configuration.is_active}`);
        console.log(`      Required Fields: ${JSON.stringify(shop.chatbot_configuration.required_fields)}`);
        console.log(`      Actualizada: ${shop.chatbot_configuration.updated_at}`);
      } else {
        console.log('   ❌ NO HAY CONFIGURACIÓN - Creando configuración por defecto...');
        
        // Crear configuración por defecto
        const defaultConfig = await prisma.chatbotConfiguration.create({
          data: {
            shop_id: shop.id,
            bot_name: "Verify",
            welcome_message: "¡Hola! Estoy aquí para ayudarte.",
            input_placeholder: "Escríbenos un mensaje...",
            personality: "Chatbot amigable que usa emojis y responde de manera casual",
            is_active: true,
            required_fields: {
              nombre: true,
              numero: true,
              correo: true,
              direccion: false,
              ciudad: false,
              provincia: false,
              pais: false
            }
          }
        });
        
        console.log('   ✅ CONFIGURACIÓN CREADA:', defaultConfig.id);
      }
      
      console.log(''); // Línea en blanco
    }

    // 2. Probar la API de configuración
    console.log('🌐 PROBANDO API DE CONFIGURACIÓN...\n');
    
    for (const shop of shops) {
      try {
        const apiUrl = `https://cod-orders.fly.dev/api/chatbot-config?shop_domain=${encodeURIComponent(shop.shop_domain)}`;
        console.log(`📡 Probando: ${apiUrl}`);
        
        const response = await fetch(apiUrl);
        const data = await response.json();
        
        if (data.success) {
          console.log('   ✅ API RESPUESTA EXITOSA');
          console.log(`      Bot Name: "${data.chatbot_config.bot_name}"`);
          console.log(`      Welcome Message: "${data.chatbot_config.welcome_message}"`);
        } else {
          console.log('   ❌ API ERROR:', data.error);
        }
      } catch (error) {
        console.log('   ❌ API CONNECTION ERROR:', error.message);
      }
      
      console.log(''); // Línea en blanco
    }

    console.log('✅ VALIDACIÓN COMPLETADA');

  } catch (error) {
    console.error('❌ ERROR EN VALIDACIÓN:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  validateChatbotConfig();
}

module.exports = { validateChatbotConfig };
