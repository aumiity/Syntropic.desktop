// VAT (ภาษีมูลค่าเพิ่ม) helpers. Prices in this app are VAT-inclusive — the
// configured price already contains VAT, so the tax is "backed out" of an
// amount rather than added on top: VAT = amount × rate / (100 + rate).
export const VAT_RATE_DEFAULT = 7

export const extractVat = (amountInclusive: number, rate: number): number =>
  amountInclusive * rate / (100 + rate)
