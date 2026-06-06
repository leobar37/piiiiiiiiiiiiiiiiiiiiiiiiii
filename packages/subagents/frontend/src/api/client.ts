import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createORPCReactQueryUtils } from "@orpc/react-query";
import type { ContractRouterClient } from "@orpc/contract";
import { subagentsContract } from "@subagents/contract";

export type SubagentsClient = ContractRouterClient<typeof subagentsContract>;

const rpcUrl = typeof window === "undefined" ? "http://127.0.0.1/rpc" : new URL("/rpc", window.location.origin).toString();
const link = new RPCLink({ url: rpcUrl });

export const orpc: SubagentsClient = createORPCClient(link);

export const api = createORPCReactQueryUtils(orpc);
