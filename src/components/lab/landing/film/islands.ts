/**
 * Where the server's island HTML waits for its island (Island.tsx): one registry per process on `globalThis`, which
 * the server component that builds an island's HTML writes (World.tsx, as its module loads) and the island reads
 * while the server renders it. A plain module: a server component may call it (an export of a 'use client' module
 * would only be a reference there).
 */
type Registry = Record<string, string>;

export const islandRegistry = (): Registry => ((globalThis as { __filmIslands?: Registry }).__filmIslands ??= {});

/** Registers an island's HTML under its id, and answers the id (for the island to name). */
export function islandHtml(id: string, html: string): string {
  islandRegistry()[id] = html;
  return id;
}
