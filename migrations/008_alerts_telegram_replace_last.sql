ALTER TABLE alert_trade_state
  ADD COLUMN IF NOT EXISTS last_telegram_message_id BIGINT;

