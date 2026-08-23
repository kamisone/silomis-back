import { Injectable } from '@nestjs/common';

export interface BackendErrorEntry {
  id: string;
  timestamp: string;
  method: string;
  url: string;
  status: number;
  message: string;
  stack?: string;
}

const MAX = 50;

/** Small in-memory ring buffer of recent 5xx errors, surfaced to the admin panel. */
@Injectable()
export class ErrorCollectorService {
  private readonly entries: BackendErrorEntry[] = [];

  push(entry: Omit<BackendErrorEntry, 'id' | 'timestamp'>): void {
    this.entries.unshift({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      ...entry,
    });
    if (this.entries.length > MAX) this.entries.splice(MAX);
  }

  getAll(): BackendErrorEntry[] {
    return [...this.entries];
  }
}
