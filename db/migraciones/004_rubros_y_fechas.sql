-- Rubro de la licitación y las dos fechas que faltaban del proceso.
-- El rubro es lo que permite responder "cuánto se licita de cada cosa".

ALTER TABLE licitaciones ADD COLUMN IF NOT EXISTS rubro          TEXT NOT NULL DEFAULT '';
ALTER TABLE licitaciones ADD COLUMN IF NOT EXISTS fecha_pliego   DATE;   -- adquisición del pliego
ALTER TABLE licitaciones ADD COLUMN IF NOT EXISTS fecha_muestras DATE;   -- entrega de muestras

CREATE INDEX IF NOT EXISTS idx_licitaciones_rubro ON licitaciones(rubro) WHERE rubro <> '';
