/**
 * The in-memory database the memory adapters share: named tables of plain
 * rows by id. Every row is deep-cloned going in and coming out
 * (structuredClone: Dates, Maps and byte arrays survive), so no caller can
 * change stored data through a reference it kept.
 */
export type Row = Record<string, unknown>;

export interface StoredRow<T extends Row = Row> {
  id: string;
  row: T;
}

export class MemoryState {
  private readonly tables = new Map<string, Map<string, Row>>();

  private table(name: string): Map<string, Row> {
    let table = this.tables.get(name);
    if (!table) this.tables.set(name, (table = new Map()));
    return table;
  }

  /** The row, or null. */
  get<T extends Row = Row>(table: string, id: string): T | null {
    const row = this.tables.get(table)?.get(id);
    return row ? (structuredClone(row) as T) : null;
  }

  /** Every row of a table, by id, optionally filtered. */
  rows<T extends Row = Row>(table: string, where?: (row: T, id: string) => boolean): StoredRow<T>[] {
    const out: StoredRow<T>[] = [];
    const rows = this.tables.get(table);
    if (!rows) return out;
    for (const id of [...rows.keys()].sort()) {
      const row = rows.get(id) as T;
      if (!where || where(row, id)) out.push({ id, row: structuredClone(row) });
    }
    return out;
  }

  /** Write the whole row (replacing any). */
  put(table: string, id: string, row: Row): void {
    this.table(table).set(id, structuredClone(row));
  }

  /** Merge these fields into the row (made when absent); a field set to `undefined` is removed. */
  merge(table: string, id: string, fields: Row): void {
    const next: Row = { ...(this.tables.get(table)?.get(id) ?? {}), ...structuredClone(fields) };
    for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key];
    this.table(table).set(id, next);
  }

  delete(table: string, id: string): void {
    this.tables.get(table)?.delete(id);
  }

  /** Seed rows (a test's starting data). */
  seed(table: string, rows: Record<string, Row>): void {
    for (const [id, row] of Object.entries(rows)) this.put(table, id, row);
  }

  /** Everything, cloned: `{ table: { id: row } }`. */
  dump(): Record<string, Record<string, Row>> {
    const out: Record<string, Record<string, Row>> = {};
    for (const [name, rows] of this.tables) {
      if (rows.size) out[name] = Object.fromEntries([...rows].map(([id, row]) => [id, structuredClone(row)]));
    }
    return out;
  }

  clear(): void {
    this.tables.clear();
  }
}
