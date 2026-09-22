/**
 * Capitalise words for display without destroying names the user capitalised themselves.
 *
 * A word keeps its own casing when it already contains an upper-case letter after the first
 * character, so acronyms and mixed-case brands survive: OpenAI, IBM, eBay, PwC. Only casual
 * all-lower-case input is capitalised ("openai" -> "Openai", "admin" -> "Admin").
 */
export function capitalizeWords(str: string): string {
  if (!str || typeof str !== "string") return str;
  return str
    .trim()
    .split(/\s+/)
    .map((word) =>
      /[A-Z]/.test(word.slice(1)) ? word : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(" ");
}
