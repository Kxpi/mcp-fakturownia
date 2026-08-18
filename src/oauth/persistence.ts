import { mkdirSync, readFileSync, renameSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import path from 'node:path';

export function loadJsonFile<T>(filePath: string, fallback: T): T {
  try {
    if (!existsSync(filePath)) {
      return fallback;
    }
    const raw = readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveJsonFile(filePath: string, data: unknown): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp`;
  writeFileSync(tempPath, JSON.stringify(data, null, 2));
  renameSync(tempPath, filePath);
}

export function deleteJsonFile(filePath: string): void {
  if (existsSync(filePath)) {
    unlinkSync(filePath);
  }
}
