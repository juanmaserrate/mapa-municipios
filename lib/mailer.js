// ============================================================
// Envío de mails por Microsoft 365
// ============================================================
// Dos caminos, se usa el que esté configurado:
//
// 1) Microsoft Graph (recomendado). Una aplicación registrada en Azure
//    manda el mail desde un buzón de la empresa. No usa contraseñas de
//    persona, no se rompe cuando alguien cambia la suya, y es lo que
//    Microsoft sostiene a futuro.
//      MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET, MS_REMITENTE
//
// 2) SMTP de Office 365. Más simple de poner en marcha si no hay acceso
//    de administrador en Azure, pero Microsoft lo viene restringiendo.
//      SMTP_USUARIO, SMTP_PASSWORD  (opcional SMTP_HOST, SMTP_PUERTO)

const GRAPH = 'https://graph.microsoft.com/v1.0';
const LOGIN = 'https://login.microsoftonline.com';

function configGraph() {
    const { MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET, MS_REMITENTE } = process.env;
    if (!MS_TENANT_ID || !MS_CLIENT_ID || !MS_CLIENT_SECRET || !MS_REMITENTE) return null;
    return { tenant: MS_TENANT_ID, clientId: MS_CLIENT_ID, secret: MS_CLIENT_SECRET, remitente: MS_REMITENTE };
}

function configSmtp() {
    const { SMTP_USUARIO, SMTP_PASSWORD } = process.env;
    if (!SMTP_USUARIO || !SMTP_PASSWORD) return null;
    return {
        host: process.env.SMTP_HOST || 'smtp.office365.com',
        puerto: Number(process.env.SMTP_PUERTO || 587),
        usuario: SMTP_USUARIO,
        password: SMTP_PASSWORD
    };
}

function comoEstaConfigurado() {
    if (configGraph()) return 'microsoft-graph';
    if (configSmtp()) return 'smtp-office365';
    return null;
}

// ---------- Microsoft Graph ----------

let tokenCache = { valor: null, vence: 0 };

async function tokenDeAplicacion(cfg) {
    if (tokenCache.valor && Date.now() < tokenCache.vence - 60000) return tokenCache.valor;

    const cuerpo = new URLSearchParams({
        client_id: cfg.clientId,
        client_secret: cfg.secret,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials'
    });

    const res = await fetch(`${LOGIN}/${cfg.tenant}/oauth2/v2.0/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: cuerpo
    });

    const datos = await res.json();
    if (!res.ok) {
        throw new Error(`Azure rechazó las credenciales: ${datos.error_description || datos.error || res.status}`);
    }

    tokenCache = { valor: datos.access_token, vence: Date.now() + (datos.expires_in * 1000) };
    return tokenCache.valor;
}

async function enviarPorGraph(cfg, { para, asunto, html }) {
    const token = await tokenDeAplicacion(cfg);

    const res = await fetch(`${GRAPH}/users/${encodeURIComponent(cfg.remitente)}/sendMail`, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            message: {
                subject: asunto,
                body: { contentType: 'HTML', content: html },
                toRecipients: para.map(d => ({ emailAddress: { address: d } }))
            },
            saveToSentItems: true
        })
    });

    if (!res.ok) {
        const texto = await res.text();
        throw new Error(`Graph no pudo enviar (${res.status}): ${texto.slice(0, 300)}`);
    }
    return { via: 'microsoft-graph', destinatarios: para.length };
}

// ---------- SMTP de Office 365 ----------

async function enviarPorSmtp(cfg, { para, asunto, html }) {
    let nodemailer;
    try {
        nodemailer = require('nodemailer');
    } catch (e) {
        throw new Error('Falta instalar nodemailer para usar SMTP (npm install nodemailer)');
    }

    const transporte = nodemailer.createTransport({
        host: cfg.host,
        port: cfg.puerto,
        secure: false,          // Office 365 usa STARTTLS en el 587
        auth: { user: cfg.usuario, pass: cfg.password },
        tls: { ciphers: 'TLSv1.2' }
    });

    await transporte.sendMail({
        from: cfg.usuario,
        to: para.join(', '),
        subject: asunto,
        html
    });

    return { via: 'smtp-office365', destinatarios: para.length };
}

// ---------- Lo que usa el resto de la app ----------

async function enviarMail({ para, asunto, html }) {
    const destinos = (para || []).filter(Boolean);
    if (!destinos.length) throw new Error('No hay a quién mandarle el mail');

    const graph = configGraph();
    if (graph) return enviarPorGraph(graph, { para: destinos, asunto, html });

    const smtp = configSmtp();
    if (smtp) return enviarPorSmtp(smtp, { para: destinos, asunto, html });

    throw new Error('El envío de mails no está configurado todavía');
}

// Comprueba que las credenciales sirvan, sin mandarle nada a nadie
async function probarConexion() {
    const graph = configGraph();
    if (graph) {
        await tokenDeAplicacion(graph);
        return { ok: true, via: 'microsoft-graph', remitente: graph.remitente };
    }
    const smtp = configSmtp();
    if (smtp) {
        return { ok: true, via: 'smtp-office365', remitente: smtp.usuario, nota: 'No se verifica hasta el primer envío' };
    }
    return { ok: false, error: 'Sin configurar' };
}

module.exports = { enviarMail, probarConexion, comoEstaConfigurado };
