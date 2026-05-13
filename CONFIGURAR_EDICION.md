# Configurar Permisos de Edición en Hasura

Para que la funcionalidad de edición de trades funcione correctamente, necesitas configurar permisos de UPDATE en Hasura.

## Pasos para Configurar Permisos

### 1. Acceder a Hasura Console
1. Abre http://149.130.182.57:8085/console
2. Ingresa la clave: `pon_una_clave_segura_aqui`

### 2. Configurar Permisos de UPDATE

1. Ve a **Data** → **[tu base de datos]** → **trades_activos** → **Permissions**

2. En la fila del rol **"public"**, haz clic en el ícono de editar (lápiz) en la columna **"update"**

3. Configura los permisos:

   **Row update permissions:**
   ```json
   {
     "_eq": "X-Hasura-Role"
   }
   ```
   O simplemente selecciona **"Without any checks"** para desarrollo

   **Column update permissions:**
   Marca todas las columnas que quieres permitir editar:
   - ✅ simbolo
   - ✅ ticker_api
   - ✅ direccion
   - ✅ precio_entrada
   - ✅ precio_salida
   - ✅ apalancamiento
   - ✅ monto_margin
   - ✅ estado
   - ✅ pnl_realizado

4. Haz clic en **"Save Permissions"**

### 3. Verificar en GraphQL API

Para probar que funciona, ve a la pestaña **API** y ejecuta:

```graphql
mutation TestUpdate {
  update_trades_activos_by_pk(
    pk_columns: { id: 1 }
    _set: { 
      ticker_api: "BTC-USD"
      apalancamiento: 10
    }
  ) {
    id
    ticker_api
    apalancamiento
  }
}
```

Si ves un error de permisos, verifica que hayas guardado correctamente los permisos de UPDATE.

## Cómo Usar la Funcionalidad de Edición

### En la Interfaz Web:

1. **Localiza el trade** que quieres editar en la tabla
2. **Haz clic en el icono de lápiz** (Edit) en la columna "Acciones"
3. **Se abrirá un modal** con un formulario completo
4. **Edita los campos** que necesites:
   - Símbolo: El par de trading (ej: BTC/USDT)
   - Ticker API: El símbolo para Yahoo Finance (ej: BTC-USD)
   - Dirección: LONG o SHORT
   - Estado: ABIERTO o CERRADO
   - Precio Entrada: El precio al que entraste
   - Precio Salida: El precio al que saliste (opcional)
   - Apalancamiento: De 1 a 125x
   - Monto Margin: El capital usado
   - PnL Realizado: Para trades cerrados

5. **Haz clic en "Guardar Cambios"**
6. Los cambios se reflejarán inmediatamente en la tabla

## Ejemplos de Ticker API para Yahoo Finance

Para que el PnL en tiempo real funcione, usa estos formatos:

### Criptomonedas:
- Bitcoin: `BTC-USD`
- Ethereum: `ETH-USD`
- Ripple: `XRP-USD`
- Cardano: `ADA-USD`
- Solana: `SOL-USD`

### Acciones:
- Apple: `AAPL`
- Tesla: `TSLA`
- Microsoft: `MSFT`
- Amazon: `AMZN`
- Google: `GOOGL`

### Forex:
- EUR/USD: `EURUSD=X`
- GBP/USD: `GBPUSD=X`
- USD/JPY: `JPY=X`

### Commodities:
- Gold: `GC=F`
- Silver: `SI=F`
- Crude Oil: `CL=F`

## Solución de Problemas

### Error: "field 'update_trades_activos_by_pk' not found"
- **Causa:** No has configurado permisos de UPDATE
- **Solución:** Sigue los pasos anteriores para configurar permisos

### El precio actual no se muestra
- **Causa:** El ticker_api está vacío o es incorrecto
- **Solución:** Edita el trade y corrige el ticker_api usando los formatos de arriba

### El PnL no se calcula
- **Causa:** Faltan datos (ticker_api, apalancamiento, o monto_margin)
- **Solución:** Edita el trade y completa todos los campos requeridos

### El apalancamiento aparece como "x" sin número
- **Causa:** El campo apalancamiento es null o 0
- **Solución:** Edita el trade y establece un apalancamiento válido (mínimo 1)

## Notas de Seguridad

⚠️ **IMPORTANTE para Producción:**

Los permisos actuales ("Without any checks") permiten que cualquiera edite los trades. Para producción deberías:

1. Implementar autenticación de usuarios
2. Agregar una columna `user_id` a la tabla
3. Configurar permisos basados en el usuario:
   ```json
   {
     "user_id": {
       "_eq": "X-Hasura-User-Id"
     }
   }
   ```

Esto asegurará que cada usuario solo pueda editar sus propios trades.

## Campos Requeridos para Funcionalidad Completa

Para que todas las funciones trabajen correctamente, asegúrate de que cada trade tenga:

| Campo | Requerido | Descripción |
|-------|-----------|-------------|
| simbolo | ✅ | Nombre del par |
| ticker_api | ✅ | Para Yahoo Finance |
| direccion | ✅ | LONG o SHORT |
| precio_entrada | ✅ | Precio de entrada |
| apalancamiento | ✅ | Multiplicador (1+) |
| monto_margin | ✅ | Capital usado |
| estado | ✅ | ABIERTO o CERRADO |
| precio_salida | ⚠️ | Solo para cerrados |
| pnl_realizado | ⚠️ | Solo para cerrados |

⚠️ = Opcional pero recomendado
