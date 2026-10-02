/**
 * Built-in content. `GET /content` merges the stored values over these, so a section nobody
 * edited (or a field added later) renders these. Contact details are placeholders the owner
 * replaces from the admin panel.
 *
 * Mirrored in frontend-galpa/src/configs/content.defaults.ts, which the storefront uses when the
 * API cannot be reached. Keep both files identical (only the import and this comment differ).
 */
import type { SiteContent } from './content.types.js'

export const DEFAULT_SITE_CONTENT: SiteContent = {
    general: {
        brandName: 'Corporación Galpa 2022 C.A.',
        tagline: '30 años climatizando tus espacios',
        description:
            'Aires acondicionados residenciales y comerciales, repuestos y accesorios. Te asesoramos para elegir el equipo ideal para tu espacio.',
        titleSuffix: '30 años climatizando tus espacios',
        metaDescription:
            'Aires acondicionados split, piso-techo y cassette, repuestos y accesorios de las mejores marcas. Asesoría personalizada, equipos en stock y bajo pedido, envío gratis desde {envioGratis}.',
        searchPlaceholder: 'Buscar equipos, marcas, repuestos…',
    },
    home: {
        heroBadge: '30 años de experiencia',
        heroTitle: 'El clima ideal para tu *hogar* y tu *negocio*',
        heroSubtitle:
            'Aires acondicionados de las mejores marcas, repuestos originales y accesorios de instalación. Te ayudamos a elegir el equipo correcto para tu espacio.',
        heroPrimaryCta: 'Ver equipos',
        heroSecondaryCta: 'Pedir asesoría',
        heroFeatures: ['Marcas reconocidas', 'Equipos en stock y bajo pedido', 'Asesoría experta'],
        categoriesEyebrow: 'Lo que ofrecemos',
        categoriesTitle: 'Todo para *climatizar* tus espacios',
        categoriesDescription:
            '{categorias} pensadas para hogares, oficinas y comercios. Equipos nuevos, repuestos y todo lo necesario para la instalación.',
        featuredEyebrow: 'Los más vendidos',
        featuredTitle: 'Equipos *destacados*',
        featuredDescription: 'Los modelos que más eligen nuestros clientes esta temporada.',
        featuredCta: 'Ver todo el catálogo',
        stepsEyebrow: 'Cómo comprar',
        stepsTitle: 'Tu equipo en *tres pasos*',
        stepsDescription: 'Te acompañamos desde la elección hasta la entrega.',
        steps: [
            {
                title: 'Elige o pide asesoría',
                description:
                    'Filtra por capacidad, voltaje o marca. Si tienes dudas, cuéntanos el tamaño de tu espacio y te recomendamos el equipo ideal.',
            },
            {
                title: 'Paga como prefieras',
                description:
                    'Pago Móvil, transferencia, Zelle o Binance. Verificamos tu pago y te mantenemos al tanto por correo y WhatsApp.',
            },
            {
                title: 'Recibe o retira',
                description:
                    'Despachamos tu pedido o lo retiras en tienda. Los equipos bajo pedido llegan en el plazo indicado en cada ficha.',
            },
        ],
        testimonialsEyebrow: 'Clientes satisfechos',
        testimonialsTitle: 'Lo que *dicen* de nosotros',
        testimonials: [],
        ctaBadge: 'Proyectos comerciales',
        ctaTitle: '¿Necesitas climatizar un *local* u *oficina*?',
        ctaDescription:
            'Cuéntanos los metros de tu espacio y te enviamos una cotización a la medida, con equipos, materiales e instalación.',
        ctaPrimary: 'Solicitar cotización',
        ctaSecondary: 'Conócenos',
    },
    about: {
        badge: '30 años de experiencia',
        title: 'Tres décadas *climatizando* Venezuela',
        paragraphs: [
            '{marca} reúne 30 años de experiencia en la venta de aires acondicionados, repuestos y accesorios. Conocemos los equipos por dentro, y por eso podemos recomendarte el que de verdad necesitas.',
            'Atendemos hogares, oficinas y comercios desde {ciudad}. Trabajamos con marcas reconocidas, mantenemos equipos en stock y conseguimos bajo pedido lo que no tengamos a mano.',
        ],
        ctaLabel: 'Pide tu asesoría',
        imageBadge: 'Asesoría personalizada',
        valuesEyebrow: 'Cómo trabajamos',
        valuesTitle: 'Lo que nos *distingue*',
        valuesDescription: 'Cuatro compromisos que mantenemos con cada cliente.',
        values: [
            {
                icon: 'air-vent',
                title: 'El equipo correcto',
                description:
                    'Calculamos la capacidad según tu espacio para que no gastes de más ni te quedes corto.',
            },
            {
                icon: 'heart-handshake',
                title: 'Trato cercano',
                description:
                    'Te atiende una persona que conoce los equipos, antes, durante y después de tu compra.',
            },
            {
                icon: 'shield-check',
                title: 'Garantía real',
                description:
                    'Equipos nuevos con garantía del fabricante y respaldo directo de nuestro equipo.',
            },
            {
                icon: 'wrench',
                title: 'Repuestos a mano',
                description:
                    'Capacitores, tarjetas, motores y más para mantener tus equipos funcionando.',
            },
        ],
        statsEyebrow: 'En números',
        statsTitle: 'Nuestra trayectoria en *cifras*',
        stats: [
            { value: '30', label: 'años de experiencia' },
            { value: '+10.000', label: 'equipos vendidos' },
            { value: '+15', label: 'marcas disponibles' },
        ],
    },
    contact: {
        email: 'ventas@galpa.com.ve',
        phone: '0414-0000000',
        whatsapp: '0414-0000000',
        city: 'Dirección por configurar',
        schedule: 'Lunes a viernes, 8:00 a.m. – 5:00 p.m.',
        instagram: 'galpa2022',
        tiktok: 'galpa2022',
    },
    contactPage: {
        badge: 'Asesoría sin compromiso',
        title: 'Cuéntanos qué espacio quieres *climatizar*',
        intro: 'Tu casa, tu oficina o tu local. Escríbenos con los metros y el uso del espacio y te recomendamos el equipo ideal.',
        faqEyebrow: 'Dudas comunes',
        faqTitle: 'Preguntas *frecuentes*',
        faq: [
            {
                question: '¿Qué capacidad de aire necesito?',
                answer: 'Depende de los metros, la orientación y el uso del espacio. Como guía, un cuarto de 12 a 15 m² suele necesitar 12.000 BTU. Escríbenos y te ayudamos a calcularlo.',
            },
            {
                question: '¿Ofrecen instalación?',
                answer: 'Sí. Al hacer tu pedido puedes indicar que deseas instalación y te contactamos para coordinar la visita y el presupuesto.',
            },
            {
                question: '¿Los equipos tienen garantía?',
                answer: 'Todos los equipos son nuevos y tienen la garantía del fabricante. Conserva tu comprobante de compra, lo necesitarás para cualquier reclamo.',
            },
            {
                question: '¿Qué significa «bajo pedido»?',
                answer: 'Son productos que pedimos al proveedor cuando haces tu compra. En cada ficha verás el tiempo estimado de llegada y te avisamos apenas estén en nuestro almacén.',
            },
            {
                question: '¿Qué métodos de pago aceptan?',
                answer: 'Pago Móvil y transferencia en bolívares a la tasa BCV del día, y Zelle o Binance en dólares. Verificamos tu pago y te confirmamos por correo.',
            },
            {
                question: '¿Cuándo despachan mi pedido?',
                answer: '{despacho}, una vez verificado el pago. El envío es gratis desde {envioGratis}; por debajo de ese monto cobramos una tarifa de {tarifaEnvio}.',
            },
        ],
    },
    shipping: {
        freeThreshold: 300,
        flatRate: 10,
        freeShippingCopy: 'Envío gratis desde {envioGratis}',
        dispatchCopy: 'Despachamos en 24 a 48 horas hábiles',
    },
    /** Every method starts disabled and empty until the owner fills in its details. */
    payment: {
        instructions: '',
        pagoMovil: {
            enabled: false,
            bankCode: '',
            bankName: '',
            phone: '',
            idNumber: '',
            holderName: '',
        },
        transfer: {
            enabled: false,
            bankCode: '',
            bankName: '',
            accountNumber: '',
            accountType: 'CORRIENTE',
            idNumber: '',
            holderName: '',
        },
        zelle: { enabled: false, email: '', holderName: '' },
        binance: { enabled: false, payId: '', email: '', holderName: '' },
    },
}
