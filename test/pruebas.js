// ============================================================
// Pruebas automáticas
// ============================================================
// No prueban todo: prueban las seis cosas que si se rompen duelen y
// nadie se da cuenta hasta que es tarde.
//
//   npm test
//
// Los archivos del navegador se cargan en una caja aparte con los
// pedazos del navegador que necesitan, así se prueban sin tocarlos.

const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.join(__dirname, '..');

// Carga archivos del navegador en una caja con lo mínimo que necesitan.
// Devuelve una función para leer cualquier cosa declarada adentro: las
// const de un script no aparecen como propiedades del contexto, hay que
// evaluarlas por nombre.
function cargarNavegador(archivos) {
    const caja = {
        console,
        document: {
            getElementById: () => null,
            querySelectorAll: () => [],
            querySelector: () => null,
            addEventListener: () => {},
            createElement: () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} }, addEventListener() {} })
        },
        window: { innerWidth: 1200, addEventListener: () => {} },
        localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
        navigator: {},
        fetch: () => Promise.reject(new Error('sin red en las pruebas')),
        setTimeout, clearTimeout, Date, Math, JSON, Intl
    };
    caja.globalThis = caja;
    caja.addEventListener = () => {};

    const ctx = vm.createContext(caja);
    archivos.forEach(a => {
        vm.runInContext(fs.readFileSync(path.join(RAIZ, a), 'utf8'), ctx, { filename: a });
    });

    // Acceso por nombre a lo que haya quedado declarado
    const leer = (nombre) => vm.runInContext(nombre, ctx);
    return new Proxy({}, {
        get(_, nombre) {
            if (nombre === Symbol.toPrimitive || typeof nombre !== 'string') return undefined;
            try { return leer(nombre); } catch (e) { return undefined; }
        }
    });
}

// ============================================================

describe('Identidad de los municipios', () => {
    const ctx = cargarNavegador(['js/municipios.js']);

    test('están los 136 municipios, incluido Lezama', () => {
        assert.strictEqual(ctx.MUNICIPIOS.length, 136);
        assert.ok(ctx.resolverMunicipio('Lezama'), 'falta Lezama');
    });

    test('ningún municipio resuelve a otro distinto', () => {
        ctx.MUNICIPIOS.forEach(m => {
            assert.strictEqual(ctx.resolverMunicipio(m.nombre).id, m.id,
                `"${m.nombre}" no resuelve a sí mismo`);
        });
    });

    test('Pila y Pilar son municipios distintos', () => {
        const pila = ctx.resolverMunicipio('Pila');
        const pilar = ctx.resolverMunicipio('Pilar');
        assert.ok(pila && pilar);
        assert.notStrictEqual(pila.id, pilar.id);
    });

    test('Monte no se confunde con Monte Hermoso ni General Viamonte', () => {
        const monte = ctx.resolverMunicipio('Monte');
        const hermoso = ctx.resolverMunicipio('Monte Hermoso');
        const viamonte = ctx.resolverMunicipio('General Viamonte');
        assert.ok(monte && hermoso && viamonte);
        assert.notStrictEqual(monte.id, hermoso.id);
        assert.notStrictEqual(monte.id, viamonte.id);
    });

    test('un nombre que no existe no resuelve a nada', () => {
        assert.strictEqual(ctx.resolverMunicipio('Deposito Central'), null);
        assert.strictEqual(ctx.resolverMunicipio('Lomas de Zamora Sur'), null);
        assert.strictEqual(ctx.resolverMunicipio(''), null);
    });

    test('tolera acentos, mayúsculas y espacios de más', () => {
        const base = ctx.resolverMunicipio('Lujan');
        assert.ok(base);
        ['LUJAN', 'luján', '  Lujan  ', 'Luján'].forEach(v => {
            assert.strictEqual(ctx.resolverMunicipio(v).id, base.id, `falló con "${v}"`);
        });
    });

    test('Cañuelas resuelve pese a la eñe', () => {
        assert.ok(ctx.resolverMunicipio('Cañuelas'));
        assert.strictEqual(ctx.resolverMunicipio('canuelas').id, ctx.resolverMunicipio('Cañuelas').id);
    });
});

// ============================================================

describe('Vencimientos', () => {
    const ctx = cargarNavegador(['js/municipios.js', 'js/app.js']);

    const enDias = (n) => {
        const d = new Date();
        d.setDate(d.getDate() + n);
        return d.toISOString().slice(0, 10);
    };

    test('cuenta bien los días que faltan', () => {
        assert.strictEqual(ctx.diasHastaVto({ fechaVto: enDias(10), sinVto: false }), 10);
        assert.strictEqual(ctx.diasHastaVto({ fechaVto: enDias(0), sinVto: false }), 0);
        assert.strictEqual(ctx.diasHastaVto({ fechaVto: enDias(-5), sinVto: false }), -5);
    });

    test('sin fecha o sin vencimiento no cuenta nada', () => {
        assert.strictEqual(ctx.diasHastaVto({ fechaVto: '', sinVto: false }), null);
        assert.strictEqual(ctx.diasHastaVto({ fechaVto: enDias(10), sinVto: true }), null);
    });

    test('clasifica en vencido, crítico, próximo y vigente', () => {
        assert.strictEqual(ctx.nivelVto({ fechaVto: enDias(-1) }), 'vencido');
        assert.strictEqual(ctx.nivelVto({ fechaVto: enDias(0) }), 'critico');
        assert.strictEqual(ctx.nivelVto({ fechaVto: enDias(30) }), 'critico');
        assert.strictEqual(ctx.nivelVto({ fechaVto: enDias(31) }), 'proximo');
        assert.strictEqual(ctx.nivelVto({ fechaVto: enDias(90) }), 'proximo');
        assert.strictEqual(ctx.nivelVto({ fechaVto: enDias(91) }), 'vigente');
    });

    test('el alta más un año cae el mismo día del año siguiente', () => {
        assert.strictEqual(ctx.sumarUnAnio('2026-10-06'), '2027-10-06');
        assert.strictEqual(ctx.sumarUnAnio('2026-01-31'), '2027-01-31');
    });

    test('el 29 de febrero no se pierde ni inventa fechas', () => {
        // 2028 es bisiesto; 2027 no. Sumar un año a un 29/02 tiene que dar
        // una fecha real, no un 29 de febrero inexistente.
        const r = ctx.sumarUnAnio('2028-02-29');
        assert.match(r, /^\d{4}-\d{2}-\d{2}$/);
        assert.ok(!isNaN(new Date(r).getTime()));
    });
});

// ============================================================

describe('Montos y formatos', () => {
    const ctx = cargarNavegador(['js/municipios.js', 'js/app.js']);

    test('lee los montos como los escribe la gente', () => {
        assert.strictEqual(ctx.parseMonto('45.000.000'), 45000000);
        assert.strictEqual(ctx.parseMonto('$ 1.250.500'), 1250500);
        assert.strictEqual(ctx.parseMonto('340000000'), 340000000);
        assert.strictEqual(ctx.parseMonto(''), null);
        assert.strictEqual(ctx.parseMonto('   '), null);
    });

    test('muestra los montos en formato argentino', () => {
        assert.strictEqual(ctx.formatMonto(45000000), '$ 45.000.000');
        assert.strictEqual(ctx.formatMonto(0), '$ 0');
        assert.strictEqual(ctx.formatMonto(null), '');
    });

    test('las fechas se muestran día/mes/año', () => {
        assert.strictEqual(ctx.fechaLegible('2026-10-06'), '06/10/2026');
        assert.strictEqual(ctx.fechaLegible(''), '');
    });

    test('escapa el HTML para que una nota no rompa la página', () => {
        assert.strictEqual(ctx.escapeHtml('<script>x</script>'),
            '&lt;script&gt;x&lt;/script&gt;');
        assert.strictEqual(ctx.escapeHtml('Pliego "A" & anexo'), 'Pliego &quot;A&quot; &amp; anexo');
    });
});

// ============================================================

describe('Versionado de los archivos', () => {
    const { versionarHtml, huella } = require('../lib/versionado');

    test('le pone a cada archivo el número de su contenido', () => {
        const html = '<link href="css/base.css?v=1"><script src="js/app.js"></script>';
        const r = versionarHtml(html);
        assert.match(r, /css\/base\.css\?v=[0-9a-f]{8}/);
        assert.match(r, /js\/app\.js\?v=[0-9a-f]{8}/);
    });

    test('el mismo archivo da siempre el mismo número', () => {
        assert.strictEqual(huella('js/app.js'), huella('js/app.js'));
    });

    test('dos archivos distintos dan números distintos', () => {
        assert.notStrictEqual(huella('js/app.js'), huella('js/api.js'));
    });

    test('todos los archivos que pide index.html existen', () => {
        const fsx = require('fs');
        const pathx = require('path');
        const html = fsx.readFileSync(pathx.join(__dirname, '..', 'index.html'), 'utf8');
        const pedidos = [...html.matchAll(/(?:src|href)="((?:js|css)\/[^"?]+)/g)].map(m => m[1]);
        assert.ok(pedidos.length > 5, 'no se encontraron archivos en index.html');
        pedidos.forEach(a => {
            assert.ok(huella(a), `index.html pide ${a} y ese archivo no existe`);
        });
    });

    test('no se cuelga si falta un archivo', () => {
        const r = versionarHtml('<script src="js/no-existe.js?v=3"></script>');
        assert.ok(r.includes('js/no-existe.js'));
    });
});

// ============================================================

describe('Lista de municipios del servidor', () => {
    const { leerMunicipios } = require('../db/migrar');

    test('el servidor lee la misma lista que el navegador', () => {
        const delServidor = leerMunicipios();
        const ctx = cargarNavegador(['js/municipios.js']);
        assert.strictEqual(delServidor.length, ctx.MUNICIPIOS.length,
            'el servidor y el navegador no ven la misma cantidad de municipios');

        const porId = {};
        delServidor.forEach(m => { porId[m.id] = m.nombre; });
        ctx.MUNICIPIOS.forEach(m => {
            assert.strictEqual(porId[m.id], m.nombre,
                `el municipio ${m.id} se llama distinto en el servidor`);
        });
    });

    test('Lezama viene marcado como sin dibujo', () => {
        const lezama = leerMunicipios().find(m => m.nombre === 'Lezama');
        assert.ok(lezama, 'falta Lezama');
        assert.strictEqual(lezama.sinGeometria, true);
    });
});

// ============================================================

describe('Exportación a Excel', () => {
    // El escapado del CSV, que es lo que rompe cuando una nota trae un
    // punto y coma o una comilla
    const campo = (v) => {
        if (v === null || v === undefined) return '';
        const s = String(v);
        return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };

    test('entrecomilla las notas con punto y coma', () => {
        assert.strictEqual(campo('Llamé a compras; falta el pliego'),
            '"Llamé a compras; falta el pliego"');
    });

    test('duplica las comillas de adentro', () => {
        assert.strictEqual(campo('Dijo "mañana"'), '"Dijo ""mañana"""');
    });

    test('deja en paz lo que no tiene nada raro', () => {
        assert.strictEqual(campo('Quilmes'), 'Quilmes');
        assert.strictEqual(campo(45000000), '45000000');
        assert.strictEqual(campo(null), '');
    });
});
