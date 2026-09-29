/**
 * Spanish validation messages shared by every DTO. Each field is described once with its Spanish
 * name (including the article) and grammatical gender, and the builders below agree with it:
 * `required(PRICE)` -> "El precio es obligatorio.", `required(LABEL)` -> "La etiqueta es obligatoria."
 */
export interface FieldName {
    /** Capitalized, with article: "El precio", "La etiqueta de la variante". */
    readonly name: string
    readonly feminine: boolean
}

export function masculine(name: string): FieldName {
    return { name, feminine: false }
}

export function feminine(name: string): FieldName {
    return { name, feminine: true }
}

function agree(field: FieldName, masculineForm: string, feminineForm: string): string {
    return field.feminine ? feminineForm : masculineForm
}

/** "99999999.99" -> "99.999.999,99" (Venezuelan formatting). */
function formatNumber(value: number): string {
    return value.toLocaleString('es-VE', { maximumFractionDigits: 2 })
}

export const msg = {
    required: (field: FieldName) =>
        `${field.name} es ${agree(field, 'obligatorio', 'obligatoria')}.`,
    text: (field: FieldName) => `${field.name} debe ser un texto.`,
    maxLength: (field: FieldName, max: number) =>
        `${field.name} no puede superar los ${max} caracteres.`,
    number: (field: FieldName) => `${field.name} debe ser un número.`,
    /** For `@IsNumber({ maxDecimalPlaces: 2 })`, which reports both problems with one message. */
    money: (field: FieldName) => `${field.name} debe ser un número con hasta 2 decimales.`,
    integer: (field: FieldName) => `${field.name} debe ser un número entero.`,
    /** Only digits, exactly `count` of them: "La referencia debe tener exactamente 6 dígitos." */
    exactDigits: (field: FieldName, count: number) =>
        `${field.name} debe tener exactamente ${count} dígitos.`,
    notNegative: (field: FieldName) =>
        `${field.name} no puede ser ${agree(field, 'negativo', 'negativa')}.`,
    min: (field: FieldName, min: number) =>
        `${field.name} debe ser como mínimo ${formatNumber(min)}.`,
    max: (field: FieldName, max: number) =>
        `${field.name} no puede ser mayor que ${formatNumber(max)}.`,
    boolean: (field: FieldName) => `${field.name} debe ser verdadero o falso.`,
    list: (field: FieldName) => `${field.name} debe ser una lista.`,
    listMaxSize: (field: FieldName, max: number) =>
        `${field.name} admite como máximo ${max} elementos.`,
    listMinSize: (field: FieldName, min: number) =>
        `${field.name} debe tener al menos ${min} ${min === 1 ? 'elemento' : 'elementos'}.`,
    listUnique: (field: FieldName) => `${field.name} no puede tener elementos repetidos.`,
    email: (field: FieldName) =>
        `${field.name} debe ser un correo válido, por ejemplo hola@correo.com.`,
    /** `example` shows the expected shape: "0412-5550134". */
    format: (field: FieldName, example: string) =>
        `${field.name} debe tener el formato ${example}.`,
    invalid: (field: FieldName) => `${field.name} no es ${agree(field, 'válido', 'válida')}.`,
    hexColor: (field: FieldName) =>
        `${field.name} debe tener formato hexadecimal, por ejemplo #FFB3D1.`,
} as const

/**
 * Messages for constraints that class-validator generates itself (not declared on a DTO), keyed
 * by constraint name. Used by the global ValidationPipe to replace the English defaults.
 */
export const SYSTEM_CONSTRAINT_MESSAGES: Readonly<
    Partial<Record<string, (property: string) => string>>
> = {
    whitelistValidation: (property) => `El campo "${property}" no está permitido.`,
    nestedValidation: (property) =>
        `El campo "${property}" debe ser un objeto o una lista de objetos.`,
    unknownValue: () => 'Los datos enviados no tienen el formato esperado.',
}
