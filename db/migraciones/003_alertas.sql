-- Datos que hacen falta para los avisos por mail

ALTER TABLE perfiles ADD COLUMN IF NOT EXISTS email           TEXT;
ALTER TABLE perfiles ADD COLUMN IF NOT EXISTS recibe_alertas  BOOLEAN NOT NULL DEFAULT FALSE;

-- Evita que el mismo aviso salga todos los días.
-- La "clave" identifica qué se avisó y en qué umbral: por ejemplo
-- "vto:ins_123:30" es "a la inscripción 123 le faltaban 30 días".
CREATE TABLE IF NOT EXISTS alertas_enviadas (
    clave        TEXT PRIMARY KEY,
    tipo         TEXT NOT NULL,
    enviado_en   TIMESTAMPTZ NOT NULL DEFAULT now(),
    destinatarios TEXT
);

CREATE INDEX IF NOT EXISTS idx_alertas_fecha ON alertas_enviadas(enviado_en DESC);
