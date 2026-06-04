// Datos iniciales del sistema

// Sociedades iniciales
const CLIENTES_INICIALES = [
    { id: 'r14', nombre: 'R 14', color: '#6366f1' },
    { id: 'ailiel', nombre: 'AILIEL', color: '#8b5cf6' },
    { id: 'pisabalun', nombre: 'PISABALUN', color: '#ec4899' },
    { id: 'villa-reyes', nombre: 'VILLA DE REYES', color: '#f97316' }
];

// Inscripciones iniciales (sociedad + partido + estado)
// Estados: 'inscripto', 'por-iniciar', 'no-inscripto'
// Partidos NO coloreables: PBAC (excluido)
const INSCRIPCIONES_INICIALES = [
    // R 14
    { partido: 'Almirante Brown', clienteId: 'r14', estado: 'inscripto' },
    { partido: 'Quilmes', clienteId: 'r14', estado: 'inscripto' },
    { partido: 'Moreno', clienteId: 'r14', estado: 'inscripto' },
    { partido: 'Lujan', clienteId: 'r14', estado: 'inscripto' },
    { partido: 'Lanus', clienteId: 'r14', estado: 'inscripto' },
    { partido: 'General Pueyrredon', clienteId: 'r14', estado: 'inscripto' },
    { partido: 'Esteban Echeverria', clienteId: 'r14', estado: 'inscripto' },
    { partido: 'Lomas de Zamora', clienteId: 'r14', estado: 'inscripto' },
    { partido: 'Avellaneda', clienteId: 'r14', estado: 'inscripto' },
    { partido: 'Hurlingham', clienteId: 'r14', estado: 'inscripto' },
    { partido: 'Berazategui', clienteId: 'r14', estado: 'inscripto' },
    { partido: 'Florencio Varela', clienteId: 'r14', estado: 'inscripto' },
    { partido: 'San Isidro', clienteId: 'r14', estado: 'inscripto' },
    { partido: 'Escobar', clienteId: 'r14', estado: 'inscripto' },
    { partido: 'CABA', clienteId: 'r14', estado: 'inscripto' },
    { partido: 'Presidente Peron', clienteId: 'r14', estado: 'por-iniciar' },
    { partido: 'Ezeiza', clienteId: 'r14', estado: 'por-iniciar' },
    { partido: 'Vicente Lopez', clienteId: 'r14', estado: 'por-iniciar' },
    { partido: 'San Miguel', clienteId: 'r14', estado: 'por-iniciar' },

    // AILIEL
    { partido: 'Almirante Brown', clienteId: 'ailiel', estado: 'inscripto' },
    { partido: 'Quilmes', clienteId: 'ailiel', estado: 'inscripto' },
    { partido: 'Lujan', clienteId: 'ailiel', estado: 'inscripto', descripcion: 'Ombu 1269' },
    { partido: 'Lanus', clienteId: 'ailiel', estado: 'inscripto', descripcion: '2504' },

    // PISABALUN
    { partido: 'Almirante Brown', clienteId: 'pisabalun', estado: 'no-inscripto' },
    { partido: 'Quilmes', clienteId: 'pisabalun', estado: 'no-inscripto' },

    // VILLA DE REYES
    { partido: 'Almirante Brown', clienteId: 'villa-reyes', estado: 'no-inscripto' },
    { partido: 'Quilmes', clienteId: 'villa-reyes', estado: 'no-inscripto' }
];

// Partidos donde NO mostrar pin ni colorear (entidades organizacionales)
const PARTIDOS_EXCLUIDOS = ['pbac', 'pbac / provincia', 'bac', 'compr.ar', 'sicoense'];
