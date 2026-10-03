import { createAuthClient } from "better-auth/react";

export const createAvenireAuthClient = (baseURL: string) => createAuthClient({ baseURL });

export type AvenireAuthClient = ReturnType<typeof createAvenireAuthClient>;
