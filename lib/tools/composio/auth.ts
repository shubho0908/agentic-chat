import { getComposioClient } from "./index";
import { type ComposioToolkit, COMPOSIO_TOOLKITS } from "./config";
import { logger } from "@/lib/logger";

export interface ConnectedService {
  id: string;
  toolkit: string;
  status: string;
}

export async function initiateConnection(
  userId: string,
  toolkit: ComposioToolkit,
  callbackUrl: string
): Promise<{ redirectUrl: string; connectionId: string } | null> {
  const client = getComposioClient();
  if (!client) return null;

  try {
    const authConfigs = await client.authConfigs.list({ toolkit });
    const authConfig = authConfigs.items[0];
    if (!authConfig) {
      logger.error(`[Composio] No auth config found for toolkit: ${toolkit}`);
      return null;
    }

    const connectionRequest = await client.connectedAccounts.link(userId, authConfig.id, {
      callbackUrl,
    });

    if (!connectionRequest.redirectUrl) {
      logger.error(`[Composio] No redirect URL returned for toolkit: ${toolkit}`);
      return null;
    }

    return {
      redirectUrl: connectionRequest.redirectUrl,
      connectionId: connectionRequest.id,
    };
  } catch (error) {
    logger.error(`[Composio] Failed to initiate connection for ${toolkit}:`, error);
    return null;
  }
}

export async function getConnectedServices(userId: string): Promise<ConnectedService[]> {
  const client = getComposioClient();
  if (!client) return [];

  try {
    const response = await client.connectedAccounts.list({
      userIds: [userId],
      statuses: ["ACTIVE"],
    });

    return response.items.map((account) => ({
      id: account.id,
      toolkit: account.toolkit.slug,
      status: account.status,
    }));
  } catch (error) {
    logger.error("[Composio] Failed to list connected services:", error);
    return [];
  }
}

export async function getConnectedToolkits(userId: string): Promise<ComposioToolkit[]> {
  const services = await getConnectedServices(userId);
  return services
    .map((s) => s.toolkit)
    .filter((t): t is ComposioToolkit => COMPOSIO_TOOLKITS.includes(t as ComposioToolkit));
}

export async function disconnectService(userId: string, connectedAccountId: string): Promise<boolean> {
  const client = getComposioClient();
  if (!client) return false;

  try {
    const response = await client.connectedAccounts.list({
      userIds: [userId],
    });
    const ownsAccount = response.items.some((a) => a.id === connectedAccountId);
    if (!ownsAccount) {
      logger.error(`[Composio] User ${userId} does not own account ${connectedAccountId}`);
      return false;
    }

    await client.connectedAccounts.delete(connectedAccountId);
    return true;
  } catch (error) {
    logger.error("[Composio] Failed to disconnect service:", error);
    return false;
  }
}
