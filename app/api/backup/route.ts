import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../chatgpt-auth";
import { backupRequest } from "../../../lib/backup-api";

export const dynamic = "force-dynamic";

async function handle(request: Request) {
  const user = await getChatGPTUser();
  return backupRequest(request, user, env.DB);
}

export const GET = handle;
export const PUT = handle;
