import 'reflect-metadata'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { CatalogQueryDto } from './catalog-query.dto.js'

async function parse(query: Record<string, unknown>) {
    const dto = plainToInstance(CatalogQueryDto, query)
    const errors = await validate(dto)
    return { dto, errors: errors.flatMap((error) => Object.values(error.constraints ?? {})) }
}

describe('CatalogQueryDto sort', () => {
    it('defaults to relevance', async () => {
        const { dto, errors } = await parse({})
        expect(errors).toEqual([])
        expect(dto.sort).toBe('relevance')
    })

    it('keeps a supported sort', async () => {
        const { dto, errors } = await parse({ sort: 'price-asc' })
        expect(errors).toEqual([])
        expect(dto.sort).toBe('price-asc')
    })

    it('rejects an unknown sort', async () => {
        const { errors } = await parse({ sort: 'cheapest' })
        expect(errors).toEqual(['El orden solicitado no es válido.'])
    })
})

describe('CatalogQueryDto air conditioner filters', () => {
    it('parses brands (comma-separated or repeated), BTU range, voltage and inverter', async () => {
        const { dto, errors } = await parse({
            brand: ['Daikin,LG', 'Gree'],
            availability: 'ON_ORDER',
            btuMin: '9000',
            btuMax: '24000',
            voltage: ' 220V ',
            inverter: 'true',
        })
        expect(errors).toEqual([])
        expect(dto).toMatchObject({
            brand: ['Daikin', 'LG', 'Gree'],
            availability: 'ON_ORDER',
            btuMin: 9000,
            btuMax: 24000,
            voltage: '220V',
            inverter: true,
        })
        expect((await parse({ inverter: 'false' })).dto.inverter).toBe(false)
    })

    it('rejects an unknown availability and a non-numeric BTU', async () => {
        const { errors } = await parse({ availability: 'OUT_OF_STOCK', btuMin: 'mucho' })
        expect(errors).toContain('La disponibilidad no es válida.')
        expect(errors).toContain('La capacidad mínima en BTU debe ser un número entero.')
    })
})
