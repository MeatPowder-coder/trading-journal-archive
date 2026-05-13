# Plan de Investigación: Fallo de Visualización en Frontend (ChatInterface)

**Premisa Confirmada**: El Backend funciona correctamente (los modelos responden y se guarda en DB). El problema es **exclusivamente de visualización en tiempo real** en el cliente.

## Objetivo
Identificar por qué `ChatInterface.tsx` descarta u oculta los mensajes entrantes del stream, requiriendo un refresco (F5) para mostrarlos.

## Áreas de Investigación (Frontend)

### 1. Desaparición del Mensaje "Optimista"
- **Hipótesis Principal**: `useChat` mantiene un mensaje temporal (optimista) mientras recibe el stream. Al finalizar el stream (`onFinish`), algo provoca que este mensaje se elimine del estado `messages` antes de ser reemplazado por la versión persistida o confirmada.
- **Sospechoso**: La llamada a `loadSessions()` dentro de `onFinish`.
    - Si `loadSessions` actualiza `sessions`, y esto dispara un `useEffect` que llama a `selectSession` o `setMessages([])`, el chat se borraría.
    - **Revisión**: Líneas 304-307 y `useEffect` en líneas 357-363 y 366-386.

### 2. Conflicto de IDs (Key Prop)
- **Hipótesis**: React usa `key={msg.id}`.
    - El ID del mensaje optimista es generado por `ai` SDK (ej. "abcd-1234").
    - El ID del mensaje real en DB es generado por el servidor (ej. "chat-msg-XYZ").
    - Si al terminar el stream, el sistema intenta reconciliar estos mensajes pero los IDs no coinciden y no se maneja la transición, React podría desmontar el componente del mensaje optimista.
- **Revisión**: Cómo `useChat` maneja la actualización de IDs tras el `onFinish`.

### 3. Renderizado Condicional (`ChatBubble`)
- **Hipótesis**: El componente `ChatBubble` podría estar recibiendo el mensaje pero fallando al renderizarlo si ciertos campos faltan (ej. `toolInvocations` indefinido pero esperado, o `content` vacío).
- **Revisión**: `ChatBubble` (líneas 146-204) y `getMessageText`.
    - Si `msg.content` es vacío pero tiene `parts`, ¿`getMessageText` lo maneja bien? (Sí, parece que sí).
    - Si `role` es 'assistant' y `content` es `null`, ¿falla?

### 4. Gestor de Errores Oculto
- **Hipótesis**: Un error en el stream (aunque sea al final, ej. JSON malformado en el último chunk) dispara `onError`.
    - `onError` en `ChatInterface` (línea 308) hace `setChatError`.
    - ¿`useChat` borra el mensaje fallido automáticamente? SÍ, por defecto `useChat` elimina el mensaje parcial si hay error.
    - **Esto explicaría todo**: El stream llega al 99%, falla el último byte (o el `finish` part), `useChat` detecta error, borra el mensaje, y muestra (o no) el error.
    - Como el usuario dice "no se ve error", quizá `chatError` se muestra y se oculta, o el error es ignorado.

## Áreas de Investigación (Backend)
Aunque el problema se manifiesta en el frontend, la *causa raíz* podría ser un dato mal formado enviado desde el backend que el frontend no sabe procesar.

### 1. `src/app/api/chat/route.ts` (Generación del Stream)
- **Hipótesis**: El formato manual del stream (V6) podría tener errores sutiles.
    - **Punto Clave**: La falta de un chunk de "finish" (`e:{...}`) o "data" (`d:{...}`) podría dejar al `useChat` esperando más datos, y al cerrarse la conexión TCP, `useChat` lo interpreta como interrupción/error.
    - **Revisión**: Verificar la implementación manual de `toDataStreamResponse`. ¿Estamos enviando los saltos de línea `\n` correctamente tras cada JSON? ¿Estamos enviando el header `X-Vercel-AI-Data-Stream: v1`? (Sí, confirmado en código, pero ¿se recibe bien?).

### 2. `src/lib/agent/tools.ts` (Ejecución de Herramientas)
- **Hipótesis**: Si una herramienta se ejecuta pero devuelve un resultado que no es serializable o contiene caracteres que rompen el stream (ej. binarios, strings muy largos sin escapar), el stream se corrompe.
    - **Evidencia**: El usuario menciona que "Gemini o ChatGPT responden", pero si usan herramientas (ej. "propose_live_trade"), el payload del resultado de la herramienta (`tool-result`) es complejo.
    - **Revisión**: Asegurar que los outputs de las tools sean JSON puro y válido.

### 3. Interacción Base de Datos (`route.ts` - `saveChat`)
- **Hipótesis**: El backend guarda el mensaje en la DB *después* de generarlo (`onFinish`).
    - Si el guardado en DB tarda mucho o falla silenciosamente (aunque parece que no falla porque persisten), podría afectar el cierre del stream si está ligado al ciclo de vida de la request.
    - **Revisión**: Lógica de `onFinish` en `streamText`.

---

## Próximos Pasos (Validación sin Cambios)

### A. Solicitud de Logs de Consola (Frontend)
Necesito que el usuario abra las Tools de Desarrollador (F12) -> Consola y verifique si aparecen errores rojos ("Chunk parse error", "Chat error") al momento de desaparecer el mensaje.

### B. Revisión de Network (Frontend)
En la pestaña Network, inspeccionar la request a `/api/chat`:
- ¿Status 200?
- ¿Response: Se ve el texto completo con formato `0:"hola"\n` etc.?
- ¿Termina con un error de red?

---
**ESTADO**: Plan actualizado con enfoque Full Stack. Esperando feedback del usuario sobre logs de consola para descartar error de protocolo vs error de renderizado.
