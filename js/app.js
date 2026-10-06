// ============================================================
// Mapa Comercial - Real Catorce
// ============================================================

const STORAGE_KEY = 'mapa_comercial_data';
const BACKUP_ULTIMO = 'mapa_comercial_backup_ultimo';   // estado previo al ultimo guardado
const BACKUP_DIA = 'mapa_comercial_backup_dia_';        // + YYYY-MM-DD, primera version de cada dia
const DIAS_BACKUP = 7;
const PREFIJO_ROTO = 'mapa_comercial_roto_';            // copia textual de datos ilegibles

let state = {
    clientes: [],
    inscripciones: [],
    filtros: {
        busqueda: '',
        estados: ['inscripto', 'por-iniciar'],
        clientes: [],
        vto: null
    },
    selectedPartido: null,
    selectedMunicipioId: null,
    municipiosSinResolver: [],
    perfiles: [],
    editingInscripcionId: null,
    archivosTemp: [],
    datosIlegibles: false
};

let map;
let partidosLayer = null;
let partidoDestacado = null;
let timerDestaque = null;

// ============================================================
// INICIALIZACIÓN
// ============================================================

const PERFIL_KEY = 'mapa_comercial_perfil';
let modoServidor = false;

window.addEventListener('DOMContentLoaded', async () => {
    api.perfil = leerPerfilGuardado();

    const datos = await api.leerEstado();
    if (datos) {
        modoServidor = true;
        state.clientes = datos.clientes || [];
        state.inscripciones = (datos.inscripciones || []).map(normalizarInscripcion);
        state.perfiles = datos.perfiles || [];
        state.filtros.clientes = state.clientes.map(c => c.id);
        guardarCacheLocal();
    } else {
        // Sin servidor: se sigue trabajando con lo último que vio este navegador
        cargarDatos();
        if (state.datosIlegibles) {
            mostrarPantallaDatosRotos();
            return;
        }
    }

    aplicarPatchesIniciales();
    inicializarMapa();
    renderClientFilters();
    actualizarContadores();
    bindUI();
    populateClientSelect();
    actualizarMedidorEspacio();
    actualizarAvisoRevisar();
    actualizarBarraConexion();
    avisarVencimientos();

    // En celular el panel arranca cerrado para que se vea el mapa entero
    if (esCelular()) document.querySelector('.app').classList.add('sidebar-collapsed');

    if (modoServidor && !api.perfil) abrirSelectorPerfil();
});

// ============================================================
// SERVIDOR: estado, perfil y caché local
// ============================================================

function leerPerfilGuardado() {
    try {
        const txt = localStorage.getItem(PERFIL_KEY);
        return txt ? JSON.parse(txt) : null;
    } catch (e) {
        return null;
    }
}

function guardarPerfil(perfil) {
    api.perfil = perfil;
    try {
        localStorage.setItem(PERFIL_KEY, JSON.stringify(perfil));
    } catch (e) { /* sin espacio: el perfil se vuelve a pedir la próxima */ }
    actualizarBarraConexion();
}

// Copia local de lo que hay en el servidor. Solo para poder mirar si el
// servidor no responde: nunca es la fuente de verdad en modo servidor.
function guardarCacheLocal() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            clientes: state.clientes,
            inscripciones: state.inscripciones
        }));
    } catch (e) { /* si no entra, no pasa nada: el servidor tiene todo */ }
}

async function recargarDesdeServidor() {
    const datos = await api.leerEstado();
    if (!datos) {
        actualizarBarraConexion();
        return false;
    }
    state.clientes = datos.clientes || [];
    state.inscripciones = (datos.inscripciones || []).map(normalizarInscripcion);
    state.perfiles = datos.perfiles || [];
    state.filtros.clientes = state.filtros.clientes.filter(id => state.clientes.some(c => c.id === id));
    state.clientes.forEach(c => { if (!state.filtros.clientes.includes(c.id)) state.filtros.clientes.push(c.id); });
    invalidarIndice();
    guardarCacheLocal();
    renderClientFilters();
    populateClientSelect();
    refrescarPartidos();
    actualizarContadores();
    actualizarAvisoRevisar();
    actualizarBarraConexion();
    if (state.selectedMunicipioId) renderInscripcionesList();
    return true;
}

function actualizarBarraConexion() {
    const barra = document.getElementById('barraConexion');
    if (!barra) return;

    if (!modoServidor) {
        barra.className = 'barra-conexion sin-servidor';
        barra.innerHTML = `
            <span class="punto"></span>
            <span>Trabajando en este navegador · tus cambios no los ve nadie más</span>
        `;
        barra.style.display = '';
        return;
    }

    if (!api.conectado) {
        barra.className = 'barra-conexion caido';
        barra.innerHTML = `
            <span class="punto"></span>
            <span>Sin conexión con el servidor · estás viendo la última copia, no se puede editar</span>
        `;
        barra.style.display = '';
        return;
    }

    const nombre = api.perfil ? api.perfil.nombre : 'Sin identificar';
    barra.className = 'barra-conexion ok';
    barra.innerHTML = `
        <span class="punto"></span>
        <span>Datos compartidos · sos <strong>${escapeHtml(nombre)}</strong></span>
        <button class="barra-cambiar" id="btnCambiarPerfil">cambiar</button>
    `;
    barra.style.display = '';
    const btn = document.getElementById('btnCambiarPerfil');
    if (btn) btn.addEventListener('click', abrirSelectorPerfil);
}

// Bloquea la edición cuando no se puede escribir en el servidor
function puedeEditar() {
    if (!modoServidor) return true;  // modo navegador: se edita local como siempre
    if (!api.conectado) {
        toast('Sin conexión con el servidor: no se puede guardar ahora', 'error');
        return false;
    }
    if (!api.perfil) {
        abrirSelectorPerfil();
        return false;
    }
    return true;
}

function esCelular() {
    return window.innerWidth <= 768;
}

function cerrarSidebar() {
    document.querySelector('.app').classList.add('sidebar-collapsed');
    setTimeout(() => map.invalidateSize(), 260);
}

function avisarVencimientos() {
    const vencidos = state.inscripciones.filter(i => nivelVto(i) === 'vencido').length;
    const criticos = state.inscripciones.filter(i => nivelVto(i) === 'critico').length;
    if (!vencidos && !criticos) return;
    setTimeout(() => {
        const partes = [];
        if (vencidos) partes.push(`${vencidos} alta${vencidos > 1 ? 's' : ''} vencida${vencidos > 1 ? 's' : ''}`);
        if (criticos) partes.push(`${criticos} vence${criticos > 1 ? 'n' : ''} en menos de 30 días`);
        toast(partes.join(' · '), vencidos ? 'error' : 'warning');
    }, 700);
}

// Patches que se aplican una vez por usuario.
// Por defecto solo AGREGAN inscripciones que no existen (no pisan lo cargado).
// Si el item lleva `actualizar: true`, tambien escribe esos campos sobre la
// inscripcion existente: sirve para completar datos desde aca sin que cada
// persona los tenga que cargar a mano en su navegador.
const PATCHES = [
    {
        id: 'r14-por-iniciar-conurbano-2026-06',
        items: [
            { partido: 'Presidente Peron', clienteId: 'r14', estado: 'por-iniciar' },
            { partido: 'Ezeiza', clienteId: 'r14', estado: 'por-iniciar' },
            { partido: 'Vicente Lopez', clienteId: 'r14', estado: 'por-iniciar' },
            { partido: 'San Miguel', clienteId: 'r14', estado: 'por-iniciar' }
        ]
    },
    {
        id: 'moreno-r14-vto-y-notas-2026-10',
        items: [
            {
                partido: 'Moreno',
                clienteId: 'r14',
                estado: 'inscripto',
                fechaVto: '2026-09-16',
                sinVto: false,
                notas: 'Envié por portal para que actualicen fecha registro- En Proceso desde 18.09.26',
                actualizar: true
            }
        ]
    },
    {
        // Carga del area comercial del 06/10/2026: vencimientos y seguimiento
        id: 'carga-comercial-2026-10-06',
        items: [
            {
                partido: 'San Isidro',
                clienteId: 'r14',
                estado: 'inscripto',
                fechaVto: '2026-10-20',
                sinVto: false,
                notas: 'Sin vencimiento, sólo se consulta si hay algo que mandar',
                actualizar: true
            },
            {
                partido: 'CABA',
                clienteId: 'r14',
                estado: 'inscripto',
                fechaVto: '2026-07-31',
                sinVto: false,
                notas: '21.09.26 iniciada la actualización',
                actualizar: true
            },
            {
                partido: 'Lanus',
                clienteId: 'r14',
                estado: 'inscripto',
                fechaVto: '2026-10-15',
                sinVto: false,
                actualizar: true
            },
            {
                partido: 'Esteban Echeverria',
                clienteId: 'r14',
                estado: 'inscripto',
                fechaVto: '2026-10-30',
                sinVto: false,
                notas: '18.09.26 mandé mail a compras para que nos inviten a cotizar. Sino, ir personalmente (Cristina)',
                actualizar: true
            },
            {
                partido: 'Florencio Varela',
                clienteId: 'r14',
                estado: 'inscripto',
                fechaVto: '2026-10-20',
                sinVto: false,
                actualizar: true
            },
            // Altas nuevas en tramite (no existian en el sistema)
            {
                partido: 'San Fernando',
                clienteId: 'r14',
                estado: 'por-iniciar',
                notas: 'Envié por mail para que nos indiquen procedimiento'
            },
            {
                partido: 'Mercedes',
                clienteId: 'r14',
                estado: 'por-iniciar',
                notas: 'Inicio alta por portal el 25/9/26'
            },
            {
                partido: 'General Rodriguez',
                clienteId: 'r14',
                estado: 'por-iniciar',
                notas: '22.09.26 hablé x tel, mandé mail y a esperar qie nos manden instructivo'
            }
        ]
    }
];

// Campos que un patch puede escribir sobre una inscripcion ya existente
const CAMPOS_PATCHEABLES = ['estado', 'descripcion', 'notas', 'fechaAlta', 'fechaVto', 'sinVto', 'monto'];

function aplicarPatchesIniciales() {
    const aplicados = JSON.parse(localStorage.getItem('mapa_comercial_patches') || '[]');
    let cambios = false;
    PATCHES.forEach(patch => {
        if (aplicados.includes(patch.id)) return;
        patch.items.forEach(item => {
            const muni = resolverMunicipio(item.partido);
            const existe = state.inscripciones.find(i =>
                (muni ? i.municipioId === muni.id : normalizar(i.partido) === normalizar(item.partido)) &&
                i.clienteId === item.clienteId
            );
            if (!existe) {
                state.inscripciones.push(normalizarInscripcion({
                    id: 'ins_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                    municipioId: muni ? muni.id : null,
                    partido: item.partido,
                    clienteId: item.clienteId,
                    estado: item.estado,
                    descripcion: item.descripcion || '',
                    notas: item.notas || '',
                    fechaAlta: item.fechaAlta || '',
                    fechaVto: item.fechaVto || '',
                    sinVto: !!item.sinVto,
                    monto: item.monto !== undefined ? item.monto : null,
                    archivos: [],
                    creado: new Date().toISOString()
                }));
                cambios = true;
            } else if (item.actualizar) {
                CAMPOS_PATCHEABLES.forEach(campo => {
                    if (item[campo] === undefined) return;
                    if (existe[campo] === item[campo]) return;
                    existe[campo] = item[campo];
                    cambios = true;
                });
                if (cambios) existe.actualizado = new Date().toISOString();
            }
        });
        aplicados.push(patch.id);
    });
    try {
        localStorage.setItem('mapa_comercial_patches', JSON.stringify(aplicados));
    } catch (e) {
        console.error('No se pudo guardar la lista de patches aplicados:', e);
    }
    if (cambios) guardarDatos();
}

function cargarDatos() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        try {
            const data = JSON.parse(saved);
            state.clientes = data.clientes || [];
            // Migración: pines (v1) → inscripciones (v2)
            if (data.pines && !data.inscripciones) {
                state.inscripciones = data.pines.map(p => ({
                    id: p.id,
                    partido: p.municipio,
                    clienteId: p.clienteId,
                    estado: p.estado === 'concursando' ? 'por-iniciar' : p.estado,
                    descripcion: p.descripcion || '',
                    notas: p.notas || '',
                    archivos: p.archivos || []
                })).filter(i => !esPartidoExcluido(i.partido));
            } else {
                state.inscripciones = (data.inscripciones || []).map(i => ({
                    ...i,
                    estado: i.estado === 'concursando' ? 'por-iniciar' : i.estado
                }));
            }
            state.inscripciones = state.inscripciones.map(normalizarInscripcion);
            guardarDatos();
        } catch (e) {
            console.error('Error cargando datos:', e);
            // NUNCA sobrescribir: se guarda el texto ilegible aparte y se frena
            // la carga para que el usuario decida. Antes se pisaba con la semilla
            // y el trabajo cargado desaparecia sin aviso.
            guardarCopiaIlegible(saved);
            state.datosIlegibles = true;
            state.filtros.clientes = [];
            return;
        }
    } else {
        cargarDatosIniciales();
    }
    state.filtros.clientes = state.clientes.map(c => c.id);
}

function guardarCopiaIlegible(texto) {
    try {
        localStorage.setItem(PREFIJO_ROTO + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-'), texto);
    } catch (e) {
        console.error('No se pudo guardar la copia de los datos ilegibles:', e);
    }
}

// ============================================================
// RESPALDOS AUTOMATICOS
// Se guardan sin los archivos adjuntos: son lo unico pesado y
// asi el respaldo ocupa unos pocos KB en vez de megas.
// ============================================================

function versionLiviana(texto) {
    const d = JSON.parse(texto);
    return JSON.stringify({
        fecha: new Date().toISOString(),
        clientes: d.clientes || [],
        inscripciones: (d.inscripciones || []).map(i => ({ ...i, archivos: [] }))
    });
}

function guardarRespaldos(textoAnterior) {
    if (!textoAnterior) return;
    let liviano;
    try {
        liviano = versionLiviana(textoAnterior);
    } catch (e) {
        return;
    }
    try {
        localStorage.setItem(BACKUP_ULTIMO, liviano);
        // La primera version de cada dia se conserva: da historia de varios dias
        const claveHoy = BACKUP_DIA + new Date().toISOString().slice(0, 10);
        if (!localStorage.getItem(claveHoy)) {
            localStorage.setItem(claveHoy, liviano);
            limpiarRespaldosViejos();
        }
    } catch (e) {
        // Si no entra el respaldo no se interrumpe el guardado principal
        console.warn('No se pudo guardar el respaldo:', e);
    }
}

function limpiarRespaldosViejos() {
    const limite = new Date();
    limite.setDate(limite.getDate() - DIAS_BACKUP);
    const corte = limite.toISOString().slice(0, 10);
    Object.keys(localStorage)
        .filter(k => k.startsWith(BACKUP_DIA) && k.slice(BACKUP_DIA.length) < corte)
        .forEach(k => localStorage.removeItem(k));
}

function listarRespaldos() {
    const items = [];
    const ultimo = localStorage.getItem(BACKUP_ULTIMO);
    if (ultimo) items.push({ clave: BACKUP_ULTIMO, etiqueta: 'Antes del último cambio', contenido: ultimo });
    Object.keys(localStorage)
        .filter(k => k.startsWith(BACKUP_DIA))
        .sort().reverse()
        .forEach(k => {
            items.push({
                clave: k,
                etiqueta: 'Inicio del ' + fechaLegible(k.slice(BACKUP_DIA.length)),
                contenido: localStorage.getItem(k)
            });
        });
    return items.map(it => {
        try {
            const d = JSON.parse(it.contenido);
            return { ...it, cantidad: (d.inscripciones || []).length };
        } catch (e) {
            return { ...it, cantidad: null };
        }
    }).filter(it => it.cantidad !== null);
}

// Espacio ocupado en el navegador (aproximado: el navegador cuenta 2 bytes por caracter)
function espacioUsado() {
    let caracteres = 0;
    Object.keys(localStorage).forEach(k => {
        caracteres += k.length + (localStorage.getItem(k) || '').length;
    });
    const bytes = caracteres * 2;
    const limite = 5 * 1024 * 1024;
    return { bytes, limite, porcentaje: Math.min(100, Math.round((bytes / limite) * 100)) };
}

function cargarDatosIniciales() {
    state.clientes = [...CLIENTES_INICIALES];
    // normalizarInscripcion resuelve el municipioId: sin eso las inscripciones
    // iniciales quedaban sin municipio y no se pintaban en el mapa
    state.inscripciones = INSCRIPCIONES_INICIALES.map((i, idx) => normalizarInscripcion({
        id: 'ins_' + Date.now() + '_' + idx,
        partido: i.partido,
        clienteId: i.clienteId,
        estado: i.estado,
        descripcion: i.descripcion || '',
        notas: i.notas || '',
        fechaAlta: i.fechaAlta || '',
        fechaVto: i.fechaVto || '',
        sinVto: !!i.sinVto,
        monto: i.monto !== undefined ? i.monto : null,
        archivos: [],
        creado: new Date().toISOString()
    }));
    guardarDatos();
}

// Devuelve true si realmente se guardo. Si no entra, deshace el cambio en
// memoria para que la pantalla no muestre algo que no quedo guardado.
function guardarDatos() {
    if (state.datosIlegibles) return false;
    invalidarIndice();

    const anterior = localStorage.getItem(STORAGE_KEY);
    const payload = JSON.stringify({
        clientes: state.clientes,
        inscripciones: state.inscripciones
    });

    try {
        localStorage.setItem(STORAGE_KEY, payload);
    } catch (e) {
        revertirAlUltimoGuardado(anterior);
        toast('No hay más espacio: el cambio se deshizo. Borrá archivos adjuntos pesados o exportá y limpiá.', 'error');
        actualizarMedidorEspacio();
        return false;
    }

    guardarRespaldos(anterior);
    actualizarMedidorEspacio();
    return true;
}

function revertirAlUltimoGuardado(textoAnterior) {
    if (!textoAnterior) return;
    try {
        const d = JSON.parse(textoAnterior);
        state.clientes = d.clientes || [];
        state.inscripciones = (d.inscripciones || []).map(normalizarInscripcion);
    } catch (e) {
        console.error('No se pudo deshacer el cambio:', e);
    }
}

function esPartidoExcluido(nombre) {
    const n = normalizar(nombre);
    return PARTIDOS_EXCLUIDOS.some(p => n.includes(normalizar(p)));
}

// ============================================================
// VENCIMIENTOS Y MONTOS
// ============================================================

const DIAS_CRITICO = 30;
const DIAS_PROXIMO = 90;

function normalizarInscripcion(i) {
    const base = {
        fechaAlta: '',
        fechaVto: '',
        sinVto: false,
        monto: null,
        ...i,
        archivos: i.archivos || []
    };
    // Identidad real del municipio. Si ya la tiene se respeta; si no, se
    // resuelve por nombre EXACTO. Lo que no resuelve queda en null y aparece
    // en la pantalla de revisión en vez de adivinarse.
    if (base.municipioId === undefined || base.municipioId === null || !MUNICIPIOS_POR_ID[base.municipioId]) {
        const m = resolverMunicipio(base.partido);
        base.municipioId = m ? m.id : null;
    }
    // El nombre pasa a ser solo una etiqueta: el que manda es el id
    if (base.municipioId) base.partido = nombreMunicipio(base.municipioId);
    return base;
}

// Inscripciones cuyo municipio no se pudo identificar: hay que revisarlas a mano
function detectarMunicipiosSinResolver() {
    state.municipiosSinResolver = state.inscripciones.filter(i => !i.municipioId);
}

// ============================================================
// INDICE POR MUNICIPIO
// Antes cada uno de los 135 poligonos recorria TODAS las inscripciones en
// cada refresco (y el refresco se dispara en cada tecla del buscador).
// Ahora se arma un indice una sola vez por refresco.
// ============================================================

let indiceMunicipios = null;

function construirIndice() {
    indiceMunicipios = {};
    state.inscripciones.forEach(i => {
        if (!i.municipioId) return;
        (indiceMunicipios[i.municipioId] = indiceMunicipios[i.municipioId] || []).push(i);
    });
    return indiceMunicipios;
}

function inscripcionesDeMunicipio(municipioId) {
    if (!indiceMunicipios) construirIndice();
    return indiceMunicipios[municipioId] || [];
}

function invalidarIndice() {
    indiceMunicipios = null;
}

// Devuelve dias restantes hasta el vencimiento (negativo = vencido), o null si no aplica
function diasHastaVto(i) {
    if (!i.fechaVto || i.sinVto) return null;
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const [a, m, d] = i.fechaVto.split('-').map(Number);
    if (!a || !m || !d) return null;
    const vto = new Date(a, m - 1, d);
    vto.setHours(0, 0, 0, 0);
    return Math.round((vto - hoy) / 86400000);
}

// 'vencido' | 'critico' | 'proximo' | 'vigente' | null
function nivelVto(i) {
    const dias = diasHastaVto(i);
    if (dias === null) return null;
    if (dias < 0) return 'vencido';
    if (dias <= DIAS_CRITICO) return 'critico';
    if (dias <= DIAS_PROXIMO) return 'proximo';
    return 'vigente';
}

function textoVto(i) {
    const dias = diasHastaVto(i);
    if (dias === null) return i.sinVto ? 'Sin vencimiento' : 'Sin fecha';
    if (dias < 0) return `Vencido hace ${Math.abs(dias)} día${Math.abs(dias) === 1 ? '' : 's'}`;
    if (dias === 0) return 'Vence hoy';
    if (dias === 1) return 'Vence mañana';
    return `Vence en ${dias} días`;
}

function fechaLegible(iso) {
    if (!iso) return '';
    const [a, m, d] = iso.split('-');
    return `${d}/${m}/${a}`;
}

function sumarUnAnio(iso) {
    if (!iso) return '';
    const [a, m, d] = iso.split('-').map(Number);
    const f = new Date(a + 1, m - 1, d);
    return f.toISOString().split('T')[0];
}

function parseMonto(txt) {
    if (txt === null || txt === undefined) return null;
    const limpio = String(txt).replace(/[^0-9,.-]/g, '').replace(/\./g, '').replace(',', '.');
    if (limpio === '') return null;
    const n = parseFloat(limpio);
    return isNaN(n) ? null : n;
}

function formatMonto(n) {
    if (n === null || n === undefined || isNaN(n)) return '';
    return '$ ' + n.toLocaleString('es-AR', { maximumFractionDigits: 0 });
}

// Inscripciones con vencimiento que pasan los filtros de estado/sociedad/busqueda
function inscripcionesConAlerta(nivel) {
    return state.inscripciones.filter(i => {
        if (!state.filtros.clientes.includes(i.clienteId)) return false;
        const n = nivelVto(i);
        if (!n || n === 'vigente') return false;
        if (nivel && nivel !== 'todos' && n !== nivel) return false;
        return true;
    }).sort((a, b) => (diasHastaVto(a) - diasHastaVto(b)));
}

function partidoTieneAlerta(municipioId) {
    let peor = null;
    inscripcionesDeMunicipio(municipioId).forEach(i => {
        if (!inscripcionPasaFiltros(i)) return;
        const nv = nivelVto(i);
        if (nv === 'vencido') peor = 'vencido';
        else if (nv === 'critico' && peor !== 'vencido') peor = 'critico';
        else if (nv === 'proximo' && !peor) peor = 'proximo';
    });
    return peor;
}

// ============================================================
// MAPA
// ============================================================

function inicializarMapa() {
    map = L.map('map', {
        center: [-34.65, -58.55],
        // En celular se arranca un paso mas lejos para ver mas territorio
        zoom: window.innerWidth <= 768 ? 9 : 10,
        zoomControl: true,
        attributionControl: true
    });

    // OpenStreetMap directo: sin API key. Se aclara con filtro CSS (.base-tiles) para
    // que no compita con los colores de los partidos.
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap &copy; mgaitan/departamentos_argentina',
        maxZoom: 19,
        className: 'base-tiles'
    }).addTo(map);

    cargarPartidos();

    map.on('zoomend moveend', actualizarLabelsPartidos);
}

function cargarPartidos() {
    // Archivo de 1,78 MB que no cambia: se versiona y se deja cachear
    fetch('data/partidos-buenos-aires.geojson?v=3')
        .then(r => r.json())
        .then(geojson => {
            partidosLayer = L.geoJSON(geojson, {
                style: (feature) => estiloPartido(feature, false),
                onEachFeature: (feature, layer) => {
                    const nombre = feature.properties.nombre || feature.properties.departamento;
                    layer.bindTooltip(nombre, {
                        permanent: true,
                        direction: 'center',
                        className: 'partido-label',
                        sticky: false,
                        opacity: 1
                    });
                    layer.on('mouseover', () => {
                        layer.setStyle(estiloPartido(feature, true));
                        layer.bringToFront();
                        mostrarLeyendaPartido(feature.properties.id, nombre);
                    });
                    layer.on('mouseout', () => {
                        layer.setStyle(estiloPartido(feature, false));
                        ocultarLeyendaPartido();
                    });
                    layer.on('click', () => {
                        abrirPanelPartido(feature.properties.id);
                        destacarPartido(layer);
                    });
                }
            });
            partidosLayer.addTo(map);
            partidosLayer.bringToBack();
            actualizarLabelsPartidos();
        })
        .catch(err => {
            console.error('Error cargando partidos:', err);
            toast('No se pudo cargar el mapa de partidos', 'error');
        });
}

function inscripcionesDelPartido(municipioId) {
    return inscripcionesDeMunicipio(municipioId).filter(inscripcionPasaFiltros);
}

function inscripcionPasaFiltros(i) {
    if (!state.filtros.estados.includes(i.estado)) return false;
    if (!state.filtros.clientes.includes(i.clienteId)) return false;
    if (state.filtros.vto) {
        const n = nivelVto(i);
        if (state.filtros.vto === 'vencido' && n !== 'vencido') return false;
        if (state.filtros.vto === 'critico' && !(n === 'vencido' || n === 'critico')) return false;
        if (state.filtros.vto === 'proximo' && !(n === 'vencido' || n === 'critico' || n === 'proximo')) return false;
    }
    if (state.filtros.busqueda) {
        const q = state.filtros.busqueda.toLowerCase();
        const cliente = state.clientes.find(c => c.id === i.clienteId);
        const matchPart = i.partido.toLowerCase().includes(q);
        const matchCliente = cliente && cliente.nombre.toLowerCase().includes(q);
        const matchDesc = (i.descripcion || '').toLowerCase().includes(q);
        const matchNotas = (i.notas || '').toLowerCase().includes(q);
        if (!matchPart && !matchCliente && !matchDesc && !matchNotas) return false;
    }
    return true;
}

function estiloPartido(feature, hover) {
    const nombre = feature.properties.nombre || '';
    const municipioId = feature.properties.id;

    // No colorear partidos excluidos (PBAC, BAC, etc.)
    if (esPartidoExcluido(nombre)) {
        return {
            color: '#cbd5e1',
            weight: hover ? 1.5 : 1,
            opacity: 0.6,
            fillColor: '#f1f5f9',
            fillOpacity: 0.3
        };
    }

    const inscripciones = inscripcionesDelPartido(municipioId);
    const estados = inscripciones.map(i => i.estado);

    // Prioridad: inscripto > por-iniciar > no-inscripto > vacío
    let fillColor = '#e2e8f0';
    let fillOpacity = hover ? 0.55 : 0.18;
    if (estados.includes('inscripto')) {
        fillColor = '#10b981';
        fillOpacity = hover ? 0.6 : 0.42;
    } else if (estados.includes('por-iniciar')) {
        fillColor = '#f59e0b';
        fillOpacity = hover ? 0.6 : 0.42;
    } else if (estados.includes('no-inscripto')) {
        fillColor = '#ef4444';
        fillOpacity = hover ? 0.55 : 0.35;
    }

    const alerta = partidoTieneAlerta(municipioId);
    if (alerta) {
        const colorAlerta = alerta === 'vencido' ? '#dc2626' : (alerta === 'critico' ? '#ea580c' : '#ca8a04');
        return {
            color: colorAlerta,
            weight: hover ? 4 : 3,
            opacity: 1,
            dashArray: alerta === 'proximo' ? '5,4' : null,
            fillColor: fillColor,
            fillOpacity: fillOpacity
        };
    }

    return {
        color: hover ? '#1e293b' : '#64748b',
        weight: hover ? 2 : 1,
        opacity: hover ? 1 : 0.55,
        dashArray: null,
        fillColor: fillColor,
        fillOpacity: fillOpacity
    };
}

function refrescarPartidos() {
    if (!partidosLayer) return;
    construirIndice();
    partidosLayer.eachLayer(layer => {
        layer.setStyle(estiloPartido(layer.feature, false));
    });
}

function actualizarLabelsPartidos() {
    if (!partidosLayer) return;
    const zoom = map.getZoom();
    const mapBounds = map.getBounds();

    partidosLayer.eachLayer(layer => {
        const tooltip = layer.getTooltip();
        if (!tooltip) return;
        const el = tooltip.getElement();
        if (!el) return;

        const bounds = layer.getBounds();
        if (!mapBounds.intersects(bounds)) {
            el.style.display = 'none';
            return;
        }

        const nw = map.latLngToContainerPoint(bounds.getNorthWest());
        const se = map.latLngToContainerPoint(bounds.getSouthEast());
        const widthPx = Math.abs(se.x - nw.x);
        const heightPx = Math.abs(se.y - nw.y);

        const nombre = layer.feature.properties.nombre || '';
        const textoAncho = nombre.length * 6.5 + 6;
        const textoAlto = 14;
        const cabe = widthPx > textoAncho && heightPx > textoAlto;
        const zoomOk = zoom >= 8;
        el.style.display = (cabe && zoomOk) ? '' : 'none';
    });
}

// ============================================================
// LEYENDA (TOOLTIP RICO) AL HOVER
// ============================================================

function mostrarLeyendaPartido(municipioId, nombre) {
    if (esPartidoExcluido(nombre)) return;

    const insc = inscripcionesDelPartido(municipioId);
    const el = document.getElementById('leyendaPartido') || crearLeyendaEl();

    let html = `<div class="leyenda-titulo">${escapeHtml(nombre)}</div>`;
    if (insc.length === 0) {
        html += `<div class="leyenda-vacio">Sin sociedades registradas</div>`;
    } else {
        html += '<div class="leyenda-lista">';
        insc.forEach(i => {
            const cliente = state.clientes.find(c => c.id === i.clienteId);
            const nombreCli = cliente ? cliente.nombre : 'Sin sociedad';
            const colorCli = cliente ? cliente.color : '#94a3b8';
            const razon = i.descripcion ? ` · ${escapeHtml(i.descripcion)}` : '';
            const nv = nivelVto(i);
            const chipVto = (nv && nv !== 'vigente')
                ? `<span class="vto-badge ${nv}">${textoVto(i)}</span>`
                : (i.fechaVto && !i.sinVto ? `<span class="vto-badge vigente">Vence ${fechaLegible(i.fechaVto)}</span>` : '');
            const chipMonto = (i.monto !== null && i.monto !== undefined && i.monto !== '')
                ? `<span class="monto-badge">${formatMonto(i.monto)}</span>` : '';
            html += `
                <div class="leyenda-item">
                    <span class="leyenda-color" style="background:${colorCli}"></span>
                    <span class="leyenda-cliente">${escapeHtml(nombreCli)}</span>
                    <span class="status-badge ${i.estado}">${textoEstado(i.estado)}</span>
                    ${chipVto}${chipMonto}
                    ${razon ? `<span class="leyenda-razon">${razon}</span>` : ''}
                </div>
            `;
        });
        html += '</div>';
    }
    html += `<div class="leyenda-hint">Click para ver / editar</div>`;
    el.innerHTML = html;
    el.style.display = 'block';
}

function ocultarLeyendaPartido() {
    const el = document.getElementById('leyendaPartido');
    if (el) el.style.display = 'none';
}

function crearLeyendaEl() {
    const el = document.createElement('div');
    el.id = 'leyendaPartido';
    el.className = 'leyenda-partido';
    document.querySelector('.map-container').appendChild(el);
    // Mover el tooltip con el mouse
    document.getElementById('map').addEventListener('mousemove', (e) => {
        if (el.style.display === 'block') {
            const rect = document.querySelector('.map-container').getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const elW = el.offsetWidth;
            const elH = el.offsetHeight;
            let left = x + 14;
            let top = y + 14;
            if (left + elW > rect.width) left = x - elW - 14;
            if (top + elH > rect.height) top = y - elH - 14;
            el.style.left = left + 'px';
            el.style.top = top + 'px';
        }
    });
    return el;
}

function textoEstado(e) {
    if (e === 'inscripto') return 'Inscripto';
    if (e === 'por-iniciar') return 'Por iniciar';
    if (e === 'no-inscripto') return 'No inscripto';
    return e;
}

// ============================================================
// PANEL PARTIDO (CLICK)
// ============================================================

// Acepta el id del municipio (lo normal) o su nombre (por compatibilidad)
function abrirPanelPartido(municipioONombre) {
    let muni = null;
    if (typeof municipioONombre === 'number') {
        muni = MUNICIPIOS_POR_ID[municipioONombre] || null;
    } else {
        if (esPartidoExcluido(municipioONombre)) {
            toast('Este organismo no se gestiona por partido', 'warning');
            return;
        }
        muni = resolverMunicipio(municipioONombre);
    }
    if (!muni) {
        toast('No se reconoce ese municipio', 'warning');
        return;
    }

    state.selectedMunicipioId = muni.id;
    state.selectedPartido = muni.nombre;
    document.getElementById('detailsTitle').textContent = muni.nombre;
    renderInscripcionesList();
    document.getElementById('detailsPanel').classList.add('open');
}

function cerrarPanel() {
    document.getElementById('detailsPanel').classList.remove('open');
    state.selectedPartido = null;
    state.selectedMunicipioId = null;
    limpiarDestaque();
}

function renderMetaInscripcion(i) {
    const partes = [];
    const nv = nivelVto(i);
    if (i.sinVto) {
        partes.push('<span class="vto-badge sin">Sin vencimiento</span>');
    } else if (i.fechaVto) {
        const clase = (nv && nv !== 'vigente') ? nv : 'vigente';
        partes.push(`<span class="vto-badge ${clase}">${fechaLegible(i.fechaVto)} · ${textoVto(i)}</span>`);
    }
    if (i.fechaAlta) partes.push(`<span class="meta-chip">Alta ${fechaLegible(i.fechaAlta)}</span>`);
    if (i.monto !== null && i.monto !== undefined && i.monto !== '') {
        partes.push(`<span class="monto-badge">${formatMonto(i.monto)}</span>`);
    }
    if (!partes.length) return '';
    return `<div class="inscripcion-meta">${partes.join('')}</div>`;
}

function renderInscripcionesList() {
    const container = document.getElementById('inscripcionesList');
    container.innerHTML = '';
    if (!state.selectedMunicipioId) return;

    const insc = state.inscripciones.filter(i => i.municipioId === state.selectedMunicipioId);
    if (insc.length === 0) {
        container.innerHTML = '<div class="empty-state">Sin sociedades en este partido todavía.</div>';
        return;
    }

    insc.forEach(i => {
        const cliente = state.clientes.find(c => c.id === i.clienteId);
        const nombreCli = cliente ? cliente.nombre : 'Sin sociedad';
        const colorCli = cliente ? cliente.color : '#94a3b8';
        const card = document.createElement('div');
        card.className = 'inscripcion-card';
        card.innerHTML = `
            <div class="inscripcion-header">
                <span class="inscripcion-color" style="background:${colorCli}"></span>
                <span class="inscripcion-cliente">${escapeHtml(nombreCli)}</span>
                <span class="status-badge ${i.estado}">
                    <span class="status-dot"></span>${textoEstado(i.estado)}
                </span>
            </div>
            ${renderMetaInscripcion(i)}
            ${i.descripcion ? `<div class="inscripcion-desc"><strong>Razón:</strong> ${escapeHtml(i.descripcion)}</div>` : ''}
            ${i.notas ? `<div class="inscripcion-notas">${escapeHtml(i.notas)}</div>` : ''}
            ${i.archivos && i.archivos.length ? `<div class="inscripcion-archivos">📎 ${i.archivos.length} archivo${i.archivos.length>1?'s':''}</div>` : ''}
            <div class="inscripcion-actions">
                <button class="btn-secondary" data-action="editar">Editar</button>
            </div>
        `;
        card.querySelector('[data-action="editar"]').addEventListener('click', () => abrirModalInscripcion(i.id));
        container.appendChild(card);
    });
}

// ============================================================
// MODAL INSCRIPCIÓN (NUEVA / EDITAR)
// ============================================================

function abrirModalInscripcion(inscripcionId = null) {
    state.editingInscripcionId = inscripcionId;
    populateClientSelect();
    state.archivosTemp = [];

    if (inscripcionId) {
        const i = state.inscripciones.find(x => x.id === inscripcionId);
        if (!i) return;
        document.getElementById('modalInscripcionTitle').textContent = 'Editar inscripción';
        document.getElementById('fieldCliente').value = i.clienteId;
        document.querySelectorAll('input[name="estado"]').forEach(r => r.checked = r.value === i.estado);
        document.getElementById('fieldDescripcion').value = i.descripcion || '';
        document.getElementById('fieldNotas').value = i.notas || '';
        document.getElementById('fieldFechaAlta').value = i.fechaAlta || '';
        document.getElementById('fieldFechaVto').value = i.fechaVto || '';
        document.getElementById('fieldSinVto').checked = !!i.sinVto;
        document.getElementById('fieldMonto').value = (i.monto !== null && i.monto !== undefined && i.monto !== '') ? Number(i.monto).toLocaleString('es-AR', { maximumFractionDigits: 0 }) : '';
        state.archivosTemp = [...(i.archivos || [])];
        document.getElementById('btnDeleteInscripcion').style.display = '';
    } else {
        document.getElementById('modalInscripcionTitle').textContent = `Nueva inscripción · ${state.selectedPartido}`;
        document.getElementById('fieldCliente').value = '';
        document.querySelectorAll('input[name="estado"]').forEach(r => r.checked = r.value === 'no-inscripto');
        document.getElementById('fieldDescripcion').value = '';
        document.getElementById('fieldNotas').value = '';
        document.getElementById('fieldFechaAlta').value = '';
        document.getElementById('fieldFechaVto').value = '';
        document.getElementById('fieldSinVto').checked = false;
        document.getElementById('fieldMonto').value = '';
        document.getElementById('btnDeleteInscripcion').style.display = 'none';
    }
    actualizarEstadoVtoUI();
    actualizarHintMonto();
    renderArchivos();
    document.getElementById('modalInscripcion').style.display = 'flex';
    document.getElementById('inscripcionForm').scrollTop = 0;
}

function cerrarModalInscripcion() {
    document.getElementById('modalInscripcion').style.display = 'none';
    state.editingInscripcionId = null;
    state.archivosTemp = [];
}

async function guardarInscripcion(e) {
    e.preventDefault();
    if (!puedeEditar()) return;
    const clienteId = document.getElementById('fieldCliente').value;
    const estadoEl = document.querySelector('input[name="estado"]:checked');
    if (!clienteId) { toast('Seleccioná una sociedad', 'error'); return; }
    if (!estadoEl) { toast('Seleccioná un estado', 'error'); return; }
    const descripcion = document.getElementById('fieldDescripcion').value.trim();
    const notas = document.getElementById('fieldNotas').value.trim();
    const sinVto = document.getElementById('fieldSinVto').checked;
    const fechaAlta = document.getElementById('fieldFechaAlta').value;
    const fechaVto = sinVto ? '' : document.getElementById('fieldFechaVto').value;
    const monto = parseMonto(document.getElementById('fieldMonto').value);

    if (modoServidor) {
        const previa = state.editingInscripcionId
            ? state.inscripciones.find(x => x.id === state.editingInscripcionId)
            : null;
        const cuerpo = {
            id: previa ? previa.id : undefined,
            municipioId: previa ? previa.municipioId : state.selectedMunicipioId,
            clienteId,
            estado: estadoEl.value,
            descripcion, notas, fechaAlta, fechaVto, sinVto, monto
        };
        try {
            await api.guardarInscripcion(cuerpo);
        } catch (err) {
            toast('No se pudo guardar: ' + err.message, 'error');
            return;
        }
        await recargarDesdeServidor();
        cerrarModalInscripcion();
        toast('Guardado', 'success');
        return;
    }

    if (state.editingInscripcionId) {
        const i = state.inscripciones.find(x => x.id === state.editingInscripcionId);
        if (i) {
            i.clienteId = clienteId;
            i.estado = estadoEl.value;
            i.descripcion = descripcion;
            i.notas = notas;
            i.fechaAlta = fechaAlta;
            i.fechaVto = fechaVto;
            i.sinVto = sinVto;
            i.monto = monto;
            i.archivos = [...state.archivosTemp];
            i.actualizado = new Date().toISOString();
        }
    } else {
        state.inscripciones.push({
            id: nuevoId('ins'),
            municipioId: state.selectedMunicipioId,
            partido: state.selectedPartido,
            clienteId: clienteId,
            estado: estadoEl.value,
            descripcion: descripcion,
            notas: notas,
            fechaAlta: fechaAlta,
            fechaVto: fechaVto,
            sinVto: sinVto,
            monto: monto,
            archivos: [...state.archivosTemp],
            creado: new Date().toISOString()
        });
    }
    invalidarIndice();
    if (!guardarDatos()) {
        // guardarDatos ya deshizo el cambio y avisó; se refresca para que la
        // pantalla muestre lo que realmente quedó guardado
        refrescarPartidos();
        actualizarContadores();
        renderInscripcionesList();
        return;
    }
    refrescarPartidos();
    actualizarContadores();
    renderClientFilters();
    renderInscripcionesList();
    cerrarModalInscripcion();
    toast('Guardado', 'success');
}

async function eliminarInscripcionActual() {
    if (!state.editingInscripcionId) return;
    if (!puedeEditar()) return;
    if (!confirm('¿Eliminar esta inscripción?')) return;

    if (modoServidor) {
        try {
            await api.borrarInscripcion(state.editingInscripcionId);
        } catch (err) {
            toast('No se pudo eliminar: ' + err.message, 'error');
            return;
        }
        await recargarDesdeServidor();
        cerrarModalInscripcion();
        toast('Inscripción eliminada', 'success');
        return;
    }

    state.inscripciones = state.inscripciones.filter(i => i.id !== state.editingInscripcionId);
    invalidarIndice();
    if (!guardarDatos()) {
        refrescarPartidos();
        actualizarContadores();
        renderInscripcionesList();
        return;
    }
    refrescarPartidos();
    actualizarContadores();
    renderClientFilters();
    renderInscripcionesList();
    cerrarModalInscripcion();
    toast('Inscripción eliminada', 'success');
}

// ============================================================
// SIDEBAR
// ============================================================

function renderClientFilters() {
    const container = document.getElementById('clientFilters');
    container.innerHTML = '';
    state.clientes.forEach(cliente => {
        const count = state.inscripciones.filter(i => i.clienteId === cliente.id).length;
        const checked = state.filtros.clientes.includes(cliente.id);
        const row = document.createElement('label');
        row.className = 'client-filter';
        row.innerHTML = `
            <input type="checkbox" data-client="${cliente.id}" ${checked ? 'checked' : ''}>
            <div class="client-color" style="background:${cliente.color}"></div>
            <span class="client-name">${escapeHtml(cliente.nombre)}</span>
            <span class="client-count">${count}</span>
        `;
        row.querySelector('input').addEventListener('change', (e) => {
            const id = e.target.dataset.client;
            if (e.target.checked) {
                if (!state.filtros.clientes.includes(id)) state.filtros.clientes.push(id);
            } else {
                state.filtros.clientes = state.filtros.clientes.filter(c => c !== id);
            }
            refrescarPartidos();
        });
        container.appendChild(row);
    });
}

function actualizarContadores() {
    const counts = { inscripto: 0, 'por-iniciar': 0, 'no-inscripto': 0 };
    state.inscripciones.forEach(i => { if (counts[i.estado] !== undefined) counts[i.estado]++; });
    document.getElementById('count-inscripto').textContent = counts.inscripto;
    document.getElementById('count-por-iniciar').textContent = counts['por-iniciar'];
    document.getElementById('count-no-inscripto').textContent = counts['no-inscripto'];
    actualizarContadoresVto();
    actualizarMontos();
}

function actualizarContadoresVto() {
    const vto = { vencido: 0, critico: 0, proximo: 0 };
    state.inscripciones.forEach(i => {
        const n = nivelVto(i);
        if (n && vto[n] !== undefined) vto[n]++;
    });
    document.getElementById('count-vto-vencido').textContent = vto.vencido;
    document.getElementById('count-vto-critico').textContent = vto.critico;
    document.getElementById('count-vto-proximo').textContent = vto.proximo;

    document.querySelectorAll('.vto-chip').forEach(chip => {
        const nivel = chip.dataset.vto;
        chip.classList.toggle('active', state.filtros.vto === nivel);
        chip.classList.toggle('vacio', vto[nivel] === 0);
    });
}

function actualizarMontos() {
    let total = 0;
    const porCliente = {};
    state.inscripciones.forEach(i => {
        const m = Number(i.monto);
        if (!i.monto || isNaN(m)) return;
        total += m;
        porCliente[i.clienteId] = (porCliente[i.clienteId] || 0) + m;
    });
    document.getElementById('montoTotal').textContent = formatMonto(total) || '$ 0';

    const detalle = document.getElementById('montoDetalle');
    detalle.innerHTML = '';
    const ids = Object.keys(porCliente).sort((a, b) => porCliente[b] - porCliente[a]);
    if (!ids.length) {
        detalle.innerHTML = '<div class="monto-empty">Sin montos cargados todavía</div>';
        return;
    }
    ids.forEach(id => {
        const c = state.clientes.find(x => x.id === id);
        const row = document.createElement('div');
        row.className = 'monto-row';
        row.innerHTML = `
            <span class="client-color" style="background:${c ? c.color : '#94a3b8'}"></span>
            <span class="monto-cli">${escapeHtml(c ? c.nombre : 'Sin sociedad')}</span>
            <span class="monto-num">${formatMonto(porCliente[id])}</span>
        `;
        detalle.appendChild(row);
    });
}

// ============================================================
// MODAL VENCIMIENTOS
// ============================================================

let vtoTabActiva = 'todos';

function abrirModalVencimientos(tab = 'todos') {
    vtoTabActiva = tab;
    document.querySelectorAll('.vto-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    renderListaVencimientos();
    document.getElementById('modalVencimientos').style.display = 'flex';
}

function cerrarModalVencimientos() {
    document.getElementById('modalVencimientos').style.display = 'none';
}

function renderListaVencimientos() {
    const cont = document.getElementById('vtoList');
    cont.innerHTML = '';
    const items = inscripcionesConAlerta(vtoTabActiva);

    if (!items.length) {
        cont.innerHTML = '<div class="empty-state">Sin vencimientos en esta categoría.</div>';
        return;
    }

    items.forEach(i => {
        const c = state.clientes.find(x => x.id === i.clienteId);
        const nv = nivelVto(i);
        const row = document.createElement('div');
        row.className = `vto-row ${nv}`;
        row.innerHTML = `
            <span class="vto-row-color" style="background:${c ? c.color : '#94a3b8'}"></span>
            <div class="vto-row-main">
                <div class="vto-row-top">
                    <strong>${escapeHtml(i.partido)}</strong>
                    <span class="vto-row-cli">${escapeHtml(c ? c.nombre : 'Sin sociedad')}</span>
                </div>
                <div class="vto-row-sub">
                    <span class="vto-badge ${nv}">${textoVto(i)}</span>
                    <span class="meta-chip">Vence ${fechaLegible(i.fechaVto)}</span>
                    ${i.monto ? `<span class="monto-badge">${formatMonto(i.monto)}</span>` : ''}
                    <span class="status-badge ${i.estado}">${textoEstado(i.estado)}</span>
                </div>
            </div>
            <button class="btn-secondary vto-row-btn">Abrir</button>
        `;
        row.querySelector('.vto-row-btn').addEventListener('click', () => {
            cerrarModalVencimientos();
            if (esCelular()) cerrarSidebar();
            abrirPanelPartido(i.partido);
            centrarEnPartido(i.partido);
        });
        cont.appendChild(row);
    });
}

// ============================================================
// VUELO CINEMATICO Y RESALTADO DE PARTIDO
// ============================================================

// Busca el poligono por id del municipio. Sin includes(): o es ese, o no es.
function buscarLayerPartido(municipioONombre) {
    if (!partidosLayer) return null;
    let id = municipioONombre;
    if (typeof municipioONombre !== 'number') {
        const m = resolverMunicipio(municipioONombre);
        if (!m) return null;
        id = m.id;
    }
    let encontrado = null;
    partidosLayer.eachLayer(layer => {
        if (layer.feature.properties.id === id) encontrado = layer;
    });
    return encontrado;
}

// Vuela hasta el partido con animacion y le resalta los bordes
function volarAPartido(nombre, opts = {}) {
    const layer = buscarLayerPartido(nombre);
    if (!layer) return false;

    const bounds = layer.getBounds();

    // Dejar lugar para el panel: a la derecha en pantalla grande,
    // abajo cuando se abre como hoja en celular.
    // Los margenes se topean a un 40% del mapa: si no, en ventanas angostas
    // el margen se come todo el ancho util y Leaflet no puede acercarse.
    const panel = document.getElementById('detailsPanel');
    const abierto = panel.classList.contains('open');
    const tam = map.getSize();
    const topeX = Math.round(tam.x * 0.4);
    const topeY = Math.round(tam.y * 0.4);

    let padDerecha = 70;
    let padAbajo = 70;
    if (abierto) {
        if (esCelular()) padAbajo = panel.offsetHeight + 40;
        else padDerecha = panel.offsetWidth + 70;
    }

    map.flyToBounds(bounds, {
        maxZoom: opts.maxZoom || 11.5,
        paddingTopLeft: [Math.min(70, topeX), Math.min(70, topeY)],
        paddingBottomRight: [Math.min(padDerecha, topeX), Math.min(padAbajo, topeY)],
        duration: opts.duration || 1.5,
        easeLinearity: 0.22
    });

    // El resaltado arranca cuando termina el vuelo
    map.once('moveend', () => destacarPartido(layer));
    // Respaldo por si el vuelo se interrumpe
    setTimeout(() => { if (partidoDestacado !== layer) destacarPartido(layer); }, ((opts.duration || 1.5) * 1000) + 200);
    return true;
}

function destacarPartido(layer) {
    limpiarDestaque();
    if (!layer) return;
    partidoDestacado = layer;
    layer.bringToFront();

    const el = layer.getElement ? layer.getElement() : layer._path;
    if (el) el.classList.add('partido-destacado');

    if (timerDestaque) clearTimeout(timerDestaque);
    timerDestaque = setTimeout(limpiarDestaque, 6000);
}

function limpiarDestaque() {
    if (timerDestaque) { clearTimeout(timerDestaque); timerDestaque = null; }
    if (!partidoDestacado) return;
    const el = partidoDestacado.getElement ? partidoDestacado.getElement() : partidoDestacado._path;
    if (el) el.classList.remove('partido-destacado');
    partidoDestacado = null;
}

function centrarEnPartido(nombre) {
    volarAPartido(nombre);
}

// ============================================================
// SUGERENCIAS DE BUSQUEDA
// ============================================================

let sugerenciaActiva = -1;

function renderSugerencias(texto) {
    const cont = document.getElementById('searchResults');
    const q = normalizar(texto);
    sugerenciaActiva = -1;

    if (!q || q.length < 2) {
        cont.style.display = 'none';
        cont.innerHTML = '';
        return;
    }

    const matches = MUNICIPIOS
        .filter(m => !esPartidoExcluido(m.nombre) && normalizarNombreMunicipio(m.nombre).includes(q))
        .sort((a, b) => {
            const ia = normalizarNombreMunicipio(a.nombre).indexOf(q);
            const ib = normalizarNombreMunicipio(b.nombre).indexOf(q);
            if (ia !== ib) return ia - ib;
            return a.nombre.length - b.nombre.length;
        })
        .slice(0, 8);

    if (!matches.length) {
        cont.innerHTML = '<div class="search-empty">Ningún municipio con ese nombre</div>';
        cont.style.display = 'block';
        return;
    }

    cont.innerHTML = '';
    matches.forEach((muni, idx) => {
        const nombre = muni.nombre;
        const insc = state.inscripciones.filter(i => i.municipioId === muni.id);
        const item = document.createElement('button');
        item.className = 'search-item';
        item.dataset.idx = idx;
        item.dataset.nombre = nombre;
        item.dataset.id = muni.id;

        const puntos = insc.slice(0, 4).map(i => {
            const c = state.clientes.find(x => x.id === i.clienteId);
            return `<span class="search-dot ${i.estado}" style="background:${c ? c.color : '#94a3b8'}"></span>`;
        }).join('');

        item.innerHTML = `
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>
            </svg>
            <span class="search-nombre">${escapeHtml(nombre)}</span>
            ${muni.sinGeometria ? '<span class="search-sin-mapa">sin dibujo</span>' : ''}
            <span class="search-dots">${puntos}</span>
            <span class="search-count">${insc.length || ''}</span>
        `;
        item.addEventListener('click', () => irAPartido(muni.id));
        cont.appendChild(item);
    });
    cont.style.display = 'block';
}

function irAPartido(municipioONombre) {
    const muni = typeof municipioONombre === 'number'
        ? MUNICIPIOS_POR_ID[municipioONombre]
        : resolverMunicipio(municipioONombre);
    if (!muni) return;

    document.getElementById('searchResults').style.display = 'none';
    document.getElementById('searchInput').value = muni.nombre;
    document.getElementById('btnClearSearch').style.display = '';
    state.filtros.busqueda = '';
    refrescarPartidos();
    if (esCelular()) cerrarSidebar();
    abrirPanelPartido(muni.id);

    if (muni.sinGeometria) {
        toast(`${muni.nombre} todavía no está dibujado en el mapa, pero podés cargarle datos`, 'warning');
        return;
    }
    volarAPartido(muni.id);
}

function limpiarBusqueda() {
    const input = document.getElementById('searchInput');
    input.value = '';
    state.filtros.busqueda = '';
    document.getElementById('searchResults').style.display = 'none';
    document.getElementById('btnClearSearch').style.display = 'none';
    limpiarDestaque();
    refrescarPartidos();
    input.focus();
}

function moverSugerencia(delta) {
    const items = Array.from(document.querySelectorAll('.search-item'));
    if (!items.length) return;
    sugerenciaActiva = (sugerenciaActiva + delta + items.length) % items.length;
    items.forEach((it, i) => it.classList.toggle('activo', i === sugerenciaActiva));
    items[sugerenciaActiva].scrollIntoView({ block: 'nearest' });
}

// ============================================================
// UI DE FECHAS EN EL MODAL DE INSCRIPCION
// ============================================================

function actualizarEstadoVtoUI() {
    const sinVto = document.getElementById('fieldSinVto').checked;
    const campoVto = document.getElementById('fieldFechaVto');
    campoVto.disabled = sinVto;
    if (sinVto) campoVto.value = '';

    const hint = document.getElementById('hintVto');
    if (sinVto) { hint.textContent = ''; hint.className = 'hint'; return; }
    const v = campoVto.value;
    if (!v) { hint.textContent = ''; hint.className = 'hint'; return; }
    const fake = { fechaVto: v, sinVto: false };
    const nv = nivelVto(fake);
    hint.textContent = textoVto(fake);
    hint.className = 'hint ' + (nv === 'vencido' ? 'danger' : (nv === 'critico' ? 'warn' : 'ok'));
}

function actualizarHintMonto() {
    const n = parseMonto(document.getElementById('fieldMonto').value);
    document.getElementById('hintMonto').textContent = n === null ? '' : formatMonto(n);
}

function populateClientSelect() {
    const select = document.getElementById('fieldCliente');
    const currentValue = select.value;
    select.innerHTML = '<option value="">Seleccionar...</option>';
    state.clientes.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.nombre;
        select.appendChild(opt);
    });
    if (currentValue) select.value = currentValue;
}

// ============================================================
// UI BINDINGS
// ============================================================

function bindUI() {
    const inputBusqueda = document.getElementById('searchInput');

    inputBusqueda.addEventListener('input', (e) => {
        const txt = e.target.value;
        state.filtros.busqueda = txt;
        document.getElementById('btnClearSearch').style.display = txt ? '' : 'none';
        renderSugerencias(txt);
        refrescarPartidos();
    });

    inputBusqueda.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); moverSugerencia(1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); moverSugerencia(-1); }
        else if (e.key === 'Enter') {
            e.preventDefault();
            const items = document.querySelectorAll('.search-item');
            if (!items.length) return;
            const elegido = items[sugerenciaActiva >= 0 ? sugerenciaActiva : 0];
            irAPartido(Number(elegido.dataset.id));
        } else if (e.key === 'Escape') {
            document.getElementById('searchResults').style.display = 'none';
        }
    });

    inputBusqueda.addEventListener('focus', () => {
        if (inputBusqueda.value) renderSugerencias(inputBusqueda.value);
    });

    document.getElementById('btnClearSearch').addEventListener('click', limpiarBusqueda);

    // Cerrar sugerencias al clickear afuera
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-wrap')) {
            document.getElementById('searchResults').style.display = 'none';
        }
    });

    document.querySelectorAll('[data-status]').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const status = e.target.dataset.status;
            if (e.target.checked) {
                if (!state.filtros.estados.includes(status)) state.filtros.estados.push(status);
            } else {
                state.filtros.estados = state.filtros.estados.filter(s => s !== status);
            }
            refrescarPartidos();
        });
    });

    document.getElementById('btnCloseDetails').addEventListener('click', cerrarPanel);
    document.getElementById('btnAddInscripcion').addEventListener('click', () => abrirModalInscripcion(null));

    document.getElementById('inscripcionForm').addEventListener('submit', guardarInscripcion);
    document.getElementById('btnDeleteInscripcion').addEventListener('click', eliminarInscripcionActual);
    document.getElementById('btnCloseInscripcionModal').addEventListener('click', cerrarModalInscripcion);
    document.getElementById('btnCancelInscripcion').addEventListener('click', cerrarModalInscripcion);
    document.getElementById('fieldArchivo').addEventListener('change', cargarArchivos);

    document.getElementById('btnAddClient').addEventListener('click', abrirModalCliente);
    document.getElementById('btnCloseClientModal').addEventListener('click', cerrarModalCliente);
    document.getElementById('btnCancelClient').addEventListener('click', cerrarModalCliente);
    document.getElementById('clientForm').addEventListener('submit', crearCliente);

    document.getElementById('btnCollapseSidebar').addEventListener('click', () => {
        document.querySelector('.app').classList.add('sidebar-collapsed');
        setTimeout(() => map.invalidateSize(), 260);
    });
    document.getElementById('btnOpenSidebar').addEventListener('click', () => {
        document.querySelector('.app').classList.remove('sidebar-collapsed');
        setTimeout(() => map.invalidateSize(), 260);
    });
    document.getElementById('sidebarOverlay').addEventListener('click', cerrarSidebar);

    // Vencimientos
    document.getElementById('btnVerVencimientos').addEventListener('click', () => abrirModalVencimientos('todos'));
    document.getElementById('btnCloseVtoModal').addEventListener('click', cerrarModalVencimientos);
    document.getElementById('modalVencimientos').addEventListener('click', (e) => {
        if (e.target.id === 'modalVencimientos') cerrarModalVencimientos();
    });
    document.querySelectorAll('.vto-tab').forEach(t => {
        t.addEventListener('click', () => abrirModalVencimientos(t.dataset.tab));
    });
    document.querySelectorAll('.vto-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const nivel = chip.dataset.vto;
            state.filtros.vto = (state.filtros.vto === nivel) ? null : nivel;
            actualizarContadoresVto();
            refrescarPartidos();
        });
    });

    // Fechas y montos en el modal de inscripcion
    document.getElementById('fieldFechaAlta').addEventListener('change', (e) => {
        const vtoEl = document.getElementById('fieldFechaVto');
        if (e.target.value && !vtoEl.value && !document.getElementById('fieldSinVto').checked) {
            vtoEl.value = sumarUnAnio(e.target.value);
        }
        actualizarEstadoVtoUI();
    });
    document.getElementById('fieldFechaVto').addEventListener('change', actualizarEstadoVtoUI);
    document.getElementById('fieldSinVto').addEventListener('change', actualizarEstadoVtoUI);
    document.getElementById('fieldMonto').addEventListener('input', actualizarHintMonto);

    // Destrabar modales: Escape y click sobre el fondo oscuro
    document.getElementById('modalInscripcion').addEventListener('click', (e) => {
        if (e.target.id === 'modalInscripcion') cerrarModalInscripcion();
    });
    document.getElementById('modalClient').addEventListener('click', (e) => {
        if (e.target.id === 'modalClient') cerrarModalCliente();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (document.getElementById('modalInscripcion').style.display === 'flex') cerrarModalInscripcion();
        else if (document.getElementById('modalClient').style.display === 'flex') cerrarModalCliente();
        else if (document.getElementById('modalVencimientos').style.display === 'flex') cerrarModalVencimientos();
    });

    document.getElementById('btnClosePerfil').addEventListener('click', cerrarSelectorPerfil);
    document.getElementById('btnCrearPerfil').addEventListener('click', crearPerfilNuevo);
    document.getElementById('perfilNuevoNombre').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); crearPerfilNuevo(); }
    });

    document.getElementById('btnMigrar').addEventListener('click', abrirModalMigrar);
    document.getElementById('btnCloseMigrar').addEventListener('click', cerrarModalMigrar);
    document.getElementById('btnSimularMigracion').addEventListener('click', simularMigracion);
    document.getElementById('modalMigrar').addEventListener('click', (e) => {
        if (e.target.id === 'modalMigrar') cerrarModalMigrar();
    });

    // El botón de migrar solo tiene sentido si hay servidor y datos locales
    if (modoServidor) {
        const locales = datosDeEsteNavegador();
        if (locales && locales.inscripciones.length) {
            document.getElementById('btnMigrar').style.display = '';
        }
    }

    document.getElementById('btnRevisarMunicipios').addEventListener('click', abrirModalRevisar);
    document.getElementById('btnCloseRevisar').addEventListener('click', cerrarModalRevisar);
    document.getElementById('modalRevisar').addEventListener('click', (e) => {
        if (e.target.id === 'modalRevisar') cerrarModalRevisar();
    });

    document.getElementById('btnRestaurar').addEventListener('click', abrirModalRestaurar);
    document.getElementById('btnCloseRestaurar').addEventListener('click', cerrarModalRestaurar);
    document.getElementById('modalRestaurar').addEventListener('click', (e) => {
        if (e.target.id === 'modalRestaurar') cerrarModalRestaurar();
    });

    document.getElementById('btnExport').addEventListener('click', exportarDatos);
    document.getElementById('btnImport').addEventListener('click', () => document.getElementById('importFile').click());
    document.getElementById('importFile').addEventListener('change', importarDatos);
}

// ============================================================
// ARCHIVOS
// ============================================================

const MAX_ARCHIVO = 1024 * 1024; // 1 MB: al guardarse como texto ocupa ~2.7x

function cargarArchivos(e) {
    const files = Array.from(e.target.files);
    files.forEach(file => {
        // Limite real: un archivo de 2MB ocupa mas que todo el espacio disponible
        if (file.size > MAX_ARCHIVO) {
            toast(`"${file.name}" pesa ${formatBytes(file.size)} y el máximo es 1 MB. Subilo a Drive y pegá el link en las notas.`, 'error');
            return;
        }
        const reader = new FileReader();
        reader.onload = (event) => {
            state.archivosTemp.push({
                id: 'file_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                nombre: file.name,
                tipo: file.type,
                size: file.size,
                data: event.target.result
            });
            renderArchivos();
        };
        reader.readAsDataURL(file);
    });
    e.target.value = '';
}

function renderArchivos() {
    const container = document.getElementById('filesList');
    container.innerHTML = '';
    state.archivosTemp.forEach(file => {
        const item = document.createElement('div');
        item.className = 'file-item';
        const iconSvg = file.tipo.startsWith('image/')
            ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>'
            : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>';
        item.innerHTML = `
            <div class="file-icon">${iconSvg}</div>
            <div class="file-info">
                <div class="file-name">${escapeHtml(file.nombre)}</div>
                <div class="file-size">${formatBytes(file.size)}</div>
            </div>
            <div class="file-actions">
                <button type="button" class="file-action" data-action="ver" title="Ver/Descargar">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                </button>
                <button type="button" class="file-action delete" data-action="eliminar" title="Eliminar">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
                </button>
            </div>
        `;
        item.querySelector('[data-action="ver"]').addEventListener('click', () => verArchivo(file));
        item.querySelector('[data-action="eliminar"]').addEventListener('click', () => {
            state.archivosTemp = state.archivosTemp.filter(f => f.id !== file.id);
            renderArchivos();
        });
        container.appendChild(item);
    });
}

function verArchivo(file) {
    if (file.tipo.startsWith('image/') || file.tipo === 'application/pdf') {
        const win = window.open();
        win.document.write(`<title>${escapeHtml(file.nombre)}</title>`);
        if (file.tipo.startsWith('image/')) {
            win.document.write(`<body style="margin:0;background:#0f172a;display:flex;align-items:center;justify-content:center;min-height:100vh"><img src="${file.data}" style="max-width:100%;max-height:100vh"></body>`);
        } else {
            win.document.write(`<body style="margin:0"><embed src="${file.data}" style="width:100vw;height:100vh" type="application/pdf"></body>`);
        }
    } else {
        const a = document.createElement('a');
        a.href = file.data;
        a.download = file.nombre;
        a.click();
    }
}

// ============================================================
// SOCIEDADES (CLIENTES)
// ============================================================

function abrirModalCliente() {
    document.getElementById('clientName').value = '';
    document.getElementById('modalClient').style.display = 'flex';
    setTimeout(() => document.getElementById('clientName').focus(), 50);
}

function cerrarModalCliente() {
    document.getElementById('modalClient').style.display = 'none';
}

async function crearCliente(e) {
    e.preventDefault();
    if (!puedeEditar()) return;
    const nombre = document.getElementById('clientName').value.trim();
    const color = document.querySelector('input[name="color"]:checked').value;
    if (!nombre) return;
    const id = nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '_' + Date.now().toString(36);

    if (modoServidor) {
        try {
            await api.crearSociedad({ id, nombre, color });
        } catch (err) {
            toast('No se pudo crear la sociedad: ' + err.message, 'error');
            return;
        }
        state.filtros.clientes.push(id);
        await recargarDesdeServidor();
        cerrarModalCliente();
        toast(`Sociedad "${nombre}" creada`, 'success');
        return;
    }

    state.clientes.push({ id, nombre, color });
    state.filtros.clientes.push(id);
    if (!guardarDatos()) {
        state.clientes = state.clientes.filter(c => c.id !== id);
        state.filtros.clientes = state.filtros.clientes.filter(c => c !== id);
        return;
    }
    renderClientFilters();
    populateClientSelect();
    cerrarModalCliente();
    toast(`Sociedad "${nombre}" creada`, 'success');
}

// ============================================================
// EXPORT / IMPORT
// ============================================================

function exportarDatos() {
    if (modoServidor && api.conectado) {
        window.location.href = '/api/respaldo.json';
        toast('Descargando el respaldo del servidor', 'success');
        return;
    }
    const data = {
        version: '2.0',
        exportado: new Date().toISOString(),
        clientes: state.clientes,
        inscripciones: state.inscripciones
    };
    descargarJSON(data, `mapa-comercial-${new Date().toISOString().split('T')[0]}.json`);
    toast('Datos exportados', 'success');
}

function importarDatos(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const data = JSON.parse(event.target.result);
            const inscripciones = data.inscripciones || (data.pines || []).map(p => ({
                id: p.id, partido: p.municipio, clienteId: p.clienteId,
                estado: p.estado === 'concursando' ? 'por-iniciar' : p.estado,
                descripcion: p.descripcion || '', notas: p.notas || '', archivos: p.archivos || []
            }));
            if (!Array.isArray(data.clientes)) throw new Error('Formato inválido: faltan las sociedades');
            if (!Array.isArray(inscripciones)) throw new Error('Formato inválido: faltan las inscripciones');
            if (!inscripciones.length) throw new Error('El archivo no trae ninguna inscripción');

            const nuevas = inscripciones
                .filter(i => !esPartidoExcluido(i.partido))
                .map(normalizarInscripcion);

            // Cuántas de las que vienen ya existen acá
            const yaEstan = nuevas.filter(n => state.inscripciones.some(
                a => normalizar(a.partido) === normalizar(n.partido) && a.clienteId === n.clienteId
            )).length;
            const faltantes = nuevas.length - yaEstan;

            const opcion = prompt(
                `El archivo trae ${nuevas.length} inscripciones y ${data.clientes.length} sociedades.\n` +
                `De esas, ${yaEstan} ya están en este navegador y ${faltantes} son nuevas.\n\n` +
                `Escribí una opción:\n` +
                `  1 = Agregar solo las que faltan (no toca lo que ya tenés)\n` +
                `  2 = Reemplazar todo por el archivo\n\n` +
                `Antes de cualquiera de las dos se descarga una copia de lo que tenés ahora.`,
                '1'
            );
            if (opcion !== '1' && opcion !== '2') { toast('Importación cancelada', 'warning'); return; }

            // Respaldo automático antes de tocar nada
            descargarJSON(
                { version: '2.0', motivo: 'antes-de-importar', exportado: new Date().toISOString(), clientes: state.clientes, inscripciones: state.inscripciones },
                `mapa-comercial-antes-de-importar-${new Date().toISOString().slice(0, 10)}.json`
            );

            const previas = state.clientes.slice();
            const previasInsc = state.inscripciones.slice();

            if (opcion === '2') {
                state.clientes = data.clientes;
                state.inscripciones = nuevas;
            } else {
                data.clientes.forEach(c => {
                    if (!state.clientes.some(x => x.id === c.id)) state.clientes.push(c);
                });
                nuevas.forEach(n => {
                    const existe = state.inscripciones.some(
                        a => normalizar(a.partido) === normalizar(n.partido) && a.clienteId === n.clienteId
                    );
                    if (!existe) state.inscripciones.push({ ...n, id: n.id || nuevoId('ins') });
                });
            }

            state.filtros.clientes = state.clientes.map(c => c.id);
            if (!guardarDatos()) {
                state.clientes = previas;
                state.inscripciones = previasInsc;
                return;
            }
            renderClientFilters();
            populateClientSelect();
            refrescarPartidos();
            actualizarContadores();
            renderInscripcionesList();
            actualizarAvisoRevisar();
            toast(opcion === '2'
                ? `Datos reemplazados: ${state.inscripciones.length} inscripciones`
                : `Se agregaron ${faltantes} inscripciones nuevas`, 'success');
        } catch (err) {
            toast('No se pudo importar: ' + err.message, 'error');
        }
    };
    reader.readAsText(file);
    e.target.value = '';
}

// ============================================================
// PERFIL: quién está cargando
// ============================================================

function abrirSelectorPerfil() {
    const cont = document.getElementById('perfilLista');
    cont.innerHTML = '';

    (state.perfiles || []).forEach(p => {
        const btn = document.createElement('button');
        btn.className = 'perfil-item' + (api.perfil && api.perfil.id === p.id ? ' actual' : '');
        btn.innerHTML = `
            <span class="perfil-inicial">${escapeHtml(p.nombre.trim().charAt(0).toUpperCase())}</span>
            <span class="perfil-datos">
                <strong>${escapeHtml(p.nombre)}</strong>
                <span>${p.rol === 'admin' ? 'Administra' : (p.rol === 'lectura' ? 'Solo mira' : 'Carga datos')}</span>
            </span>
        `;
        btn.addEventListener('click', () => {
            guardarPerfil({ id: p.id, nombre: p.nombre, rol: p.rol });
            cerrarSelectorPerfil();
            toast(`Entraste como ${p.nombre}`, 'success');
        });
        cont.appendChild(btn);
    });

    if (!state.perfiles || !state.perfiles.length) {
        cont.innerHTML = '<div class="empty-state">Todavía no hay perfiles. Escribí tu nombre abajo.</div>';
    }

    // El botón de cerrar solo aparece si ya hay un perfil elegido
    document.getElementById('btnClosePerfil').style.display = api.perfil ? '' : 'none';
    document.getElementById('perfilNuevoNombre').value = '';
    document.getElementById('modalPerfil').style.display = 'flex';
}

function cerrarSelectorPerfil() {
    document.getElementById('modalPerfil').style.display = 'none';
    actualizarBarraConexion();
}

async function crearPerfilNuevo() {
    const nombre = document.getElementById('perfilNuevoNombre').value.trim();
    if (!nombre) { toast('Escribí un nombre', 'error'); return; }
    try {
        const p = await api.crearPerfil(nombre, 'carga');
        guardarPerfil(p);
        await recargarDesdeServidor();
        cerrarSelectorPerfil();
        toast(`Entraste como ${p.nombre}`, 'success');
    } catch (e) {
        toast('No se pudo crear el perfil: ' + e.message, 'error');
    }
}

// ============================================================
// MIGRACIÓN: subir lo que tiene este navegador
// ============================================================

function datosDeEsteNavegador() {
    try {
        const txt = localStorage.getItem(STORAGE_KEY);
        if (!txt) return null;
        const d = JSON.parse(txt);
        return {
            clientes: d.clientes || [],
            inscripciones: (d.inscripciones || []).map(normalizarInscripcion)
        };
    } catch (e) {
        return null;
    }
}

function abrirModalMigrar() {
    document.getElementById('migrarPaso1').style.display = '';
    document.getElementById('migrarInforme').style.display = 'none';
    document.getElementById('migrarInforme').innerHTML = '';
    document.getElementById('modalMigrar').style.display = 'flex';
}

function cerrarModalMigrar() {
    document.getElementById('modalMigrar').style.display = 'none';
}

async function simularMigracion() {
    const datos = datosDeEsteNavegador();
    if (!datos || !datos.inscripciones.length) {
        toast('Este navegador no tiene datos para subir', 'warning');
        return;
    }
    const boton = document.getElementById('btnSimularMigracion');
    boton.disabled = true;
    boton.textContent = 'Comparando...';
    try {
        const informe = await api.migrarDesdeNavegador(datos, 'simular');
        mostrarInformeMigracion(informe, datos);
    } catch (e) {
        toast('No se pudo comparar: ' + e.message, 'error');
    } finally {
        boton.disabled = false;
        boton.textContent = 'Comparar con el servidor';
    }
}

function mostrarInformeMigracion(informe, datos) {
    document.getElementById('migrarPaso1').style.display = 'none';
    const cont = document.getElementById('migrarInforme');
    cont.style.display = '';

    let html = `
        <div class="migrar-resumen">
            <div class="migrar-dato nuevas"><strong>${informe.nuevas}</strong><span>nuevas para el servidor</span></div>
            <div class="migrar-dato iguales"><strong>${informe.iguales}</strong><span>ya estaban igual</span></div>
            <div class="migrar-dato distintas"><strong>${informe.distintas}</strong><span>están distintas</span></div>
        </div>
    `;

    if (informe.sinMunicipio) {
        html += `<p class="aviso-texto">⚠ ${informe.sinMunicipio} inscripciones de este navegador no tienen municipio
                 identificado y no se van a subir. Resolvelas primero en "Inscripciones sin municipio".</p>`;
    }

    if (informe.distintas) {
        html += `<p class="aviso-texto"><strong>Las ${informe.distintas} que están distintas NO se tocan.</strong>
                 Estas son las diferencias:</p><div class="migrar-conflictos">`;
        (informe.detalleDistintas || []).forEach(d => {
            const muni = nombreMunicipio(d.entrante.municipioId) || d.entrante.partido;
            const soc = (state.clientes.find(c => c.id === d.entrante.clienteId) || {}).nombre || d.entrante.clienteId;
            const filas = d.campos.map(c => `
                <div class="migrar-campo">
                    <span class="migrar-campo-nombre">${escapeHtml(etiquetaCampo(c))}</span>
                    <span class="migrar-aca">acá: ${escapeHtml(String(d.entrante[c] || '—'))}</span>
                    <span class="migrar-alla">servidor: ${escapeHtml(String(d.actual[c] || '—'))}</span>
                </div>
            `).join('');
            html += `<div class="migrar-conflicto"><strong>${escapeHtml(muni)} · ${escapeHtml(soc)}</strong>${filas}</div>`;
        });
        html += '</div>';
    }

    html += `
        <div class="rotos-acciones">
            <button class="btn-primary" id="btnAplicarMigracion">Subir las ${informe.nuevas} nuevas</button>
            ${informe.distintas ? '<button class="btn-secondary" id="btnAplicarTodo">Subir todo y pisar las distintas</button>' : ''}
        </div>
    `;

    cont.innerHTML = html;

    document.getElementById('btnAplicarMigracion').addEventListener('click', () => aplicarMigracion(datos, false));
    const btnTodo = document.getElementById('btnAplicarTodo');
    if (btnTodo) btnTodo.addEventListener('click', () => {
        if (!confirm('Vas a pisar en el servidor las versiones distintas con las de este navegador.\n\n¿Seguro?')) return;
        aplicarMigracion(datos, true);
    });
}

function etiquetaCampo(c) {
    return ({
        estado: 'Estado', descripcion: 'Razón', notas: 'Notas',
        fechaAlta: 'Fecha de alta', fechaVto: 'Vence el',
        sinVto: 'Sin vencimiento', monto: 'Monto'
    })[c] || c;
}

async function aplicarMigracion(datos, forzar) {
    try {
        const r = await api.migrarDesdeNavegador(datos, 'aplicar', forzar);
        await recargarDesdeServidor();
        cerrarModalMigrar();
        toast(`Se subieron ${r.aplicadas} inscripciones al servidor`, 'success');
    } catch (e) {
        toast('No se pudo subir: ' + e.message, 'error');
    }
}

// ============================================================
// MUNICIPIOS A REVISAR
// Inscripciones cuyo nombre de municipio no coincide con ninguno real.
// No se adivinan: las resuelve una persona.
// ============================================================

function actualizarAvisoRevisar() {
    detectarMunicipiosSinResolver();
    const aviso = document.getElementById('avisoRevisar');
    if (!aviso) return;
    const cant = state.municipiosSinResolver.length;
    document.getElementById('cantRevisar').textContent = cant;
    aviso.style.display = cant ? '' : 'none';
}

function abrirModalRevisar() {
    const cont = document.getElementById('revisarLista');
    cont.innerHTML = '';

    if (!state.municipiosSinResolver.length) {
        cont.innerHTML = '<div class="empty-state">No quedan inscripciones sin municipio.</div>';
    } else {
        state.municipiosSinResolver.forEach(insc => {
            const cliente = state.clientes.find(c => c.id === insc.clienteId);
            const fila = document.createElement('div');
            fila.className = 'revisar-item';

            const opciones = MUNICIPIOS
                .map(m => `<option value="${m.id}">${escapeHtml(m.nombre)}</option>`)
                .join('');

            fila.innerHTML = `
                <div class="revisar-info">
                    <strong>${escapeHtml(insc.partido || '(sin nombre)')}</strong>
                    <span>${escapeHtml(cliente ? cliente.nombre : 'Sin sociedad')} · ${textoEstado(insc.estado)}</span>
                </div>
                <select class="revisar-select">
                    <option value="">Elegir municipio...</option>
                    ${opciones}
                </select>
                <button class="btn-primary revisar-btn" disabled>Asignar</button>
            `;

            const select = fila.querySelector('select');
            const boton = fila.querySelector('button');
            // Sugerencia: el municipio cuyo nombre mas se parece, pero NO se aplica solo
            const sugerido = MUNICIPIOS.find(m => normalizarNombreMunicipio(m.nombre).startsWith(normalizar(insc.partido).slice(0, 4)));
            if (sugerido) select.value = sugerido.id;
            boton.disabled = !select.value;

            select.addEventListener('change', () => { boton.disabled = !select.value; });
            boton.addEventListener('click', async () => {
                const m = MUNICIPIOS_POR_ID[Number(select.value)];
                if (!m) return;
                insc.municipioId = m.id;
                insc.partido = m.nombre;
                insc.actualizado = new Date().toISOString();
                if (modoServidor) {
                    try {
                        await api.guardarInscripcion(insc);
                    } catch (err) {
                        toast('No se pudo asignar: ' + err.message, 'error');
                        return;
                    }
                    await recargarDesdeServidor();
                    actualizarAvisoRevisar();
                    abrirModalRevisar();
                    toast(`Asignado a ${m.nombre}`, 'success');
                    return;
                }
                if (!guardarDatos()) return;
                refrescarPartidos();
                actualizarContadores();
                actualizarAvisoRevisar();
                abrirModalRevisar();
                toast(`Asignado a ${m.nombre}`, 'success');
            });

            cont.appendChild(fila);
        });
    }
    document.getElementById('modalRevisar').style.display = 'flex';
}

function cerrarModalRevisar() {
    document.getElementById('modalRevisar').style.display = 'none';
}

// ============================================================
// SEGURIDAD DE LOS DATOS (medidor, restaurar, datos ilegibles)
// ============================================================

function actualizarMedidorEspacio() {
    const box = document.getElementById('espacioBox');
    if (!box) return;
    const { bytes, limite, porcentaje } = espacioUsado();
    document.getElementById('espacioValor').textContent =
        `${formatBytes(bytes)} de ${formatBytes(limite)}`;
    const barra = document.getElementById('espacioLlena');
    barra.style.width = porcentaje + '%';
    box.classList.toggle('alerta', porcentaje >= 75);
    box.classList.toggle('critico', porcentaje >= 90);
}

function abrirModalRestaurar() {
    const cont = document.getElementById('restaurarLista');
    const copias = listarRespaldos();
    cont.innerHTML = '';

    if (!copias.length) {
        cont.innerHTML = '<div class="empty-state">Todavía no hay copias guardadas. Se crean solas con el primer cambio.</div>';
    } else {
        copias.forEach(c => {
            const fila = document.createElement('div');
            fila.className = 'restaurar-item';
            fila.innerHTML = `
                <div class="restaurar-info">
                    <strong>${escapeHtml(c.etiqueta)}</strong>
                    <span>${c.cantidad} inscripcion${c.cantidad === 1 ? '' : 'es'}</span>
                </div>
                <button class="btn-secondary">Restaurar</button>
            `;
            fila.querySelector('button').addEventListener('click', () => restaurarCopia(c));
            cont.appendChild(fila);
        });
    }
    document.getElementById('modalRestaurar').style.display = 'flex';
}

function cerrarModalRestaurar() {
    document.getElementById('modalRestaurar').style.display = 'none';
}

function restaurarCopia(copia) {
    const actuales = state.inscripciones.length;
    if (!confirm(
        `Vas a reemplazar las ${actuales} inscripciones de ahora por las ${copia.cantidad} de "${copia.etiqueta}".\n\n` +
        `Antes se descarga un archivo con lo que tenés ahora, por las dudas.\n\n¿Seguimos?`
    )) return;

    descargarJSON(
        { version: '2.0', motivo: 'antes-de-restaurar', exportado: new Date().toISOString(), clientes: state.clientes, inscripciones: state.inscripciones },
        `mapa-comercial-antes-de-restaurar-${new Date().toISOString().slice(0, 10)}.json`
    );

    try {
        const d = JSON.parse(copia.contenido);
        state.clientes = d.clientes || [];
        state.inscripciones = (d.inscripciones || []).map(normalizarInscripcion);
    } catch (e) {
        toast('Esa copia no se pudo leer', 'error');
        return;
    }

    state.filtros.clientes = state.clientes.map(c => c.id);
    if (!guardarDatos()) return;
    renderClientFilters();
    populateClientSelect();
    refrescarPartidos();
    actualizarContadores();
    actualizarAvisoRevisar();
    cerrarModalRestaurar();
    toast('Copia restaurada', 'success');
}

function mostrarPantallaDatosRotos() {
    const cont = document.getElementById('rotosLista');
    const copias = listarRespaldos();
    cont.innerHTML = '';

    if (!copias.length) {
        cont.innerHTML = '<div class="empty-state">No hay copias de seguridad disponibles en este navegador.</div>';
    } else {
        copias.forEach(c => {
            const fila = document.createElement('div');
            fila.className = 'restaurar-item';
            fila.innerHTML = `
                <div class="restaurar-info">
                    <strong>${escapeHtml(c.etiqueta)}</strong>
                    <span>${c.cantidad} inscripcion${c.cantidad === 1 ? '' : 'es'}</span>
                </div>
                <button class="btn-primary">Usar esta</button>
            `;
            fila.querySelector('button').addEventListener('click', () => {
                try {
                    const d = JSON.parse(c.contenido);
                    state.datosIlegibles = false;
                    state.clientes = d.clientes || [];
                    state.inscripciones = (d.inscripciones || []).map(normalizarInscripcion);
                    localStorage.setItem(STORAGE_KEY, JSON.stringify({ clientes: state.clientes, inscripciones: state.inscripciones }));
                    location.reload();
                } catch (e) {
                    alert('Esa copia tampoco se pudo leer.');
                }
            });
            cont.appendChild(fila);
        });
    }

    document.getElementById('btnDescargarRotos').addEventListener('click', () => {
        const clave = Object.keys(localStorage).filter(k => k.startsWith(PREFIJO_ROTO)).sort().pop();
        const texto = clave ? localStorage.getItem(clave) : '';
        const blob = new Blob([texto], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'datos-dañados.txt';
        a.click();
        URL.revokeObjectURL(url);
    });

    document.getElementById('btnEmpezarDeCero').addEventListener('click', () => {
        if (!confirm('Vas a empezar con los datos de ejemplo. Los datos dañados quedan guardados igual.\n\n¿Seguro?')) return;
        localStorage.removeItem(STORAGE_KEY);
        location.reload();
    });

    document.getElementById('modalDatosRotos').style.display = 'flex';
}

function descargarJSON(objeto, nombre) {
    const blob = new Blob([JSON.stringify(objeto, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    a.click();
    URL.revokeObjectURL(url);
}

// ============================================================
// UTILS
// ============================================================

function nuevoId(prefijo) {
    return prefijo + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
}

function normalizar(s) {
    return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

function toast(mensaje, tipo = 'info') {
    const container = document.getElementById('toastContainer');
    const el = document.createElement('div');
    el.className = `toast ${tipo}`;
    el.textContent = mensaje;
    container.appendChild(el);
    setTimeout(() => {
        el.style.transition = 'opacity 0.3s, transform 0.3s';
        el.style.opacity = '0';
        el.style.transform = 'translateX(100%)';
        setTimeout(() => el.remove(), 300);
    }, 3000);
}
