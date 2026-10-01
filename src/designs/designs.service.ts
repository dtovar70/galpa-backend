import {
    BadRequestException,
    ConflictException,
    Inject,
    Injectable,
    Logger,
    NotFoundException,
    PayloadTooLargeException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource, In, IsNull, LessThan, type EntityManager } from 'typeorm'
import { CategoryDesignTemplate } from '../categories/entities/category-design-template.entity.js'
import { Category } from '../categories/entities/category.entity.js'
import type { Env } from '../config/env.schema.js'
import { newId } from '../database/id.js'
import { OrderItem } from '../orders/entities/order-item.entity.js'
import { Order } from '../orders/entities/order.entity.js'
import { accessTokenMatches, generateAccessToken } from '../orders/order-token.js'
import { ProductVariant } from '../products/entities/product-variant.entity.js'
import { Product } from '../products/entities/product.entity.js'
import { isWithinPixelLimits, readImageSize } from '../storage/image-size.js'
import { detectImageType, IMAGE_EXTENSIONS, type ImageType } from '../storage/image-type.js'
import { readPrivateBuffer } from '../storage/private-file.js'
import {
    STORAGE_SERVICE,
    type PrivateFileAccess,
    type StorageService,
} from '../storage/storage.service.js'
import {
    artworkFilename,
    DESIGN_FONTS,
    originalFilename,
    lowestDpi,
    parseRequestedLayers,
    textLayers,
    type DesignFormat,
    type DesignLayer,
    type DesignTextLayer,
} from './design-layers.js'
import {
    artworkDpi,
    dpiLevel,
    estimateDpi,
    resolveDesignTemplate,
    type DesignTemplate,
    type DpiLevel,
} from './design-templates.js'
import {
    ARTWORK_FIELD,
    INVALID_ARTWORK_TYPE,
    INVALID_ORIGINAL_TYPE,
    INVALID_PREVIEW_TYPE,
    MAX_ARTWORK_BYTES,
    MAX_ORIGINAL_BYTES,
    MAX_PREVIEW_BYTES,
    ORIGINAL_TOO_LARGE,
    ORIGINAL_TOO_MANY_PIXELS,
    ORIGINALS_FIELD,
    PREVIEW_FIELD,
} from './design-upload.js'
import type { CreateDesignDto } from './dto/create-design.dto.js'
import { DesignAsset } from './entities/design-asset.entity.js'
import { Design, designColorOf, type DesignColor } from './entities/design.entity.js'

/** Unattached designs live this long; checkout refuses older ones and the cleanup deletes them. */
export const DESIGN_TTL_MS = 7 * 24 * 60 * 60_000
export const DESIGN_NOT_FOUND = 'No encontramos este diseño.'
export const ORDER_DESIGN_INVALID = 'ORDER_DESIGN_INVALID'
export const ORDER_DESIGN_USED = 'ORDER_DESIGN_USED'
export const DESIGN_ALREADY_USED = 'Este diseño ya se usó en otro pedido; vuelve a crearlo.'
export const NO_LINE_DESIGN = 'Esta línea no tiene un diseño propio.'
/** Largest preview forwarded to Telegram (they are rendered at ~800 px, far below this). */
const MAX_FORWARDED_PREVIEW_BYTES = 5 * 1024 * 1024
/** Files forwarded as Telegram documents (bots may send up to 50 MB). */
const MAX_FORWARDED_DOCUMENT_BYTES = 48 * 1024 * 1024
const CLEANUP_BATCH_SIZE = 100

const INVALID_BODY_MESSAGE = 'Los datos enviados no son válidos. Revisa los campos marcados.'

/** One layer of the upload response, bottom to top. */
export interface CreatedDesignLayerDto {
    index: number
    type: DesignLayer['type']
    /** Image layers only (null for text). */
    dpi: number | null
    dpiLevel: DpiLevel | null
}

/** `POST /designs`: the only time the preview token is returned. */
export interface CreatedDesignDto {
    id: string
    previewToken: string
    /** API path (without the `/api` prefix) of the preview for this token: `/designs/<id>/preview?t=…`. */
    previewPath: string
    /** The same, absolute (`PUBLIC_API_URL`). */
    previewUrl: string
    /** The lowest DPI among the image layers; null for a design with only text. */
    dpiEstimate: number | null
    dpiLevel: DpiLevel | null
    layers: CreatedDesignLayerDto[]
    /** The garment color it was made on; null with an illustration template. */
    color: DesignColor | null
}

export interface DesignUploadFiles {
    originals: readonly Express.Multer.File[]
    artwork: Express.Multer.File | undefined
    preview: Express.Multer.File | undefined
}

/** A cart line of the checkout, as far as its design is concerned. */
export interface DesignLineInput {
    productId: string
    variantId?: string
    designId?: string
    quantity: number
}

/** Same shape as the stock problems of checkout (OrderLineProblem), with `kind: 'design'`. */
export interface DesignLineProblem {
    index: number
    productId: string
    variantId: string | null
    available: number
    message: string
    kind: 'design'
}

/** A text layer as listed in the admin and in Telegram. */
export interface DesignTextSummary {
    content: string
    fontLabel: string
    color: string
}

export interface DesignImage {
    buffer: Buffer
    filename: string
    /** 1-based line number in the order. */
    line: number
    productName: string
    variantLabel: string | null
    /** The garment color it was made on, if any. */
    color: DesignColor | null
    /** Its text layers, bottom to top. */
    texts: DesignTextSummary[]
}

/**
 * A print file of an order's design, for Telegram: the arte final or one image layer's
 * original. `load` reads it from the private storage (null when it cannot), one at a time.
 */
export interface DesignPrintFile {
    kind: 'artwork' | 'original'
    /** 1-based line number in the order. */
    line: number
    /** For an original, 1-based among the design's images (bottom to top). */
    number: number | null
    productName: string
    filename: string
    load: () => Promise<Buffer | null>
}

export type AdminDesignFile =
    { kind: 'preview' } | { kind: 'artwork' } | { kind: 'original'; number: number }

export interface DesignFile {
    access: PrivateFileAccess
    /** `MR-000123-linea1-arte-final.png`, `MR-000123-linea1-imagen2.jpg` (preview: inline). */
    downloadName: string
}

function fieldError(field: string, message: string): BadRequestException {
    return new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message,
        details: [{ field, errors: [message] }],
    })
}

function extensionOf(type: ImageType | null): DesignFormat | null {
    return type ? (IMAGE_EXTENSIONS[type] as DesignFormat) : null
}

export function textSummaryOf(layer: DesignTextLayer): DesignTextSummary {
    return {
        content: layer.content,
        fontLabel: DESIGN_FONTS[layer.font] ?? layer.font,
        color: layer.color,
    }
}

interface CheckedOriginal {
    file: Express.Multer.File
    type: ImageType
    format: DesignFormat
    width: number
    height: number
}

/**
 * "Diseña con tu imagen": the customer's layers (images and texts), their files (originals, arte
 * final, mockup preview), their private reads (preview token, order link, admin, Telegram) and
 * their life cycle (attach at checkout, cleanup).
 */
@Injectable()
export class DesignsService {
    private readonly logger = new Logger(DesignsService.name)
    private readonly apiUrl: string

    constructor(
        @InjectDataSource() private readonly dataSource: DataSource,
        @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
        config: ConfigService<Env, true>,
    ) {
        this.apiUrl = config.get('PUBLIC_API_URL', { infer: true })
    }

    // Upload

    async create(dto: CreateDesignDto, files: DesignUploadFiles): Promise<CreatedDesignDto> {
        const { preview, artwork } = files
        if (!preview) throw fieldError(PREVIEW_FIELD, 'Falta la vista previa del diseño.')
        if (!artwork) throw fieldError(ARTWORK_FIELD, 'Falta el arte final del diseño.')

        const originals = files.originals.map((file) => this.checkOriginal(file))
        if (detectImageType(preview.buffer) !== 'png' || !readImageSize(preview.buffer, 'png')) {
            throw fieldError(PREVIEW_FIELD, INVALID_PREVIEW_TYPE)
        }
        if (preview.size > MAX_PREVIEW_BYTES) {
            throw fieldError(PREVIEW_FIELD, 'La vista previa del diseño es demasiado grande.')
        }
        const artworkSize =
            detectImageType(artwork.buffer) === 'png' ? readImageSize(artwork.buffer, 'png') : null
        if (!artworkSize) throw fieldError(ARTWORK_FIELD, INVALID_ARTWORK_TYPE)
        if (artwork.size > MAX_ARTWORK_BYTES) {
            const message = `El arte final de tu diseño puede pesar como máximo ${MAX_ARTWORK_BYTES / (1024 * 1024)} MB.`
            throw new PayloadTooLargeException({
                statusCode: 413,
                error: 'Payload Too Large',
                message,
                details: [{ field: ARTWORK_FIELD, errors: [message] }],
            })
        }

        const requested = parseRequestedLayers(dto.layers, originals.length)
        const { template, color } = await this.templateForProduct(
            dto.productId,
            dto.variantId,
            dto.templateColorId,
        )
        const printDpi = artworkDpi(artworkSize, template)
        if (printDpi === null) {
            throw fieldError(
                ARTWORK_FIELD,
                'El arte final no coincide con el área de impresión. Vuelve a abrir el editor.',
            )
        }
        const layers: DesignLayer[] = requested.map((layer) => {
            if (layer.type === 'text') return layer
            const original = originals[layer.assetIndex]!
            return {
                ...layer,
                format: original.format,
                width: original.width,
                height: original.height,
                bytes: original.file.size,
                dpi: estimateDpi(original.width, layer.placement.scale, template),
            }
        })
        const dpi = lowestDpi(layers)

        const uploaded: string[] = []
        const cleanup = async () => {
            for (const key of uploaded) {
                await this.storage.deletePrivate(key).catch((error: unknown) => {
                    this.logger.warn(`Could not delete orphan design file ${key}: ${String(error)}`)
                })
            }
        }
        const upload = async (buffer: Buffer, type: ImageType) => {
            const { key } = await this.storage.uploadPrivate({ buffer, type }, 'designs')
            uploaded.push(key)
            return key
        }
        const { token, hash } = generateAccessToken()
        const id = newId()
        try {
            const assets: Omit<DesignAsset, 'design' | 'createdAt'>[] = []
            for (const [index, layer] of layers.entries()) {
                if (layer.type !== 'image') continue
                const original = originals[layer.assetIndex]!
                assets.push({
                    id: newId(),
                    designId: id,
                    kind: 'original',
                    layerIndex: index,
                    storageKey: await upload(original.file.buffer, original.type),
                    format: original.format,
                    width: original.width,
                    height: original.height,
                    bytes: original.file.size,
                    dpi: layer.dpi,
                })
            }
            assets.push({
                id: newId(),
                designId: id,
                kind: 'artwork',
                layerIndex: null,
                storageKey: await upload(artwork.buffer, 'png'),
                format: 'png',
                width: artworkSize.width,
                height: artworkSize.height,
                bytes: artwork.size,
                dpi: printDpi,
            })
            const previewKey = await upload(preview.buffer, 'png')

            await this.dataSource.transaction(async (manager) => {
                await manager.insert(Design, {
                    id,
                    productId: dto.productId,
                    variantId: dto.variantId ?? null,
                    previewKey,
                    layers,
                    printSize: { widthCm: template.widthCm, heightCm: template.heightCm },
                    colorName: color?.name ?? null,
                    colorHex: color?.hex ?? null,
                    dpiEstimate: dpi,
                    previewTokenHash: hash,
                    attachedAt: null,
                    createdAt: new Date(),
                })
                await manager.insert(DesignAsset, assets)
            })
        } catch (error) {
            this.logger.error(`Design upload failed for product ${dto.productId}`, error as Error)
            await cleanup()
            throw new BadRequestException(
                'No pudimos guardar tu diseño. Revisa tu conexión e intenta de nuevo.',
            )
        }

        const previewPath = `/designs/${encodeURIComponent(id)}/preview?t=${encodeURIComponent(token)}`
        return {
            id,
            previewToken: token,
            previewPath,
            previewUrl: `${this.apiUrl}/api${previewPath}`,
            dpiEstimate: dpi,
            dpiLevel: dpi === null ? null : dpiLevel(dpi),
            layers: layers.map((layer, index) => ({
                index,
                type: layer.type,
                dpi: layer.type === 'image' ? layer.dpi : null,
                dpiLevel: layer.type === 'image' ? dpiLevel(layer.dpi) : null,
            })),
            color,
        }
    }

    /** An original must really be a JPG, PNG or WEBP (by its bytes) of at most 10 MB. */
    private checkOriginal(file: Express.Multer.File): CheckedOriginal {
        if (file.size > MAX_ORIGINAL_BYTES) {
            throw new PayloadTooLargeException({
                statusCode: 413,
                error: 'Payload Too Large',
                message: ORIGINAL_TOO_LARGE,
                details: [{ field: ORIGINALS_FIELD, errors: [ORIGINAL_TOO_LARGE] }],
            })
        }
        const type = detectImageType(file.buffer)
        const format = extensionOf(type)
        const size = type ? readImageSize(file.buffer, type) : null
        if (!type || !format || !size) throw fieldError(ORIGINALS_FIELD, INVALID_ORIGINAL_TYPE)
        if (!isWithinPixelLimits(size)) throw fieldError(ORIGINALS_FIELD, ORIGINAL_TOO_MANY_PIXELS)
        return { file, type, format, width: size.width, height: size.height }
    }

    /**
     * The product must be active, personalizable, of a category with a template (its template
     * photos and print size, or a hardcoded illustration template). With template photos the
     * design names one of the category's garment colors (`templateColorId`), whose name and
     * swatch are returned for the snapshot.
     */
    private async templateForProduct(
        productId: string,
        variantId: string | undefined,
        templateColorId: string | undefined,
    ): Promise<{ template: DesignTemplate; color: DesignColor | null }> {
        const product = await this.dataSource
            .getRepository(Product)
            .findOne({ where: { id: productId } })
        if (!product || !product.isActive) {
            throw fieldError('productId', 'Este producto ya no está disponible.')
        }
        const category = await this.dataSource
            .getRepository(Category)
            .findOne({ where: { slug: product.categorySlug } })
        const colors = await this.dataSource
            .getRepository(CategoryDesignTemplate)
            .find({ where: { categorySlug: product.categorySlug } })
        const template = resolveDesignTemplate(
            category ?? {
                slug: product.categorySlug,
                designPrintWidthCm: null,
                designPrintHeightCm: null,
            },
            colors.length > 0,
        )
        if (!(product.tags ?? []).includes('personalizable') || !template) {
            throw fieldError('productId', 'Este producto no admite diseños con tu imagen.')
        }
        const variants = await this.dataSource
            .getRepository(ProductVariant)
            .find({ where: { productId: product.id } })
        if (variantId && !variants.some((variant) => variant.id === variantId)) {
            throw fieldError('variantId', 'La opción elegida ya no existe. Elígela de nuevo.')
        }
        if (!variantId && variants.length > 0) {
            throw fieldError('variantId', 'Elige una opción del producto.')
        }
        return { template, color: this.templateColor(colors, templateColorId) }
    }

    /** The chosen garment color: required (and one of theirs) when the category has colors. */
    private templateColor(
        colors: readonly CategoryDesignTemplate[],
        templateColorId: string | undefined,
    ): DesignColor | null {
        if (!colors.length) {
            if (templateColorId) {
                throw fieldError(
                    'templateColorId',
                    'Este producto no tiene colores para elegir. Vuelve a abrir el editor.',
                )
            }
            return null
        }
        if (!templateColorId) {
            throw fieldError('templateColorId', 'Elige el color de tu producto.')
        }
        const color = colors.find((candidate) => candidate.id === templateColorId)
        if (!color) {
            throw fieldError('templateColorId', 'Ese color ya no está disponible. Elige otro.')
        }
        return { name: color.colorName, hex: color.colorHex }
    }

    // Reads

    /** The preview for whoever holds the upload token (the customer's cart). 404 otherwise. */
    async previewForToken(id: string, token: string | undefined): Promise<PrivateFileAccess> {
        const design = await this.dataSource.getRepository(Design).findOne({
            where: { id },
            select: { id: true, previewKey: true, previewTokenHash: true },
        })
        const matches = accessTokenMatches(token, design?.previewTokenHash)
        const access = design && matches ? await this.storage.readPrivate(design.previewKey) : null
        if (!access) throw new NotFoundException(DESIGN_NOT_FOUND)
        return access
    }

    /** The preview of a design attached to `orderId` (the caller checked the order's link). */
    async previewForOrder(orderId: string, designId: string): Promise<PrivateFileAccess> {
        const item = await this.dataSource
            .getRepository(OrderItem)
            .findOne({ where: { orderId, designId } })
        const design = item ? await this.findDesign(designId) : null
        const access = design ? await this.storage.readPrivate(design.previewKey) : null
        if (!access) throw new NotFoundException(DESIGN_NOT_FOUND)
        return access
    }

    /**
     * Admin: a file of the design of one order line: the mockup preview, the arte final, or the
     * original of its image `number` (1-based, bottom to top).
     */
    async fileForAdmin(code: string, itemId: string, file: AdminDesignFile): Promise<DesignFile> {
        const item = await this.dataSource
            .getRepository(OrderItem)
            .findOne({ where: { id: itemId } })
        const order = item
            ? await this.dataSource
                  .getRepository(Order)
                  .findOne({ where: { id: item.orderId }, select: { id: true, code: true } })
            : null
        const design =
            item?.designId && order?.code === code ? await this.findDesign(item.designId) : null
        if (!design || !item) throw new NotFoundException(NO_LINE_DESIGN)
        const line = item.sortOrder + 1

        if (file.kind === 'preview') {
            const access = await this.storage.readPrivate(design.previewKey)
            if (!access) throw new NotFoundException(NO_LINE_DESIGN)
            return { access, downloadName: `${code}-linea${line}-vista-previa.png` }
        }
        const assets = await this.assetsOf(design.id)
        let asset: DesignAsset | undefined
        let downloadName: string
        if (file.kind === 'artwork') {
            asset = assets.find((candidate) => candidate.kind === 'artwork')
            downloadName = artworkFilename(code, line)
        } else {
            const layerIndex = this.imageLayerIndex(design.layers, file.number)
            asset = assets.find(
                (candidate) => candidate.kind === 'original' && candidate.layerIndex === layerIndex,
            )
            downloadName = originalFilename(code, line, file.number, asset?.format ?? 'png')
        }
        const access = asset ? await this.storage.readPrivate(asset.storageKey) : null
        if (!access) throw new NotFoundException('Este archivo del diseño no está disponible.')
        return { access, downloadName }
    }

    /** Position in `layers` of image `number` (1-based among the image layers); -1 if none. */
    private imageLayerIndex(layers: readonly DesignLayer[], number: number): number {
        let seen = 0
        for (const [index, layer] of layers.entries()) {
            if (layer.type === 'image' && ++seen === number) return index
        }
        return -1
    }

    /**
     * The previews of an order's designs (for Telegram), in line order, with their text layers.
     * A preview that cannot be read is skipped: the notification never fails because of it.
     */
    async previewImagesForOrder(orderId: string): Promise<DesignImage[]> {
        const images: DesignImage[] = []
        for (const { item, design } of await this.designedItems(orderId)) {
            try {
                const access = await this.storage.readPrivate(design.previewKey)
                const file = access
                    ? await readPrivateBuffer(access, MAX_FORWARDED_PREVIEW_BYTES)
                    : null
                if (!file) continue
                const line = item.sortOrder + 1
                images.push({
                    buffer: file.buffer,
                    filename: `diseno-linea${line}.png`,
                    line,
                    productName: item.productName,
                    variantLabel: item.variantLabel,
                    color: designColorOf(design),
                    texts: textLayers(design.layers).map(textSummaryOf),
                })
            } catch (error) {
                this.logger.warn(
                    `Could not read the design preview of item ${item.id}: ${(error as Error).message}`,
                )
            }
        }
        return images
    }

    /**
     * The print files of an order's designs, in line order: for each line the arte final, then
     * the original of each image (bottom to top), named like the admin downloads. Sent to
     * Telegram as documents so the owner keeps a print-quality copy there. Read lazily, one at a
     * time; a file that cannot be read loads as null.
     */
    async printFilesForOrder(orderId: string, orderCode: string): Promise<DesignPrintFile[]> {
        const files: DesignPrintFile[] = []
        for (const { item, design } of await this.designedItems(orderId)) {
            const line = item.sortOrder + 1
            let assets: DesignAsset[]
            try {
                assets = await this.assetsOf(design.id)
            } catch (error) {
                this.logger.warn(
                    `Could not list the design files of item ${item.id}: ${(error as Error).message}`,
                )
                continue
            }
            const load = (asset: DesignAsset) => () => this.loadForTelegram(asset.storageKey)
            const artwork = assets.find((asset) => asset.kind === 'artwork')
            if (artwork) {
                files.push({
                    kind: 'artwork',
                    line,
                    number: null,
                    productName: item.productName,
                    filename: artworkFilename(orderCode, line),
                    load: load(artwork),
                })
            }
            let number = 0
            for (const [index, layer] of design.layers.entries()) {
                if (layer.type !== 'image') continue
                number += 1
                const asset = assets.find(
                    (candidate) => candidate.kind === 'original' && candidate.layerIndex === index,
                )
                if (!asset) continue
                files.push({
                    kind: 'original',
                    line,
                    number,
                    productName: item.productName,
                    filename: originalFilename(orderCode, line, number, asset.format),
                    load: load(asset),
                })
            }
        }
        return files
    }

    private async loadForTelegram(key: string): Promise<Buffer | null> {
        try {
            const access = await this.storage.readPrivate(key)
            const file = access
                ? await readPrivateBuffer(access, MAX_FORWARDED_DOCUMENT_BYTES)
                : null
            return file?.buffer ?? null
        } catch (error) {
            this.logger.warn(`Could not read the design file ${key}: ${(error as Error).message}`)
            return null
        }
    }

    /** The order's lines with a design (still existing), in line order. */
    private async designedItems(orderId: string): Promise<{ item: OrderItem; design: Design }[]> {
        const items = (await this.dataSource.getRepository(OrderItem).find({ where: { orderId } }))
            .filter((item) => item.designId)
            .sort((a, b) => a.sortOrder - b.sortOrder)
        const found: { item: OrderItem; design: Design }[] = []
        for (const item of items) {
            const design = await this.findDesign(item.designId!)
            if (design) found.push({ item, design })
        }
        return found
    }

    private findDesign(id: string): Promise<Design | null> {
        return this.dataSource.getRepository(Design).findOne({ where: { id } })
    }

    private assetsOf(designId: string): Promise<DesignAsset[]> {
        return this.dataSource.getRepository(DesignAsset).find({ where: { designId } })
    }

    // Checkout

    /**
     * Locks the designs of the cart lines and checks each one: it exists, was never used, belongs
     * to the line's product (and variant) and is younger than 7 days. Throws 409
     * `ORDER_DESIGN_USED` when one was already ordered, 400 `ORDER_DESIGN_INVALID` for the rest,
     * with one problem per line. Returns the designs by line index. Runs inside checkout's
     * transaction, after the products were locked (lock order: products, variants, designs).
     */
    async lockForOrder(
        manager: EntityManager,
        items: readonly DesignLineInput[],
        now = new Date(),
    ): Promise<Map<number, Design>> {
        const ids = [...new Set(items.flatMap((item) => (item.designId ? [item.designId] : [])))]
        const byLine = new Map<number, Design>()
        if (!ids.length) return byLine

        const designs = await manager
            .createQueryBuilder(Design, 'design')
            .setLock('pessimistic_write')
            .where('design.id IN (:...ids)', { ids: [...ids].sort() })
            .orderBy('design.id', 'ASC')
            .getMany()
        const found = new Map(designs.map((design) => [design.id, design]))

        const problems: DesignLineProblem[] = []
        const seen = new Set<string>()
        let reused = false
        items.forEach((item, index) => {
            if (!item.designId) return
            const problem = (message: string) =>
                problems.push({
                    index,
                    productId: item.productId,
                    variantId: item.variantId ?? null,
                    available: item.quantity,
                    message,
                    kind: 'design',
                })
            const design = found.get(item.designId)
            if (seen.has(item.designId)) {
                problem('Este diseño ya está en otra línea de tu carrito; vuelve a crearlo.')
            } else if (!design) {
                problem('Tu diseño ya no está disponible; vuelve a crearlo.')
            } else if (design.attachedAt) {
                reused = true
                problem(DESIGN_ALREADY_USED)
            } else if (design.productId !== item.productId) {
                problem('Este diseño es de otro producto; vuelve a crearlo.')
            } else if (design.variantId && design.variantId !== (item.variantId ?? null)) {
                problem('Este diseño se hizo para otra versión del producto; vuelve a crearlo.')
            } else if (now.getTime() - design.createdAt.getTime() > DESIGN_TTL_MS) {
                problem('Tu diseño venció (los guardamos 7 días); vuelve a crearlo.')
            } else {
                byLine.set(index, design)
            }
            seen.add(item.designId)
        })

        if (problems.length) {
            const body = {
                error: reused ? 'Conflict' : 'Bad Request',
                code: reused ? ORDER_DESIGN_USED : ORDER_DESIGN_INVALID,
                message: reused
                    ? DESIGN_ALREADY_USED
                    : problems.length === 1
                      ? problems[0]!.message
                      : INVALID_BODY_MESSAGE,
                details: problems.map((problem) => ({
                    field: `items.${problem.index}.designId`,
                    errors: [problem.message],
                })),
                lines: problems,
            }
            throw reused
                ? new ConflictException({ statusCode: 409, ...body })
                : new BadRequestException({ statusCode: 400, ...body })
        }
        return byLine
    }

    /** Marks the designs as used (inside checkout's transaction, rows already locked). */
    async markAttached(manager: EntityManager, designIds: readonly string[], now: Date) {
        if (!designIds.length) return
        await manager.update(Design, { id: In([...designIds]) }, { attachedAt: now })
    }

    // Cleanup

    /**
     * Deletes the designs nobody ordered within 7 days: the row first (only while still
     * unattached, so a design attached meanwhile is never touched; its asset rows go with it),
     * then every file: the preview, the arte final and the originals. Returns how many were
     * deleted.
     */
    async deleteStale(now = new Date()): Promise<number> {
        const repository = this.dataSource.getRepository(Design)
        const cutoff = new Date(now.getTime() - DESIGN_TTL_MS)
        let deleted = 0
        for (;;) {
            const stale = await repository.find({
                where: { attachedAt: IsNull(), createdAt: LessThan(cutoff) },
                order: { createdAt: 'ASC' },
                take: CLEANUP_BATCH_SIZE,
            })
            let progress = 0
            for (const design of stale) {
                // Read before the row (and, by CASCADE, its asset rows) goes away.
                const assets = await this.assetsOf(design.id)
                const result = await repository.delete({ id: design.id, attachedAt: IsNull() })
                if (!result.affected) continue
                progress += 1
                const keys = [design.previewKey, ...assets.map((asset) => asset.storageKey)]
                for (const key of keys) {
                    await this.storage.deletePrivate(key).catch((error: unknown) => {
                        this.logger.warn(`Could not delete design file ${key}: ${String(error)}`)
                    })
                }
            }
            deleted += progress
            if (stale.length < CLEANUP_BATCH_SIZE || progress === 0) break
        }
        if (deleted) this.logger.log(`Deleted ${deleted} unused design(s)`)
        return deleted
    }
}
