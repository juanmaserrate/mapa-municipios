# Mapa Comercial · Real de Catorce

Herramienta del área comercial para gestionar las licitaciones del grupo en los
municipios de la provincia de Buenos Aires: dónde está dada de alta cada
sociedad, cuándo vence esa alta, qué se licita en cada lugar, cómo salió, y
contra quién se compitió.

**En producción:** https://mapa-municipios-production.up.railway.app

---

## Qué resuelve

Reemplaza una planilla de Excel que vivía en la máquina de cada persona. El
problema no era la planilla: era que el área comercial y administración tenían
dos copias distintas de la verdad, unidas por un archivo que alguien tenía que
acordarse de mandar.

Hoy los datos están en una sola base y todos ven lo mismo al instante.

### Las cinco vistas

| | |
|---|---|
| **Mapa** | Los 136 municipios pintados por estado del alta, o por licitaciones. Marcadores con las oportunidades abiertas. |
| **Tabla** | Todo junto, ordenable y filtrable, con descarga a Excel. |
| **Tablero** | La plata: ofertado, ganado, comprometido por mes, tasa de éxito, huecos de cobertura. |
| **Competencia** | Quiénes se presentan, a qué precio, y cómo nos fue contra cada uno. |
| **Historial** | Quién cargó o cambió qué, y cuándo. |

---

## Cómo está armado

Sin framework ni build. HTML, CSS y JavaScript que el navegador ejecuta tal
como están en el repositorio, más un servidor Express mínimo. Dos dependencias
en total: `express` y `pg`.

Es una decisión deliberada: la herramienta la mantiene alguien que no programa
a diario, y cada capa de herramientas que se suma es una que hay que entender
el día que algo falla.

```
index.html            La página entera: el marcado de las cinco vistas
server.js             Express: sirve el sitio y monta la API

js/
  api.js              Único lugar que habla con el servidor
  app.js              Mapa, filtros, panel, vencimientos, perfiles
  municipios.js       Lista canónica de los 136 municipios (generada)
  licitaciones.js     Licitaciones y competidores
  tabla.js            Vista de tabla + cambio de vista
  tablero.js          Vista de tablero
  competencia.js      Vista de competencia
  historial.js        Vista de historial

api/
  datos.js            Inscripciones, sociedades, perfiles, migración
  licitaciones.js     Licitaciones, sociedades por licitación, competidores
  resumen.js          Las cuentas del tablero, hechas en SQL
  competencia.js      El análisis de competencia, hecho en SQL
  alertas.js          Estado del correo y destinatarios

db/
  pool.js             Conexión a Postgres
  migrar.js           Aplica las migraciones al arrancar
  migraciones/        001 inicial · 002 licitaciones · 003 alertas
                      004 rubros y fechas · 005 competencia

lib/
  mailer.js           Envío por Microsoft 365 (Graph o SMTP)
  versionado.js       Versionado automático de js y css

jobs/
  alertas.js          Arma y manda los avisos
  correr.js           Punto de entrada del trabajo programado

test/pruebas.js       26 pruebas, sin dependencias
css/                  Nueve archivos por área. El orden de carga importa.
data/                 GeoJSON de los partidos de Buenos Aires
```

### Decisiones que conviene conocer antes de tocar nada

**El municipio se identifica por número, nunca por nombre.** Cada polígono del
GeoJSON trae un `properties.id`. Antes se comparaban nombres con `includes()` y
"Pila" matcheaba con "Pilar", "Monte" con "Monte Hermoso": un municipio se
pintaba mostrando los montos de otro. La lista canónica vive en
`js/municipios.js` y el servidor lee ese mismo archivo, para que no existan dos
verdades.

**El orden de los `<link>` de CSS importa.** Los nueve archivos son un solo
archivo partido por área; reordenarlos cambia qué reglas ganan.

**Las listas cerradas son a propósito.** Rubros y estados no se escriben a
mano: si cada uno escribe "SAE", "sae" y "S.A.E.", los totales se parten en
variantes y dejan de servir. Los rubros están duplicados en
`api/licitaciones.js` y `js/licitaciones.js`: al agregar uno, tocar los dos.

**Una licitación puede presentarse con dos sociedades (UTE).** Por eso la
relación vive en la tabla `licitacion_sociedades` y no en una columna. En el
desglose por sociedad, una UTE cuenta el monto entero en cada una, así que el
detalle puede sumar más que el total — hay una nota al pie que lo aclara.

**Los identificadores internos de los estados no cambian aunque cambie el
nombre en pantalla.** `por-iniciar` se muestra como "En proceso" y
`no-inscripto` como "Próximos".

**Nadie ve menos que otro.** Los perfiles identifican quién carga, no
restringen: historial, tablero, competencia y Excel están abiertos a todos.

---

## Correrlo localmente

```bash
npm install
npm start          # http://localhost:3000
npm test           # las 26 pruebas
```

Sin `DATABASE_URL` el sitio arranca igual, en modo de solo lectura sobre la
última copia guardada en el navegador, y lo avisa en pantalla.

## Publicarlo

El proyecto vive en Railway, con dos servicios: el sitio y una base Postgres.
Las migraciones se aplican solas al arrancar y son idempotentes.

Variables que usa:

| Variable | Para qué |
|---|---|
| `DATABASE_URL` | La inyecta Railway al enlazar el Postgres |
| `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_REMITENTE` | Avisos por Microsoft 365 — ver `CONECTAR-MICROSOFT.md` |
| `CLAVE_JOBS` | Protege el disparo manual de los avisos |

## Respaldos

`GET /api/respaldo.json` baja todo: sociedades e inscripciones.
`GET /api/salud` dice si la base responde y cuántos registros hay.

---

## Pendiente

- **El sitio no tiene clave de acceso.** Cualquiera con el link entra, edita y
  ve los montos. Es lo más urgente.
- La versión vieja en GitHub Pages sigue publicada y **no habla con la base**:
  quien entre por ahí carga datos que nadie más ve. Conviene apagarla.
- Falta el polígono de Lezama en el GeoJSON (aparece en listas, no en el mapa).
- Los avisos por mail están programados pero sin credenciales cargadas.

## Cómo se desarrolló

Entre junio y noviembre de 2026, en 38 commits, trabajando con Claude Code: el
área comercial definía qué necesitaba y Claude escribía el código. Los commits
que llevan `Co-Authored-By: Claude` lo dejan asentado.

El historial de git es el registro de ese trabajo: cada commit explica qué
cambió y por qué, no solo qué archivos se tocaron.
