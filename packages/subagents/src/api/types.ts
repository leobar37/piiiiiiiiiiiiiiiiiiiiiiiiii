import type { InferContractRouterInputs, InferContractRouterOutputs } from "@orpc/contract";
import type { subagentsContract } from "./contract.js";

/**
 * Inferred input types for every procedure in the contract.
 * Useful for frontend forms and backend handler signatures.
 */
export type SubagentsInputs = InferContractRouterInputs<typeof subagentsContract>;

/**
 * Inferred output types for every procedure in the contract.
 * Useful for frontend component props and caching.
 */
export type SubagentsOutputs = InferContractRouterOutputs<typeof subagentsContract>;
