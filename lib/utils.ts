type ClassValue = string | false | null | undefined;

/** Minimal class joiner. Not tailwind-merge — order your classes deliberately. */
export function cn(...parts: ClassValue[]): string {
  return parts.filter(Boolean).join(" ");
}
