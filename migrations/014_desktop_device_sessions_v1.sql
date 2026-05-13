-- Desktop pairing + token session state for Tauri clients.

CREATE TABLE IF NOT EXISTS desktop_device_sessions (
  id BIGSERIAL PRIMARY KEY,
  pairing_id UUID NOT NULL UNIQUE,
  pairing_code VARCHAR(12) NOT NULL UNIQUE,
  poll_token_hash VARCHAR(128),
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  user_id VARCHAR(120),
  user_email VARCHAR(255),
  user_name VARCHAR(120),
  client_name VARCHAR(120),
  client_platform VARCHAR(40),
  access_token_jti VARCHAR(64),
  refresh_token_hash VARCHAR(128),
  refresh_expires_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  exchanged_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT desktop_device_sessions_status_check
    CHECK (
      status IN ('PENDING', 'APPROVED', 'EXCHANGED', 'REVOKED', 'EXPIRED')
    )
);

CREATE INDEX IF NOT EXISTS idx_desktop_device_sessions_status
  ON desktop_device_sessions (status);

CREATE INDEX IF NOT EXISTS idx_desktop_device_sessions_user_id
  ON desktop_device_sessions (user_id);

CREATE INDEX IF NOT EXISTS idx_desktop_device_sessions_expires_at
  ON desktop_device_sessions (expires_at DESC);
