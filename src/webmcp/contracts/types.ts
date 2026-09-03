/**
 * Contracts are the single source of truth for tool names, descriptions, and
 * schemas. The runtime registers from them and the agent console counts them,
 * so nothing can claim a tool the app did not actually declare.
 *
 * Chrome's published budgets are hard limits here, enforced by `assertBudgets`:
 * 30 characters per tool and parameter name, 500 per tool description, 150 per
 * parameter description.
 */

export const NAME_LIMIT = 30;
export const TOOL_DESCRIPTION_LIMIT = 500;
export const PARAM_DESCRIPTION_LIMIT = 150;

export const TEXT_PARAMETER_LIMIT = 80;

/** Roughly Chrome's guidance for a single tool result. */
export const OUTPUT_LIMIT = 1500;

export type PropertyType = "string" | "number" | "boolean";

export interface PropertySchema {
  readonly type: PropertyType;
  readonly description: string;
  readonly enum?: readonly string[];
  readonly maxLength?: number;
  readonly minimum?: number;
  readonly maximum?: number;
}

export interface ObjectSchema {
  readonly type: "object";
  readonly properties: Readonly<Record<string, PropertySchema>>;
  readonly required: readonly string[];
}

export interface ToolAnnotations {
  /** Set on every tool that cannot change the sheet. */
  readonly readOnlyHint: boolean;
  /** Set when the output can carry text a person or an agent authored. */
  readonly untrustedContentHint?: boolean;
}

export interface ToolContract {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly inputSchema: ObjectSchema;
  readonly annotations: ToolAnnotations;
}

export const text = (
  description: string,
  options?: readonly string[],
): PropertySchema => ({
  type: "string",
  description,
  maxLength: TEXT_PARAMETER_LIMIT,
  ...(options ? { enum: options } : {}),
});

export const number = (
  description: string,
  minimum: number,
  maximum: number,
): PropertySchema => ({ type: "number", description, minimum, maximum });

export const flag = (description: string): PropertySchema => ({
  type: "boolean",
  description,
});

export const noArguments: ObjectSchema = {
  type: "object",
  properties: {},
  required: [],
};

export const schema = (
  properties: Readonly<Record<string, PropertySchema>>,
  required: readonly string[] = [],
): ObjectSchema => ({ type: "object", properties, required });

/**
 * Fail loudly at startup rather than shipping a tool Chrome would truncate.
 * Called by the runtime before anything is registered.
 */
export const assertBudgets = (contracts: readonly ToolContract[]): void => {
  for (const contract of contracts) {
    if (contract.name.length > NAME_LIMIT) {
      throw new Error(`Tool name over ${NAME_LIMIT} characters: ${contract.name}`);
    }

    if (contract.description.length > TOOL_DESCRIPTION_LIMIT) {
      throw new Error(`Tool description too long: ${contract.name}`);
    }

    for (const [parameter, property] of Object.entries(
      contract.inputSchema.properties,
    )) {
      if (parameter.length > NAME_LIMIT) {
        throw new Error(`Parameter name too long: ${contract.name}.${parameter}`);
      }

      if (property.description.length > PARAM_DESCRIPTION_LIMIT) {
        throw new Error(
          `Parameter description too long: ${contract.name}.${parameter}`,
        );
      }
    }
  }

  const names = contracts.map((contract) => contract.name);
  const unique = new Set(names);

  if (unique.size !== names.length) {
    throw new Error("Duplicate tool name in the contract list.");
  }
};
