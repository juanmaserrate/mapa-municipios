// Datos iniciales del sistema
// Estos son los municipios y clientes pre-cargados.
// Los usuarios pueden agregar, editar o eliminar todo lo que quieran.

const MUNICIPIOS_BA = [
    { nombre: 'Almirante Brown', lat: -34.8333, lng: -58.3833 },
    { nombre: 'Avellaneda', lat: -34.6608, lng: -58.3656 },
    { nombre: 'Berazategui', lat: -34.7647, lng: -58.2096 },
    { nombre: 'Escobar', lat: -34.3486, lng: -58.7916 },
    { nombre: 'Esteban Echeverría', lat: -34.8500, lng: -58.4667 },
    { nombre: 'Ezeiza', lat: -34.8527, lng: -58.5236 },
    { nombre: 'Florencio Varela', lat: -34.8126, lng: -58.2750 },
    { nombre: 'General Pueyrredón (Mar del Plata)', lat: -38.0055, lng: -57.5426 },
    { nombre: 'Hurlingham', lat: -34.5908, lng: -58.6403 },
    { nombre: 'Ituzaingó', lat: -34.6553, lng: -58.6717 },
    { nombre: 'La Matanza', lat: -34.7706, lng: -58.6219 },
    { nombre: 'La Plata', lat: -34.9214, lng: -57.9544 },
    { nombre: 'Lanús', lat: -34.7065, lng: -58.3914 },
    { nombre: 'Lomas de Zamora', lat: -34.7607, lng: -58.4007 },
    { nombre: 'Luján', lat: -34.5703, lng: -59.1050 },
    { nombre: 'Marcos Paz', lat: -34.7811, lng: -58.8367 },
    { nombre: 'Mercedes', lat: -34.6515, lng: -59.4318 },
    { nombre: 'Moreno', lat: -34.6500, lng: -58.7833 },
    { nombre: 'Morón', lat: -34.6534, lng: -58.6198 },
    { nombre: 'Quilmes', lat: -34.7203, lng: -58.2632 },
    { nombre: 'San Fernando', lat: -34.4441, lng: -58.5598 },
    { nombre: 'San Isidro', lat: -34.4711, lng: -58.5121 },
    { nombre: 'San Miguel', lat: -34.5447, lng: -58.7128 },
    { nombre: 'Tigre', lat: -34.4264, lng: -58.5797 },
    { nombre: 'Vicente López', lat: -34.5267, lng: -58.4833 },
    // Organismos provinciales (con ubicación en CABA/La Plata)
    { nombre: 'PBAC / Provincia', lat: -34.9214, lng: -57.9544 },
    { nombre: 'BAC (Buenos Aires Compras)', lat: -34.9100, lng: -57.9544 },
    { nombre: 'COMPR.AR', lat: -34.6037, lng: -58.3816 },
    { nombre: 'Sicoense (Corrientes)', lat: -27.4691, lng: -58.8306 }
];

// Clientes iniciales (extraídos de la planilla)
const CLIENTES_INICIALES = [
    { id: 'r14', nombre: 'R 14', color: '#6366f1' },
    { id: 'ailiel', nombre: 'AILIEL', color: '#8b5cf6' },
    { id: 'pisabalun', nombre: 'PISABALUN', color: '#ec4899' },
    { id: 'villa-reyes', nombre: 'VILLA DE REYES', color: '#f97316' }
];

// Pines iniciales pre-cargados basados en la planilla
// Estados: 'inscripto', 'concursando', 'no-inscripto'
const PINES_INICIALES = [
    // R 14 - inscripto en muchos municipios
    { municipio: 'Almirante Brown', clienteId: 'r14', estado: 'inscripto' },
    { municipio: 'Quilmes', clienteId: 'r14', estado: 'inscripto' },
    { municipio: 'Moreno', clienteId: 'r14', estado: 'inscripto' },
    { municipio: 'Luján', clienteId: 'r14', estado: 'inscripto' },
    { municipio: 'Lanús', clienteId: 'r14', estado: 'inscripto' },
    { municipio: 'General Pueyrredón (Mar del Plata)', clienteId: 'r14', estado: 'inscripto' },
    { municipio: 'Esteban Echeverría', clienteId: 'r14', estado: 'inscripto' },
    { municipio: 'PBAC / Provincia', clienteId: 'r14', estado: 'inscripto' },
    { municipio: 'Lomas de Zamora', clienteId: 'r14', estado: 'inscripto' },
    { municipio: 'Avellaneda', clienteId: 'r14', estado: 'inscripto' },
    { municipio: 'Hurlingham', clienteId: 'r14', estado: 'inscripto' },
    { municipio: 'Berazategui', clienteId: 'r14', estado: 'inscripto' },
    { municipio: 'Sicoense (Corrientes)', clienteId: 'r14', estado: 'inscripto' },
    { municipio: 'Florencio Varela', clienteId: 'r14', estado: 'inscripto' },
    { municipio: 'San Isidro', clienteId: 'r14', estado: 'inscripto' },
    { municipio: 'BAC (Buenos Aires Compras)', clienteId: 'r14', estado: 'inscripto' },
    { municipio: 'COMPR.AR', clienteId: 'r14', estado: 'inscripto' },
    { municipio: 'Escobar', clienteId: 'r14', estado: 'inscripto' },

    // AILIEL
    { municipio: 'Almirante Brown', clienteId: 'ailiel', estado: 'inscripto' },
    { municipio: 'Quilmes', clienteId: 'ailiel', estado: 'inscripto' },
    { municipio: 'Luján', clienteId: 'ailiel', estado: 'inscripto', descripcion: 'Ombu 1269' },
    { municipio: 'Lanús', clienteId: 'ailiel', estado: 'inscripto', descripcion: '2504' },
    { municipio: 'PBAC / Provincia', clienteId: 'ailiel', estado: 'inscripto', descripcion: 'Ombu 1269' },

    // PISABALUN
    { municipio: 'Almirante Brown', clienteId: 'pisabalun', estado: 'no-inscripto' },
    { municipio: 'Quilmes', clienteId: 'pisabalun', estado: 'no-inscripto' },

    // VILLA DE REYES
    { municipio: 'Almirante Brown', clienteId: 'villa-reyes', estado: 'no-inscripto' },
    { municipio: 'Quilmes', clienteId: 'villa-reyes', estado: 'no-inscripto' }
];
