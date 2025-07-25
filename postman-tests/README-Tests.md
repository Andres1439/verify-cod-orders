# 🧪 Guía de Tests para API de Órdenes Shopify

## 📋 Configuración Inicial

### 1. Importar Colección en Postman
1. Abre Postman
2. Click en "Import"
3. Selecciona el archivo `Shopify-Orders-API-Tests.json`
4. Configura las variables de entorno

### 2. Variables de Entorno
```
base_url: https://cod-orders.fly.dev
shop_domain: tu-tienda.myshopify.com
```

## 🎯 Tests Incluidos

### ✅ Test 1: Un Solo Producto (Compatibilidad)
**Propósito:** Verificar que el formato anterior sigue funcionando
**Formato:** Campos individuales (product_name, variant_id, etc.)
**Resultado esperado:** ✅ Orden creada exitosamente

### ✅ Test 2: Múltiples Productos (Nuevo)
**Propósito:** Probar la nueva funcionalidad principal
**Formato:** Array `products` con múltiples items
**Resultado esperado:** ✅ Orden con múltiples productos creada

### ❌ Test 3: Datos Faltantes
**Propósito:** Validar manejo de errores
**Resultado esperado:** ❌ Error 400 con mensaje específico

### ❌ Test 4: Variant ID Inválido
**Propósito:** Verificar validación de productos en Shopify
**Resultado esperado:** ❌ Error indicando variant no encontrado

### 🔥 Test 5: Stress Test (5 Productos)
**Propósito:** Probar rendimiento con muchos productos
**Resultado esperado:** ✅ Procesamiento exitoso de todos los productos

### 🔄 Test 6: Formato Mixto
**Propósito:** Verificar prioridad del array products
**Resultado esperado:** ✅ Procesa solo el array products

## 📊 Respuestas Esperadas

### ✅ Éxito (Un Producto)
```json
{
  "success": true,
  "message": "Orden creada exitosamente",
  "data": {
    "shopifyOrderId": "gid://shopify/Order/123456",
    "shopifyOrderName": "#1001",
    "product": {
      "name": "The Archived Snowboard",
      "quantity": 1,
      "price": "629.95"
    },
    "customer": {
      "name": "Juan",
      "phone": "987654321",
      "email": "juan@test.com"
    },
    "total": "629.95"
  }
}
```

### ✅ Éxito (Múltiples Productos)
```json
{
  "success": true,
  "message": "Orden creada exitosamente",
  "data": {
    "shopifyOrderId": "gid://shopify/Order/123457",
    "shopifyOrderName": "#1002",
    "products": [
      {
        "name": "The Archived Snowboard",
        "quantity": 2,
        "price": "629.95",
        "subtotal": "1259.90"
      },
      {
        "name": "Camiseta Básica", 
        "quantity": 1,
        "price": "25.00",
        "subtotal": "25.00"
      }
    ],
    "customer": {
      "name": "María",
      "phone": "987654321",
      "email": "maria@test.com"
    },
    "total": "1284.90"
  }
}
```

### ❌ Error (Datos Faltantes)
```json
{
  "success": false,
  "error": "VALIDATION_ERROR",
  "message": "Faltan campos obligatorios",
  "details": {
    "missing_fields": ["first_name", "email", "address1"],
    "invalid_products": ["quantity requerida para producto 1"]
  }
}
```

## 🔧 Actualización Necesaria para N8N

### ❌ Tu Formato Actual
```json
{
  "shopDomain": "{{ $('Prepare Data').item.json.shop_domain }}",
  "product_name": "{{ $fromAI('product_name', '...') }}",
  "variant_id": "{{ $fromAI('variant_id', '...') }}",
  "price": "{{ $fromAI('price', '...') }}",
  "quantity": "{{ $fromAI('quantity', '...') || '1' }}",
  "phone": "{{ $fromAI('phone', '...') }}",
  "first_name": "{{ $fromAI('first_name', '...') }}",
  "email": "{{ $fromAI('email', '...') }}",
  "address1": "{{ $fromAI('address', '...') }}"
}
```

### ✅ Formato Recomendado (Múltiples Productos)
```json
{
  "shopDomain": "{{ $('Prepare Data').item.json.shop_domain }}",
  "products": [
    {
      "product_name": "{{ $fromAI('product_name_1', 'Nombre EXACTO del producto 1', 'string') }}",
      "variant_id": "{{ $fromAI('variant_id_1', 'ID variante producto 1', 'string') }}",
      "price": "{{ $fromAI('price_1', 'Precio producto 1', 'string') }}",
      "quantity": "{{ $fromAI('quantity_1', 'Cantidad producto 1', 'string') || '1' }}"
    }
  ],
  "phone": "{{ $fromAI('phone', 'Número de teléfono del cliente', 'string') }}",
  "first_name": "{{ $fromAI('first_name', 'Nombre del cliente', 'string') }}",
  "email": "{{ $fromAI('email', 'Correo del cliente', 'string') }}",
  "address1": "{{ $fromAI('address', 'Dirección del cliente', 'string') }}"
}
```

### 🔄 Opción: Mantener Compatibilidad
Si prefieres mantener tu formato actual, la API seguirá funcionando porque mantiene **compatibilidad hacia atrás**. Pero para aprovechar múltiples productos, necesitas el nuevo formato.

## 📝 Notas Importantes

1. **Compatibilidad:** El formato anterior sigue funcionando
2. **Prioridad:** Si envías ambos formatos, se usa el array `products`
3. **Validación:** Cada producto se valida individualmente
4. **Shopify:** Cada variant_id se verifica en Shopify antes de crear la orden
5. **Total:** Se calcula automáticamente sumando todos los productos

## 🚀 Próximos Pasos

1. **Ejecutar tests en Postman** para validar funcionalidad
2. **Actualizar N8N** al nuevo formato si quieres múltiples productos
3. **Probar en ambiente real** con datos de tu tienda Shopify
4. **Monitorear logs** para verificar que todo funciona correctamente
