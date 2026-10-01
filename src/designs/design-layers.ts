import { BadRequestException } from '@nestjs/common'
import { PLACEMENT_LIMITS } from './dto/create-design.dto.js'

/**
 * Where a layer sits, relative to the product's print area:
 * - `x`, `y`: offset of the layer center from the area center, as fractions of the area width
 *   and height (0 = centered, ±0.5 = on an edge; right and down are positive).
 * - `scale`: image layers, image width ÷ area width (the height follows the image's aspect
 *   ratio); text layers, font size ÷ (TEXT_FONT_RATIO × area width).
 * - `rotation`: degrees, clockwise, around the layer center.
 */
export interface LayerPlacement {
    x: number
    y: number
    scale: number
    rotation: number
}

/** Font size of a text layer at scale 1, as a fraction of the print area width. */
export const TEXT_FONT_RATIO = 0.2

export const MAX_IMAGE_LAYERS = 5
export const MAX_TEXT_LAYERS = 3
export const MAX_TEXT_LENGTH = 60
export const MAX_TEXT_LINES = 2

/**
 * The fonts a text layer may use (ids shared with the storefront editor, which loads them from
 * Google Fonts). The label is what the admin and Telegram show.
 */
export const DESIGN_FONTS = {
    fredoka: 'Fredoka',
    jakarta: 'Plus Jakarta Sans',
    pacifico: 'Pacifico',
    bebas: 'Bebas Neue',
    baloo: 'Baloo 2',
    caveat: 'Caveat',
    playfair: 'Playfair Display',
} as const
export type DesignFontId = keyof typeof DESIGN_FONTS

export const TEXT_OUTLINES = ['none', 'white', 'black'] as const
export type TextOutline = (typeof TEXT_OUTLINES)[number]
export const TEXT_ALIGNS = ['left', 'center', 'right'] as const
export type TextAlign = (typeof TEXT_ALIGNS)[number]

export const DESIGN_FORMATS = ['jpg', 'png', 'webp'] as const
export type DesignFormat = (typeof DESIGN_FORMATS)[number]

/** An image layer: one of the design's original files (`assetIndex`, 0-based, upload order). */
export interface DesignImageLayer {
    type: 'image'
    z: number
    placement: LayerPlacement
    assetIndex: number
    format: DesignFormat
    width: number
    height: number
    bytes: number
    /** Effective print resolution, computed by the API (see `estimateDpi`). */
    dpi: number
}

export interface DesignTextLayer {
    type: 'text'
    z: number
    placement: LayerPlacement
    /** 1–60 characters, at most 2 lines (`\n`). */
    content: string
    font: DesignFontId
    /** `#RRGGBB`, upper case. */
    color: string
    outline: TextOutline
    align: TextAlign
}

/** Stored in `designs.layers`, bottom to top (`z` = position). */
export type DesignLayer = DesignImageLayer | DesignTextLayer

/** What the client sends for an image layer; the API adds the file facts and the DPI. */
export type RequestedImageLayer = Pick<DesignImageLayer, 'type' | 'z' | 'placement' | 'assetIndex'>
export type RequestedLayer = RequestedImageLayer | DesignTextLayer

export const LAYERS_FIELD = 'layers'

function layersError(message: string): BadRequestException {
    return new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message,
        details: [{ field: LAYERS_FIELD, errors: [message] }],
    })
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value)

const isFiniteNumber = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value)

const HEX = /^#[0-9a-fA-F]{6}$/

/** `of`: "de la imagen 1", "del texto 2". */
function parsePlacement(value: unknown, of: string): LayerPlacement {
    const invalid = layersError(`La ubicación ${of} no es válida.`)
    if (!isRecord(value)) throw invalid
    const { x, y, scale, rotation } = value
    if (![x, y, scale, rotation].every(isFiniteNumber)) throw invalid
    const { offset } = PLACEMENT_LIMITS
    if (Math.abs(x as number) > offset || Math.abs(y as number) > offset) throw invalid
    if (
        (scale as number) < PLACEMENT_LIMITS.scale.min ||
        (scale as number) > PLACEMENT_LIMITS.scale.max
    ) {
        throw layersError(`El tamaño ${of} está fuera de rango.`)
    }
    if (Math.abs(rotation as number) > PLACEMENT_LIMITS.rotation) throw invalid
    return {
        x: x as number,
        y: y as number,
        scale: scale as number,
        rotation: rotation as number,
    }
}

/** Trims each line and drops `\r`; null when it breaks the length or line limits. */
export function normalizeText(value: unknown): string | null {
    if (typeof value !== 'string') return null
    const lines = value
        .replace(/\r/g, '')
        .split('\n')
        .map((line) => line.trim())
    while (lines.length > 1 && lines.at(-1) === '') lines.pop()
    while (lines.length > 1 && lines[0] === '') lines.shift()
    const content = lines.join('\n')
    const length = [...content].length
    if (!content.trim() || length > MAX_TEXT_LENGTH || lines.length > MAX_TEXT_LINES) return null
    return content
}

function parseText(value: Record<string, unknown>, z: number, number: number): DesignTextLayer {
    const content = normalizeText(value.content)
    if (content === null) {
        throw layersError(
            `Escribe el texto ${number} con 1 a ${MAX_TEXT_LENGTH} caracteres, en ${MAX_TEXT_LINES} líneas como máximo.`,
        )
    }
    if (typeof value.font !== 'string' || !Object.hasOwn(DESIGN_FONTS, value.font)) {
        throw layersError(`Elige una de nuestras fuentes para el texto ${number}.`)
    }
    if (typeof value.color !== 'string' || !HEX.test(value.color)) {
        throw layersError(`El color del texto ${number} debe ser un color #RRGGBB.`)
    }
    const outline = value.outline ?? 'none'
    if (!TEXT_OUTLINES.includes(outline as TextOutline)) {
        throw layersError(`El borde del texto ${number} no es válido.`)
    }
    const align = value.align ?? 'center'
    if (!TEXT_ALIGNS.includes(align as TextAlign)) {
        throw layersError(`La alineación del texto ${number} no es válida.`)
    }
    return {
        type: 'text',
        z,
        placement: parsePlacement(value.placement, `del texto ${number}`),
        content,
        font: value.font as DesignFontId,
        color: value.color.toUpperCase(),
        outline: outline as TextOutline,
        align: align as TextAlign,
    }
}

/**
 * Validates the `layers` field of `POST /designs` (JSON text): 1 to 8 layers, at most 5 images
 * and 3 texts; each image names one of the uploaded originals (`assetIndex`, every file used
 * exactly once); `z` orders them (any distinct integers). Returns them bottom to top, with `z`
 * renumbered 0…n-1. Throws a 400 with a Spanish message on the first problem.
 */
export function parseRequestedLayers(raw: unknown, originalsCount: number): RequestedLayer[] {
    let value: unknown = raw
    if (typeof raw === 'string') {
        try {
            value = JSON.parse(raw)
        } catch {
            throw layersError('Las capas del diseño no son válidas.')
        }
    }
    if (!Array.isArray(value)) throw layersError('Las capas del diseño no son válidas.')
    if (!value.length) throw layersError('Agrega una imagen o un texto a tu diseño.')

    const images = value.filter((layer) => isRecord(layer) && layer.type === 'image').length
    const texts = value.filter((layer) => isRecord(layer) && layer.type === 'text').length
    if (images + texts !== value.length) throw layersError('Las capas del diseño no son válidas.')
    if (images > MAX_IMAGE_LAYERS) {
        throw layersError(`Puedes usar hasta ${MAX_IMAGE_LAYERS} imágenes por diseño.`)
    }
    if (texts > MAX_TEXT_LAYERS) {
        throw layersError(`Puedes usar hasta ${MAX_TEXT_LAYERS} textos por diseño.`)
    }
    if (images !== originalsCount) {
        throw layersError('Cada imagen del diseño debe venir con su archivo original.')
    }

    const zs = (value as Record<string, unknown>[]).map((layer) => layer.z)
    if (!zs.every((z) => Number.isInteger(z)) || new Set(zs).size !== zs.length) {
        throw layersError('El orden de las capas no es válido.')
    }

    const usedAssets = new Set<number>()
    let imageNumber = 0
    let textNumber = 0
    const layers = (value as Record<string, unknown>[]).map((layer): RequestedLayer => {
        const z = layer.z as number
        if (layer.type === 'text') return parseText(layer, z, ++textNumber)
        imageNumber += 1
        const { assetIndex } = layer
        if (
            !Number.isInteger(assetIndex) ||
            (assetIndex as number) < 0 ||
            (assetIndex as number) >= originalsCount ||
            usedAssets.has(assetIndex as number)
        ) {
            throw layersError('Cada imagen del diseño debe venir con su archivo original.')
        }
        usedAssets.add(assetIndex as number)
        return {
            type: 'image',
            z,
            assetIndex: assetIndex as number,
            placement: parsePlacement(layer.placement, `de la imagen ${imageNumber}`),
        }
    })
    return layers.sort((a, b) => a.z - b.z).map((layer, index) => ({ ...layer, z: index }))
}

export function imageLayers(layers: readonly DesignLayer[] | null | undefined): DesignImageLayer[] {
    return (layers ?? []).filter((layer): layer is DesignImageLayer => layer.type === 'image')
}

export function textLayers(layers: readonly DesignLayer[] | null | undefined): DesignTextLayer[] {
    return (layers ?? []).filter((layer): layer is DesignTextLayer => layer.type === 'text')
}

/** The lowest DPI among the image layers; null for a design with only text. */
export function lowestDpi(layers: readonly DesignLayer[]): number | null {
    const images = imageLayers(layers)
    return images.length ? Math.min(...images.map((layer) => layer.dpi)) : null
}

/** A text layer's content on one line ("Sofía / 7"). */
export function textOnOneLine(content: string): string {
    return content.replace(/\s*\n\s*/g, ' / ')
}

/** "«Sofía 7», «Luna»" (texts bottom to top); null without text layers. */
export function designTextsSummary(
    layers: readonly DesignLayer[] | null | undefined,
): string | null {
    const texts = textLayers(layers)
    return texts.length
        ? texts.map((layer) => `«${textOnOneLine(layer.content)}»`).join(', ')
        : null
}

/** "2 imágenes · 1 texto". */
export function layersSummary(layers: readonly DesignLayer[] | null | undefined): string {
    const images = imageLayers(layers).length
    const texts = textLayers(layers).length
    return [
        images ? `${images} ${images === 1 ? 'imagen' : 'imágenes'}` : null,
        texts ? `${texts} ${texts === 1 ? 'texto' : 'textos'}` : null,
    ]
        .filter(Boolean)
        .join(' · ')
}

/** `MR-000123-linea1-arte-final.png`. */
export function artworkFilename(code: string, line: number): string {
    return `${code}-linea${line}-arte-final.png`
}

/** `MR-000123-linea1-imagen2.jpg`. */
export function originalFilename(
    code: string,
    line: number,
    number: number,
    format: string,
): string {
    return `${code}-linea${line}-imagen${number}.${format}`
}
