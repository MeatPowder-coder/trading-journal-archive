import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

const VALID_TENDENCIA = ['ALCISTA', 'BAJISTA', 'LATERAL', 'NO_SE'];
const VALID_CONTEXTO = ['TENDENCIA_ALCISTA', 'TENDENCIA_BAJISTA', 'RANGO', 'CONSOLIDACION'];
const VALID_VOLATILIDAD = ['BAJA', 'MEDIA', 'ALTA'];
const VALID_LIQUIDEZ = ['SWEEP_HIGHS', 'SWEEP_LOWS', 'INDUCEMENT', 'NINGUNA'];
const VALID_DELTA = ['POSITIVO', 'NEGATIVO', 'DIVERGENTE', 'NEUTRO'];
const VALID_VOLUMEN = ['MUCHO_VOLUMEN', 'POCO_VOLUMEN', 'NORMAL'];

function toNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
}

function upperOrNull(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim().toUpperCase() : null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const tradeId = toNumber(body?.tradeId);
    if (!Number.isInteger(tradeId) || tradeId <= 0) {
      return NextResponse.json({ error: 'tradeId inválido' }, { status: 400 });
    }

    const setupTag = typeof body?.setupTag === 'string' ? body.setupTag.trim() : null;
    const timeframe = typeof body?.timeframe === 'string' ? body.timeframe.trim() : null;
    const zonaEntrada = typeof body?.zonaEntrada === 'string' ? body.zonaEntrada.trim() : null;
    const entryTesis = typeof body?.entryTesis === 'string' ? body.entryTesis.trim() : null;
    const tendenciaMacro = upperOrNull(body?.tendenciaMacro);
    const contextoMercado = upperOrNull(body?.contextoMercado);
    const volatilidad = upperOrNull(body?.volatilidad);
    const tipoLiquidez = upperOrNull(body?.tipoLiquidez);
    const estadoDelta = upperOrNull(body?.estadoDelta);
    const volumenEstado = upperOrNull(body?.volumenEstado);
    const emocionEntrada = typeof body?.emocionEntrada === 'string' ? body.emocionEntrada.trim() : null;
    const absorcionDetectada = body?.absorcionDetectada === true;

    if (tendenciaMacro && !VALID_TENDENCIA.includes(tendenciaMacro)) {
      return NextResponse.json({ error: 'tendenciaMacro inválido' }, { status: 400 });
    }
    if (contextoMercado && !VALID_CONTEXTO.includes(contextoMercado)) {
      return NextResponse.json({ error: 'contextoMercado inválido' }, { status: 400 });
    }
    if (volatilidad && !VALID_VOLATILIDAD.includes(volatilidad)) {
      return NextResponse.json({ error: 'volatilidad inválida' }, { status: 400 });
    }
    if (tipoLiquidez && !VALID_LIQUIDEZ.includes(tipoLiquidez)) {
      return NextResponse.json({ error: 'tipoLiquidez inválido' }, { status: 400 });
    }
    if (estadoDelta && !VALID_DELTA.includes(estadoDelta)) {
      return NextResponse.json({ error: 'estadoDelta inválido' }, { status: 400 });
    }
    if (volumenEstado && !VALID_VOLUMEN.includes(volumenEstado)) {
      return NextResponse.json({ error: 'volumenEstado inválido' }, { status: 400 });
    }

    await query(
      `UPDATE trades_activos
       SET entry_tesis = COALESCE($2, entry_tesis),
           setup_tag = COALESCE($3, setup_tag),
           timeframe = COALESCE($4, timeframe),
           zona_entrada = COALESCE($5, zona_entrada),
           tendencia_macro = COALESCE($6, tendencia_macro),
           contexto_mercado = COALESCE($7, contexto_mercado),
           volatilidad = COALESCE($8, volatilidad),
           tipo_liquidez = COALESCE($9, tipo_liquidez),
           estado_delta = COALESCE($10, estado_delta),
           volumen_estado = COALESCE($11, volumen_estado),
           emocion_entrada = COALESCE($12, emocion_entrada),
           absorcion_detectada = CASE WHEN $13 = TRUE THEN TRUE ELSE absorcion_detectada END
       WHERE id = $1`,
      [
        tradeId,
        entryTesis,
        setupTag,
        timeframe,
        zonaEntrada,
        tendenciaMacro,
        contextoMercado,
        volatilidad,
        tipoLiquidez,
        estadoDelta,
        volumenEstado,
        emocionEntrada,
        absorcionDetectada,
      ]
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Error guardando contexto post-entry' }, { status: 500 });
  }
}
