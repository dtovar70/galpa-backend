import type { SeedCategory } from './types.js'

/** The store's categories. Array order = sortOrder. */
export const categories: SeedCategory[] = [
    {
        slug: 'aires-residenciales',
        name: 'Aires Residenciales',
        tagline: 'Confort para cada habitación',
        description:
            'Equipos split de pared de 9.000 a 24.000 BTU, convencionales e inverter, para habitaciones, salas y oficinas pequeñas.',
        colorHex: '#0B6FB8',
        icon: 'air-vent',
    },
    {
        slug: 'aires-comerciales',
        name: 'Aires Comerciales',
        tagline: 'Piso-techo, cassette y ductos',
        description:
            'Capacidad para locales, oficinas y espacios amplios: equipos piso-techo, cassette de cuatro vías y unidades para ductos.',
        colorHex: '#0F2537',
        icon: 'building-2',
    },
    {
        slug: 'repuestos',
        name: 'Repuestos',
        tagline: 'Mantén tus equipos funcionando',
        description:
            'Capacitores, compresores, tarjetas electrónicas, motores y controles para las marcas más comunes del mercado.',
        colorHex: '#3E8FCB',
        icon: 'wrench',
    },
    {
        slug: 'accesorios',
        name: 'Accesorios e Instalación',
        tagline: 'Todo para una instalación correcta',
        description:
            'Kits de tubería de cobre, gas refrigerante, bases y soportes, bombas de condensado y más materiales de instalación.',
        colorHex: '#7CC4EC',
        icon: 'package',
    },
]
