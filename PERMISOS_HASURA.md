# Configurar Permisos en Hasura para trades_activos

## Problema
La aplicación se queda en "Connecting..." sin mostrar datos. Esto ocurre porque la tabla `trades_activos` no tiene permisos configurados para permitir consultas públicas.

## Solución: Configurar Permisos en Hasura Console

### Paso 1: Acceder a Hasura Console
1. Abre tu navegador y ve a: **http://149.130.182.57:8085/console**
2. Ingresa la clave de administrador: `pon_una_clave_segura_aqui`

### Paso 2: Configurar Permisos de SELECT

1. En el menú superior, haz clic en **"Data"**
2. En el panel izquierdo, selecciona tu base de datos (probablemente "default" o "postgres")
3. Busca y haz clic en la tabla **"trades_activos"**
4. Haz clic en la pestaña **"Permissions"**

5. En la fila del rol **"public"**, haz clic en el ícono de **editar (lápiz)** en la columna **"select"**

6. Configura los permisos de la siguiente manera:
   - **Row select permissions:** Selecciona "Without any checks" (Permite leer todas las filas)
   - **Column select permissions:** Selecciona todas las columnas que quieres exponer:
     - ✅ id
     - ✅ pair
     - ✅ entry_price
     - ✅ pnl
     - ✅ status
     - ✅ created_at (opcional)
     - ✅ updated_at (opcional)

7. Haz clic en **"Save Permissions"**

### Paso 3: Configurar Permisos de SUBSCRIBE

1. En la misma fila del rol **"public"**, haz clic en el ícono de **editar (lápiz)** en la columna **"subscribe"**

2. Configura los permisos de la siguiente manera:
   - **Row subscribe permissions:** Selecciona "Without any checks"
   - **Column subscribe permissions:** Selecciona las mismas columnas que en el paso anterior

3. Haz clic en **"Save Permissions"**

### Paso 4: Verificar en la Consola GraphQL

1. Ve a la pestaña **"API"** en el menú superior
2. En el panel de GraphQL, prueba esta suscripción:

```graphql
subscription {
  trades_activos(order_by: {id: desc}) {
    id
    pair
    entry_price
    pnl
    status
  }
}
```

3. Haz clic en el botón de **"Play"** (▶️)
4. Deberías ver los datos de tu tabla en tiempo real

### Paso 5: Probar la Aplicación

1. Refresca tu aplicación en el navegador (http://localhost:3002)
2. Ahora deberías ver los datos cargándose correctamente

## Configuración Visual de Permisos

### Para el rol "public" - Permiso SELECT:
```
Row select permissions: 
  ○ With custom check: {}
  ● Without any checks

Column select permissions:
  ✅ id
  ✅ pair  
  ✅ entry_price
  ✅ pnl
  ✅ status
  ✅ created_at
  ✅ updated_at

Aggregation queries permissions:
  □ Allow aggregation queries
```

### Para el rol "public" - Permiso SUBSCRIBE:
```
Row subscribe permissions:
  ○ With custom check: {}
  ● Without any checks

Column subscribe permissions:
  ✅ id
  ✅ pair
  ✅ entry_price
  ✅ pnl
  ✅ status
  ✅ created_at
  ✅ updated_at
```

## Troubleshooting

### Si todavía no funciona después de configurar permisos:

1. **Verifica que la tabla existe:**
   - Ve a Data → [tu base de datos]
   - Confirma que "trades_activos" aparece en la lista de tablas rastreadas

2. **Verifica los permisos:**
   - Asegúrate de que el rol "public" tenga permisos tanto de "select" como de "subscribe"
   - Las columnas deben estar marcadas en ambos

3. **Revisa la consola del navegador:**
   - Abre las Herramientas de Desarrollador (F12)
   - Ve a la pestaña "Console"
   - Busca mensajes de error relacionados con GraphQL o WebSocket

4. **Verifica la conexión WebSocket:**
   - En la consola del navegador, busca mensajes como "WebSocket connection failed"
   - Asegúrate de que el servidor Hasura esté accesible en ws://149.130.182.57:8085

5. **Limpia el caché:**
   - Cierra y vuelve a abrir el navegador
   - O usa Ctrl+Shift+R para hacer un hard refresh

## Seguridad (Importante)

⚠️ **NOTA DE SEGURIDAD:** Actualmente estamos usando permisos públicos para facilitar el desarrollo. Para producción, deberías:

1. Implementar autenticación de usuarios
2. Configurar permisos basados en roles específicos
3. Limitar el acceso según el usuario autenticado
4. Usar custom checks para filtrar datos por usuario

Ejemplo de permiso más restrictivo (para futuro):
```json
{
  "user_id": {
    "_eq": "X-Hasura-User-Id"
  }
}
```

## Comandos útiles

### Ver logs de Hasura (si tienes acceso al servidor):
```bash
docker logs -f hasura-container-name
```

### Reiniciar Hasura (si necesitas):
```bash
docker restart hasura-container-name
```
