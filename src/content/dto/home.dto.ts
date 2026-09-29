import { Type } from 'class-transformer'
import { ValidateNested } from 'class-validator'
import { feminine, masculine, type FieldName } from '../../common/validation/messages.js'
import type { HomeContent, HomeStep, HomeTestimonial } from '../content.types.js'
import { CONTENT_LIST_SIZES, CONTENT_LIMITS as MAX } from './content-limits.js'
import { ContentList, ContentText, ContentTextList } from './content-validation.js'

const eyebrow = (section: string): FieldName => masculine(`El antetítulo de ${section}`)
const title = (section: string): FieldName => masculine(`El título de ${section}`)
const description = (section: string): FieldName => feminine(`La descripción de ${section}`)

export class HomeStepDto implements HomeStep {
    @ContentText(masculine('El título del paso'), { max: MAX.itemTitle })
    title: string

    @ContentText(feminine('La descripción del paso'), { max: MAX.text })
    description: string
}

export class HomeTestimonialDto implements HomeTestimonial {
    @ContentText(feminine('La opinión del cliente'), { max: MAX.testimonialQuote })
    quote: string

    @ContentText(masculine('El nombre del cliente'), { max: MAX.testimonialName })
    name: string

    @ContentText(feminine('La ciudad del cliente'), { max: MAX.city, optional: true })
    city: string

    @ContentText(masculine('El producto de la reseña'), {
        max: MAX.testimonialProduct,
        optional: true,
    })
    product: string
}

export class HomeContentDto implements HomeContent {
    @ContentText(feminine('La etiqueta de la portada'), { max: MAX.label })
    heroBadge: string

    @ContentText(masculine('El titular de la portada'), { max: MAX.title, highlights: true })
    heroTitle: string

    @ContentText(masculine('El subtítulo de la portada'), { max: MAX.text })
    heroSubtitle: string

    @ContentText(masculine('El botón principal de la portada'), { max: MAX.label })
    heroPrimaryCta: string

    @ContentText(masculine('El botón secundario de la portada'), { max: MAX.label })
    heroSecondaryCta: string

    @ContentTextList(feminine('La lista de ventajas'), {
        ...CONTENT_LIST_SIZES.heroFeatures,
        max: MAX.label,
        item: (position) => feminine(`La ventaja ${position}`),
    })
    heroFeatures: string[]

    @ContentText(eyebrow('las categorías'), { max: MAX.label })
    categoriesEyebrow: string

    @ContentText(title('las categorías'), { max: MAX.title, highlights: true })
    categoriesTitle: string

    @ContentText(description('las categorías'), {
        max: MAX.text,
        placeholders: ['categorias'],
    })
    categoriesDescription: string

    @ContentText(eyebrow('los favoritos'), { max: MAX.label })
    featuredEyebrow: string

    @ContentText(title('los favoritos'), { max: MAX.title, highlights: true })
    featuredTitle: string

    @ContentText(description('los favoritos'), { max: MAX.text })
    featuredDescription: string

    @ContentText(masculine('El botón de los favoritos'), { max: MAX.label })
    featuredCta: string

    @ContentText(eyebrow('los pasos'), { max: MAX.label })
    stepsEyebrow: string

    @ContentText(title('los pasos'), { max: MAX.title, highlights: true })
    stepsTitle: string

    @ContentText(description('los pasos'), { max: MAX.shortText, optional: true })
    stepsDescription: string

    @ContentList(feminine('La lista de pasos'), CONTENT_LIST_SIZES.steps)
    @ValidateNested({ each: true })
    @Type(() => HomeStepDto)
    steps: HomeStepDto[]

    @ContentText(eyebrow('las reseñas'), { max: MAX.label })
    testimonialsEyebrow: string

    @ContentText(title('las reseñas'), { max: MAX.title, highlights: true })
    testimonialsTitle: string

    @ContentList(feminine('La lista de reseñas'), CONTENT_LIST_SIZES.testimonials)
    @ValidateNested({ each: true })
    @Type(() => HomeTestimonialDto)
    testimonials: HomeTestimonialDto[]

    @ContentText(feminine('La etiqueta del banner final'), { max: MAX.label })
    ctaBadge: string

    @ContentText(title('el banner final'), { max: MAX.title, highlights: true })
    ctaTitle: string

    @ContentText(description('el banner final'), { max: MAX.text })
    ctaDescription: string

    @ContentText(masculine('El botón principal del banner final'), { max: MAX.label })
    ctaPrimary: string

    @ContentText(masculine('El botón secundario del banner final'), { max: MAX.label })
    ctaSecondary: string
}
