// ============================================================
// Mapa Comercial - Real Catorce
// ============================================================

const STORAGE_KEY = 'mapa_comercial_data';

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
    editingInscripcionId: null,
    archivosTemp: []
};

let map;
let partidosLayer = null;

// ============================================================
// INICIALIZACIÓN
// ============================================================

window.addEventListener('DOMContentLoaded', () => {
    cargarDatos();
    aplicarPatchesIniciales();
    inicializarMapa();
    renderClientFilters();
    actualizarContadores();
    bindUI();
    populateClientSelect();
    avisarVencimientos();
});

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

// Patches que se aplican una vez por usuario (para sumar inscripciones nuevas sin tocar las existentes)
const PATCHES = [
    {
        id: 'r14-por-iniciar-conurbano-2026-06',
        items: [
            { partido: 'Presidente Peron', clienteId: 'r14', estado: 'por-iniciar' },
            { partido: 'Ezeiza', clienteId: 'r14', estado: 'por-iniciar' },
            { partido: 'Vicente Lopez', clienteId: 'r14', estado: 'por-iniciar' },
            { partido: 'San Miguel', clienteId: 'r14', estado: 'por-iniciar' }
        ]
    }
];

function aplicarPatchesIniciales() {
    const aplicados = JSON.parse(localStorage.getItem('mapa_comercial_patches') || '[]');
    let cambios = false;
    PATCHES.forEach(patch => {
        if (aplicados.includes(patch.id)) return;
        patch.items.forEach(item => {
            const existe = state.inscripciones.find(i =>
                normalizar(i.partido) === normalizar(item.partido) &&
                i.clienteId === item.clienteId
            );
            if (!existe) {
                state.inscripciones.push({
                    id: 'ins_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                    partido: item.partido,
                    clienteId: item.clienteId,
                    estado: item.estado,
                    descripcion: item.descripcion || '',
                    notas: '',
                    archivos: [],
                    creado: new Date().toISOString()
                });
                cambios = true;
            }
        });
        aplicados.push(patch.id);
    });
    localStorage.setItem('mapa_comercial_patches', JSON.stringify(aplicados));
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
            cargarDatosIniciales();
        }
    } else {
        cargarDatosIniciales();
    }
    state.filtros.clientes = state.clientes.map(c => c.id);
}

function cargarDatosIniciales() {
    state.clientes = [...CLIENTES_INICIALES];
    state.inscripciones = INSCRIPCIONES_INICIALES.map((i, idx) => ({
        id: 'ins_' + Date.now() + '_' + idx,
        partido: i.partido,
        clienteId: i.clienteId,
        estado: i.estado,
        descripcion: i.descripcion || '',
        notas: '',
        archivos: [],
        creado: new Date().toISOString()
    }));
    guardarDatos();
}

function guardarDatos() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            clientes: state.clientes,
            inscripciones: state.inscripciones
        }));
    } catch (e) {
        toast('Error: límite de almacenamiento alcanzado. Exporta y borra archivos pesados.', 'error');
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
    return {
        fechaAlta: '',
        fechaVto: '',
        sinVto: false,
        monto: null,
        ...i,
        archivos: i.archivos || []
    };
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

function partidoTieneAlerta(nombrePartido) {
    const n = normalizar(nombrePartido);
    let peor = null;
    state.inscripciones.forEach(i => {
        if (!inscripcionPasaFiltros(i)) return;
        const m = normalizar(i.partido);
        if (!(m === n || m.includes(n) || n.includes(m))) return;
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
        zoom: 10,
        zoomControl: true,
        attributionControl: true
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap &copy; CARTO &copy; mgaitan/departamentos_argentina',
        subdomains: 'abcd',
        maxZoom: 19,
        opacity: 0.55
    }).addTo(map);

    cargarPartidos();

    map.on('zoomend moveend', actualizarLabelsPartidos);
}

function cargarPartidos() {
    fetch('data/partidos-buenos-aires.geojson?v=2', { cache: 'no-cache' })
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
                        mostrarLeyendaPartido(nombre, layer);
                    });
                    layer.on('mouseout', () => {
                        layer.setStyle(estiloPartido(feature, false));
                        ocultarLeyendaPartido();
                    });
                    layer.on('click', () => {
                        abrirPanelPartido(nombre);
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

function inscripcionesDelPartido(nombrePartido) {
    const n = normalizar(nombrePartido);
    return state.inscripciones.filter(i => {
        const m = normalizar(i.partido);
        return (m === n || m.includes(n) || n.includes(m)) && inscripcionPasaFiltros(i);
    });
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

    const inscripciones = inscripcionesDelPartido(nombre);
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

    const alerta = partidoTieneAlerta(nombre);
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

function mostrarLeyendaPartido(nombre, layer) {
    if (esPartidoExcluido(nombre)) return;

    const insc = inscripcionesDelPartido(nombre);
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

function abrirPanelPartido(nombrePartido) {
    if (esPartidoExcluido(nombrePartido)) {
        toast('Este organismo no se gestiona por partido', 'warning');
        return;
    }
    state.selectedPartido = nombrePartido;
    document.getElementById('detailsTitle').textContent = nombrePartido;
    renderInscripcionesList();
    document.getElementById('detailsPanel').classList.add('open');
}

function cerrarPanel() {
    document.getElementById('detailsPanel').classList.remove('open');
    state.selectedPartido = null;
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
    if (!state.selectedPartido) return;

    const insc = state.inscripciones.filter(i => normalizar(i.partido) === normalizar(state.selectedPartido));
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
}

function cerrarModalInscripcion() {
    document.getElementById('modalInscripcion').style.display = 'none';
    state.editingInscripcionId = null;
    state.archivosTemp = [];
}

function guardarInscripcion(e) {
    e.preventDefault();
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
            id: 'ins_' + Date.now(),
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
    guardarDatos();
    refrescarPartidos();
    actualizarContadores();
    renderClientFilters();
    renderInscripcionesList();
    cerrarModalInscripcion();
    toast('Guardado', 'success');
}

function eliminarInscripcionActual() {
    if (!state.editingInscripcionId) return;
    if (!confirm('¿Eliminar esta inscripción?')) return;
    state.inscripciones = state.inscripciones.filter(i => i.id !== state.editingInscripcionId);
    guardarDatos();
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
            abrirPanelPartido(i.partido);
            centrarEnPartido(i.partido);
        });
        cont.appendChild(row);
    });
}

function centrarEnPartido(nombre) {
    if (!partidosLayer) return;
    const n = normalizar(nombre);
    partidosLayer.eachLayer(layer => {
        const nom = normalizar(layer.feature.properties.nombre || '');
        if (nom === n || nom.includes(n) || n.includes(nom)) {
            map.fitBounds(layer.getBounds(), { maxZoom: 11, padding: [40, 40] });
        }
    });
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
    document.getElementById('searchInput').addEventListener('input', (e) => {
        state.filtros.busqueda = e.target.value;
        refrescarPartidos();
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

    document.getElementById('btnExport').addEventListener('click', exportarDatos);
    document.getElementById('btnImport').addEventListener('click', () => document.getElementById('importFile').click());
    document.getElementById('importFile').addEventListener('change', importarDatos);
}

// ============================================================
// ARCHIVOS
// ============================================================

function cargarArchivos(e) {
    const files = Array.from(e.target.files);
    files.forEach(file => {
        if (file.size > 2 * 1024 * 1024) {
            toast(`"${file.name}" supera 2MB - puede saturar almacenamiento`, 'warning');
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

function crearCliente(e) {
    e.preventDefault();
    const nombre = document.getElementById('clientName').value.trim();
    const color = document.querySelector('input[name="color"]:checked').value;
    if (!nombre) return;
    const id = nombre.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '_' + Date.now().toString(36);
    state.clientes.push({ id, nombre, color });
    state.filtros.clientes.push(id);
    guardarDatos();
    renderClientFilters();
    populateClientSelect();
    cerrarModalCliente();
    toast(`Sociedad "${nombre}" creada`, 'success');
}

// ============================================================
// EXPORT / IMPORT
// ============================================================

function exportarDatos() {
    const data = {
        version: '2.0',
        exportado: new Date().toISOString(),
        clientes: state.clientes,
        inscripciones: state.inscripciones
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mapa-comercial-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
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
            if (!data.clientes || !inscripciones) throw new Error('Formato inválido');
            if (!confirm(`Importar ${inscripciones.length} inscripciones y ${data.clientes.length} sociedades? Reemplaza los datos actuales.`)) return;
            state.clientes = data.clientes;
            state.inscripciones = inscripciones.filter(i => !esPartidoExcluido(i.partido)).map(normalizarInscripcion);
            state.filtros.clientes = state.clientes.map(c => c.id);
            guardarDatos();
            renderClientFilters();
            populateClientSelect();
            refrescarPartidos();
            actualizarContadores();
            toast('Datos importados', 'success');
        } catch (err) {
            toast('Error al importar: archivo inválido', 'error');
        }
    };
    reader.readAsText(file);
    e.target.value = '';
}

// ============================================================
// UTILS
// ============================================================

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
