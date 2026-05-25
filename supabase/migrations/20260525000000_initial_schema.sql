-- Initial schema for Maaperä.fi
-- Run order matters: enum → profiles → buildings → tracked_properties → alerts_sent → reports_generated

-- ─────────────────────────────────────────────────────────────────
-- EXTENSIONS
-- ─────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS postgis;

-- ─────────────────────────────────────────────────────────────────
-- ENUMS
-- ─────────────────────────────────────────────────────────────────
CREATE TYPE user_tier AS ENUM ('public', 'registered', 'pro', 'enterprise');

-- ─────────────────────────────────────────────────────────────────
-- PROFILES
-- Extends auth.users. Created automatically on signup via trigger.
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE profiles (
    id                      UUID        REFERENCES auth.users NOT NULL PRIMARY KEY,
    email                   TEXT,
    company_name            TEXT,
    tier                    user_tier   NOT NULL DEFAULT 'public',
    max_tracked_properties  INT         NOT NULL DEFAULT 0,
    stripe_customer_id      TEXT,
    stripe_subscription_id  TEXT,
    subscription_status     TEXT        NOT NULL DEFAULT 'none',  -- none | trialing | active | past_due | canceled
    subscription_period_end TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Auto-create profile on signup; new signups are 'registered' not 'public'
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, tier, max_tracked_properties)
  VALUES (NEW.id, NEW.email, 'registered', 1)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE handle_new_user();

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users see own profile"
  ON profiles FOR ALL
  USING (auth.uid() = id);

-- ─────────────────────────────────────────────────────────────────
-- BUILDINGS
-- Populated by ETL pipeline; public-read, service_role-write only.
-- No RLS (non-sensitive data). Write access revoked from API roles.
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE buildings (
    building_id      TEXT        PRIMARY KEY,  -- MML rakennus_p ID
    city             TEXT        NOT NULL,
    municipality_code TEXT,                    -- kuntakoodi
    address          TEXT,
    postal_code      TEXT,
    geom             GEOMETRY(Polygon, 3067)  NOT NULL,
    centroid         GEOGRAPHY(Point, 4326)   NOT NULL,
    mean_velocity_mm_y REAL,
    max_velocity_mm_y  REAL,
    velocity_std       REAL,
    point_count        INT,
    risk_class         TEXT,  -- stable | monitor | attention | urgent
    trend_class        TEXT,  -- stable | linear | accelerating | decelerating | seasonal
    last_egms_update   DATE,
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_buildings_geom     ON buildings USING GIST(geom);
CREATE INDEX idx_buildings_centroid ON buildings USING GIST(centroid);
CREATE INDEX idx_buildings_city     ON buildings(city);
CREATE INDEX idx_buildings_risk     ON buildings(risk_class)
  WHERE risk_class IN ('attention', 'urgent');

-- Restrict writes to service_role (ETL pipeline uses service_role key)
REVOKE INSERT, UPDATE, DELETE ON buildings FROM anon;
REVOKE INSERT, UPDATE, DELETE ON buildings FROM authenticated;

-- ─────────────────────────────────────────────────────────────────
-- TRACKED_PROPERTIES
-- User watch-list. Tier limits enforced by application layer.
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE tracked_properties (
    id                   BIGSERIAL    PRIMARY KEY,
    user_id              UUID         REFERENCES auth.users NOT NULL,
    building_id          TEXT         REFERENCES buildings(building_id) NOT NULL,
    nickname             TEXT,
    alert_threshold_mm_y REAL         NOT NULL DEFAULT 5.0,
    alerts_enabled       BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, building_id)
);

ALTER TABLE tracked_properties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own tracked properties"
  ON tracked_properties FOR ALL
  USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────
-- ALERTS_SENT
-- Audit log + email deduplication.
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE alerts_sent (
    id                   BIGSERIAL    PRIMARY KEY,
    tracked_property_id  BIGINT       REFERENCES tracked_properties(id),
    triggered_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    threshold_value      REAL,
    actual_value         REAL,
    email_sent           BOOLEAN      NOT NULL DEFAULT FALSE
);

ALTER TABLE alerts_sent ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users see own alerts"
  ON alerts_sent FOR SELECT
  USING (
    auth.uid() = (
      SELECT user_id FROM tracked_properties WHERE id = tracked_property_id
    )
  );

-- ─────────────────────────────────────────────────────────────────
-- REPORTS_GENERATED
-- Rate-limiting + PDF audit log. Writes via service_role only.
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE reports_generated (
    id           BIGSERIAL    PRIMARY KEY,
    user_id      UUID         REFERENCES auth.users NOT NULL,
    building_id  TEXT         NOT NULL,
    generated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    pdf_url      TEXT
);

ALTER TABLE reports_generated ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users see own reports"
  ON reports_generated FOR SELECT
  USING (auth.uid() = user_id);
