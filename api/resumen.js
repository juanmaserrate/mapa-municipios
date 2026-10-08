// ============================================================
// Resumen para el tablero
// ============================================================
// Las cuentas se hacen en la base, no en el navegador: así son las
// mismas para todos y no dependen de qué filtros tenga puestos cada uno.
// Abierto a cualquier perfil: el usuario pidió que nadie tenga vistas
// exclusivas.
const express = require('express');
const { consultar } = require('../db/pool');

const router = express.Router();

const VIVOS = `('oportunidad','en-preparacion','presentada','en-evaluacion')`;
const RESUELTOS = `('ganada','perdida','desierta')`;

router.get('/resumen', async (req, res) => {
    try {
        const [
            plata, porSociedad, embudo, exito, tiempos, trabadas,
            cobertura, dormidos, sinAlta, vencenConPlata, competidores,
            porRubro, comprometido, sinResponsable
        ] = await Promise.all([

            // --- Plata global ---
            consultar(`
                SELECT
                    COALESCE(SUM(monto_ofertado)   FILTER (WHERE estado_proceso IN ${VIVOS}), 0)      AS ofertado_vivo,
                    COALESCE(SUM(monto_adjudicado) FILTER (WHERE estado_proceso = 'ganada'), 0)       AS ganado,
                    COALESCE(SUM(monto_ofertado)   FILTER (WHERE estado_proceso = 'perdida'), 0)      AS perdido,
                    COALESCE(SUM(monto_presupuesto) FILTER (WHERE monto_ofertado IS NOT NULL), 0)     AS presupuesto_comparable,
                    COALESCE(SUM(monto_ofertado)   FILTER (WHERE monto_presupuesto IS NOT NULL), 0)   AS ofertado_comparable,
                    COUNT(*)::int AS total
                  FROM licitaciones
            `),

            // --- Por sociedad ---
            consultar(`
                SELECT s.id, s.nombre, s.color,
                       COUNT(DISTINCT l.id) FILTER (WHERE l.estado_proceso IN ${VIVOS})::int   AS vivas,
                       COUNT(DISTINCT l.id) FILTER (WHERE l.estado_proceso = 'ganada')::int    AS ganadas,
                       COUNT(DISTINCT l.id) FILTER (WHERE l.estado_proceso = 'perdida')::int   AS perdidas,
                       COALESCE(SUM(l.monto_ofertado)   FILTER (WHERE l.estado_proceso IN ${VIVOS}), 0) AS ofertado,
                       COALESCE(SUM(l.monto_adjudicado) FILTER (WHERE l.estado_proceso = 'ganada'), 0)  AS ganado
                  FROM sociedades s
                  LEFT JOIN licitacion_sociedades ls ON ls.sociedad_id = s.id
                  LEFT JOIN licitaciones l ON l.id = ls.licitacion_id
                 WHERE s.activa
                 GROUP BY s.id, s.nombre, s.color, s.orden
                 ORDER BY s.orden, s.nombre
            `),

            // --- Embudo ---
            consultar(`
                SELECT estado_proceso, COUNT(*)::int AS n,
                       COALESCE(SUM(COALESCE(monto_adjudicado, monto_ofertado)), 0) AS monto
                  FROM licitaciones GROUP BY estado_proceso
            `),

            // --- Tasa de éxito ---
            consultar(`
                SELECT COUNT(*) FILTER (WHERE estado_proceso = 'ganada')::int AS ganadas,
                       COUNT(*) FILTER (WHERE estado_proceso IN ${RESUELTOS})::int AS resueltas
                  FROM licitaciones
            `),

            // --- Días promedio hasta el resultado ---
            consultar(`
                SELECT ROUND(AVG(fecha_resultado - fecha_apertura))::int AS dias
                  FROM licitaciones
                 WHERE fecha_resultado IS NOT NULL AND fecha_apertura IS NOT NULL
            `),

            // --- Trabadas: presentadas sin resultado hace más de 60 días ---
            consultar(`
                SELECT l.id, l.objeto, l.expediente, l.fecha_apertura, l.monto_ofertado,
                       m.nombre AS municipio, (CURRENT_DATE - l.fecha_apertura) AS dias
                  FROM licitaciones l JOIN municipios m ON m.id = l.municipio_id
                 WHERE l.estado_proceso IN ('presentada','en-evaluacion')
                   AND l.fecha_apertura IS NOT NULL
                   AND (CURRENT_DATE - l.fecha_apertura) > 60
                 ORDER BY l.fecha_apertura LIMIT 50
            `),

            // --- Cobertura: en cuántos municipios está cada sociedad ---
            consultar(`
                SELECT s.id, s.nombre,
                       COUNT(*) FILTER (WHERE i.estado = 'inscripto')::int   AS inscripta,
                       COUNT(*) FILTER (WHERE i.estado = 'por-iniciar')::int AS en_tramite,
                       (SELECT COUNT(*)::int FROM municipios)                AS total_municipios
                  FROM sociedades s
                  LEFT JOIN inscripciones i ON i.sociedad_id = s.id
                 WHERE s.activa
                 GROUP BY s.id, s.nombre, s.orden
                 ORDER BY s.orden, s.nombre
            `),

            // --- Oportunidad dormida: inscriptos sin licitación en 12 meses ---
            consultar(`
                SELECT m.nombre AS municipio, s.nombre AS sociedad
                  FROM inscripciones i
                  JOIN municipios m ON m.id = i.municipio_id
                  JOIN sociedades s ON s.id = i.sociedad_id
                 WHERE i.estado = 'inscripto'
                   AND NOT EXISTS (
                        SELECT 1 FROM licitaciones l
                         WHERE l.municipio_id = i.municipio_id
                           AND COALESCE(l.fecha_apertura, l.creado_en::date) > CURRENT_DATE - 365
                   )
                 ORDER BY m.nombre LIMIT 100
            `),

            // --- Riesgo: licitación cargada pero sin alta vigente ---
            consultar(`
                SELECT DISTINCT m.nombre AS municipio, l.objeto
                  FROM licitaciones l
                  JOIN municipios m ON m.id = l.municipio_id
                 WHERE l.estado_proceso IN ${VIVOS}
                   AND NOT EXISTS (
                        SELECT 1 FROM inscripciones i
                         WHERE i.municipio_id = l.municipio_id AND i.estado = 'inscripto'
                   )
                 ORDER BY m.nombre LIMIT 50
            `),

            // --- Altas por vencer, con la plata que hay detrás ---
            consultar(`
                SELECT COUNT(*)::int AS cantidad,
                       COALESCE(SUM(
                           (SELECT COALESCE(SUM(l.monto_adjudicado), 0)
                              FROM licitaciones l
                             WHERE l.municipio_id = i.municipio_id AND l.estado_proceso = 'ganada')
                       ), 0) AS plata_detras
                  FROM inscripciones i
                 WHERE i.fecha_vto IS NOT NULL AND i.sin_vto = FALSE
                   AND i.fecha_vto BETWEEN CURRENT_DATE AND CURRENT_DATE + 30
            `),

            // --- Quién nos gana ---
            consultar(`
                SELECT c.nombre,
                       COUNT(*)::int AS veces,
                       COUNT(*) FILTER (WHERE c.resultado = 'gano')::int AS gano,
                       ROUND(AVG(c.monto_ofertado))::bigint AS promedio
                  FROM licitacion_competidores c
                 GROUP BY c.nombre
                 ORDER BY gano DESC, veces DESC
                 LIMIT 15
            `),

            // --- Que se licita de cada rubro ---
            consultar(`
                SELECT COALESCE(NULLIF(rubro,''), 'Sin rubro') AS rubro,
                       COUNT(*)::int AS cantidad,
                       COUNT(*) FILTER (WHERE estado_proceso IN ${VIVOS})::int AS vivas,
                       COUNT(*) FILTER (WHERE estado_proceso = 'ganada')::int AS ganadas,
                       COALESCE(SUM(monto_ofertado)   FILTER (WHERE estado_proceso IN ${VIVOS}), 0) AS ofertado,
                       COALESCE(SUM(monto_adjudicado) FILTER (WHERE estado_proceso = 'ganada'), 0)  AS ganado
                  FROM licitaciones
                 GROUP BY 1
                 ORDER BY ofertado DESC, ganado DESC
            `),

            // --- Plata comprometida por mes: adjudicado dividido el plazo ---
            consultar(`
                SELECT COALESCE(ROUND(SUM(monto_adjudicado / NULLIF(plazo_meses, 0))), 0) AS por_mes,
                       COUNT(*) FILTER (WHERE plazo_meses IS NULL OR plazo_meses = 0)::int AS sin_plazo
                  FROM licitaciones
                 WHERE estado_proceso = 'ganada' AND monto_adjudicado IS NOT NULL
            `),

            // --- Oportunidades todavia sin empresa responsable ---
            consultar(`
                SELECT l.id, l.objeto, l.rubro, l.fecha_apertura, l.monto_ofertado,
                       m.nombre AS municipio
                  FROM licitaciones l
                  JOIN municipios m ON m.id = l.municipio_id
                 WHERE l.estado_proceso IN ${VIVOS}
                   AND NOT EXISTS (SELECT 1 FROM licitacion_sociedades ls WHERE ls.licitacion_id = l.id)
                 ORDER BY l.fecha_apertura NULLS LAST
                 LIMIT 50
            `)
        ]);

        const p = plata[0];
        const ex = exito[0];
        const desvio = Number(p.presupuesto_comparable) > 0
            ? ((Number(p.ofertado_comparable) - Number(p.presupuesto_comparable)) / Number(p.presupuesto_comparable)) * 100
            : null;

        res.json({
            plata: {
                ofertadoVivo: Number(p.ofertado_vivo),
                ganado: Number(p.ganado),
                perdido: Number(p.perdido),
                desvioPresupuesto: desvio === null ? null : Number(desvio.toFixed(1)),
                comprometidoPorMes: Math.round(Number(comprometido[0].por_mes)),
                ganadasSinPlazo: comprometido[0].sin_plazo,
                totalLicitaciones: p.total
            },
            porSociedad: porSociedad.map(s => ({
                id: s.id, nombre: s.nombre, color: s.color,
                vivas: s.vivas, ganadas: s.ganadas, perdidas: s.perdidas,
                ofertado: Number(s.ofertado), ganado: Number(s.ganado),
                tasaExito: (s.ganadas + s.perdidas) > 0
                    ? Number(((s.ganadas / (s.ganadas + s.perdidas)) * 100).toFixed(0))
                    : null
            })),
            embudo: embudo.map(e => ({ estado: e.estado_proceso, cantidad: e.n, monto: Number(e.monto) })),
            exito: {
                ganadas: ex.ganadas,
                resueltas: ex.resueltas,
                tasa: ex.resueltas > 0 ? Number(((ex.ganadas / ex.resueltas) * 100).toFixed(0)) : null
            },
            diasHastaResultado: tiempos[0].dias,
            trabadas: trabadas.map(t => ({
                municipio: t.municipio, objeto: t.objeto, expediente: t.expediente,
                dias: Number(t.dias), monto: t.monto_ofertado === null ? null : Number(t.monto_ofertado)
            })),
            cobertura: cobertura.map(c => ({
                nombre: c.nombre, inscripta: c.inscripta, enTramite: c.en_tramite,
                total: c.total_municipios, sin: c.total_municipios - c.inscripta
            })),
            dormidos: dormidos.map(d => ({ municipio: d.municipio, sociedad: d.sociedad })),
            sinAltaVigente: sinAlta.map(s => ({ municipio: s.municipio, objeto: s.objeto })),
            vencenConPlata: {
                cantidad: vencenConPlata[0].cantidad,
                plataDetras: Number(vencenConPlata[0].plata_detras)
            },
            competidores: competidores.map(c => ({
                nombre: c.nombre, veces: c.veces, gano: c.gano,
                promedio: c.promedio === null ? null : Number(c.promedio)
            })),
            porRubro: porRubro.map(r => ({
                rubro: r.rubro, cantidad: r.cantidad, vivas: r.vivas, ganadas: r.ganadas,
                ofertado: Number(r.ofertado), ganado: Number(r.ganado)
            })),
            sinResponsable: sinResponsable.map(x => ({
                municipio: x.municipio, objeto: x.objeto, rubro: x.rubro,
                fechaApertura: x.fecha_apertura ? x.fecha_apertura.toISOString().slice(0, 10) : '',
                monto: x.monto_ofertado === null ? null : Number(x.monto_ofertado)
            }))
        });
    } catch (e) {
        console.error('[api] error armando el resumen:', e.message);
        res.status(500).json({ error: 'No se pudo armar el resumen: ' + e.message });
    }
});

module.exports = router;
