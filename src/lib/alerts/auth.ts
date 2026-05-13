import { timingSafeEqual } from 'crypto';

function safeEqual(a: string, b: string) {
    const aBuf = Buffer.from(a);
    const bBuf = Buffer.from(b);
    if (aBuf.length !== bBuf.length) return false;
    return timingSafeEqual(aBuf, bBuf);
}

export function isInternalAlertsRequest(incomingToken: string | null) {
    const expected = process.env.ALERTS_INTERNAL_TOKEN || '';
    if (!expected || !incomingToken) return false;
    return safeEqual(incomingToken, expected);
}

