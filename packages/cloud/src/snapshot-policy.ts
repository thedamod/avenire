/** Runtime snapshot selection; independent of the snapshot's build-time assets. */
export const AVENIRE_SNAPSHOT = "avenire-sandbox-v7";
/** Daytona fixes resources at snapshot creation; the plan's disk cap is 10 GB. */
export const SANDBOX_RESOURCES = { cpu: 4, memory: 8, disk: 10 } as const;
