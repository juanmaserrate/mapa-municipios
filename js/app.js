// ============================================================
// Mapa Comercial - Lógica principal
// ============================================================

const STORAGE_KEY = 'mapa_comercial_data';

let state = {
    clientes: [],
    pines: [],
    filtros: {
        busqueda: '',
        estados: ['inscripto', 'concursando', 'no-inscripto'],
        clientes: []
    },
    addingPin: false,
    selectedPinId: null,
    markers: {},
    archivosTemp: []
};

let map;

// ============================================================
// INICIALIZACIÓN
// ============================================================

window.addEventListener('DOMContentLoaded', () => {
    cargarDatos();
    inicializarMapa();
    renderClientFilters();
    renderPines();
    actualizarContadores();
    bindUI();
    populateClientSelect();
});

function cargarDatos() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        try {
            const data = JSON.parse(saved);
            state.clientes = data.clientes || [];
            state.pines = data.pines || [];
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
    state.pines = PINES_INICIALES.map((p, idx) => {
        const muni = MUNICIPIOS_BA.find(m => m.nombre === p.municipio);
        if (!muni) return null;
        return {
            id: 'pin_' + Date.now() + '_' + idx,
            municipio: p.municipio,
            clienteId: p.clienteId,
            estado: p.estado,
            descripcion: p.descripcion || '',
            notas: '',
            archivos: [],
            lat: muni.lat,
            lng: muni.lng,
            creado: new Date().toISOString()
        };
    }).filter(Boolean);
    guardarDatos();
}

function guardarDatos() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            clientes: state.clientes,
            pines: state.pines
        }));
    } catch (e) {
        toast('Error: límite de almacenamiento alcanzado. Exporta y borra archivos pesados.', 'error');
    }
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

    // Capa de fondo: claro y minimalista (sin etiquetas, calles muy tenues)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap &copy; CARTO &copy; mgaitan/departamentos_argentina',
        subdomains: 'abcd',
        maxZoom: 19,
        opacity: 0.55
    }).addTo(map);

    // Mostrar/ocultar labels de partidos según el espacio disponible
    map.on('zoomend moveend', actualizarLabelsPartidos);

    // Cargar polígonos de partidos de Buenos Aires
    cargarPartidos();

    map.on('click', (e) => {
        if (state.addingPin) {
            crearPinEnUbicacion(e.latlng.lat, e.latlng.lng);
            toggleAddPinMode(false);
        }
    });
}

let partidosLayer = null;

function cargarPartidos() {
    fetch('data/partidos-buenos-aires.geojson?v=2', { cache: 'no-cache' })
        .then(r => r.json())
        .then(geojson => {
            partidosLayer = L.geoJSON(geojson, {
                style: (feature) => estiloPartido(feature, false),
                onEachFeature: (feature, layer) => {
                    const nombre = feature.properties.nombre || feature.properties.departamento;
                    // Label permanente en el centro del polígono
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
                    });
                    layer.on('mouseout', () => {
                        layer.setStyle(estiloPartido(feature, false));
                    });
                    layer.on('click', (e) => {
                        if (state.addingPin) {
                            const center = layer.getBounds().getCenter();
                            crearPinEnUbicacionConMunicipio(center.lat, center.lng, nombre);
                            toggleAddPinMode(false);
                            L.DomEvent.stopPropagation(e);
                        }
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

function normalizar(s) {
    return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

function estiloPartido(feature, hover) {
    // Color de fondo: si hay pines del partido, color predominante; si no, gris oscuro
    const nombre = normalizar(feature.properties.nombre);
    const pinesPartido = state.pines.filter(p => {
        if (!p.municipio) return false;
        const muni = normalizar(p.municipio);
        return (muni.includes(nombre) || nombre.includes(muni)) && pinPasaFiltros(p);
    });

    let fillColor = '#1e293b';
    let estados = pinesPartido.map(p => p.estado);
    if (estados.includes('inscripto')) fillColor = '#10b981';
    else if (estados.includes('concursando')) fillColor = '#f59e0b';
    else if (estados.includes('no-inscripto')) fillColor = '#ef4444';

    return {
        color: hover ? '#a5b4fc' : '#475569',
        weight: hover ? 2 : 1,
        opacity: hover ? 1 : 0.7,
        fillColor: fillColor,
        fillOpacity: hover ? 0.45 : (pinesPartido.length > 0 ? 0.25 : 0.08)
    };
}

function refrescarPartidos() {
    if (!partidosLayer) return;
    partidosLayer.eachLayer(layer => {
        layer.setStyle(estiloPartido(layer.feature, false));
    });
}

// Muestra el label solo si entra en el polígono visible y el zoom es suficiente
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

        // Fuera de la vista: ocultar
        if (!mapBounds.intersects(bounds)) {
            el.style.display = 'none';
            return;
        }

        // Tamaño del polígono en pixels
        const nw = map.latLngToContainerPoint(bounds.getNorthWest());
        const se = map.latLngToContainerPoint(bounds.getSouthEast());
        const widthPx = Math.abs(se.x - nw.x);
        const heightPx = Math.abs(se.y - nw.y);

        const nombre = layer.feature.properties.nombre || '';
        const textoAncho = nombre.length * 6.5 + 6;
        const textoAlto = 14;

        // Mostrar solo si el polígono visible aloja al texto y zoom no es muy bajo
        const cabe = widthPx > textoAncho && heightPx > textoAlto;
        const zoomOk = zoom >= 8;
        el.style.display = (cabe && zoomOk) ? '' : 'none';
    });
}

function crearPinEnUbicacionConMunicipio(lat, lng, municipio) {
    const nuevoPin = {
        id: 'pin_' + Date.now(),
        municipio: municipio || '',
        clienteId: state.clientes[0]?.id || '',
        estado: 'no-inscripto',
        descripcion: '',
        notas: '',
        archivos: [],
        lat: lat,
        lng: lng,
        creado: new Date().toISOString()
    };
    state.pines.push(nuevoPin);
    guardarDatos();
    renderPines();
    abrirDetallesPin(nuevoPin.id);
    actualizarContadores();
    renderClientFilters();
    refrescarPartidos();
}

function renderPines() {
    // Limpiar markers existentes
    Object.values(state.markers).forEach(m => map.removeLayer(m));
    state.markers = {};

    // Agrupar pines visibles por ubicación (precisión de 3 decimales = ~100m)
    const grupos = {};
    state.pines.forEach(pin => {
        if (!pinPasaFiltros(pin)) return;
        const key = `${pin.lat.toFixed(3)},${pin.lng.toFixed(3)}`;
        (grupos[key] = grupos[key] || []).push(pin);
    });

    Object.values(grupos).forEach(grupo => {
        const offsets = calcularOffsetsGrupo(grupo.length);
        grupo.forEach((pin, i) => {
            const [dx, dy] = offsets[i];
            const marker = crearMarker(pin, dx, dy);
            marker.addTo(map);
            state.markers[pin.id] = marker;
        });
    });
    refrescarPartidos();
}

function calcularOffsetsGrupo(n) {
    // Devuelve offsets [dx, dy] en píxeles para no superponer los pines de la misma ubicación
    if (n === 1) return [[0, 0]];
    if (n === 2) return [[-13, 0], [13, 0]];
    if (n === 3) return [[0, -14], [-13, 8], [13, 8]];
    if (n === 4) return [[-13, -13], [13, -13], [-13, 13], [13, 13]];
    // 5+: distribución circular
    const r = 18;
    return Array.from({ length: n }, (_, i) => {
        const a = (2 * Math.PI * i) / n - Math.PI / 2;
        return [r * Math.cos(a), r * Math.sin(a)];
    });
}

function crearMarker(pin, offsetX = 0, offsetY = 0) {
    const cliente = state.clientes.find(c => c.id === pin.clienteId);
    const clienteNombre = cliente ? cliente.nombre : 'Sin cliente';
    const clienteColor = cliente ? cliente.color : '#94a3b8';

    const html = `<div class="pin-dot ${pin.estado}" style="border-color:${clienteColor}"></div>`;

    const icon = L.divIcon({
        html: html,
        className: 'custom-pin',
        iconSize: [22, 22],
        iconAnchor: [11 - offsetX, 11 - offsetY]
    });

    const marker = L.marker([pin.lat, pin.lng], { icon, riseOnHover: true });
    marker.bindTooltip(`${escapeHtml(clienteNombre)} — ${escapeHtml(pin.municipio || 'Sin municipio')}`, {
        direction: 'top',
        offset: [0, -8],
        className: 'pin-tooltip'
    });
    marker.on('click', () => abrirDetallesPin(pin.id));

    return marker;
}

function pinPasaFiltros(pin) {
    if (!state.filtros.estados.includes(pin.estado)) return false;
    if (!state.filtros.clientes.includes(pin.clienteId)) return false;

    if (state.filtros.busqueda) {
        const q = state.filtros.busqueda.toLowerCase();
        const cliente = state.clientes.find(c => c.id === pin.clienteId);
        const matchMuni = pin.municipio.toLowerCase().includes(q);
        const matchCliente = cliente && cliente.nombre.toLowerCase().includes(q);
        const matchDesc = (pin.descripcion || '').toLowerCase().includes(q);
        const matchNotas = (pin.notas || '').toLowerCase().includes(q);
        if (!matchMuni && !matchCliente && !matchDesc && !matchNotas) return false;
    }
    return true;
}

// ============================================================
// SIDEBAR FILTERS
// ============================================================

function renderClientFilters() {
    const container = document.getElementById('clientFilters');
    container.innerHTML = '';

    state.clientes.forEach(cliente => {
        const count = state.pines.filter(p => p.clienteId === cliente.id).length;
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
            renderPines();
        });
        container.appendChild(row);
    });
}

function actualizarContadores() {
    const counts = { inscripto: 0, concursando: 0, 'no-inscripto': 0 };
    state.pines.forEach(p => { if (counts[p.estado] !== undefined) counts[p.estado]++; });
    document.getElementById('count-inscripto').textContent = counts.inscripto;
    document.getElementById('count-concursando').textContent = counts.concursando;
    document.getElementById('count-no-inscripto').textContent = counts['no-inscripto'];
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
    // Búsqueda
    document.getElementById('searchInput').addEventListener('input', (e) => {
        state.filtros.busqueda = e.target.value;
        renderPines();
    });

    // Filtros de estado
    document.querySelectorAll('[data-status]').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const status = e.target.dataset.status;
            if (e.target.checked) {
                if (!state.filtros.estados.includes(status)) state.filtros.estados.push(status);
            } else {
                state.filtros.estados = state.filtros.estados.filter(s => s !== status);
            }
            renderPines();
        });
    });

    // Botón agregar pin
    document.getElementById('btnAddPin').addEventListener('click', () => toggleAddPinMode(true));
    document.getElementById('btnCancelAdd').addEventListener('click', () => toggleAddPinMode(false));

    // Detalles panel
    document.getElementById('btnCloseDetails').addEventListener('click', cerrarDetalles);
    document.getElementById('detailsForm').addEventListener('submit', guardarPin);
    document.getElementById('btnDeletePin').addEventListener('click', eliminarPinActual);

    // Archivos
    document.getElementById('fieldArchivo').addEventListener('change', cargarArchivos);

    // Modal cliente
    document.getElementById('btnAddClient').addEventListener('click', abrirModalCliente);
    document.getElementById('btnCloseClientModal').addEventListener('click', cerrarModalCliente);
    document.getElementById('btnCancelClient').addEventListener('click', cerrarModalCliente);
    document.getElementById('clientForm').addEventListener('submit', crearCliente);

    // Colapsar/expandir sidebar
    document.getElementById('btnCollapseSidebar').addEventListener('click', () => {
        document.querySelector('.app').classList.add('sidebar-collapsed');
        setTimeout(() => map.invalidateSize(), 260);
    });
    document.getElementById('btnOpenSidebar').addEventListener('click', () => {
        document.querySelector('.app').classList.remove('sidebar-collapsed');
        setTimeout(() => map.invalidateSize(), 260);
    });

    // Export/Import
    document.getElementById('btnExport').addEventListener('click', exportarDatos);
    document.getElementById('btnImport').addEventListener('click', () => {
        document.getElementById('importFile').click();
    });
    document.getElementById('importFile').addEventListener('change', importarDatos);
}

function toggleAddPinMode(active) {
    state.addingPin = active;
    document.getElementById('mapOverlay').style.display = active ? 'flex' : 'none';
    document.getElementById('map').style.cursor = active ? 'crosshair' : '';
}

// ============================================================
// PIN CRUD
// ============================================================

function crearPinEnUbicacion(lat, lng) {
    const nuevoPin = {
        id: 'pin_' + Date.now(),
        municipio: '',
        clienteId: state.clientes[0]?.id || '',
        estado: 'no-inscripto',
        descripcion: '',
        notas: '',
        archivos: [],
        lat: lat,
        lng: lng,
        creado: new Date().toISOString()
    };
    state.pines.push(nuevoPin);
    guardarDatos();
    renderPines();
    abrirDetallesPin(nuevoPin.id);
    actualizarContadores();
    renderClientFilters();
}

function abrirDetallesPin(pinId) {
    const pin = state.pines.find(p => p.id === pinId);
    if (!pin) return;

    state.selectedPinId = pinId;
    state.archivosTemp = [...(pin.archivos || [])];

    document.getElementById('fieldMunicipio').value = pin.municipio || '';
    document.getElementById('fieldCliente').value = pin.clienteId || '';
    document.querySelectorAll('input[name="estado"]').forEach(r => {
        r.checked = r.value === pin.estado;
    });
    document.getElementById('fieldDescripcion').value = pin.descripcion || '';
    document.getElementById('fieldNotas').value = pin.notas || '';
    document.getElementById('detailsTitle').textContent = pin.municipio || 'Nuevo pin';

    renderArchivos();

    document.getElementById('detailsPanel').classList.add('open');

    // Centrar mapa en el pin
    map.setView([pin.lat, pin.lng], Math.max(map.getZoom(), 12), { animate: true });
}

function cerrarDetalles() {
    document.getElementById('detailsPanel').classList.remove('open');
    state.selectedPinId = null;
    state.archivosTemp = [];
}

function guardarPin(e) {
    e.preventDefault();
    const pin = state.pines.find(p => p.id === state.selectedPinId);
    if (!pin) return;

    pin.municipio = document.getElementById('fieldMunicipio').value.trim();
    pin.clienteId = document.getElementById('fieldCliente').value;
    const estadoEl = document.querySelector('input[name="estado"]:checked');
    pin.estado = estadoEl ? estadoEl.value : 'no-inscripto';
    pin.descripcion = document.getElementById('fieldDescripcion').value.trim();
    pin.notas = document.getElementById('fieldNotas').value.trim();
    pin.archivos = [...state.archivosTemp];
    pin.actualizado = new Date().toISOString();

    guardarDatos();
    renderPines();
    actualizarContadores();
    renderClientFilters();
    cerrarDetalles();
    toast('Pin guardado correctamente', 'success');
}

function eliminarPinActual() {
    if (!state.selectedPinId) return;
    if (!confirm('¿Eliminar este pin? Esta acción no se puede deshacer.')) return;
    state.pines = state.pines.filter(p => p.id !== state.selectedPinId);
    guardarDatos();
    renderPines();
    actualizarContadores();
    renderClientFilters();
    cerrarDetalles();
    toast('Pin eliminado', 'success');
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
        // Descargar
        const a = document.createElement('a');
        a.href = file.data;
        a.download = file.nombre;
        a.click();
    }
}

// ============================================================
// CLIENTES
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
    toast(`Cliente "${nombre}" creado`, 'success');
}

// ============================================================
// EXPORT / IMPORT
// ============================================================

function exportarDatos() {
    const data = {
        version: '1.0',
        exportado: new Date().toISOString(),
        clientes: state.clientes,
        pines: state.pines
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
            if (!data.clientes || !data.pines) throw new Error('Formato inválido');
            if (!confirm(`Importar ${data.pines.length} pines y ${data.clientes.length} clientes? Esto reemplazará los datos actuales.`)) return;
            state.clientes = data.clientes;
            state.pines = data.pines;
            state.filtros.clientes = state.clientes.map(c => c.id);
            guardarDatos();
            renderClientFilters();
            populateClientSelect();
            renderPines();
            actualizarContadores();
            toast('Datos importados correctamente', 'success');
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
