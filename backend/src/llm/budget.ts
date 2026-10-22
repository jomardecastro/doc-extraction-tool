import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { AppError } from "../errors.js";

interface Ledger {
  date: string;
  usedUsd: number;
}

/**
 * A daily spending cap for the live demo. Reviewers can upload as many documents as they like
 * up to the cap; after that new work is refused with a clear message while cached results and
 * precomputed samples keep working. The ledger is a tiny JSON file so it survives restarts.
 */
export class Budget {
  private ledger: Ledger = { date: today(), usedUsd: 0 };
  private loaded = false;

  constructor(
    private readonly file: string,
    readonly capUsd: number,
  ) {}

  async load(): Promise<void> {
    try {
      const parsed = JSON.parse(await readFile(this.file, "utf8")) as Ledger;
      if (parsed.date === today()) this.ledger = parsed;
    } catch {
      // first run, or an unreadable file: start from zero for today
    }
    this.loaded = true;
  }

  async check(): Promise<void> {
    if (!this.loaded) await this.load();
    this.rollover();
    if (this.capUsd > 0 && this.ledger.usedUsd >= this.capUsd) throw new AppError("budget_exceeded");
  }

  async add(usd: number): Promise<void> {
    if (!this.loaded) await this.load();
    this.rollover();
    this.ledger.usedUsd = Math.round((this.ledger.usedUsd + usd) * 10000) / 10000;
    await mkdir(path.dirname(this.file), { recursive: true });
    await writeFile(this.file, JSON.stringify(this.ledger));
  }

  view(): { usedUsd: number; capUsd: number } {
    this.rollover();
    return { usedUsd: this.ledger.usedUsd, capUsd: this.capUsd };
  }

  private rollover() {
    if (this.ledger.date !== today()) this.ledger = { date: today(), usedUsd: 0 };
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
