/** Error with a stable code translated by the UI (`t.errors[code]`); `params` fill `{placeholders}`. */
export class AppError extends Error {
  constructor(
    public code: string,
    public params: Record<string, string | number> = {},
    message?: string,
  ) {
    super(message ?? code);
    this.name = "AppError";
  }
}
