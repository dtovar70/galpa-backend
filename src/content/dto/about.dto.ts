import { Type } from 'class-transformer'
import { IsIn, ValidateNested } from 'class-validator'
import { feminine, masculine, msg } from '../../common/validation/messages.js'
import {
    ABOUT_VALUE_ICONS,
    type AboutContent,
    type AboutStat,
    type AboutValue,
} from '../content.types.js'
import { CONTENT_LIST_SIZES, CONTENT_LIMITS as MAX } from './content-limits.js'
import { ContentList, ContentText, ContentTextList } from './content-validation.js'

export class AboutValueDto implements AboutValue {
    @IsIn(ABOUT_VALUE_ICONS, { message: msg.invalid(masculine('El ícono del valor')) })
    icon: AboutValue['icon']

    @ContentText(masculine('El título del valor'), { max: MAX.itemTitle })
    title: string

    @ContentText(feminine('La descripción del valor'), { max: MAX.text })
    description: string
}

export class AboutStatDto implements AboutStat {
    @ContentText(feminine('La cifra'), { max: MAX.statValue })
    value: string

    @ContentText(masculine('El texto de la cifra'), { max: MAX.label })
    label: string
}

export class AboutContentDto implements AboutContent {
    @ContentText(feminine('La etiqueta de Nosotros'), { max: MAX.label })
    badge: string

    @ContentText(masculine('El título de Nosotros'), { max: MAX.title, highlights: true })
    title: string

    @ContentTextList(feminine('La lista de párrafos'), {
        ...CONTENT_LIST_SIZES.paragraphs,
        max: MAX.paragraph,
        placeholders: ['marca', 'ciudad'],
        item: (position) => masculine(`El párrafo ${position}`),
    })
    paragraphs: string[]

    @ContentText(masculine('El botón de Nosotros'), { max: MAX.label })
    ctaLabel: string

    @ContentText(feminine('La etiqueta de la imagen'), { max: MAX.label })
    imageBadge: string

    @ContentText(masculine('El antetítulo de los valores'), { max: MAX.label })
    valuesEyebrow: string

    @ContentText(masculine('El título de los valores'), { max: MAX.title, highlights: true })
    valuesTitle: string

    @ContentText(feminine('La descripción de los valores'), { max: MAX.text, optional: true })
    valuesDescription: string

    @ContentList(feminine('La lista de valores'), CONTENT_LIST_SIZES.values)
    @ValidateNested({ each: true })
    @Type(() => AboutValueDto)
    values: AboutValueDto[]

    @ContentText(masculine('El antetítulo de las cifras'), { max: MAX.label })
    statsEyebrow: string

    @ContentText(masculine('El título de las cifras'), { max: MAX.title, highlights: true })
    statsTitle: string

    @ContentList(feminine('La lista de cifras'), CONTENT_LIST_SIZES.stats)
    @ValidateNested({ each: true })
    @Type(() => AboutStatDto)
    stats: AboutStatDto[]
}
