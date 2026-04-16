/** Shared brand styles for transactional HTML emails (matches app primary CTA). */
export const EMAIL_BRAND_PRIMARY = "#014aad";

export const EMAIL_PAGE_BG = "#f4f4f4";

/** Checkmark below “The AI-Q Platform Team” — no external images; works in major clients. */
export function emailSignatureCheckmarkHtml(): string {
  return `<p style="margin:8px 0 16px;font-size:18px;line-height:1;color:${EMAIL_BRAND_PRIMARY};"></p>`;
}
