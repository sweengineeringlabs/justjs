export type MemoryKind = "episodic" | "structured" | "semantic";
export type MemorySource = "user" | "agent";

export interface MemoryRecord {
  readonly id: string;
  readonly userId: string;
  readonly kind: MemoryKind;
  readonly content: string;
  readonly embedding?: number[];
  readonly tags?: string[];
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly source: MemorySource;
}
