import { clsx, type ClassValue } from "clsx";

/**
 * Combines class names cleanly using clsx.
 */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
