-- Audioswipe · PostgreSQL (единственная схема для хостинга)
-- psql $DATABASE_URL -f db/schema.sql
--
-- auth_codes — заготовка под 2FA (пока не используется на бэкенде)

CREATE TABLE IF NOT EXISTS users (
  id              BIGSERIAL PRIMARY KEY,
  email           VARCHAR(255) NOT NULL UNIQUE,
  password_hash   VARCHAR(255) NOT NULL,
  role            VARCHAR(16) NOT NULL CHECK (role IN ('listener', 'artist')),
  artist_name     VARCHAR(255),
  main_role       VARCHAR(64),
  daw_software    VARCHAR(128),
  status_tag      VARCHAR(128),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

CREATE TABLE IF NOT EXISTS user_blacklists (
  id                BIGSERIAL PRIMARY KEY,
  user_id           BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  yandex_artist_id  VARCHAR(64) NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, yandex_artist_id)
);

CREATE INDEX IF NOT EXISTS idx_blacklist_user ON user_blacklists (user_id);

CREATE TABLE IF NOT EXISTS auth_codes (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  code        CHAR(6) NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_codes_user ON auth_codes (user_id);
CREATE INDEX IF NOT EXISTS idx_auth_codes_expires ON auth_codes (expires_at);
