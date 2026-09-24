import { feminine, masculine } from '../../common/validation/messages.js'
import type { AnnouncementsContent } from '../content.types.js'
import { CONTENT_LIST_SIZES, CONTENT_LIMITS as MAX } from './content-limits.js'
import { ContentTextList } from './content-validation.js'

export class AnnouncementsContentDto implements AnnouncementsContent {
    @ContentTextList(feminine('La lista de anuncios'), {
        ...CONTENT_LIST_SIZES.announcements,
        max: MAX.announcement,
        placeholders: ['envioGratis', 'tarifaEnvio'],
        item: (position) => masculine(`El anuncio ${position}`),
    })
    messages: string[]
}
