/**
 * Built-in content: exactly the texts and values the storefront shipped with before they became
 * editable. `GET /content` merges the stored values over these, so a section nobody edited (or a
 * field added later) renders these.
 *
 * Mirrored in frontend-cups/src/configs/content.defaults.ts, which the storefront uses when the
 * API cannot be reached. Keep both files identical (only the import and this comment differ).
 */
import type { SiteContent } from './content.types.js'

export const DEFAULT_SITE_CONTENT: SiteContent = {
    general: {
        brandName: 'Manada Russo Creativa',
        tagline: 'Sublimación hecha con amor',
        description:
            'Tazas, franelas y llaveros personalizados con sublimación. Tú mandas el diseño, nosotros lo hacemos realidad.',
        titleSuffix: 'Sublimación hecha con amor',
        metaDescription:
            'Tazas, franelas y llaveros personalizados con sublimación. Diseños 100% a tu medida, hechos a mano en Venezuela y con envío gratis desde {envioGratis}.',
        searchPlaceholder: 'Buscar tazas, franelas…',
    },
    announcements: {
        messages: [
            'Envío gratis desde {envioGratis}',
            'Diseños 100% personalizables',
            'Hecho a mano en Venezuela',
        ],
    },
    home: {
        heroBadge: 'Sublimación hecha con amor',
        heroTitle: 'Tazas, franelas y llaveros *que hablan* por ti',
        heroSubtitle:
            'Tú mandas la idea, nosotros la sublimamos. Piezas únicas para regalar, para tu marca o simplemente porque sí.',
        heroPrimaryCta: 'Explorar catálogo',
        heroSecondaryCta: 'Personalizar el mío',
        heroFeatures: ['100% personalizable', 'Envío nacional', 'Hecho a mano'],
        categoriesEyebrow: 'Qué hacemos',
        categoriesTitle: 'Elige tu *lienzo* favorito',
        categoriesDescription:
            '{categorias}, infinitas ideas. Todos se personalizan con tu texto, tu foto o tu logo.',
        featuredEyebrow: 'Los más pedidos',
        featuredTitle: 'Tus *favoritos*',
        featuredDescription: 'Los diseños que más salen de nuestro taller esta temporada.',
        featuredCta: 'Ver todo el catálogo',
        stepsEyebrow: 'Así de fácil',
        stepsTitle: '*Tres pasos* y listo',
        stepsDescription: 'Sin mínimos imposibles ni formularios eternos.',
        steps: [
            {
                title: 'Elige tu producto',
                description:
                    'Taza, franela o llavero. Escoge el modelo, el tamaño y el color que mejor va con tu idea.',
            },
            {
                title: 'Envía tu diseño',
                description:
                    'Mándanos tu foto, tu texto o tu logo por WhatsApp. Si no tienes arte, lo armamos contigo.',
            },
            {
                title: 'Lo sublimamos y enviamos',
                description:
                    'Producimos en 3 a 5 días hábiles y te lo llevamos a la puerta, listo para regalar.',
            },
        ],
        testimonialsEyebrow: 'Clientes felices',
        testimonialsTitle: 'Lo que *dicen* de nosotros',
        ctaBadge: 'Pedidos por mayor',
        ctaTitle: '¿Tienes una *idea* en mente?',
        ctaDescription:
            'Cuéntanos qué necesitas y te mandamos un boceto sin compromiso. Desde una pieza hasta cien.',
        ctaPrimary: 'Pedir mi diseño',
        ctaSecondary: 'Conócenos',
        newsletterTitle: 'Recibe ideas y descuentos',
        newsletterDescription: 'Un correo al mes con diseños nuevos y promos. Sin spam, prometido.',
    },
    about: {
        badge: 'Desde 2020',
        title: 'Un taller pequeño con *ideas grandes*',
        paragraphs: [
            '{marca} nació en una mesa de comedor con una prensa de segunda mano y muchas ganas. Hoy seguimos siendo un equipo chiquito, y eso es justo lo que nos permite cuidar cada pieza como si fuera para nuestra casa.',
            'Sublimamos en {ciudad} y enviamos a todo el país. Cada pedido pasa por una revisión de arte antes de entrar a la prensa, porque una taza mal centrada no se arregla después.',
        ],
        ctaLabel: 'Hablemos de tu idea',
        imageBadge: 'Taller propio',
        valuesEyebrow: 'Cómo trabajamos',
        valuesTitle: 'Lo que *no negociamos*',
        valuesDescription: 'Cuatro cosas que sostienen todo lo que sale del taller.',
        values: [
            {
                icon: 'palette',
                title: 'Diseño con criterio',
                description:
                    'Si tu idea no se va a ver bien sublimada, te lo decimos y te proponemos una alternativa.',
            },
            {
                icon: 'heart-handshake',
                title: 'Trato cercano',
                description:
                    'Hablas con la persona que produce tu pedido, no con un formulario ni con un bot.',
            },
            {
                icon: 'timer',
                title: 'Tiempos reales',
                description:
                    'Prometemos lo que podemos cumplir. Si algo se atrasa, te avisamos antes de que preguntes.',
            },
            {
                icon: 'leaf',
                title: 'Materiales que duran',
                description:
                    'Cerámica, algodón y acrílico probados en el taller antes de ofrecerlos en el catálogo.',
            },
        ],
        statsEyebrow: 'En números',
        statsTitle: 'El taller en *cifras*',
        stats: [
            { value: '+4.800', label: 'pedidos entregados' },
            { value: '6', label: 'años sublimando' },
            { value: '4.9', label: 'promedio de reseñas' },
            { value: '23', label: 'ciudades atendidas' },
        ],
    },
    contact: {
        email: 'hola@manadarusso.com',
        phone: '0414-5086536',
        whatsapp: '0414-5086536',
        city: 'Quíbor, estado Lara',
        schedule: 'Lunes a viernes, 9:00 a.m. – 6:00 p.m.',
        instagram: 'manadarussocreativa',
        tiktok: 'manadarussocreativa',
    },
    contactPage: {
        badge: 'Respondemos rápido',
        title: 'Cuéntanos qué quieres *sublimar*',
        intro: 'Un regalo, el uniforme del equipo o el detalle de tu evento. Escríbenos y armamos la propuesta contigo.',
        faqEyebrow: 'Dudas comunes',
        faqTitle: 'Preguntas *frecuentes*',
        faq: [
            {
                question: '¿Hay cantidad mínima de pedido?',
                answer: 'No. Hacemos desde una sola pieza. A partir de 12 unidades aplicamos precio por mayor.',
            },
            {
                question: 'No tengo el diseño listo, ¿me ayudan?',
                answer: 'Sí. Cuéntanos la idea y te preparamos una propuesta sin costo. Solo cobramos el arte si pides más de dos rondas de cambios.',
            },
            {
                question: '¿Cuánto tardan en producir?',
                answer: '{produccion}, contados desde que apruebas el boceto. Los pedidos grandes pueden tomar un poco más.',
            },
            {
                question: '¿Cómo funciona el envío?',
                answer: 'Envío gratis desde {envioGratis}. Por debajo de ese monto cobramos una tarifa plana y te enviamos el número de guía apenas sale el paquete.',
            },
        ],
    },
    shipping: {
        freeThreshold: 35,
        flatRate: 4,
        freeShippingCopy: 'Envío gratis desde {envioGratis}',
        productionCopy: 'Producción en 3 a 5 días hábiles',
    },
    /** Not shown on the storefront yet (checkout will use it); empty until the owner fills it. */
    payment: {
        bankCode: '',
        bankName: '',
        phone: '',
        idNumber: '',
        holderName: '',
        instructions: '',
    },
}
