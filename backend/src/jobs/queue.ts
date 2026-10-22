import { AppError } from "../errors.js";

interface Task {
  id: string;
  run: () => Promise<void>;
}

/**
 * A small in-process FIFO queue. One worker by default: a 100-page extraction holds a 60 MB
 * buffer and several concurrent model calls, so running uploads one at a time keeps the demo
 * box predictable. Each task is wrapped in a hard timeout so a stuck call cannot block the
 * queue for everyone else.
 */
export class JobQueue {
  private readonly waiting: Task[] = [];
  private active = 0;

  constructor(
    private readonly concurrency: number,
    private readonly timeoutMs: number,
    private readonly maxWaiting: number,
    private readonly onError: (id: string, err: unknown) => void,
  ) {}

  enqueue(id: string, run: () => Promise<void>): void {
    if (this.waiting.length >= this.maxWaiting) throw new AppError("queue_full");
    this.waiting.push({ id, run });
    this.pump();
  }

  stats(): { active: number; waiting: number } {
    return { active: this.active, waiting: this.waiting.length };
  }

  private pump(): void {
    while (this.active < this.concurrency && this.waiting.length > 0) {
      const task = this.waiting.shift()!;
      this.active++;
      void this.execute(task).finally(() => {
        this.active--;
        this.pump();
      });
    }
  }

  private async execute(task: Task): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new AppError("job_timeout")), this.timeoutMs);
    });
    try {
      await Promise.race([task.run(), timeout]);
    } catch (err) {
      this.onError(task.id, err);
    } finally {
      clearTimeout(timer);
    }
  }
}
