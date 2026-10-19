import { handleAuth } from "../../../../server/authRuntime.ts";

export const runtime = "nodejs";
export const GET = handleAuth;
export const POST = handleAuth;
