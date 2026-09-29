/**
 * Idempotent seed: admin user + categories + catalog copied from the frontend mocks.
 * Run with `npm run db:seed` (after `npm run db:migrate`).
 */
import argon2 from 'argon2'
import { User } from '../../auth/entities/user.entity.js'
import { passwordPolicyErrors } from '../../auth/password-policy.js'
import { Role } from '../../auth/role.enum.js'
import { passwordChangeInstant } from '../../auth/session.config.js'
import { feminine } from '../../common/validation/messages.js'
import { Category } from '../../categories/entities/category.entity.js'
import { ProductVariant } from '../../products/entities/product-variant.entity.js'
import { Product } from '../../products/entities/product.entity.js'
import { computeDerivedFields } from '../../products/product-derived.js'
import dataSource from '../data-source.js'
import { newId } from '../id.js'
import { categories } from './seed-data/categories.data.js'
import { products } from './seed-data/products.data.js'

function requireEnv(name: string): string {
    const value = process.env[name]?.trim()
    if (!value) {
        throw new Error(`Missing required environment variable ${name} (see .env.example).`)
    }
    return value
}

async function seedAdmin(): Promise<void> {
    const email = requireEnv('SEED_ADMIN_EMAIL').toLowerCase()
    const password = requireEnv('SEED_ADMIN_PASSWORD')
    const name = requireEnv('SEED_ADMIN_NAME')
    const problems = passwordPolicyErrors(password, feminine('SEED_ADMIN_PASSWORD'))
    if (problems.length) {
        throw new Error(problems.join(' '))
    }

    const users = dataSource.getRepository(User)
    const passwordHash = await argon2.hash(password)
    const existing = await users
        .createQueryBuilder('user')
        .where('LOWER(user.email) = :email', { email })
        .getOne()

    // Re-seeding resets the password/name (closing that user's sessions) and makes the account
    // an active ADMIN again: the way back in if every admin was locked out.
    if (existing) {
        await users.update(
            { id: existing.id },
            {
                name,
                passwordHash,
                role: Role.ADMIN,
                isActive: true,
                passwordChangedAt: passwordChangeInstant(),
            },
        )
    } else {
        await users.insert({ id: newId(), email, name, passwordHash, role: Role.ADMIN })
    }
    console.log(`  admin user: ${email}`)
}

async function seedCategories(): Promise<void> {
    await dataSource.getRepository(Category).upsert(
        categories.map((category, sortOrder) => ({ ...category, sortOrder })),
        ['slug'],
    )
    console.log(`  categories: ${categories.length}`)
}

/**
 * The seed data keeps one stock per product (copied from the frontend mock): it is shared out
 * evenly across the variants, the first ones taking the remainder, so the sum stays the same.
 */
function splitStock(total: number, count: number, index: number): number {
    return Math.floor(total / count) + (index < total % count ? 1 : 0)
}

async function seedProducts(): Promise<void> {
    for (const product of products) {
        const { id, category, variants, compareAtPrice, createdAt, ...fields } = product

        await dataSource.transaction(async (manager) => {
            await manager.upsert(
                Product,
                {
                    id,
                    ...fields,
                    categorySlug: category,
                    compareAtPrice: compareAtPrice ?? null,
                    createdAt: new Date(createdAt),
                    ...computeDerivedFields(product),
                },
                ['id'],
            )
            await manager.delete(ProductVariant, { productId: id })
            if (variants.length) {
                await manager.insert(
                    ProductVariant,
                    variants.map((variant, sortOrder) => ({
                        id: variant.id,
                        productId: id,
                        label: variant.label,
                        priceDelta: variant.priceDelta,
                        colorHex: variant.colorHex ?? null,
                        stock: splitStock(product.stock, variants.length, sortOrder),
                        sortOrder,
                    })),
                )
            }
        })
    }
    console.log(`  products: ${products.length}`)
}

async function main(): Promise<void> {
    console.log('Seeding database...')
    await dataSource.initialize()
    try {
        await seedAdmin()
        await seedCategories()
        await seedProducts()
        console.log('Seed completed.')
    } finally {
        await dataSource.destroy()
    }
}

main().catch((error: unknown) => {
    console.error('Seed failed:', error)
    process.exitCode = 1
})
