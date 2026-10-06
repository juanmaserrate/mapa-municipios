// Aplica los .sql pendientes al arrancar y deja la base lista.
// Es idempotente: correrlo dos veces no rompe nada.
const fs = require('fs');
const path = require('path');
const { consultar, hayBase } = require('./pool');

const DIR = path.join(__dirname, 'migraciones');

async function aplicarMigraciones() {
    if (!hayBase) {
        console.warn('[migrar] Sin DATABASE_URL: la app arranca en modo solo lectura local');
        return false;
    }

    await consultar(`
        CREATE TABLE IF NOT EXISTS migraciones (
            version     TEXT PRIMARY KEY,
            aplicada_en TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    `);

    const aplicadas = (await consultar('SELECT version FROM migraciones')).map(r => r.version);
    const archivos = fs.readdirSync(DIR).filter(f => f.endsWith('.sql')).sort();

    for (const archivo of archivos) {
        if (aplicadas.includes(archivo)) continue;
        const sql = fs.readFileSync(path.join(DIR, archivo), 'utf8');
        console.log('[migrar] aplicando', archivo);
        await consultar(sql);
        await consultar('INSERT INTO migraciones (version) VALUES ($1)', [archivo]);
    }

    await sembrarDatosBase();
    return true;
}

// Municipios y sociedades: lo que tiene que existir si o si para que la app ande.
async function sembrarDatosBase() {
    const municipios = leerMunicipios();
    for (const m of municipios) {
        await consultar(
            `INSERT INTO municipios (id, nombre, sin_geometria) VALUES ($1, $2, $3)
             ON CONFLICT (id) DO UPDATE SET nombre = EXCLUDED.nombre`,
            [m.id, m.nombre, !!m.sinGeometria]
        );
    }

    const sociedades = [
        { id: 'r14', nombre: 'R 14', color: '#6366f1', orden: 1 },
        { id: 'ailiel', nombre: 'AILIEL', color: '#8b5cf6', orden: 2 },
        { id: 'pisabalun', nombre: 'PISABALUN', color: '#ec4899', orden: 3 },
        { id: 'villa-reyes', nombre: 'VILLA DE REYES', color: '#f97316', orden: 4 }
    ];
    for (const s of sociedades) {
        await consultar(
            `INSERT INTO sociedades (id, nombre, color, orden) VALUES ($1, $2, $3, $4)
             ON CONFLICT (id) DO NOTHING`,
            [s.id, s.nombre, s.color, s.orden]
        );
    }

    const perfiles = [
        { id: 'comercial', nombre: 'Área comercial', rol: 'carga' },
        { id: 'juanma', nombre: 'Juanma', rol: 'admin' },
        { id: 'santiago', nombre: 'Santiago', rol: 'lectura' }
    ];
    for (const p of perfiles) {
        await consultar(
            `INSERT INTO perfiles (id, nombre, rol) VALUES ($1, $2, $3)
             ON CONFLICT (id) DO NOTHING`,
            [p.id, p.nombre, p.rol]
        );
    }

    console.log(`[migrar] base lista: ${municipios.length} municipios, ${sociedades.length} sociedades`);
}

// Lee la misma lista que usa el navegador, para que no existan dos verdades
function leerMunicipios() {
    const texto = fs.readFileSync(path.join(__dirname, '..', 'js', 'municipios.js'), 'utf8');
    const bloque = texto.match(/const MUNICIPIOS = \[([\s\S]*?)\n\];/);
    if (!bloque) throw new Error('No se pudo leer js/municipios.js');
    const items = [];
    const re = /\{\s*id:\s*(\d+),\s*nombre:\s*'((?:[^'\\]|\\.)*)'(,\s*sinGeometria:\s*(true|false))?\s*\}/g;
    let m;
    while ((m = re.exec(bloque[1])) !== null) {
        items.push({ id: Number(m[1]), nombre: m[2].replace(/\\'/g, "'"), sinGeometria: m[4] === 'true' });
    }
    return items;
}

module.exports = { aplicarMigraciones, leerMunicipios };
