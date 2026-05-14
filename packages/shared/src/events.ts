import { z } from 'zod';

export const desktopEventTypeSchema = z.enum([
  'snapshot.capture.requested',
  'snapshot.created',
  'sltp.move.recorded',
  'ai.analysis.ready',
  'trade.updated',
  'order.updated',
  'risk.updated',
]);
export type DesktopEventType = z.infer<typeof desktopEventTypeSchema>;

export const desktopEventSchema = z.object({
  type: desktopEventTypeSchema,
  timestamp: z.number().int(),
  tradeId: z.number().int().optional(),
  payload: z.record(z.string(), z.unknown()).default({}),
});
export type DesktopEvent = z.infer<typeof desktopEventSchema>;
