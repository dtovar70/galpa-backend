import { Controller, Get, Ip, Module } from '@nestjs/common'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import type { TrustProxy } from '../src/config/env.schema.js'
import { applyTrustProxy } from '../src/config/trust-proxy.js'

@Controller('whoami')
class WhoAmIController {
    @Get()
    whoami(@Ip() ip: string): { ip: string } {
        return { ip }
    }
}

@Module({ controllers: [WhoAmIController] })
class WhoAmIModule {}

/** req.ip (what the throttler keys on) behind a reverse proxy like Caddy. */
describe('trust proxy (e2e)', () => {
    let app: NestExpressApplication

    async function boot(value: TrustProxy): Promise<void> {
        const moduleFixture = await Test.createTestingModule({ imports: [WhoAmIModule] }).compile()
        app = moduleFixture.createNestApplication<NestExpressApplication>()
        applyTrustProxy(app, value)
        await app.init()
    }

    afterEach(async () => {
        await app.close()
    })

    it('reads the client from X-Forwarded-For when one hop is trusted', async () => {
        await boot(1)
        const response = await request(app.getHttpServer())
            .get('/whoami')
            .set('X-Forwarded-For', '203.0.113.7')
            .expect(200)
        expect(response.body.ip).toBe('203.0.113.7')
    })

    it('only trusts the configured hops: a spoofed leftmost entry is ignored', async () => {
        await boot(1)
        const response = await request(app.getHttpServer())
            .get('/whoami')
            .set('X-Forwarded-For', '6.6.6.6, 203.0.113.7')
            .expect(200)
        expect(response.body.ip).toBe('203.0.113.7')
    })

    it('ignores X-Forwarded-For when no proxy is trusted', async () => {
        await boot(false)
        const response = await request(app.getHttpServer())
            .get('/whoami')
            .set('X-Forwarded-For', '203.0.113.7')
            .expect(200)
        expect(response.body.ip).not.toBe('203.0.113.7')
        expect(response.body.ip).toMatch(/127\.0\.0\.1|::1/)
    })
})
