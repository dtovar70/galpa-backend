import type { SeedCategory } from './types.js'

/**
 * Copied from frontend-cups/src/mock/data/categories.data.ts. PALETTE references were
 * resolved to their hex values (blush300, sky300, lilac400). Array order = sortOrder.
 */
export const categories: SeedCategory[] = [
    {
        slug: 'mugs',
        name: 'Tazas',
        tagline: 'Tu mañana, con tu diseño',
        description:
            'Cerámica sublimada a 180 °C: el diseño queda fundido en la taza, así que aguanta microondas, lavavajillas y años de café.',
        colorHex: '#FFB3D1',
    },
    {
        slug: 'tees',
        name: 'Franelas',
        tagline: 'Se pone y se nota',
        description:
            'Algodón suave con estampado que no se agrieta ni se despega. Cortes unisex, crop y oversize, de la talla S a la XXL.',
        colorHex: '#A8D8FF',
    },
    {
        slug: 'keychains',
        name: 'Llaveros',
        tagline: 'El detalle que se lleva puesto',
        description:
            'Acrílico, madera o metal con tu nombre, tu foto o tu mascota. El regalo pequeño que siempre termina en las llaves de todos.',
        colorHex: '#C0AEFF',
    },
]
