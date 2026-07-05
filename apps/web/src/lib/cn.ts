/** Join conditional class names — a tiny local `clsx`, no dependency. */
export type ClassValue = string | false | null | undefined;

export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(' ');
}
