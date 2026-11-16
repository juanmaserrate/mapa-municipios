// ============================================================
// Competencia
// ============================================================
// Responde lo que hoy está enterrado en actas de apertura en PDF:
// quién se presenta, dónde, a qué precio, y cómo nos fue contra cada uno.
// Abierto a cualquier perfil, como el resto.
const express = require('express');
const { consultar } = require('../db/pool');

const router = express.Router();

// Los nombres vienen escritos a mano en cada acta: se agrupan por el
// nombre en minúscula y sin espacios de más, pero se muestra el original.
const CLAVE = `lower(trim(c.nombre))`;

router.get('/competencia', async (req, res) => {
    try {
        const [porCompetidor, porMunicipio, caraACara, resumen] = await Promise.all([

            // --- Un renglón por competidor ---
            consultar(`
                SELECT ${CLAVE} AS clave,
                       MIN(c.nombre) AS nombre,
                       COUNT(*)::int AS veces,
                       COUNT(*) FILTER (WHERE c.resultado = 'gano')::int AS gano,
                       COUNT(DISTINCT l.municipio_id)::int AS municipios,
                       ROUND(AVG(c.monto_ofertado))::bigint AS promedio,
                       MIN(c.monto_ofertado) AS minimo,
                       MAX(c.monto_ofertado) AS maximo,
                       -- Cuánto más caro o barato oferta respecto de nosotros
                       ROUND(AVG(
                           CASE WHEN l.monto_ofertado > 0 AND c.monto_ofertado IS NOT NULL
                                THEN ((c.monto_ofertado - l.monto_ofertado) / l.monto_ofertado) * 100
                           END
                       )::numeric, 1) AS desvio_vs_nosotros,
                       MAX(COALESCE(l.fecha_apertura, l.creado_en::date)) AS ultima_vez,
                       COALESCE(
                           (SELECT string_agg(DISTINCT m2.nombre, ', ' ORDER BY m2.nombre)
                              FROM licitacion_competidores c2
                              JOIN licitaciones l2 ON l2.id = c2.licitacion_id
                              JOIN municipios m2 ON m2.id = l2.municipio_id
                             WHERE lower(trim(c2.nombre)) = ${CLAVE}),
                           ''
                       ) AS donde
                  FROM licitacion_competidores c
                  JOIN licitaciones l ON l.id = c.licitacion_id
                 GROUP BY ${CLAVE}
                 ORDER BY veces DESC, gano DESC
            `),

            // --- Dónde hay más competencia ---
            consultar(`
                SELECT m.nombre AS municipio,
                       COUNT(DISTINCT l.id)::int AS licitaciones,
                       COUNT(DISTINCT ${CLAVE})::int AS competidores,
                       ROUND(AVG(sub.cuantos), 1) AS promedio_por_licitacion
                  FROM licitaciones l
                  JOIN municipios m ON m.id = l.municipio_id
                  JOIN licitacion_competidores c ON c.licitacion_id = l.id
                  JOIN (SELECT licitacion_id, COUNT(*)::int AS cuantos
                          FROM licitacion_competidores GROUP BY licitacion_id) sub
                       ON sub.licitacion_id = l.id
                 GROUP BY m.nombre
                 ORDER BY competidores DESC, licitaciones DESC
            `),

            // --- Cara a cara: cuando nos cruzamos con cada uno, cómo salió ---
            consultar(`
                SELECT ${CLAVE} AS clave,
                       MIN(c.nombre) AS nombre,
                       COUNT(*) FILTER (WHERE l.estado_proceso = 'ganada')::int  AS ganamos,
                       COUNT(*) FILTER (WHERE l.estado_proceso = 'perdida')::int AS perdimos,
                       COUNT(*) FILTER (WHERE l.estado_proceso IN
                            ('oportunidad','en-preparacion','presentada','en-evaluacion'))::int AS sin_resolver
                  FROM licitacion_competidores c
                  JOIN licitaciones l ON l.id = c.licitacion_id
                 GROUP BY ${CLAVE}
                 HAVING COUNT(*) FILTER (WHERE l.estado_proceso IN ('ganada','perdida')) > 0
                 ORDER BY (COUNT(*) FILTER (WHERE l.estado_proceso = 'perdida')) DESC
            `),

            // --- Números generales ---
            consultar(`
                SELECT COUNT(DISTINCT ${CLAVE})::int AS distintos,
                       COUNT(*)::int AS presentaciones,
                       COUNT(DISTINCT c.licitacion_id)::int AS licitaciones_con_datos,
                       (SELECT COUNT(*)::int FROM licitaciones) AS licitaciones_totales
                  FROM licitacion_competidores c
            `)
        ]);

        const r = resumen[0];
        res.json({
            resumen: {
                distintos: r.distintos,
                presentaciones: r.presentaciones,
                licitacionesConDatos: r.licitaciones_con_datos,
                licitacionesTotales: r.licitaciones_totales
            },
            competidores: porCompetidor.map(c => ({
                nombre: c.nombre,
                veces: c.veces,
                gano: c.gano,
                municipios: c.municipios,
                promedio: c.promedio === null ? null : Number(c.promedio),
                minimo: c.minimo === null ? null : Number(c.minimo),
                maximo: c.maximo === null ? null : Number(c.maximo),
                desvio: c.desvio_vs_nosotros === null ? null : Number(c.desvio_vs_nosotros),
                ultimaVez: c.ultima_vez ? String(c.ultima_vez).slice(0, 10) : '',
                donde: c.donde || ''
            })),
            porMunicipio: porMunicipio.map(m => ({
                municipio: m.municipio,
                licitaciones: m.licitaciones,
                competidores: m.competidores,
                promedioPorLicitacion: m.promedio_por_licitacion === null ? null : Number(m.promedio_por_licitacion)
            })),
            caraACara: caraACara.map(c => ({
                nombre: c.nombre,
                ganamos: c.ganamos,
                perdimos: c.perdimos,
                sinResolver: c.sin_resolver
            }))
        });
    } catch (e) {
        console.error('[api] error armando competencia:', e.message);
        res.status(500).json({ error: 'No se pudo armar la competencia: ' + e.message });
    }
});

module.exports = router;
