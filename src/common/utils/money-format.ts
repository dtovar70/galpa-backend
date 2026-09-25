/**
 * Venezuelan number formatting for documents and messages: "1.234,56". Done by hand instead of
 * `Intl` so the output never depends on the ICU data of the Node build.
 */
export function formatVeNumber(amount: number, decimals = 2): string {
    const fixed = Math.abs(amount).toFixed(decimals)
    const [whole, fraction] = fixed.split('.')
    const grouped = (whole ?? '0').replace(/\B(?=(\d{3})+(?!\d))/g, '.')
    const sign = amount < 0 && Number(fixed) !== 0 ? '-' : ''
    return `${sign}${grouped}${fraction ? `,${fraction}` : ''}`
}

/** "$1.234,50". */
export function formatUsd(amount: number): string {
    return `$${formatVeNumber(amount)}`
}

/** "Bs. 1.234,56". */
export function formatBs(amount: number): string {
    return `Bs. ${formatVeNumber(amount)}`
}
