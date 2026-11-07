import type { AgentScope, DeepReadonly } from "./agent-types";

/** Read-only boundary. Connector input never grants write, send, or new source permissions. */
export type ConnectorGrant = DeepReadonly<{
  workspaceId: string;
  connectorId: string;
  scope: readonly AgentScope[];
  version: number;
  revokedAt: string | null;
}>;
export type ConnectorPage = DeepReadonly<{
  workspaceId: string;
  records: readonly { id: string; text: string; occurredAt: string }[];
  nextCursor: string | null;
  coverage: { from: string | null; through: string; complete: boolean };
}>;
export interface ReadOnlyAgentConnector {
  readonly id: string;
  read(
    input: DeepReadonly<{
      workspaceId: string;
      grant: ConnectorGrant;
      cursor: string | null;
    }>,
  ): Promise<ConnectorPage>;
  revoke(grant: ConnectorGrant): Promise<void>;
}

export function assertConnectorGrant(
  grant: ConnectorGrant,
  workspaceId: string,
  connectorId: string,
  scope: AgentScope,
): void {
  if (
    grant.workspaceId !== workspaceId ||
    grant.connectorId !== connectorId ||
    grant.revokedAt !== null ||
    !grant.scope.includes(scope)
  ) {
    throw new Error("来源授权无效或已撤销");
  }
}
