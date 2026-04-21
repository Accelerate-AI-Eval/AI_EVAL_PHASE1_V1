/**
 * Substitutes attestation label placeholders with values from form state.
 * Currently replaces *this product* with the trimmed product name when present.
 */
export function personalizeAttestationFieldLabel(
  label: string,
  productName: string | null | undefined,
): string {
  if (!label.includes("*this product*")) return label;
  const name = (productName ?? "").trim();
  return name.length > 0 ? label.replaceAll("*this product*", name) : label;
}
