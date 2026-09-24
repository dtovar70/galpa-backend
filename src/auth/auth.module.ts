import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { JwtModule } from '@nestjs/jwt'
import { TypeOrmModule } from '@nestjs/typeorm'
import type { Env } from '../config/env.schema.js'
import { AuthController } from './auth.controller.js'
import { AuthService } from './auth.service.js'
import { User } from './entities/user.entity.js'
import { JwtAuthGuard } from './guards/jwt-auth.guard.js'
import { RolesGuard } from './guards/roles.guard.js'
import { sessionSettingsFrom } from './session.config.js'

@Module({
    imports: [
        TypeOrmModule.forFeature([User]),
        JwtModule.registerAsync({
            inject: [ConfigService],
            useFactory: (config: ConfigService<Env, true>) => ({
                secret: config.get('JWT_SECRET', { infer: true }),
                // Seconds: idle limit + prompt countdown + margin (see session.config.ts).
                signOptions: { expiresIn: sessionSettingsFrom(config).ttlSeconds },
            }),
        }),
    ],
    controllers: [AuthController],
    providers: [
        AuthService,
        // Order matters: authenticate first, then check roles.
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
    ],
})
export class AuthModule {}
