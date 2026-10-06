// ============================================================
// Vista de tabla
// ============================================================
// Lo que el mapa no puede dar: ver todo junto, ordenado y comparable.
// Respeta los mismos filtros del panel izquierdo, así lo que se ve acá
// es lo mismo que se ve pintado en el mapa.

const tabla = {
    orden: { campo: 'municipio', dir: 'asc' },

    columnas: [
        { id: 'municipio',   titulo: 'Municipio',   tipo: 'texto' },
        { id: 'sociedad',    titulo: 'Sociedad',    tipo: 'texto' },
        { id: 'estado',      titulo: 'Estado',      tipo: 'texto' },
        { id: 'fechaAlta',   titulo: 'Alta',        tipo: 'fecha' },
        { id: 'fechaVto',    titulo: 'Vence',       tipo: 'fecha' },
        { id: 'dias',        titulo: 'Días',        tipo: 'numero', ayuda: 'Días que faltan para el vencimiento. En negativo, días vencida.' },
        { id: 'monto',       titulo: 'Monto',       tipo: 'numero' },
        { id: 'notas',       titulo: 'Notas',       tipo: 'texto' },
        { id: 'cargadoPor',  titulo: 'Cargado por', tipo: 'texto' },
        { id: 'modificado',  titulo: 'Modificado',  tipo: 'fecha' }
    ],

    // Arma las filas desde el estado, ya resueltas a texto plano
    filas() {
        return state.inscripciones
            .filter(inscripcionPasaFiltros)
            .map(i => {
                const soc = state.clientes.find(c => c.id === i.clienteId);
                const dias = diasHastaVto(i);
                return {
                    _id: i.id,
                    _municipioId: i.municipioId,
                    _nivel: nivelVto(i),
                    municipio: i.municipioId ? nombreMunicipio(i.municipioId) : (i.partido || ''),
                    sociedad: soc ? soc.nombre : 'Sin sociedad',
                    _color: soc ? soc.color : '#94a3b8',
                    estado: textoEstado(i.estado),
                    _estadoId: i.estado,
                    fechaAlta: i.fechaAlta || '',
                    fechaVto: i.sinVto ? '' : (i.fechaVto || ''),
                    _sinVto: !!i.sinVto,
                    dias: dias,
                    monto: (i.monto === null || i.monto === undefined || i.monto === '') ? null : Number(i.monto),
                    notas: (i.notas || '').replace(/\s+/g, ' ').trim(),
                    _notasCompletas: i.notas || '',
                    cargadoPor: i.actualizadoPor || i.creadoPor || '',
                    modificado: i.actualizado || i.creado || ''
                };
            });
    },

    ordenar(filas) {
        const { campo, dir } = this.orden;
        const col = this.columnas.find(c => c.id === campo) || this.columnas[0];
        const signo = dir === 'asc' ? 1 : -1;

        return filas.slice().sort((a, b) => {
            let va = a[campo];
            let vb = b[campo];

            // Los vacíos siempre al final, ordenen como ordenen
            const aVacio = va === null || va === undefined || va === '';
            const bVacio = vb === null || vb === undefined || vb === '';
            if (aVacio && bVacio) return 0;
            if (aVacio) return 1;
            if (bVacio) return -1;

            if (col.tipo === 'numero') return (va - vb) * signo;
            if (col.tipo === 'fecha') return String(va).localeCompare(String(vb)) * signo;
            return String(va).localeCompare(String(vb), 'es', { sensitivity: 'base' }) * signo;
        });
    },

    render() {
        const cont = document.getElementById('tablaContenido');
        if (!cont) return;

        const filas = this.ordenar(this.filas());
        document.getElementById('tablaResumen').textContent =
            `${filas.length} ${filas.length === 1 ? 'inscripción' : 'inscripciones'}`;

        if (!filas.length) {
            cont.innerHTML = '<div class="empty-state">Ninguna inscripción con los filtros puestos. Probá destildando algún estado o sociedad en el panel.</div>';
            this.actualizarTotales([]);
            return;
        }

        const encabezados = this.columnas.map(c => {
            const activa = this.orden.campo === c.id;
            const flecha = activa ? (this.orden.dir === 'asc' ? '▲' : '▼') : '';
            return `<th data-col="${c.id}" class="${activa ? 'ordenada' : ''}"
                        ${c.ayuda ? `title="${escapeHtml(c.ayuda)}"` : ''}>
                        ${escapeHtml(c.titulo)} <span class="flecha">${flecha}</span>
                    </th>`;
        }).join('');

        const cuerpo = filas.map(f => `
            <tr data-id="${escapeHtml(f._id)}" data-municipio="${f._municipioId || ''}">
                <td class="col-municipio">${escapeHtml(f.municipio)}</td>
                <td><span class="tabla-punto" style="background:${f._color}"></span>${escapeHtml(f.sociedad)}</td>
                <td><span class="status-badge ${f._estadoId}">${escapeHtml(f.estado)}</span></td>
                <td class="col-fecha">${f.fechaAlta ? fechaLegible(f.fechaAlta) : '—'}</td>
                <td class="col-fecha">${f._sinVto ? '<span class="vto-badge sin">Sin vto.</span>' : (f.fechaVto ? fechaLegible(f.fechaVto) : '—')}</td>
                <td class="col-dias">${this.celdaDias(f)}</td>
                <td class="col-monto">${f.monto === null ? '—' : formatMonto(f.monto)}</td>
                <td class="col-notas" title="${escapeHtml(f._notasCompletas)}">${escapeHtml(f.notas) || '—'}</td>
                <td class="col-quien">${escapeHtml(f.cargadoPor) || '—'}</td>
                <td class="col-fecha">${f.modificado ? fechaLegible(String(f.modificado).slice(0, 10)) : '—'}</td>
                <td class="col-accion">
                    <button class="tabla-ir" title="Ver en el mapa">Ver</button>
                </td>
            </tr>
        `).join('');

        cont.innerHTML = `
            <table class="tabla-datos">
                <thead><tr>${encabezados}<th></th></tr></thead>
                <tbody>${cuerpo}</tbody>
            </table>
        `;

        cont.querySelectorAll('th[data-col]').forEach(th => {
            th.addEventListener('click', () => {
                const col = th.dataset.col;
                if (this.orden.campo === col) {
                    this.orden.dir = this.orden.dir === 'asc' ? 'desc' : 'asc';
                } else {
                    this.orden = { campo: col, dir: 'asc' };
                }
                this.render();
            });
        });

        cont.querySelectorAll('.tabla-ir').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const fila = e.target.closest('tr');
                const id = Number(fila.dataset.municipio);
                if (!id) { toast('Esta inscripción no tiene municipio asignado', 'warning'); return; }
                mostrarVista('mapa');
                irAPartido(id);
            });
        });

        this.actualizarTotales(filas);
    },

    celdaDias(f) {
        if (f._sinVto) return '—';
        if (f.dias === null) return '—';
        const clase = f._nivel && f._nivel !== 'vigente' ? f._nivel : 'vigente';
        const texto = f.dias < 0 ? `${Math.abs(f.dias)} vencida` : `${f.dias}`;
        return `<span class="vto-badge ${clase}">${texto}</span>`;
    },

    actualizarTotales(filas) {
        const conMonto = filas.filter(f => f.monto !== null);
        const total = conMonto.reduce((s, f) => s + f.monto, 0);
        const vencidas = filas.filter(f => f._nivel === 'vencido').length;
        const porVencer = filas.filter(f => f._nivel === 'critico').length;

        document.getElementById('tablaTotales').innerHTML = `
            <span class="tabla-total"><strong>${formatMonto(total) || '$ 0'}</strong> en ${conMonto.length} con monto</span>
            ${vencidas ? `<span class="tabla-total alerta"><strong>${vencidas}</strong> vencida${vencidas > 1 ? 's' : ''}</span>` : ''}
            ${porVencer ? `<span class="tabla-total aviso"><strong>${porVencer}</strong> vence${porVencer > 1 ? 'n' : ''} en 30 días</span>` : ''}
        `;
    },

    // ---------- Excel ----------
    // CSV con punto y coma y marca de codificación: Excel en español lo abre
    // de doble click, con los acentos bien y los montos como números.
    exportarExcel() {
        const filas = this.ordenar(this.filas());
        if (!filas.length) { toast('No hay nada para exportar con estos filtros', 'warning'); return; }

        const titulos = ['Municipio', 'Sociedad', 'Estado', 'Fecha de alta', 'Vence el',
                         'Días restantes', 'Monto', 'Notas', 'Cargado por', 'Última modificación'];

        const campo = (v) => {
            if (v === null || v === undefined) return '';
            const s = String(v);
            return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
        };

        const lineas = [titulos.join(';')];
        filas.forEach(f => {
            lineas.push([
                campo(f.municipio),
                campo(f.sociedad),
                campo(f.estado),
                campo(f.fechaAlta ? fechaLegible(f.fechaAlta) : ''),
                campo(f._sinVto ? 'Sin vencimiento' : (f.fechaVto ? fechaLegible(f.fechaVto) : '')),
                campo(f.dias === null ? '' : f.dias),
                // Coma decimal: así Excel en español lo toma como número
                campo(f.monto === null ? '' : String(f.monto).replace('.', ',')),
                campo(f._notasCompletas),
                campo(f.cargadoPor),
                campo(f.modificado ? fechaLegible(String(f.modificado).slice(0, 10)) : '')
            ].join(';'));
        });

        const BOM = '﻿';
        const blob = new Blob([BOM + lineas.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `mapa-comercial-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast(`${filas.length} filas descargadas`, 'success');
    }
};

// ---------- Cambio de vista ----------

function mostrarVista(cual) {
    // El panel del municipio es del mapa: fuera del mapa estorba
    if (cual !== 'mapa') cerrarPanel();

    document.querySelector('.map-container').style.display = cual === 'mapa' ? '' : 'none';
    document.getElementById('vistaTabla').style.display = cual === 'tabla' ? '' : 'none';
    document.getElementById('vistaTablero').style.display = cual === 'tablero' ? '' : 'none';
    document.getElementById('vistaHistorial').style.display = cual === 'historial' ? '' : 'none';

    document.querySelectorAll('.tab-vista').forEach(t => {
        t.classList.toggle('activa', t.dataset.vista === cual);
    });

    if (cual === 'mapa') setTimeout(() => map.invalidateSize(), 60);
    else if (cual === 'tabla') tabla.render();
    else if (cual === 'tablero') tablero.cargar();
    else if (cual === 'historial') historial.cargar();
}
