/** Persian/Arabic text normalization utilities for atlas search. */
export function normalizeFa(input: string): string {
  return input.normalize('NFKC')
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[ـًٌٍَُِّْ]/g, '')
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 1776))
    .toLocaleLowerCase('fa')
    .trim();
}
export function includesNormalized(value: unknown, query: string): boolean {
  return normalizeFa(value === null || value === undefined ? '' : String(value)).includes(normalizeFa(query));
}
