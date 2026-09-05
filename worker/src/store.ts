import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { log } from "./log.js";

/**
 * One JSON file per record, held in memory, rewritten whole on every change.
 *
 * A build panel for one operator holds hundreds of records, not millions, and this buys three
 * things a database would not: no native module to compile for the container, a history that
 * survives being copied off the VPS with `scp -r`, and records an operator can read and repair
 * with `cat` when something has gone wrong at three in the morning.
 */
export class Collection<T extends { id: string }> {
  private readonly records = new Map<string, T>();

  /**
   * `hydrate` fills in fields a record written by an older version does not have. Applied on the
   * way in rather than at every use, so nothing downstream has to guard for a field that only
   * appeared in a later release.
   */
  constructor(private readonly dir: string, private readonly hydrate: (record: T) => T = (record) => record) {
    mkdirSync(dir, { recursive: true });
    for (const entry of readdirSync(dir)) {
      if (!entry.endsWith(".json")) continue;
      const path = join(dir, entry);
      try {
        const record = JSON.parse(readFileSync(path, "utf8")) as T;
        if (record?.id) this.records.set(record.id, this.hydrate(record));
      } catch (failure) {
        // A half-written file from a hard kill. Losing one record beats refusing to start.
        log.warn(`ignoring unreadable record ${path}`, failure);
      }
    }
  }

  get size(): number {
    return this.records.size;
  }

  all(): T[] {
    return [...this.records.values()];
  }

  get(id: string): T | null {
    return this.records.get(id) ?? null;
  }

  put(record: T): T {
    this.records.set(record.id, record);
    const path = join(this.dir, `${record.id}.json`);
    const pending = `${path}.tmp`;
    // Written aside and renamed, because a build writing its own record while the machine loses
    // power is exactly how the half-file above gets created.
    writeFileSync(pending, JSON.stringify(record, null, 2));
    renameSync(pending, path);
    return record;
  }

  remove(id: string): void {
    this.records.delete(id);
    rmSync(join(this.dir, `${id}.json`), { force: true });
  }
}
