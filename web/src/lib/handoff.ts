/**
 * Passes result files to the next tool ("continue with…") across a client-side navigation.
 * Lives in module memory only: lost on a full page load, which is fine (the user re-uploads).
 */
let pending: File[] | null = null;

export function handOff(files: File[]) {
  pending = files;
}

export function peekHandOff(): File[] | null {
  return pending;
}

export function clearHandOff() {
  pending = null;
}
