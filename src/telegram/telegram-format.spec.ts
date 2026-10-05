import {
    contactMessage,
    contactWhatsAppGreeting,
    escapeHtml,
    itemLines,
    newOrderMessage,
    orderSummaryMessage,
    formatCaracasDateTime,
    formatCaracasTime,
    formatDay,
    paymentMessage,
    rateSyncFailingMessage,
    rateSyncRecoveredMessage,
    TELEGRAM_TEXT_LIMIT,
    truncate,
    visibleLength,
    type PaymentMessageData,
} from './telegram-format.js'

const DATA: PaymentMessageData = {
    code: 'GP-000012',
    customerName: 'Ana & <Co>',
    customerPhone: '0414-1234567',
    items: Array.from({ length: 8 }, (_, index) => ({
        quantity: index + 1,
        productName: `Split <${index}>`,
        variantLabel: index === 0 ? '220V' : null,
        productId: `p${index}`,
        stockMode: index === 0 ? ('ON_ORDER' as const) : ('STOCK' as const),
    })),
    totalUsd: 1234.5,
    totalBs: 1054853.41,
    exchangeRate: 854.4637,
    stockConflict: null,
    payment: {
        methodLabel: 'Pago Móvil',
        currency: 'VES',
        reference: '00123456',
        payerBankCode: '0102',
        payerBankName: 'Banco de Venezuela',
        payerPhone: '0414-1234567',
        payerIdNumber: 'V-12345678',
        payerName: null,
        payerAccount: null,
        paidOn: '2026-09-25',
        amount: 1054853.41,
        expected: 1054853.41,
        duplicateReference: false,
        late: false,
        source: 'customer',
        recordedByName: null,
        hasProof: true,
    },
    adminUrl: 'https://galpa.com.ve/admin/pedidos/GP-000012',
}

describe('telegram-format', () => {
    it('escapes HTML and truncates by characters', () => {
        expect(escapeHtml('<b>"A" & B</b>')).toBe('&lt;b&gt;&quot;A&quot; &amp; B&lt;/b&gt;')
        expect(truncate('  abcdef  ', 4)).toBe('abc…')
        expect(truncate('❄️❄️', 4)).toBe('❄️❄️')
        expect(visibleLength('<b>a &amp; b</b>')).toBe(5)
    })

    it('marks the lines sold "bajo pedido" (never a free-text line)', () => {
        const [stock, onOrder, free] = itemLines([
            {
                quantity: 1,
                productName: 'Capacitor',
                variantLabel: null,
                productId: 'p1',
                stockMode: 'STOCK',
            },
            {
                quantity: 2,
                productName: 'Split',
                variantLabel: '220V',
                productId: 'p2',
                stockMode: 'ON_ORDER',
            },
            {
                quantity: 1,
                productName: 'Instalación',
                variantLabel: null,
                productId: null,
                stockMode: 'ON_ORDER',
            },
        ])
        expect(stock).toBe('• 1 × Capacitor')
        expect(onOrder).toBe('• 2 × Split (220V) · <i>bajo pedido</i>')
        expect(free).toBe('• 1 × Instalación')
    })

    it('formats Caracas dates and times', () => {
        const date = new Date('2026-09-25T19:05:00Z')
        expect(formatCaracasTime(date)).toBe('3:05 p. m.')
        expect(formatCaracasDateTime(date)).toBe('25/09/2026, 3:05 p. m.')
        expect(formatCaracasTime(new Date('2026-09-25T04:30:00Z'))).toBe('12:30 a. m.')
        expect(formatDay('2026-09-05')).toBe('05/09/2026')
    })

    it('renders the payment with escaped customer text, money and capped items', () => {
        const text = paymentMessage(DATA)
        expect(text).toContain('🧾 <b>Nuevo pago por verificar</b> · <b>GP-000012</b>')
        expect(text).toContain('Ana &amp; &lt;Co&gt;')
        expect(text).toContain('• 1 × Split &lt;0&gt; (220V) · <i>bajo pedido</i>')
        expect(text).toContain('…y 2 artículos más')
        expect(text).not.toContain('Split &lt;6&gt;')
        expect(text).toContain('💳 <b>Pago Móvil</b>')
        expect(text).toContain('$1.234,50 · Bs. 1.054.853,41')
        expect(text).toContain('Tasa BCV 854,46')
        expect(text).toContain('Banco de Venezuela (0102)')
        expect(text).toContain('Fecha: 25/09/2026')
        expect(text).toContain('Monto pagado: <b>Bs. 1.054.853,41</b>')
        expect(text).not.toContain('⚠️')
    })

    it('renders a Zelle payment in dollars with the payer and account', () => {
        const text = paymentMessage({
            ...DATA,
            payment: {
                ...DATA.payment,
                methodLabel: 'Zelle',
                currency: 'USD',
                reference: 'ZL12AB',
                payerBankCode: null,
                payerBankName: null,
                payerPhone: null,
                payerIdNumber: null,
                payerName: 'Ana <Pérez>',
                payerAccount: 'ana@example.com',
                amount: 1200,
                expected: 1234.5,
            },
        })
        expect(text).toContain('💳 <b>Zelle</b>')
        expect(text).toContain('Titular: Ana &lt;Pérez&gt;')
        expect(text).toContain('Cuenta: ana@example.com')
        expect(text).not.toContain('Banco:')
        expect(text).toContain('Monto pagado: <b>$1.200,00</b>')
        expect(text).toContain('⚠️ <b>Monto no coincide:</b> faltan $34,50 (esperado $1.234,50)')
    })

    it('announces a new order with its payment method and the installation request', () => {
        const text = newOrderMessage({
            code: 'GP-000012',
            customerName: 'Ana',
            totalUsd: 640,
            totalBs: 98856.77,
            itemCount: 1,
            items: DATA.items.slice(0, 1),
            paymentMethodLabel: 'Transferencia bancaria',
            wantsInstallation: true,
            paymentDueAt: new Date('2026-09-26T15:05:00Z'),
        })
        expect(text).toContain('💳 Pagará por Transferencia bancaria')
        expect(text).toContain('🔧 <b>Pide instalación</b>')
    })

    it('summarizes an order with its latest payment in the right currency', () => {
        const text = orderSummaryMessage({
            code: 'GP-000012',
            statusLabel: 'Pago rechazado',
            customerName: 'Ana',
            customerPhone: '0414-1234567',
            items: DATA.items.slice(0, 1),
            totalUsd: 640,
            totalBs: 98856.77,
            createdAt: new Date('2026-09-25T15:05:00Z'),
            deliveryMethod: 'pickup',
            latestPayment: {
                methodLabel: 'Binance Pay',
                reference: '123456789',
                amount: 640,
                currency: 'USD',
                statusLabel: 'rechazado',
            },
        })
        expect(text).toContain('Retiro en tienda')
        expect(text).toContain(
            '💳 Último pago (Binance Pay): ref. <code>123456789</code> · $640,00',
        )
    })

    it('lists every warning', () => {
        const text = paymentMessage({
            ...DATA,
            stockConflict: {
                detectedAt: '',
                resolvedAt: null,
                resolvedById: null,
                lines: [
                    {
                        productId: 'p',
                        productName: 'Capacitor',
                        requested: 3,
                        available: 1,
                        reserved: 1,
                    },
                    {
                        productId: 'f',
                        variantId: 'f-m',
                        productName: 'Kit de cobre',
                        variantLabel: '5 metros',
                        requested: 2,
                        available: 0,
                        reserved: 0,
                    },
                ],
            },
            payment: {
                ...DATA.payment,
                amount: 1054900,
                duplicateReference: true,
                late: true,
                source: 'admin',
                recordedByName: 'Dueña',
                hasProof: false,
            },
        })
        expect(text).toContain('⚠️ <b>Monto no coincide:</b> sobran Bs. 46,59')
        expect(text).toContain('⚠️ <b>Referencia repetida')
        expect(text).toContain('⏰ <b>Pago fuera de plazo</b>')
        expect(text).toContain(
            '📦 <b>Stock insuficiente:</b> «Capacitor» pidió 3, hay 1; «Kit de cobre – 5 metros» pidió 2, hay 0',
        )
        expect(text).toContain('Registrado manualmente en el panel por Dueña · sin captura')
    })

    it('appends the resolution line', () => {
        expect(paymentMessage(DATA, { resolution: '✅ Hecho' }).endsWith('\n\n✅ Hecho')).toBe(true)
    })
})

describe('rate sync alerts', () => {
    const current = {
        rate: 36.5,
        source: 'bcv' as const,
        effectiveDate: '2026-09-25',
        usableUntil: '2026-09-26T04:00:00.000Z',
        isStale: false,
    }

    it('says both sources failed, the current rate and when orders pause', () => {
        const text = rateSyncFailingMessage({
            consecutiveFailures: 3,
            errors: [],
            current,
            at: '2026-09-25T18:00:00.000Z',
        })
        expect(text).toContain('No se pudo obtener la tasa del BCV')
        expect(text).toContain('BCV y DolarApi')
        expect(text).toContain('36,5000 Bs/$')
        expect(text).toContain('fecha valor 25/09/2026')
        expect(text).toContain('los pedidos se pausan el 26/09/2026, 12:00 a. m.')
        expect(text).toContain('Tasa BCV')
    })

    it('says orders are already paused when the rate expired or is missing', () => {
        const at = '2026-09-26T18:00:00.000Z'
        expect(
            rateSyncFailingMessage({
                consecutiveFailures: 3,
                errors: [],
                current: { ...current, isStale: true },
                at,
            }),
        ).toContain('Los pedidos ya están pausados')
        expect(
            rateSyncFailingMessage({ consecutiveFailures: 3, errors: [], current: null, at }),
        ).toContain('Todavía no hay ninguna tasa guardada')
    })

    it('announces the recovery with the rate in use', () => {
        const text = rateSyncRecoveredMessage({
            outcome: 'stored',
            failedRuns: 3,
            current,
            at: '2026-09-25T20:00:00.000Z',
        })
        expect(text).toContain('La tasa del BCV se volvió a obtener')
        expect(text).toContain('36,5000 Bs/$')
        expect(text).not.toContain('pausados')
    })
})

describe('contactMessage', () => {
    const EVENT = {
        fullName: 'Ana & <Co>',
        email: 'ana@example.com',
        phone: '0414-1234567',
        topic: 'COTIZACION',
        topicLabel: 'Necesito una cotización',
        spaceType: null,
        spaceTypeLabel: null,
        areaM2: null,
        product: null,
        message: 'Hola <b>equipo</b> & amigos',
        receivedAt: '2026-09-25T14:30:00.000Z',
    }

    it('renders who wrote, the topic label and the escaped message', () => {
        const text = contactMessage(EVENT)
        expect(text.split('\n').slice(0, 5)).toEqual([
            '📨 <b>Nuevo mensaje de contacto</b>',
            '👤 Ana &amp; &lt;Co&gt;',
            '✉️ ana@example.com',
            '📱 WhatsApp: 0414-1234567',
            '🏷️ Necesito una cotización',
        ])
        expect(text).toContain('🗓️ 25/09/2026')
        expect(text.endsWith('Hola &lt;b&gt;equipo&lt;/b&gt; &amp; amigos')).toBe(true)
    })

    it('adds the space and the product of an advisory request', () => {
        const text = contactMessage({
            ...EVENT,
            topic: 'ASESORIA',
            topicLabel: 'Quiero asesoría para elegir un equipo',
            spaceType: 'COMERCIAL',
            spaceTypeLabel: 'Comercial',
            areaM2: 45,
            product: {
                slug: 'piso-techo-gree-36000-btu',
                name: 'Piso-techo <Gree>',
                url: 'https://galpa.com.ve/producto/piso-techo-gree-36000-btu',
            },
        })
        expect(text.split('\n')[0]).toBe('📨 <b>Nueva solicitud de asesoría</b>')
        expect(text).toContain('🏷️ Quiero asesoría para elegir un equipo')
        expect(text).toContain('🏠 Espacio: Comercial · 45 m²')
        expect(text).toContain(
            '❄️ Producto: <a href="https://galpa.com.ve/producto/piso-techo-gree-36000-btu">Piso-techo &lt;Gree&gt;</a>',
        )
    })

    it('leaves the WhatsApp line out without a phone', () => {
        expect(contactMessage({ ...EVENT, phone: null })).not.toContain('WhatsApp')
    })

    it('stays under the Telegram limit with a very long message', () => {
        const text = contactMessage({ ...EVENT, message: '<'.repeat(10_000) })
        expect(visibleLength(text)).toBeLessThanOrEqual(TELEGRAM_TEXT_LIMIT)
        expect(text).toContain('…')
    })

    it('greets the customer by first name', () => {
        expect(contactWhatsAppGreeting('  Ana María Pérez ')).toMatch(/^Hola Ana, te escribimos/)
        expect(contactWhatsAppGreeting('')).toMatch(/^Hola, te escribimos/)
    })
})
