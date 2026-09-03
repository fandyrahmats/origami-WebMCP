import { READ_CONTRACTS } from "./read.js";
import { assertBudgets } from "./types.js";
import type { ToolContract } from "./types.js";
import { WRITE_CONTRACTS } from "./write.js";

export const CONTRACTS: readonly ToolContract[] = [
  ...READ_CONTRACTS,
  ...WRITE_CONTRACTS,
];

export const contractFor = (name: string): ToolContract | null =>
  CONTRACTS.find((contract) => contract.name === name) ?? null;

export { READ_CONTRACTS, WRITE_CONTRACTS, assertBudgets };
export * from "./types.js";
