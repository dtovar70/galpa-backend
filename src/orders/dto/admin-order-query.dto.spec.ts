import 'reflect-metadata'
import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { AdminOrderQueryDto } from './admin-order-query.dto.js'

async function parse(query: Record<string, unknown>) {
    const dto = plainToInstance(AdminOrderQueryDto, query)
    const errors = await validate(dto)
    return { dto, errors: errors.flatMap((error) => Object.values(error.constraints ?? {})) }
}

describe('AdminOrderQueryDto status', () => {
    it('keeps a single status as a one-item list', async () => {
        const { dto, errors } = await parse({ status: 'PENDIENTE_VERIFICACION' })
        expect(errors).toEqual([])
        expect(dto.status).toEqual(['PENDIENTE_VERIFICACION'])
    })

    it('accepts a comma-separated list, trimming blanks and repeats', async () => {
        const { dto, errors } = await parse({
            status: ' PENDIENTE_PAGO, PAGO_RECHAZADO ,,PENDIENTE_PAGO',
        })
        expect(errors).toEqual([])
        expect(dto.status).toEqual(['PENDIENTE_PAGO', 'PAGO_RECHAZADO'])
    })

    it('accepts repeated params, each of which may be a list', async () => {
        const { dto, errors } = await parse({
            status: ['ENTREGADO', 'CANCELADO,EXPIRADO'],
        })
        expect(errors).toEqual([])
        expect(dto.status).toEqual(['ENTREGADO', 'CANCELADO', 'EXPIRADO'])
    })

    it('treats an empty value as no filter', async () => {
        const { dto, errors } = await parse({ status: ' , ' })
        expect(errors).toEqual([])
        expect(dto.status).toBeUndefined()
    })

    it('rejects unknown statuses with a Spanish message', async () => {
        const { errors } = await parse({ status: 'PENDIENTE_PAGO,PAGADO' })
        expect(errors).toHaveLength(1)
        expect(errors[0]).toMatch(/^El estado no es válido\. Usa uno o varios de PENDIENTE_PAGO/)
    })
})
