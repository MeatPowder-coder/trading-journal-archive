#!/usr/bin/env python3
"""Update workflow.json to support multi-media files (audio, PDF, video, etc.)"""
import json

with open('/home/ubuntu/trading-journal/workflow.json', 'r') as f:
    wf = json.load(f)

nodes = wf['nodes']
connections = wf['connections']

def find_node(name):
    for n in nodes:
        if n['name'] == name:
            return n
    return None

# =============================================
# 1. UPDATE: Normalizar Entrada
# =============================================
norm = find_node('Normalizar Entrada')
norm['parameters']['jsCode'] = '\n'.join([
    '// ============================================================',
    '// NORMALIZAR ENTRADA',
    '// Unifica los 3 entry points: Telegram, iPhone Shortcut, React',
    '// Output: { text, chatId, source, fileType, fileExtension } + binary',
    '// ============================================================',
    'const item = $input.first();',
    'const json = item.json;',
    'let text = \'\';',
    'let chatId = \'\';',
    'let source = \'\';',
    'let fileType = \'none\';',
    'let fileExtension = \'\';',
    '',
    'if (json.message && json.message.chat) {',
    '  // --- Telegram Trigger ---',
    '  const msg = json.message;',
    '  chatId = String(msg.chat.id);',
    '  text = msg.text || msg.caption || \'\';',
    '  source = \'telegram\';',
    '',
    '  // Detectar tipo de archivo adjunto',
    '  if (msg.photo) {',
    '    fileType = \'image\';',
    '    fileExtension = \'webp\';',
    '  } else if (msg.document) {',
    '    const mime = msg.document.mime_type || \'\';',
    '    const fname = msg.document.file_name || \'\';',
    '    const ext = fname.includes(\'.\') ? fname.split(\'.\').pop().toLowerCase() : \'\';',
    '    if (mime.startsWith(\'image/\')) {',
    '      fileType = \'image\';',
    '      fileExtension = \'webp\';',
    '    } else if (mime.startsWith(\'audio/\')) {',
    '      fileType = \'audio\';',
    '      fileExtension = ext || \'mp3\';',
    '    } else if (mime === \'application/pdf\') {',
    '      fileType = \'document\';',
    '      fileExtension = \'pdf\';',
    '    } else if (mime.startsWith(\'video/\')) {',
    '      fileType = \'video\';',
    '      fileExtension = ext || \'mp4\';',
    '    } else {',
    '      fileType = \'document\';',
    '      fileExtension = ext || \'bin\';',
    '    }',
    '  } else if (msg.audio) {',
    '    fileType = \'audio\';',
    '    const fname = msg.audio.file_name || \'\';',
    '    fileExtension = fname.includes(\'.\') ? fname.split(\'.\').pop().toLowerCase() : \'mp3\';',
    '  } else if (msg.voice) {',
    '    fileType = \'audio\';',
    '    fileExtension = \'ogg\';',
    '  } else if (msg.video || msg.video_note) {',
    '    fileType = \'video\';',
    '    fileExtension = \'mp4\';',
    '  } else if (msg.sticker) {',
    '    fileType = \'image\';',
    '    fileExtension = \'webp\';',
    '  }',
    '',
    '  if (msg.reply_to_message) {',
    '    const rt = msg.reply_to_message.text || msg.reply_to_message.caption || \'\';',
    '    if (rt) text += `\\\\n\\\\n=== CONTEXTO REPLY ===\\\\n\\"${rt}\\"\\\\n=== FIN CONTEXTO ===`;',
    '  }',
    '} else if (json.body && (json.body.tradeId || json.body.userId || json.body.message)) {',
    '  // --- React Web ---',
    '  const body = json.body;',
    '  chatId = body.tradeId ? String(body.tradeId) : (String(body.userId) || \'react_guest\');',
    '  text = body.message || \'\';',
    '',
    '  if (body.tradeId) {',
    '    let contextMsg = `[SISTEMA: Contexto Trade ID: ${body.tradeId}`;',
    '    if (body.context) {',
    '      const ctx = body.context;',
    '      if (ctx.symbol) contextMsg += ` | ${ctx.symbol}`;',
    '      if (ctx.direction) contextMsg += ` ${ctx.direction}`;',
    '      if (ctx.pnl) contextMsg += ` | PnL: ${ctx.pnl}`;',
    '    }',
    '    contextMsg += `]`;',
    '    text += `\\\\n\\\\n${contextMsg}`;',
    '  }',
    '',
    '  // --- PROCESAMIENTO DE ARCHIVO BASE64 (imagen, audio, PDF, etc.) ---',
    '  const fileData = body.file || body.image;',
    '  if (fileData && typeof fileData === \'string\' && fileData.startsWith(\'data:\')) {',
    '    try {',
    '      const parts = fileData.split(\';\');',
    '      if (parts.length > 1) {',
    '        const mimeType = parts[0].split(\':\')[1];',
    '        const base64Data = parts[1].split(\',\')[1];',
    '        if (mimeType && base64Data) {',
    '          if (mimeType.startsWith(\'image/\')) {',
    '            fileType = \'image\';',
    '            fileExtension = \'webp\';',
    '          } else if (mimeType.startsWith(\'audio/\')) {',
    '            fileType = \'audio\';',
    '            fileExtension = mimeType.split(\'/\')[1] || \'mp3\';',
    '          } else if (mimeType === \'application/pdf\') {',
    '            fileType = \'document\';',
    '            fileExtension = \'pdf\';',
    '          } else if (mimeType.startsWith(\'video/\')) {',
    '            fileType = \'video\';',
    '            fileExtension = mimeType.split(\'/\')[1] || \'mp4\';',
    '          } else {',
    '            fileType = \'document\';',
    '            fileExtension = mimeType.split(\'/\')[1] || \'bin\';',
    '          }',
    '          if (!item.binary) item.binary = {};',
    '          item.binary.data = {',
    '            data: base64Data,',
    '            mimeType: mimeType,',
    '            fileName: `react_upload_${Date.now()}.${fileExtension}`',
    '          };',
    '        }',
    '      }',
    '    } catch (err) {',
    '      text += `\\\\n[ERROR SISTEMA: Falló al procesar archivo adjunto]`;',
    '    }',
    '  }',
    '  source = \'react_web\';',
    '} else {',
    '  // --- iPhone Shortcut ---',
    '  const body = json.body || json;',
    '  chatId = \'8106031507\';',
    '  text = body.text || json.text || \'\';',
    '  source = \'iphone\';',
    '}',
    '',
    '// Output limpio',
    'const result = { json: { text, chatId, source, fileType, fileExtension } };',
    'if (item.binary) result.binary = item.binary;',
    'return result;',
])

# =============================================
# 2. UPDATE: Edit Fields1 - dynamic extension
# =============================================
ef1 = find_node('Edit Fields1')
ef1['parameters']['assignments']['assignments'][0]['value'] = \
    "=trade_{{ $now.toFormat('yyyyMMdd_HHmmss') }}.{{ $('Normalizar Entrada').first().json.fileExtension || 'bin' }}"

# =============================================
# 3. ADD: If: ¿Es Imagen? node
# =============================================
new_if = {
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
                    "id": "b1c2d3e4-f5a6-7890-bcde-f12345678901",
                    "leftValue": "={{ $('Normalizar Entrada').first().json.fileType }}",
                    "rightValue": "image",
                    "operator": {
                        "type": "string",
                        "operation": "equals",
                        "name": "filter.operator.equals"
                    }
                }
            ],
            "combinator": "and"
        },
        "options": {}
    },
    "id": "c2d3e4f5-a6b7-8901-cdef-234567890abc",
    "name": "If: ¿Es Imagen?",
    "type": "n8n-nodes-base.if",
    "typeVersion": 2.2,
    "position": [-128, -240]
}
nodes.append(new_if)

# =============================================
# 4. MOVE nodes to make room for the new If
# =============================================
find_node('Edit Image')['position'] = [80, -400]
find_node('Escribir en Disco')['position'] = [280, -300]
find_node('Guardar Sesión')['position'] = [480, -300]
find_node('Preparar Input (Con Imagen)')['position'] = [680, -300]

# =============================================
# 5. UPDATE: Preparar Input (Con Imagen)
#    - Generic file tag instead of image-only
# =============================================
prep = find_node('Preparar Input (Con Imagen)')
prep['parameters']['jsCode'] = '\n'.join([
    '// Ruta CON archivo (imagen, audio, PDF, etc.)',
    '// Binary se toma de \'Escribir en Disco\' (Guardar Sesión no preserva binary)',
    'const diskItem = $(\'Escribir en Disco\').first();',
    'const nombreArchivo = $(\'Edit Fields1\').first().json.nombre_archivo_fijo;',
    'const fileUrl = `https://assets.agentame.xyz/uploads/${nombreArchivo}`;',
    'const { text, chatId, source, fileType } = $(\'Normalizar Entrada\').first().json;',
    '',
    '// OUTPUT: \'input\' para LangChain + binary para Gemini',
    'let input = text || \'\';',
    'input += `\\\\n\\\\n[SISTEMA: ARCHIVO_ADJUNTO: ${fileUrl} | tipo: ${fileType}]`;',
    '',
    'const result = { json: { input } };',
    'if (diskItem.binary) result.binary = diskItem.binary;',
    'return result;',
])

# =============================================
# 6. UPDATE: Connections
# =============================================

# Edit Fields1 now goes to "If: ¿Es Imagen?" instead of "Edit Image"
connections['Edit Fields1'] = {
    "main": [[
        {"node": "If: ¿Es Imagen?", "type": "main", "index": 0}
    ]]
}

# New If node: TRUE → Edit Image, FALSE → Escribir en Disco
connections['If: ¿Es Imagen?'] = {
    "main": [
        [{"node": "Edit Image", "type": "main", "index": 0}],
        [{"node": "Escribir en Disco", "type": "main", "index": 0}]
    ]
}

# Edit Image → Escribir en Disco (same as before, just confirming)
connections['Edit Image'] = {
    "main": [[
        {"node": "Escribir en Disco", "type": "main", "index": 0}
    ]]
}

# Rest of the chain stays: Escribir en Disco → Guardar Sesión → Preparar Input → Agente

# =============================================
# WRITE
# =============================================
with open('/home/ubuntu/trading-journal/workflow.json', 'w') as f:
    json.dump(wf, f, indent=4, ensure_ascii=False)

print("✅ workflow.json updated successfully!")
print("Changes:")
print("  - Normalizar Entrada: now detects fileType + fileExtension for all sources")
print("  - Edit Fields1: dynamic file extension")
print("  - New node: 'If: ¿Es Imagen?' (routes images to Edit Image, others skip it)")
print("  - Preparar Input: generic ARCHIVO_ADJUNTO tag instead of IMAGEN_ACTIVA")
print("  - Node positions adjusted for new branching")
