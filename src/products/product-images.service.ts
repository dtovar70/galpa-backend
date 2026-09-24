import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm'
import { DataSource, Repository } from 'typeorm'
import { newId } from '../database/id.js'
import { detectImageType, type ImageType } from '../storage/image-type.js'
import {
    STORAGE_SERVICE,
    type StorageService,
    type StoredFile,
} from '../storage/storage.service.js'
import { ProductImage } from './entities/product-image.entity.js'
import { Product } from './entities/product.entity.js'
import { ProductRepository } from './product.repository.js'
import { toAdminProduct, type AdminProductDto } from './product.mapper.js'
import { PRODUCT_NOT_FOUND } from './products.constants.js'

@Injectable()
export class ProductImagesService {
    private readonly logger = new Logger(ProductImagesService.name)

    constructor(
        @InjectDataSource() private readonly dataSource: DataSource,
        @InjectRepository(Product) private readonly products: Repository<Product>,
        @InjectRepository(ProductImage) private readonly images: Repository<ProductImage>,
        private readonly productReader: ProductRepository,
        @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
    ) {}

    async upload(productId: string, files: Express.Multer.File[]): Promise<AdminProductDto> {
        if (!files.length) {
            throw new BadRequestException('Adjunta al menos una imagen en el campo "files".')
        }
        const product = await this.products.findOne({
            where: { id: productId },
            select: { id: true, name: true },
        })
        if (!product) throw new NotFoundException(PRODUCT_NOT_FOUND)

        // Validate every file before uploading anything.
        const images = files.map((file) => {
            const type: ImageType | null = detectImageType(file.buffer)
            if (!type) {
                throw new BadRequestException(
                    `El archivo "${file.originalname}" no es una imagen JPG, PNG o WEBP válida.`,
                )
            }
            return { buffer: file.buffer, type }
        })

        const stored: StoredFile[] = []
        try {
            for (const image of images) {
                stored.push(await this.storage.upload(image))
            }

            const last = await this.images
                .createQueryBuilder('image')
                .select('MAX(image.sortOrder)', 'max')
                .where('image.productId = :productId', { productId })
                .getRawOne<{ max: number | string | null }>()
            const start = last?.max === null || last?.max === undefined ? 0 : Number(last.max) + 1

            await this.images.insert(
                stored.map((file, index) => ({
                    id: newId(),
                    productId,
                    url: file.url,
                    publicId: file.publicId,
                    alt: product.name,
                    sortOrder: start + index,
                })),
            )
        } catch (error) {
            await this.deleteFiles(stored.map((file) => file.publicId))
            this.logger.error(`Image upload failed for product ${productId}`, error as Error)
            throw new BadRequestException('No pudimos guardar las imágenes. Intenta de nuevo.')
        }

        return this.loadProduct(productId)
    }

    async remove(productId: string, imageId: string): Promise<AdminProductDto> {
        const image = await this.images.findOne({
            where: { id: imageId, productId },
            select: { id: true, publicId: true },
        })
        if (!image) throw new NotFoundException('No encontramos la imagen solicitada.')

        await this.images.delete({ id: image.id })
        await this.deleteFiles([image.publicId])
        return this.loadProduct(productId)
    }

    async reorder(productId: string, imageIds: string[]): Promise<AdminProductDto> {
        const current = await this.images.find({ where: { productId }, select: { id: true } })
        const currentIds = new Set(current.map((image) => image.id))
        const sameSet =
            currentIds.size === imageIds.length && imageIds.every((id) => currentIds.has(id))
        if (!sameSet) {
            throw new BadRequestException(
                'La lista debe incluir exactamente todas las imágenes del producto.',
            )
        }

        await this.dataSource.transaction(async (manager) => {
            for (const [index, id] of imageIds.entries()) {
                await manager.update(ProductImage, { id, productId }, { sortOrder: index })
            }
        })
        return this.loadProduct(productId)
    }

    private async loadProduct(productId: string): Promise<AdminProductDto> {
        const product = await this.productReader.findOneWithRelations({ id: productId })
        if (!product) throw new NotFoundException(PRODUCT_NOT_FOUND)
        return toAdminProduct(product)
    }

    private async deleteFiles(publicIds: string[]): Promise<void> {
        await Promise.all(
            publicIds.map((publicId) =>
                this.storage.delete(publicId).catch((error: unknown) => {
                    this.logger.warn(
                        `Could not delete stored image "${publicId}": ${String(error)}`,
                    )
                }),
            ),
        )
    }
}
