-- Lo que traen las actas de apertura y el modelo todavía no guardaba.
-- Ver el acta de SAE Quilmes: cada oferente lleva su tipo de garantía,
-- el monto, y a qué zonas o renglones se presentó.

ALTER TABLE licitacion_competidores ADD COLUMN IF NOT EXISTS tipo_garantia  TEXT NOT NULL DEFAULT '';
ALTER TABLE licitacion_competidores ADD COLUMN IF NOT EXISTS monto_garantia NUMERIC(16,2);
ALTER TABLE licitacion_competidores ADD COLUMN IF NOT EXISTS zonas          TEXT NOT NULL DEFAULT '';

-- El nombre del competidor es la clave con la que se agrupa todo el
-- análisis: conviene que esté indexado y normalizado al comparar.
CREATE INDEX IF NOT EXISTS idx_competidores_nombre ON licitacion_competidores(lower(trim(nombre)));
