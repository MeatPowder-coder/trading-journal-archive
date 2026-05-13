import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { normalizeMediaUrl, toAssetUrl } from "@/lib/media-url";

function asInt(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.trunc(n);
}

function isAllowedImageUrl(url: string): boolean {
  if (!url) return false;
  if (url.startsWith("/uploads/")) return true;
  if (url.startsWith("http://") || url.startsWith("https://")) return true;
  return false;
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthSession();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const tradeId = asInt(body?.tradeId);
    const pendingOrderId = asInt(body?.pendingOrderId);
    const sessionId = typeof body?.sessionId === "string" ? body.sessionId : null;
    const source = typeof body?.source === "string" ? body.source.trim() : "CHAT_IMAGE_CONFIRM";

    const normalized = normalizeMediaUrl(body?.imageUrl);
    if (!normalized || !isAllowedImageUrl(normalized)) {
      return NextResponse.json({ error: "imageUrl inválida. Usa /uploads/... o URL http(s)." }, { status: 400 });
    }

    if (!tradeId && !pendingOrderId) {
      return NextResponse.json({ error: "Debes enviar tradeId o pendingOrderId." }, { status: 400 });
    }
    if (tradeId && pendingOrderId) {
      return NextResponse.json({ error: "No puedes enviar tradeId y pendingOrderId al mismo tiempo." }, { status: 400 });
    }

    if (sessionId) {
      const check = await query(
        `SELECT id, trade_id, pending_limit_order_id
         FROM react_chat_sessions
         WHERE id = $1 AND user_id = $2`,
        [sessionId, auth.userId]
      );
      if ((check.rowCount ?? 0) === 0) {
        return NextResponse.json({ error: "La sesión no existe o no pertenece al usuario." }, { status: 403 });
      }
      const row = check.rows[0];
      if (tradeId && Number(row.trade_id || 0) !== tradeId) {
        return NextResponse.json({ error: "tradeId no coincide con la sesión actual." }, { status: 403 });
      }
      if (pendingOrderId && Number(row.pending_limit_order_id || 0) !== pendingOrderId) {
        return NextResponse.json({ error: "pendingOrderId no coincide con la sesión actual." }, { status: 403 });
      }
    } else {
      const ownership = tradeId
        ? await query(
            `SELECT id FROM react_chat_sessions
             WHERE user_id = $1 AND trade_id = $2
             LIMIT 1`,
            [auth.userId, tradeId]
          )
        : await query(
            `SELECT id FROM react_chat_sessions
             WHERE user_id = $1 AND pending_limit_order_id = $2
             LIMIT 1`,
            [auth.userId, pendingOrderId]
          );

      if ((ownership.rowCount ?? 0) === 0) {
        return NextResponse.json({ error: "No tienes acceso a ese contexto de screenshot." }, { status: 403 });
      }
    }

    const finalUrl = toAssetUrl(normalized);

    if (tradeId) {
      const result = await query(
        `UPDATE trades_activos
         SET screenshot_url = $1
         WHERE id = $2
         RETURNING id, screenshot_url`,
        [finalUrl, tradeId]
      );
      if ((result.rowCount ?? 0) === 0) {
        return NextResponse.json({ error: "Trade no encontrado." }, { status: 404 });
      }

      return NextResponse.json({
        success: true,
        target: "trade",
        id: tradeId,
        screenshotUrl: result.rows[0].screenshot_url,
        source,
      });
    }

    const result = await query(
      `UPDATE pending_limit_orders
       SET screenshot_url = $1,
           updated_at = NOW()
       WHERE id = $2
       RETURNING id, screenshot_url`,
      [finalUrl, pendingOrderId]
    );
    if ((result.rowCount ?? 0) === 0) {
      return NextResponse.json({ error: "Orden LIMIT pendiente no encontrada." }, { status: 404 });
    }

    await query(
      `INSERT INTO pending_limit_order_events (
         pending_order_id, event_type, actor_type, reason, payload_before, payload_after, metadata, created_at
       ) VALUES (
         $1, 'edited', 'user', $2, '{}'::jsonb, $3::jsonb, $4::jsonb, NOW()
       )`,
      [
        pendingOrderId,
        "Screenshot actualizado desde chat",
        JSON.stringify({ screenshot_url: finalUrl }),
        JSON.stringify({ source }),
      ]
    ).catch(() => undefined);

    return NextResponse.json({
      success: true,
      target: "pending_limit_order",
      id: pendingOrderId,
      screenshotUrl: result.rows[0].screenshot_url,
      source,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Error adjuntando screenshot" },
      { status: 500 }
    );
  }
}
