// Utilitários internos da camada de API (não re-exportados em index.ts).
import { addDays, parseISO } from 'date-fns';

/** numeric do Postgres → number (ou null). */
export function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** numeric do Postgres → number (0 se vazio). */
export function num(v: unknown): number {
  return numOrNull(v) ?? 0;
}

/** Início do dia local (yyyy-MM-dd) em ISO. */
export function inicioDoDiaISO(d: string): string {
  return parseISO(d).toISOString();
}

/** Início do dia seguinte (limite exclusivo) em ISO. */
export function fimExclusivoISO(d: string): string {
  return addDays(parseISO(d), 1).toISOString();
}

/** Remove caracteres que quebram filtros `or()`/`ilike` do PostgREST. */
export function sanitizarBusca(s: string): string {
  return s.replace(/[,()%*\\:"']/g, ' ').trim();
}

/** Remove chaves com valor `undefined` (para não sobrescrever defaults do banco). */
export function semUndefined<T extends object>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) if (v !== undefined) out[k] = v;
  return out as Partial<T>;
}
