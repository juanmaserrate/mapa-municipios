// ============================================================
// Avisos automáticos
// ============================================================
// Hasta ahora el aviso de vencimiento era un cartelito de 3 segundos al
// abrir la página: si nadie entraba, nadie se enteraba. Esto sale solo.

const { consultar } = require('../db/pool');
const { enviarMail, comoEstaConfigurado } = require('../lib/mailer');

const DIAS_AVISO = [30, 7, 0];   // cuándo avisar antes del vencimiento

function fechaLegible(d) {
    if (!d) return '';
    const s = d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
    const [a, m, dd] = s.split('-');
    return `${dd}/${m}/${a}`;
}

function plata(n) {
    if (n === null || n === undefined) return '';
    return '$ ' + Number(n).toLocaleString('es-AR', { maximumFractionDigits: 0 });
}

async function destinatarios() {
    const filas = await consultar(
        `SELECT nombre, email FROM perfiles
          WHERE activo AND recibe_alertas AND email IS NOT NULL AND email <> ''`
    );
    return filas.map(f => f.email);
}

// ---------- Qué hay para avisar ----------

async function vencimientos() {
    return consultar(`
        SELECT i.id, i.fecha_vto, i.notas,
               m.nombre AS municipio, s.nombre AS sociedad,
               (i.fecha_vto - CURRENT_DATE) AS dias
          FROM inscripciones i
          JOIN municipios m ON m.id = i.municipio_id
          JOIN sociedades s ON s.id = i.sociedad_id
         WHERE i.fecha_vto IS NOT NULL
           AND i.sin_vto = FALSE
           AND i.estado <> 'no-inscripto'
           AND (i.fecha_vto - CURRENT_DATE) <= 30
         ORDER BY i.fecha_vto
    `);
}

async function aperturasProximas() {
    return consultar(`
        SELECT l.id, l.objeto, l.expediente, l.fecha_apertura, l.monto_ofertado,
               m.nombre AS municipio,
               (l.fecha_apertura - CURRENT_DATE) AS dias
          FROM licitaciones l
          JOIN municipios m ON m.id = l.municipio_id
         WHERE l.fecha_apertura IS NOT NULL
           AND l.estado_proceso IN ('oportunidad','en-preparacion','presentada')
           AND (l.fecha_apertura - CURRENT_DATE) BETWEEN 0 AND 7
         ORDER BY l.fecha_apertura
    `);
}

async function licitacionesTrabadas() {
    return consultar(`
        SELECT l.id, l.objeto, l.expediente, l.fecha_apertura, l.monto_ofertado,
               m.nombre AS municipio,
               (CURRENT_DATE - l.fecha_apertura) AS dias
          FROM licitaciones l
          JOIN municipios m ON m.id = l.municipio_id
         WHERE l.estado_proceso IN ('presentada','en-evaluacion')
           AND l.fecha_apertura IS NOT NULL
           AND (CURRENT_DATE - l.fecha_apertura) > 60
         ORDER BY l.fecha_apertura
    `);
}

// ---------- Anti repetición ----------

async function yaAvisado(clave) {
    const r = await consultar('SELECT 1 FROM alertas_enviadas WHERE clave = $1', [clave]);
    return r.length > 0;
}

async function marcarAvisado(clave, tipo, destinos) {
    await consultar(
        `INSERT INTO alertas_enviadas (clave, tipo, destinatarios) VALUES ($1,$2,$3)
         ON CONFLICT (clave) DO NOTHING`,
        [clave, tipo, (destinos || []).join(', ')]
    );
}

// Umbral del aviso: 30, 7, 0 (el día) o "vencida esta semana"
function umbralDe(dias) {
    if (dias < 0) return 'vencida-sem' + Math.floor(Math.abs(dias) / 7);
    for (const d of DIAS_AVISO) if (dias <= d) return String(d);
    return null;
}

// ---------- El mail ----------

function armarHtml({ vencidas, porVencer, aperturas, trabadas }) {
    const estilo = 'font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px;color:#0f172a;line-height:1.5';
    const seccion = (titulo, color) =>
        `<h3 style="margin:22px 0 8px;font-size:14px;color:${color};border-bottom:1px solid #e2e8f0;padding-bottom:5px">${titulo}</h3>`;
    const item = (txt, sub) =>
        `<div style="padding:7px 0;border-bottom:1px solid #f1f5f9">${txt}${sub ? `<br><span style="color:#64748b;font-size:12.5px">${sub}</span>` : ''}</div>`;

    let html = `<div style="${estilo}">`;
    html += '<p style="margin:0 0 4px">Buen día,</p>';
    html += '<p style="margin:0 0 16px;color:#64748b">Esto es lo que necesita atención hoy en el Mapa Comercial.</p>';

    if (vencidas.length) {
        html += seccion(`⚠ ${vencidas.length} alta${vencidas.length > 1 ? 's' : ''} vencida${vencidas.length > 1 ? 's' : ''}`, '#b91c1c');
        vencidas.forEach(v => {
            html += item(`<strong>${v.municipio}</strong> · ${v.sociedad}`,
                `Venció el ${fechaLegible(v.fecha_vto)} — hace ${Math.abs(v.dias)} días` + (v.notas ? ` · ${v.notas}` : ''));
        });
    }

    if (porVencer.length) {
        html += seccion(`${porVencer.length} alta${porVencer.length > 1 ? 's' : ''} por vencer`, '#c2410c');
        porVencer.forEach(v => {
            html += item(`<strong>${v.municipio}</strong> · ${v.sociedad}`,
                `Vence el ${fechaLegible(v.fecha_vto)} — en ${v.dias} día${v.dias === 1 ? '' : 's'}`);
        });
    }

    if (aperturas.length) {
        html += seccion(`${aperturas.length} licitación${aperturas.length > 1 ? 'es' : ''} que abre${aperturas.length > 1 ? 'n' : ''} esta semana`, '#4338ca');
        aperturas.forEach(a => {
            html += item(`<strong>${a.municipio}</strong> — ${a.objeto}`,
                `Abre el ${fechaLegible(a.fecha_apertura)}` + (a.expediente ? ` · Exp. ${a.expediente}` : '') +
                (a.monto_ofertado ? ` · ofertado ${plata(a.monto_ofertado)}` : ''));
        });
    }

    if (trabadas.length) {
        html += seccion(`${trabadas.length} licitación${trabadas.length > 1 ? 'es' : ''} sin resultado hace más de 60 días`, '#a16207');
        trabadas.forEach(t => {
            html += item(`<strong>${t.municipio}</strong> — ${t.objeto}`,
                `Abrió el ${fechaLegible(t.fecha_apertura)}, hace ${t.dias} días` +
                (t.monto_ofertado ? ` · ofertado ${plata(t.monto_ofertado)}` : ''));
        });
    }

    html += `<p style="margin:24px 0 0"><a href="${process.env.URL_SITIO || 'https://mapa-municipios-production.up.railway.app'}"
             style="background:#6366f1;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">Abrir el Mapa Comercial</a></p>`;
    html += '<p style="margin:18px 0 0;color:#94a3b8;font-size:12px">Este aviso lo manda el Mapa Comercial solo. Si no querés recibirlo, se desmarca desde tu perfil en el sitio.</p>';
    html += '</div>';
    return html;
}

// ---------- El trabajo ----------

async function correrAlertas({ forzar = false } = {}) {
    const via = comoEstaConfigurado();
    if (!via) return { ok: false, motivo: 'El envío de mails no está configurado todavía' };

    const destinos = await destinatarios();
    if (!destinos.length) return { ok: false, motivo: 'Nadie tiene marcado "recibir alertas" con un mail cargado' };

    const [vtos, aperturas, trabadas] = await Promise.all([
        vencimientos(), aperturasProximas(), licitacionesTrabadas()
    ]);

    // Solo lo que no se avisó todavía en este umbral
    const nuevos = { vencidas: [], porVencer: [], aperturas: [], trabadas: [] };
    const claves = [];

    for (const v of vtos) {
        const umbral = umbralDe(Number(v.dias));
        if (umbral === null) continue;
        const clave = `vto:${v.id}:${umbral}`;
        if (!forzar && await yaAvisado(clave)) continue;
        claves.push([clave, 'vencimiento']);
        (Number(v.dias) < 0 ? nuevos.vencidas : nuevos.porVencer).push(v);
    }

    for (const a of aperturas) {
        const clave = `apertura:${a.id}:${a.dias <= 1 ? '1' : '7'}`;
        if (!forzar && await yaAvisado(clave)) continue;
        claves.push([clave, 'apertura']);
        nuevos.aperturas.push(a);
    }

    for (const t of trabadas) {
        // Recordatorio semanal mientras siga trabada
        const semana = Math.floor(Number(t.dias) / 7);
        const clave = `trabada:${t.id}:${semana}`;
        if (!forzar && await yaAvisado(clave)) continue;
        claves.push([clave, 'trabada']);
        nuevos.trabadas.push(t);
    }

    const total = nuevos.vencidas.length + nuevos.porVencer.length + nuevos.aperturas.length + nuevos.trabadas.length;
    if (!total) return { ok: true, enviado: false, motivo: 'No hay nada nuevo para avisar' };

    const partes = [];
    if (nuevos.vencidas.length) partes.push(`${nuevos.vencidas.length} vencida${nuevos.vencidas.length > 1 ? 's' : ''}`);
    if (nuevos.porVencer.length) partes.push(`${nuevos.porVencer.length} por vencer`);
    if (nuevos.aperturas.length) partes.push(`${nuevos.aperturas.length} abre${nuevos.aperturas.length > 1 ? 'n' : ''} esta semana`);
    if (nuevos.trabadas.length) partes.push(`${nuevos.trabadas.length} sin resultado`);

    await enviarMail({
        para: destinos,
        asunto: 'Mapa Comercial · ' + partes.join(' · '),
        html: armarHtml(nuevos)
    });

    for (const [clave, tipo] of claves) await marcarAvisado(clave, tipo, destinos);

    return { ok: true, enviado: true, via, destinatarios: destinos.length, avisos: total, detalle: partes };
}

// ---------- Resumen semanal ----------

async function correrResumenSemanal() {
    const via = comoEstaConfigurado();
    if (!via) return { ok: false, motivo: 'El envío de mails no está configurado todavía' };

    const destinos = await destinatarios();
    if (!destinos.length) return { ok: false, motivo: 'Nadie tiene marcado recibir alertas' };

    const [[altas], [lics], porEstado, [vencen]] = await Promise.all([
        consultar(`SELECT COUNT(*)::int AS n, COUNT(*) FILTER (WHERE estado='inscripto')::int AS inscriptas FROM inscripciones`),
        consultar(`SELECT COUNT(*)::int AS n,
                          COALESCE(SUM(monto_ofertado) FILTER (WHERE estado_proceso IN ('oportunidad','en-preparacion','presentada','en-evaluacion')),0) AS ofertado,
                          COALESCE(SUM(monto_adjudicado) FILTER (WHERE estado_proceso='ganada'),0) AS ganado
                     FROM licitaciones`),
        consultar(`SELECT estado_proceso, COUNT(*)::int AS n FROM licitaciones GROUP BY estado_proceso ORDER BY n DESC`),
        consultar(`SELECT COUNT(*)::int AS n FROM inscripciones
                    WHERE fecha_vto IS NOT NULL AND sin_vto = FALSE
                      AND fecha_vto BETWEEN CURRENT_DATE AND CURRENT_DATE + 30`)
    ]);

    const estilo = 'font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px;color:#0f172a;line-height:1.6';
    let html = `<div style="${estilo}">`;
    html += '<h2 style="margin:0 0 4px;font-size:17px">Resumen de la semana</h2>';
    html += '<p style="margin:0 0 18px;color:#64748b">Mapa Comercial · Real Catorce</p>';
    html += `<p><strong>${altas.inscriptas}</strong> municipios con alta vigente, de ${altas.n} registradas.<br>`;
    html += `<strong>${vencen.n}</strong> altas vencen en los próximos 30 días.</p>`;
    html += `<p style="margin-top:14px"><strong>${plata(lics.ofertado)}</strong> ofertados esperando resultado.<br>`;
    html += `<strong>${plata(lics.ganado)}</strong> adjudicados ganados.</p>`;
    if (porEstado.length) {
        html += '<p style="margin-top:14px;color:#64748b">Licitaciones por estado:<br>';
        html += porEstado.map(e => `${e.estado_proceso}: ${e.n}`).join(' · ');
        html += '</p>';
    }
    html += `<p style="margin:22px 0 0"><a href="${process.env.URL_SITIO || 'https://mapa-municipios-production.up.railway.app'}"
             style="background:#6366f1;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">Ver el detalle</a></p>`;
    html += '</div>';

    await enviarMail({ para: destinos, asunto: 'Mapa Comercial · resumen semanal', html });
    return { ok: true, enviado: true, via, destinatarios: destinos.length };
}

module.exports = { correrAlertas, correrResumenSemanal };
