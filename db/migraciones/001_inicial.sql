-- ============================================================
-- Esquema inicial del Mapa Comercial
-- ============================================================
-- El municipio se identifica por el id del geojson, nunca por nombre:
-- es lo que arregla el cruce Pila/Pilar y Monte/Monte Hermoso.

CREATE TABLE IF NOT EXISTS municipios (
    id            INTEGER PRIMARY KEY,
    nombre        TEXT NOT NULL,
    sin_geometria BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS sociedades (
    id       TEXT PRIMARY KEY,
    nombre   TEXT NOT NULL,
    color    TEXT NOT NULL DEFAULT '#6366f1',
    orden    INTEGER NOT NULL DEFAULT 0,
    activa   BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Perfiles: identifican quién carga, sin contraseña (decisión del usuario).
CREATE TABLE IF NOT EXISTS perfiles (
    id         TEXT PRIMARY KEY,
    nombre     TEXT NOT NULL,
    rol        TEXT NOT NULL DEFAULT 'carga',   -- carga | lectura | admin
    activo     BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- El alta de una sociedad en un municipio: UNA sola por par, con vencimiento.
CREATE TABLE IF NOT EXISTS inscripciones (
    id              TEXT PRIMARY KEY,
    municipio_id    INTEGER NOT NULL REFERENCES municipios(id),
    sociedad_id     TEXT NOT NULL REFERENCES sociedades(id),
    estado          TEXT NOT NULL DEFAULT 'no-inscripto',
    descripcion     TEXT NOT NULL DEFAULT '',
    notas           TEXT NOT NULL DEFAULT '',
    fecha_alta      DATE,
    fecha_vto       DATE,
    sin_vto         BOOLEAN NOT NULL DEFAULT FALSE,
    monto           NUMERIC(16,2),
    creado_por      TEXT,
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT now(),
    actualizado_por TEXT,
    actualizado_en  TIMESTAMPTZ,
    UNIQUE (municipio_id, sociedad_id)
);

CREATE INDEX IF NOT EXISTS idx_inscripciones_municipio ON inscripciones(municipio_id);
CREATE INDEX IF NOT EXISTS idx_inscripciones_sociedad  ON inscripciones(sociedad_id);
CREATE INDEX IF NOT EXISTS idx_inscripciones_vto       ON inscripciones(fecha_vto)
    WHERE fecha_vto IS NOT NULL AND sin_vto = FALSE;

-- Quién cambió qué y cómo estaba antes. Sirve de historial y de deshacer.
CREATE TABLE IF NOT EXISTS auditoria (
    id            BIGSERIAL PRIMARY KEY,
    fecha         TIMESTAMPTZ NOT NULL DEFAULT now(),
    perfil_id     TEXT,
    perfil_nombre TEXT,
    accion        TEXT NOT NULL,          -- crear | editar | borrar | importar
    entidad       TEXT NOT NULL,          -- inscripcion | sociedad
    entidad_id    TEXT,
    antes         JSONB,
    despues       JSONB
);

CREATE INDEX IF NOT EXISTS idx_auditoria_fecha ON auditoria(fecha DESC);

-- El JSON crudo de cada migración desde un navegador, guardado para siempre.
-- Si algo sale mal en la migración, siempre se puede volver a mirar.
CREATE TABLE IF NOT EXISTS importaciones_crudas (
    id            BIGSERIAL PRIMARY KEY,
    perfil_nombre TEXT,
    origen        TEXT,
    json_crudo    JSONB NOT NULL,
    resultado     JSONB,
    importado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);
