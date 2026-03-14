export interface RenderableResult<TFull = unknown> {
  toFull(): TFull;
  toCompact(): string;
}

export function isRenderableResult(value: unknown): value is RenderableResult {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    typeof (value as RenderableResult).toFull === "function" &&
    typeof (value as RenderableResult).toCompact === "function"
  );
}
