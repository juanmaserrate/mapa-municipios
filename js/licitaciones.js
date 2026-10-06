// ============================================================
// Licitaciones
// ============================================================
// Cada proceso es un registro propio: expediente, fechas, montos,
// resultado y competidores. En un municipio puede haber muchas, y se
// repiten todos los años.

const ESTADOS_LICITACION = [
    { id: 'oportunidad',    texto: 'Oportunidad',    ayuda: 'La vimos, todavía no hicimos nada' },
    { id: 'en-preparacion', texto: 'En preparación', ayuda: 'Estamos armando la oferta' },
    { id: 'presentada',     texto: 'Presentada',     ayuda: 'Ya ofertamos' },
    { id: 'en-evaluacion',  texto: 'En evaluación',  ayuda: 'Esperando el resultado' },
    { id: 'ganada',         texto: 'Ganada',         ayuda: 'Nos la adjudicaron' },
    { id: 'perdida',        texto: 'Perdida',        ayuda: 'Se la dieron a otro' },
    { id: 'desierta',       texto: 'Desierta',       ayuda: 'No se adjudicó a nadie' },
    { id: 'desistida',      texto: 'Desistida',      ayuda: 'Decidimos no presentarnos' },
    { id: 'a-clasificar',   texto: 'A clasificar',   ayuda: 'Monto que venía del mapa anterior, falta ordenarlo' }
];

function textoEstadoLic(id) {
    const e = ESTADOS_LICITACION.find(x => x.id === id);
    return e ? e.texto : id;
}

// Los estados que todavía pueden dar plata
const ESTADOS_VIVOS = ['oportunidad', 'en-preparacion', 'presentada', 'en-evaluacion'];

const licitaciones = {
    lista: [],
    editandoId: null,
    competidoresTemp: [],

    async cargar() {
        if (!modoServidor) { this.lista = []; return; }
        try {
            this.lista = await api.leerLicitaciones();
        } catch (e) {
            console.warn('[licitaciones] no se pudieron leer:', e.message);
            this.lista = [];
        }
    },

    deMunicipio(municipioId) {
        return this.lista
            .filter(l => l.municipioId === municipioId)
            .sort((a, b) => String(b.fechaApertura || b.creado || '').localeCompare(String(a.fechaApertura || a.creado || '')));
    },

    aClasificar() {
        return this.lista.filter(l => l.estadoProceso === 'a-clasificar');
    },

    // ---------- Panel del municipio ----------

    renderEnPanel(municipioId) {
        const cont = document.getElementById('licitacionesList');
        if (!cont) return;

        if (!modoServidor) {
            cont.innerHTML = '<div class="empty-state">Las licitaciones necesitan el servidor.</div>';
            return;
        }

        const lics = this.deMunicipio(municipioId);
        if (!lics.length) {
            cont.innerHTML = '<div class="empty-state">Sin licitaciones cargadas en este municipio.</div>';
            return;
        }

        cont.innerHTML = lics.map(l => {
            const socs = l.sociedades
                .map(sid => (state.clientes.find(c => c.id === sid) || {}))
                .filter(s => s.nombre);
            const esUte = socs.length > 1;
            return `
                <div class="lic-card" data-id="${escapeHtml(l.id)}">
                    <div class="lic-top">
                        <span class="lic-estado ${l.estadoProceso}">${escapeHtml(textoEstadoLic(l.estadoProceso))}</span>
                        ${l.expediente ? `<span class="lic-exp">${escapeHtml(l.expediente)}</span>` : ''}
                    </div>
                    <div class="lic-objeto">${escapeHtml(l.objeto)}</div>
                    <div class="lic-chips">
                        ${socs.map(s => `<span class="lic-soc"><span class="tabla-punto" style="background:${s.color}"></span>${escapeHtml(s.nombre)}</span>`).join('')}
                        ${esUte ? '<span class="lic-ute">UTE</span>' : ''}
                        ${l.fechaApertura ? `<span class="meta-chip">Abre ${fechaLegible(l.fechaApertura)}</span>` : ''}
                        ${l.montoOfertado !== null ? `<span class="monto-badge">Ofertado ${formatMonto(l.montoOfertado)}</span>` : ''}
                        ${l.montoAdjudicado !== null ? `<span class="monto-badge adjudicado">Adjudicado ${formatMonto(l.montoAdjudicado)}</span>` : ''}
                    </div>
                    ${l.competidores.length ? `<div class="lic-competidores">${l.competidores.length} competidor${l.competidores.length > 1 ? 'es' : ''} registrado${l.competidores.length > 1 ? 's' : ''}</div>` : ''}
                    <button class="btn-secondary lic-editar">Editar</button>
                </div>
            `;
        }).join('');

        cont.querySelectorAll('.lic-editar').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.abrirModal(e.target.closest('.lic-card').dataset.id);
            });
        });
    },

    // ---------- Modal ----------

    abrirModal(id = null) {
        if (!puedeEditar()) return;
        this.editandoId = id;
        const l = id ? this.lista.find(x => x.id === id) : null;

        document.getElementById('modalLicitacionTitle').textContent =
            l ? 'Editar licitación' : `Nueva licitación · ${state.selectedPartido}`;

        // Estados
        const selEstado = document.getElementById('licEstado');
        selEstado.innerHTML = ESTADOS_LICITACION
            .filter(e => e.id !== 'a-clasificar' || (l && l.estadoProceso === 'a-clasificar'))
            .map(e => `<option value="${e.id}" title="${escapeHtml(e.ayuda)}">${escapeHtml(e.texto)}</option>`)
            .join('');
        selEstado.value = l ? l.estadoProceso : 'oportunidad';

        // Sociedades: casillas, porque pueden ser varias (UTE)
        const contSoc = document.getElementById('licSociedades');
        contSoc.innerHTML = state.clientes.map(c => `
            <label class="lic-soc-check">
                <input type="checkbox" value="${escapeHtml(c.id)}" ${l && l.sociedades.includes(c.id) ? 'checked' : ''}>
                <span class="tabla-punto" style="background:${c.color}"></span>
                ${escapeHtml(c.nombre)}
            </label>
        `).join('');

        const v = (campo, valor) => { document.getElementById(campo).value = valor || ''; };
        v('licExpediente', l && l.expediente);
        v('licObjeto', l && l.objeto);
        v('licTipo', l && l.tipo);
        v('licFechaPublicacion', l && l.fechaPublicacion);
        v('licFechaApertura', l && l.fechaApertura);
        v('licFechaResultado', l && l.fechaResultado);
        v('licPresupuesto', l && l.montoPresupuesto !== null && l.montoPresupuesto !== undefined ? Number(l.montoPresupuesto).toLocaleString('es-AR', { maximumFractionDigits: 0 }) : '');
        v('licOfertado', l && l.montoOfertado !== null && l.montoOfertado !== undefined ? Number(l.montoOfertado).toLocaleString('es-AR', { maximumFractionDigits: 0 }) : '');
        v('licAdjudicado', l && l.montoAdjudicado !== null && l.montoAdjudicado !== undefined ? Number(l.montoAdjudicado).toLocaleString('es-AR', { maximumFractionDigits: 0 }) : '');
        v('licPlazo', l && l.plazoMeses);
        v('licNotas', l && l.notas);

        this.competidoresTemp = l ? l.competidores.map(c => ({ ...c })) : [];
        this.renderCompetidores();

        document.getElementById('btnBorrarLicitacion').style.display = l ? '' : 'none';
        document.getElementById('modalLicitacion').style.display = 'flex';
        document.getElementById('licitacionForm').scrollTop = 0;
    },

    cerrarModal() {
        document.getElementById('modalLicitacion').style.display = 'none';
        this.editandoId = null;
        this.competidoresTemp = [];
    },

    renderCompetidores() {
        const cont = document.getElementById('licCompetidores');
        cont.innerHTML = this.competidoresTemp.map((c, idx) => `
            <div class="comp-fila" data-idx="${idx}">
                <input type="text" class="comp-nombre" value="${escapeHtml(c.nombre || '')}" placeholder="Nombre del competidor">
                <input type="text" class="comp-monto" value="${c.montoOfertado !== null && c.montoOfertado !== undefined ? Number(c.montoOfertado).toLocaleString('es-AR', { maximumFractionDigits: 0 }) : ''}" placeholder="Cuánto ofertó" inputmode="numeric">
                <select class="comp-resultado">
                    <option value="participo" ${c.resultado === 'participo' ? 'selected' : ''}>Participó</option>
                    <option value="gano" ${c.resultado === 'gano' ? 'selected' : ''}>Ganó</option>
                    <option value="perdio" ${c.resultado === 'perdio' ? 'selected' : ''}>Perdió</option>
                </select>
                <button type="button" class="comp-quitar" title="Quitar">×</button>
            </div>
        `).join('') || '<div class="comp-vacio">Sin competidores cargados</div>';

        cont.querySelectorAll('.comp-quitar').forEach(b => {
            b.addEventListener('click', (e) => {
                this.leerCompetidoresDelFormulario();
                this.competidoresTemp.splice(Number(e.target.closest('.comp-fila').dataset.idx), 1);
                this.renderCompetidores();
            });
        });
    },

    leerCompetidoresDelFormulario() {
        const filas = document.querySelectorAll('#licCompetidores .comp-fila');
        this.competidoresTemp = Array.from(filas).map((f, idx) => ({
            id: this.competidoresTemp[idx] ? this.competidoresTemp[idx].id : undefined,
            nombre: f.querySelector('.comp-nombre').value.trim(),
            montoOfertado: parseMonto(f.querySelector('.comp-monto').value),
            resultado: f.querySelector('.comp-resultado').value,
            notas: ''
        })).filter(c => c.nombre);
    },

    agregarCompetidor() {
        this.leerCompetidoresDelFormulario();
        this.competidoresTemp.push({ nombre: '', montoOfertado: null, resultado: 'participo', notas: '' });
        this.renderCompetidores();
        const ultimo = document.querySelector('#licCompetidores .comp-fila:last-child .comp-nombre');
        if (ultimo) ultimo.focus();
    },

    async guardar(e) {
        e.preventDefault();
        if (!puedeEditar()) return;

        const objeto = document.getElementById('licObjeto').value.trim();
        if (!objeto) { toast('Poné al menos el objeto de la licitación', 'error'); return; }

        this.leerCompetidoresDelFormulario();

        const existente = this.editandoId ? this.lista.find(x => x.id === this.editandoId) : null;
        const cuerpo = {
            id: this.editandoId || undefined,
            municipioId: existente ? existente.municipioId : state.selectedMunicipioId,
            sociedades: Array.from(document.querySelectorAll('#licSociedades input:checked')).map(i => i.value),
            expediente: document.getElementById('licExpediente').value.trim(),
            objeto,
            tipo: document.getElementById('licTipo').value.trim(),
            estadoProceso: document.getElementById('licEstado').value,
            fechaPublicacion: document.getElementById('licFechaPublicacion').value,
            fechaApertura: document.getElementById('licFechaApertura').value,
            fechaResultado: document.getElementById('licFechaResultado').value,
            montoPresupuesto: parseMonto(document.getElementById('licPresupuesto').value),
            montoOfertado: parseMonto(document.getElementById('licOfertado').value),
            montoAdjudicado: parseMonto(document.getElementById('licAdjudicado').value),
            plazoMeses: document.getElementById('licPlazo').value ? Number(document.getElementById('licPlazo').value) : null,
            notas: document.getElementById('licNotas').value.trim(),
            competidores: this.competidoresTemp
        };

        try {
            await api.guardarLicitacion(cuerpo);
        } catch (err) {
            toast('No se pudo guardar: ' + err.message, 'error');
            return;
        }

        await this.cargar();
        this.cerrarModal();
        if (state.selectedMunicipioId) this.renderEnPanel(state.selectedMunicipioId);
        actualizarMontos();
        actualizarAvisoClasificar();
        refrescarPartidos();
        toast('Licitación guardada', 'success');
    },

    async borrar() {
        if (!this.editandoId || !puedeEditar()) return;
        if (!confirm('¿Eliminar esta licitación? También se borran sus competidores.')) return;
        try {
            await api.borrarLicitacion(this.editandoId);
        } catch (err) {
            toast('No se pudo eliminar: ' + err.message, 'error');
            return;
        }
        await this.cargar();
        this.cerrarModal();
        if (state.selectedMunicipioId) this.renderEnPanel(state.selectedMunicipioId);
        actualizarMontos();
        actualizarAvisoClasificar();
        toast('Licitación eliminada', 'success');
    },

    // ---------- Totales para el panel izquierdo ----------

    totales() {
        let ofertadoVivo = 0, adjudicado = 0, hayUte = false;
        const porSociedad = {};
        this.lista.forEach(l => {
            if (l.sociedades.length > 1) hayUte = true;
            if (ESTADOS_VIVOS.includes(l.estadoProceso) && l.montoOfertado) {
                ofertadoVivo += Number(l.montoOfertado);
                // En una UTE el monto se cuenta entero para cada sociedad: las dos
                // participan del mismo contrato. Por eso el detalle puede sumar mas
                // que el total, y se aclara abajo del desglose.
                l.sociedades.forEach(s => { porSociedad[s] = (porSociedad[s] || 0) + Number(l.montoOfertado); });
            }
            if (l.estadoProceso === 'ganada' && l.montoAdjudicado) {
                adjudicado += Number(l.montoAdjudicado);
            }
        });
        return { ofertadoVivo, adjudicado, porSociedad, hayUte, cantidad: this.lista.length };
    }
};
