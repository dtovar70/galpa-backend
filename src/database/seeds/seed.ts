/**
 * Idempotent seed: admin user + categories + catalog copied from the frontend mocks.
 * Run with `npm run db:seed` (after `npm run db:migrate`).
 */
import argon2 from 'argon2'
import { User } from '../../auth/entities/user.entity.js'
import { Role } from '../../auth/role.enum.js'
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
    if (password.length < 8) {
        throw new Error('SEED_ADMIN_PASSWORD must be at least 8 characters long.')
    }

    const users = dataSource.getRepository(User)
    const passwordHash = await argon2.hash(password)
    const existing = await users.findOneBy({ email })

    // Re-seeding updates the password/name, so changing the env and re-running rotates them.
    if (existing) {
        await users.update({ id: existing.id }, { name, passwordHash, role: Role.ADMIN })
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
