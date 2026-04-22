export function getClientConfigRaw(key: string): string | undefined {
  // Admin runtime overrides are stored locally (non-destructive UI config).
  const local = localStorage.getItem(`config_${key}`);
  if (local !== null && local !== undefined) return local;

  const v = (import.meta.env as any)[key];
  return v === undefined ? undefined : String(v);
}

export function getClientConfigNumber(key: string, fallback: number): number {
  const raw = getClientConfigRaw(key);
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export function getClientConfigBoolean(key: string, fallback: boolean): boolean {
  const raw = getClientConfigRaw(key);
  if (!raw) return fallback;
  const v = raw.toLowerCase().trim();
  if (["true", "1", "yes", "y", "on"].includes(v)) return true;
  if (["false", "0", "no", "n", "off"].includes(v)) return false;
  return fallback;
}

