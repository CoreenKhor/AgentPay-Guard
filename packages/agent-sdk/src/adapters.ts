import { AgentPayGuardInterceptor, InterceptResponse } from "./interceptor.js";

export interface GuardedToolResult<TOutput> {
  success: boolean;
  data?: TOutput;
  error?: string;
  guardStatus?: string;
  signature?: string;
  ticketId?: string;
}

/**
 * Wraps an arbitrary tool execution function for LangChain agents with AgentPay Guard.
 * Provides structured error return strings to allow the agent LLM to replan upon denial.
 */
export function createGuardedLangChainTool<TInput, TOutput>(
  interceptor: AgentPayGuardInterceptor,
  toolName: string,
  targetRecipient: string,
  costCalculator: (input: TInput) => bigint,
  executeOriginal: (input: TInput) => Promise<TOutput>
) {
  return async (input: TInput): Promise<GuardedToolResult<TOutput>> => {
    const cost = costCalculator(input);

    const interceptResult: InterceptResponse = await interceptor.interceptTransaction({
      agentId: "langchain-agent",
      recipient: targetRecipient,
      amountLamports: cost,
      metadata: {
        endpoint: `/tool/${toolName}`,
        servicePayload: input,
      },
    });

    if (!interceptResult.success && interceptResult.status !== "SETTLED") {
      return {
        success: false,
        error: interceptResult.error || "Economic action halted by AgentPay Guard security kernel",
        guardStatus: interceptResult.status,
        ticketId: interceptResult.approvalTicket?.ticketId,
      };
    }

    try {
      const output = await executeOriginal(input);
      return {
        success: true,
        data: output,
        guardStatus: interceptResult.status,
        signature: interceptResult.signature,
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Tool execution failed: ${err.message}`,
        guardStatus: "EXECUTION_ERROR",
      };
    }
  };
}

export interface ElizaOSAction {
  name: string;
  description: string;
  handler: (agentId: string, params: any) => Promise<any>;
}

export interface ElizaOSPlugin {
  name: string;
  description: string;
  actions: ElizaOSAction[];
}

/**
 * Drop-in plugin for ElizaOS autonomous agent runtime.
 * Integrates into ElizaOS actions pipeline to enforce financial governance.
 */
export function createElizaOSGuardPlugin(interceptor: AgentPayGuardInterceptor): ElizaOSPlugin {
  return {
    name: "agentpay-guard",
    description: "Inline financial governance and circuit breaker layer for Solana payments",
    actions: [
      {
        name: "EXECUTE_GUARDED_PAYMENT",
        description: "Transfers funds via AgentPay Guard security kernel",
        handler: async (agentId: string, params: { recipient: string; amountLamports: string; payload?: any }) => {
          return await interceptor.interceptTransaction({
            agentId,
            recipient: params.recipient,
            amountLamports: BigInt(params.amountLamports),
            metadata: {
              endpoint: "/eliza/action",
              servicePayload: params.payload ?? params,
            },
          });
        },
      },
      {
        name: "CHECK_PAYMENT_POLICY",
        description: "Pre-evaluates spending policy without dispatching payment",
        handler: async (_agentId: string, params: { recipient: string; amountLamports: string }) => {
          return interceptor.policyEngine.evaluate({
            recipient: params.recipient,
            amountLamports: BigInt(params.amountLamports),
            currentDailySpentLamports: 0n,
          });
        },
      },
    ],
  };
}

/**
 * Drop-in action wrapper for Solana Agent Kit actions.
 */
export function wrapSolanaAgentKitAction<TParams, TReturn>(
  interceptor: AgentPayGuardInterceptor,
  actionName: string,
  actionHandler: (params: TParams) => Promise<TReturn>
) {
  return async (params: TParams & { recipient: string; amountLamports: bigint; payload?: any }): Promise<TReturn> => {
    const check = await interceptor.interceptTransaction({
      agentId: "solana-agent-kit",
      recipient: params.recipient,
      amountLamports: params.amountLamports,
      metadata: {
        endpoint: `/solana-agent-kit/${actionName}`,
        servicePayload: params.payload ?? params,
      },
    });

    if (!check.success && check.status !== "SETTLED") {
      throw new Error(`[AgentPayGuard] Action '${actionName}' blocked: ${check.error}`);
    }

    return await actionHandler(params);
  };
}
