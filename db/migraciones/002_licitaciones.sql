-- ============================================================
-- Licitaciones como registro propio
-- ============================================================
-- Hasta acá había UN monto pegado a la inscripción, que es el lugar
-- equivocado: en un municipio hay muchas licitaciones, se repiten todos
-- los años y cada una tiene su resultado.
--
-- La relación con la sociedad va en tabla aparte (licitacion_sociedades)
-- para que una licitación pueda presentarse con DOS sociedades juntas
-- (UTE) sin tener que rehacer el modelo después.

CREATE TABLE IF NOT EXISTS licitaciones (
    id                 TEXT PRIMARY KEY,
    municipio_id       INTEGER NOT NULL REFERENCES municipios(id),
    expediente         TEXT NOT NULL DEFAULT '',
    objeto             TEXT NOT NULL DEFAULT '',
    tipo               TEXT NOT NULL DEFAULT '',   -- licitación pública, privada, compra directa...
    estado_proceso     TEXT NOT NULL DEFAULT 'oportunidad',
    fecha_publicacion  DATE,
    fecha_apertura     DATE,
    fecha_resultado    DATE,
    monto_presupuesto  NUMERIC(16,2),   -- el presupuesto oficial del pliego
    monto_ofertado     NUMERIC(16,2),   -- lo que ofertamos nosotros
    monto_adjudicado   NUMERIC(16,2),   -- lo que finalmente se adjudicó
    plazo_meses        INTEGER,
    notas              TEXT NOT NULL DEFAULT '',
    origen             TEXT NOT NULL DEFAULT 'manual',
    creado_por         TEXT,
    creado_en          TIMESTAMPTZ NOT NULL DEFAULT now(),
    actualizado_por    TEXT,
    actualizado_en     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_licitaciones_municipio ON licitaciones(municipio_id);
CREATE INDEX IF NOT EXISTS idx_licitaciones_estado    ON licitaciones(estado_proceso);
CREATE INDEX IF NOT EXISTS idx_licitaciones_apertura  ON licitaciones(fecha_apertura);

-- Con qué sociedad (o sociedades, si es UTE) nos presentamos
CREATE TABLE IF NOT EXISTS licitacion_sociedades (
    licitacion_id TEXT NOT NULL REFERENCES licitaciones(id) ON DELETE CASCADE,
    sociedad_id   TEXT NOT NULL REFERENCES sociedades(id),
    PRIMARY KEY (licitacion_id, sociedad_id)
);

-- Quién más se presentó y a qué precio: responde "quién nos gana y por cuánto"
CREATE TABLE IF NOT EXISTS licitacion_competidores (
    id             TEXT PRIMARY KEY,
    licitacion_id  TEXT NOT NULL REFERENCES licitaciones(id) ON DELETE CASCADE,
    nombre         TEXT NOT NULL,
    monto_ofertado NUMERIC(16,2),
    resultado      TEXT NOT NULL DEFAULT 'participo',  -- participo | gano | perdio
    notas          TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_competidores_licitacion ON licitacion_competidores(licitacion_id);

-- ------------------------------------------------------------
-- Los montos que ya estaban cargados en las inscripciones pasan a ser
-- licitaciones marcadas "a-clasificar". No se pierde ni un peso: queda
-- una lista corta y finita para que el área comercial la ordene.
-- ------------------------------------------------------------

INSERT INTO licitaciones (
    id, municipio_id, objeto, estado_proceso, monto_ofertado, notas, origen,
    creado_por, creado_en
)
SELECT
    'lic_mig_' || i.id,
    i.municipio_id,
    'Monto importado del mapa anterior',
    'a-clasificar',
    i.monto,
    'Revisar: no se sabe si este monto era lo ofertado o lo adjudicado, ni a qué licitación correspondía.',
    'migracion',
    i.creado_por,
    COALESCE(i.creado_en, now())
FROM inscripciones i
WHERE i.monto IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM licitaciones l WHERE l.id = 'lic_mig_' || i.id);

INSERT INTO licitacion_sociedades (licitacion_id, sociedad_id)
SELECT 'lic_mig_' || i.id, i.sociedad_id
FROM inscripciones i
WHERE i.monto IS NOT NULL
  AND EXISTS (SELECT 1 FROM licitaciones l WHERE l.id = 'lic_mig_' || i.id)
ON CONFLICT DO NOTHING;
