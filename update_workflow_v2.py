#!/usr/bin/env python3
"""Add audio download + transcription and PDF extraction to workflow.json.
Uses existing credentials: telegramApi and googlePalmApi."""
import json, uuid

with open('/home/ubuntu/trading-journal/workflow.json', 'r') as f:
    wf = json.load(f)

nodes = wf['nodes']
connections = wf['connections']

def find_node(name):
    for n in nodes:
        if n['name'] == name:
            return n
    return None

def gid():
    return str(uuid.uuid4())

# =============================================
# 1. UPDATE: Normalizar Entrada — add fileId extraction + binary key normalization
# =============================================
norm = find_node('Normalizar Entrada')
norm['parameters']['jsCode'] = r"""// ============================================================
// NORMALIZAR ENTRADA
// Unifica los 3 entry points: Telegram, iPhone Shortcut, React
// Output: { text, chatId, source, fileType, fileExtension, fileId } + binary
// ============================================================
const item = $input.first();
const json = item.json;
let text = '';
let chatId = '';
let source = '';
let fileType = 'none';
let fileExtension = '';
let fileId = '';

if (json.message && json.message.chat) {
  // --- Telegram Trigger ---
  const msg = json.message;
  chatId = String(msg.chat.id);
  text = msg.text || msg.caption || '';
  source = 'telegram';

  // Detectar tipo de archivo adjunto
  if (msg.photo) {
    fileType = 'image';
    fileExtension = 'webp';
    // Telegram photos are arrays, largest one last
    fileId = msg.photo[msg.photo.length - 1].file_id;
  } else if (msg.document) {
    const mime = msg.document.mime_type || '';
    const fname = msg.document.file_name || '';
    const ext = fname.includes('.') ? fname.split('.').pop().toLowerCase() : '';
    fileId = msg.document.file_id;
    if (mime.startsWith('image/')) {
      fileType = 'image';
      fileExtension = 'webp';
    } else if (mime.startsWith('audio/')) {
      fileType = 'audio';
      fileExtension = ext || 'mp3';
    } else if (mime === 'application/pdf') {
      fileType = 'document';
      fileExtension = 'pdf';
    } else if (mime.startsWith('video/')) {
      fileType = 'video';
      fileExtension = ext || 'mp4';
    } else {
      fileType = 'document';
      fileExtension = ext || 'bin';
    }
  } else if (msg.audio) {
    fileType = 'audio';
    const fname = msg.audio.file_name || '';
    fileExtension = fname.includes('.') ? fname.split('.').pop().toLowerCase() : 'mp3';
    fileId = msg.audio.file_id;
  } else if (msg.voice) {
    fileType = 'audio';
    fileExtension = 'ogg';
    fileId = msg.voice.file_id;
  } else if (msg.video || msg.video_note) {
    fileType = 'video';
    fileExtension = 'mp4';
    fileId = (msg.video || msg.video_note).file_id;
  } else if (msg.sticker) {
    fileType = 'image';
    fileExtension = 'webp';
    fileId = msg.sticker.file_id;
  }

  if (msg.reply_to_message) {
    const rt = msg.reply_to_message.text || msg.reply_to_message.caption || '';
    if (rt) text += `\\n\\n=== CONTEXTO REPLY ===\\\"${rt}\\\"\\n=== FIN CONTEXTO ===`;
  }
} else if (json.body && (json.body.tradeId || json.body.userId || json.body.message)) {
  // --- React Web ---
  const body = json.body;
  chatId = body.tradeId ? String(body.tradeId) : (String(body.userId) || 'react_guest');
  text = body.message || '';

  if (body.tradeId) {
    let contextMsg = `[SISTEMA: Contexto Trade ID: ${body.tradeId}`;
    if (body.context) {
      const ctx = body.context;
      if (ctx.symbol) contextMsg += ` | ${ctx.symbol}`;
      if (ctx.direction) contextMsg += ` ${ctx.direction}`;
      if (ctx.pnl) contextMsg += ` | PnL: ${ctx.pnl}`;
    }
    contextMsg += `]`;
    text += `\\n\\n${contextMsg}`;
  }

  // --- PROCESAMIENTO DE ARCHIVO BASE64 (imagen, audio, PDF, etc.) ---
  const fileData = body.file || body.image;
  if (fileData && typeof fileData === 'string' && fileData.startsWith('data:')) {
    try {
      const parts = fileData.split(';');
      if (parts.length > 1) {
        const mimeType = parts[0].split(':')[1];
        const base64Data = parts[1].split(',')[1];
        if (mimeType && base64Data) {
          if (mimeType.startsWith('image/')) {
            fileType = 'image';
            fileExtension = 'webp';
          } else if (mimeType.startsWith('audio/')) {
            fileType = 'audio';
            fileExtension = mimeType.split('/')[1] || 'mp3';
          } else if (mimeType === 'application/pdf') {
            fileType = 'document';
            fileExtension = 'pdf';
          } else if (mimeType.startsWith('video/')) {
            fileType = 'video';
            fileExtension = mimeType.split('/')[1] || 'mp4';
          } else {
            fileType = 'document';
            fileExtension = mimeType.split('/')[1] || 'bin';
          }
          if (!item.binary) item.binary = {};
          item.binary.data = {
            data: base64Data,
            mimeType: mimeType,
            fileName: `react_upload_${Date.now()}.${fileExtension}`
          };
        }
      }
    } catch (err) {
      text += `\\n[ERROR SISTEMA: Falló al procesar archivo adjunto]`;
    }
  }
  source = 'react_web';
} else {
  // --- iPhone Shortcut ---
  const body = json.body || json;
  chatId = '8106031507';
  text = body.text || json.text || '';
  source = 'iphone';
}

// Normalizar binary key: si existe bajo otro nombre, copiar a 'data'
if (item.binary) {
  const keys = Object.keys(item.binary);
  if (keys.length > 0 && !item.binary.data) {
    item.binary.data = item.binary[keys[0]];
  }
}

// Para voice notes sin texto, usar placeholder
if (!text && fileId) {
  text = '[Archivo enviado sin texto]';
}

// Output limpio
const result = { json: { text, chatId, source, fileType, fileExtension, fileId } };
if (item.binary) result.binary = item.binary;
return result;"""

# =============================================
# 2. UPDATE: Validation node — allow empty text with fileId
# =============================================
debug_node = find_node('Code in JavaScript')
if debug_node:
    debug_node['parameters']['jsCode'] = r"""const item = $input.first();
const json = item.json;

console.log('=== DEBUG NORMALIZAR ENTRADA ===');
console.log('text:', json.text);
console.log('chatId:', json.chatId);
console.log('source:', json.source);
console.log('fileType:', json.fileType);
console.log('fileId:', json.fileId);
console.log('binary:', item.binary ? 'SÍ' : 'NO');

if (!json.chatId || json.chatId === 'undefined' || json.chatId === '') {
  throw new Error(`❌ CHATID INVÁLIDO: ${json.chatId}`);
}

if (!json.text && !json.fileId) {
  throw new Error(`❌ TEXT VACÍO Y SIN ARCHIVO`);
}

return item;"""

# =============================================
# 3. FIX: "If: ¿Hay Imagen?" → check fileType instead of binary
# =============================================
hay_img = find_node('If: ¿Hay Imagen?')
hay_img['name'] = 'If: ¿Hay Archivo?'
hay_img['parameters']['conditions']['conditions'] = [
    {
        "id": gid(),
        "leftValue": "={{ $json.fileType }}",
        "rightValue": "none",
        "operator": {
            "type": "string",
            "operation": "notEquals",
            "name": "filter.operator.notEquals"
        }
    }
]

# =============================================
# 4. NEW NODE: "If: ¿Falta Binary?"
# =============================================
if_falta_binary = {
    "parameters": {
        "conditions": {
            "options": {
                "caseSensitive": True,
                "leftValue": "",
                "typeValidation": "strict",
                "version": 2
            },
            "conditions": [
                {
                    "id": gid(),
                    "leftValue": "={{ $json.fileId }}",
                    "rightValue": "",
                    "operator": {
                        "type": "string",
                        "operation": "isNotEmpty",
                        "singleValue": True
                    }
                },
                {
                    "id": gid(),
                    "leftValue": "={{ $binary }}",
                    "rightValue": "",
                    "operator": {
                        "type": "object",
                        "operation": "empty",
                        "singleValue": True
                    }
                }
            ],
            "combinator": "and"
        },
        "options": {}
    },
    "id": gid(),
    "name": "If: ¿Falta Binary?",
    "type": "n8n-nodes-base.if",
    "typeVersion": 2.2,
    "position": [-1100, 0]
}
nodes.append(if_falta_binary)

# =============================================
# 5. NEW NODE: "Telegram: getFile" (HTTP Request)
# =============================================
tg_getfile = {
    "parameters": {
        "method": "GET",
        "url": "=https://api.telegram.org/bot{{ $env.TELEGRAM_BOT_TOKEN }}/getFile",
        "sendQuery": True,
        "queryParameters": {
            "parameters": [
                {
                    "name": "file_id",
                    "value": "={{ $('Normalizar Entrada').first().json.fileId }}"
                }
            ]
        },
        "options": {}
    },
    "id": gid(),
    "name": "Telegram: getFile",
    "type": "n8n-nodes-base.httpRequest",
    "typeVersion": 4.2,
    "position": [-1100, 240]
}
nodes.append(tg_getfile)

# =============================================
# 6. NEW NODE: "Telegram: Download Binary" (HTTP Request)
# =============================================
tg_download = {
    "parameters": {
        "method": "GET",
        "url": "=https://api.telegram.org/file/bot{{ $env.TELEGRAM_BOT_TOKEN }}/{{ $json.result.file_path }}",
        "options": {
            "response": {
                "response": {
                    "responseFormat": "file"
                }
            }
        }
    },
    "id": gid(),
    "name": "Telegram: Download Binary",
    "type": "n8n-nodes-base.httpRequest",
    "typeVersion": 4.2,
    "position": [-920, 240]
}
nodes.append(tg_download)

# =============================================
# 7. NEW NODE: "Preparar Binary" (Code) — merge downloaded binary with original JSON
# =============================================
preparar_binary = {
    "parameters": {
        "jsCode": r"""// Combina el binary descargado con los datos de Normalizar Entrada
const normData = $('Normalizar Entrada').first().json;
const downloadItem = $input.first();
const binary = downloadItem.binary || {};

// Normalizar binary key a 'data'
const keys = Object.keys(binary);
if (keys.length > 0 && !binary.data) {
  binary.data = binary[keys[0]];
}

// Fijar mimeType según fileType/fileExtension
if (binary.data) {
  const ft = normData.fileType;
  const ext = normData.fileExtension;
  if (ft === 'audio') {
    if (ext === 'ogg' || ext === 'oga') binary.data.mimeType = 'audio/ogg';
    else if (ext === 'mp3') binary.data.mimeType = 'audio/mpeg';
    else binary.data.mimeType = `audio/${ext}`;
  } else if (ft === 'document' && ext === 'pdf') {
    binary.data.mimeType = 'application/pdf';
  } else if (ft === 'video') {
    binary.data.mimeType = `video/${ext}`;
  }
  binary.data.fileName = `telegram_${Date.now()}.${ext}`;
}

return { json: normData, binary };"""
    },
    "id": gid(),
    "name": "Preparar Binary",
    "type": "n8n-nodes-base.code",
    "typeVersion": 2,
    "position": [-740, 240]
}
nodes.append(preparar_binary)

# =============================================
# 8. NEW NODE: "If: ¿Audio o PDF?" — routes to Gemini pre-processing
# =============================================
if_audio_pdf = {
    "parameters": {
        "conditions": {
            "options": {
                "caseSensitive": True,
                "leftValue": "",
                "typeValidation": "strict",
                "version": 2
            },
            "conditions": [
                {
                    "id": gid(),
                    "leftValue": "={{ $('Normalizar Entrada').first().json.fileType }}",
                    "rightValue": "image",
                    "operator": {
                        "type": "string",
                        "operation": "notEquals",
                        "name": "filter.operator.notEquals"
                    }
                }
            ],
            "combinator": "and"
        },
        "options": {}
    },
    "id": gid(),
    "name": "If: ¿Audio o PDF?",
    "type": "n8n-nodes-base.if",
    "typeVersion": 2.2,
    "position": [550, -300]
}
nodes.append(if_audio_pdf)

# =============================================
# 9. NEW NODE: "Gemini: Transcribir/Extraer" (HTTP Request to Gemini API)
# =============================================
gemini_preprocess = {
    "parameters": {
        "method": "POST",
        "url": "=https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={{ $env.GOOGLE_API_KEY }}",
        "sendBody": True,
        "specifyBody": "json",
        "jsonBody": """={{ JSON.stringify({
  contents: [{
    parts: [
      {
        text: $('Normalizar Entrada').first().json.fileType === 'audio'
          ? 'Transcribe este audio textualmente en español. Devuelve SOLO la transcripción sin formato adicional. Si no puedes transcribirlo, di exactamente qué problema hay.'
          : 'Extrae TODAS las transacciones de este estado de cuenta bancario. Para cada transacción incluye: fecha, descripción, monto, y si es débito o crédito. Devuelve la información de forma clara y estructurada. Si hay saldo inicial y final, inclúyelos también.'
      },
      {
        inlineData: {
          mimeType: $binary.data.mimeType,
          data: $binary.data.data
        }
      }
    ]
  }],
  generationConfig: { temperature: 0.1 }
}) }}""",
        "options": {
            "response": {
                "response": {
                    "responseFormat": "json"
                }
            }
        }
    },
    "id": gid(),
    "name": "Gemini: Transcribir/Extraer",
    "type": "n8n-nodes-base.httpRequest",
    "typeVersion": 4.2,
    "position": [550, -520]
}
nodes.append(gemini_preprocess)

# =============================================
# 10. NEW NODE: "Preparar Input (Pre-procesado)" — builds input with Gemini-extracted text
# =============================================
prep_preprocessed = {
    "parameters": {
        "jsCode": r"""// Ruta PRE-PROCESADA: audio transcrito o PDF extraído por Gemini
const geminiResp = $input.first().json;
const normData = $('Normalizar Entrada').first().json;
const nombreArchivo = $('Edit Fields1').first().json.nombre_archivo_fijo;
const fileUrl = `https://assets.agentame.xyz/uploads/${nombreArchivo}`;

// Extraer texto de respuesta Gemini
let extractedText = '';
try {
  if (geminiResp.candidates && geminiResp.candidates[0]) {
    extractedText = geminiResp.candidates[0].content.parts[0].text || '';
  }
} catch (e) {
  extractedText = '[ERROR: No se pudo procesar el archivo con Gemini]';
}

const { text, fileType } = normData;
let input = text || '';

if (fileType === 'audio') {
  input += `\n\n[SISTEMA: TRANSCRIPCIÓN_AUDIO: ${extractedText}]`;
  input += `\n[SISTEMA: ARCHIVO_ADJUNTO: ${fileUrl} | tipo: ${fileType}]`;
} else {
  // PDF / documento
  input += `\n\n[SISTEMA: CONTENIDO_DOCUMENTO_EXTRAÍDO:\n${extractedText}\n]`;
  input += `\n[SISTEMA: ARCHIVO_ADJUNTO: ${fileUrl} | tipo: ${fileType}]`;
}

return { json: { input } };"""
    },
    "id": gid(),
    "name": "Preparar Input (Pre-procesado)",
    "type": "n8n-nodes-base.code",
    "typeVersion": 2,
    "position": [780, -520]
}
nodes.append(prep_preprocessed)

# =============================================
# 11. UPDATE: "Preparar Input (Con Imagen)" — keep for image path only
# =============================================
prep = find_node('Preparar Input (Con Imagen)')
prep['parameters']['jsCode'] = r"""// Ruta CON IMAGEN — pasa binary al agente para visión
const diskItem = $('Escribir en Disco').first();
const nombreArchivo = $('Edit Fields1').first().json.nombre_archivo_fijo;
const fileUrl = `https://assets.agentame.xyz/uploads/${nombreArchivo}`;
const { text, chatId, source, fileType, fileExtension } = $('Normalizar Entrada').first().json;

let input = text || '';
input += `\n\n[SISTEMA: ARCHIVO_ADJUNTO: ${fileUrl} | tipo: ${fileType}]`;

const result = { json: { input } };
if (diskItem.binary) {
    result.binary = diskItem.binary;
}
return result;"""

# =============================================
# 12. POSITION ADJUSTMENTS
# =============================================
# Move Normalizar Entrada slightly left to make room
find_node('Normalizar Entrada')['position'] = [-1320, 0]

# Move existing nodes to accommodate new branching after Guardar Sesión
find_node('Guardar Sesión')['position'] = [480, -300]
prep['position'] = [780, -300]  # Preparar Input (Con Imagen) moved right

# =============================================
# 13. UPDATE CONNECTIONS
# =============================================

# Normalizar Entrada → If: ¿Falta Binary? (instead of Esperar Cuentas)
connections['Normalizar Entrada'] = {
    "main": [[
        {"node": "If: ¿Falta Binary?", "type": "main", "index": 0}
    ]]
}

# If: ¿Falta Binary? TRUE → Telegram: getFile, FALSE → Esperar Cuentas
connections['If: ¿Falta Binary?'] = {
    "main": [
        [{"node": "Telegram: getFile", "type": "main", "index": 0}],
        [{"node": "Esperar Cuentas", "type": "main", "index": 1}]
    ]
}

# Telegram download chain
connections['Telegram: getFile'] = {
    "main": [[
        {"node": "Telegram: Download Binary", "type": "main", "index": 0}
    ]]
}

connections['Telegram: Download Binary'] = {
    "main": [[
        {"node": "Preparar Binary", "type": "main", "index": 0}
    ]]
}

# Preparar Binary → Esperar Cuentas (same input as before)
connections['Preparar Binary'] = {
    "main": [[
        {"node": "Esperar Cuentas", "type": "main", "index": 1}
    ]]
}

# Update "If: ¿Hay Imagen?" references to new name "If: ¿Hay Archivo?"
connections['Esperar Cuentas'] = {
    "main": [[
        {"node": "If: ¿Hay Archivo?", "type": "main", "index": 0}
    ]]
}
# Remove old key, add new
if 'If: ¿Hay Imagen?' in connections:
    old_conns = connections.pop('If: ¿Hay Imagen?')
connections['If: ¿Hay Archivo?'] = {
    "main": [
        [{"node": "Edit Fields1", "type": "main", "index": 0}],
        [{"node": "Check Session", "type": "main", "index": 0}]
    ]
}

# Guardar Sesión → If: ¿Audio o PDF? (instead of directly to Preparar Input)
connections['Guardar Sesión'] = {
    "main": [[
        {"node": "If: ¿Audio o PDF?", "type": "main", "index": 0}
    ]]
}

# If: ¿Audio o PDF? TRUE (not image) → Gemini, FALSE (image) → Preparar Input (Con Imagen)
connections['If: ¿Audio o PDF?'] = {
    "main": [
        [{"node": "Gemini: Transcribir/Extraer", "type": "main", "index": 0}],
        [{"node": "Preparar Input (Con Imagen)", "type": "main", "index": 0}]
    ]
}

# Gemini → Preparar Input (Pre-procesado)
connections['Gemini: Transcribir/Extraer'] = {
    "main": [[
        {"node": "Preparar Input (Pre-procesado)", "type": "main", "index": 0}
    ]]
}

# Pre-processed input → Agent
connections['Preparar Input (Pre-procesado)'] = {
    "main": [[
        {"node": "Agente Financiero", "type": "main", "index": 0}
    ]]
}

# Preparar Input (Con Imagen) still → Agente Financiero (already exists, just confirm)
connections['Preparar Input (Con Imagen)'] = {
    "main": [[
        {"node": "Agente Financiero", "type": "main", "index": 0}
    ]]
}

# =============================================
# WRITE
# =============================================
with open('/home/ubuntu/trading-journal/workflow.json', 'w') as f:
    json.dump(wf, f, indent=4, ensure_ascii=False)

print("✅ workflow.json updated!")
print("New nodes added:")
print("  - If: ¿Falta Binary? (checks if fileId exists but no binary)")
print("  - Telegram: getFile (gets file path from Telegram API)")
print("  - Telegram: Download Binary (downloads the actual file)")
print("  - Preparar Binary (merges binary with original data)")
print("  - If: ¿Audio o PDF? (routes audio/PDF to Gemini pre-processing)")
print("  - Gemini: Transcribir/Extraer (calls Gemini API for transcription/extraction)")
print("  - Preparar Input (Pre-procesado) (builds input with extracted text)")
print()
print("Modified nodes:")
print("  - Normalizar Entrada: binary key normalization + placeholder for audio-only")
print("  - If: ¿Hay Imagen? → renamed to If: ¿Hay Archivo? (checks fileType != none)")
print("  - Code in JavaScript: allows empty text with fileId")
print("  - Preparar Input (Con Imagen): simplified for image-only path")
print()
print("⚠️  REQUIRES env vars in n8n: TELEGRAM_BOT_TOKEN, GOOGLE_API_KEY")
