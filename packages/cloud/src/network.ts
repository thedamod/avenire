/** Domain firewall policy; package indexes only, with no provider or Avenire hosts. */
export const PACKAGE_INDEX_DOMAINS = "registry.npmjs.org,pypi.org,files.pythonhosted.org";
/**
 * Daytona tiers 1–2 fix egress at the organisation ("restricted"): creating a sandbox with
 * `domainAllowList`/`networkAllowList` is rejected with 400 and running sandboxes can't be
 * updated. Their default policy already allows only essential services (package registries,
 * Git hosts, OS mirrors, AI providers), which covers `packages`; `open` needs tier 3+.
 */
export type DaytonaNetworkTier = "restricted" | "open";
export const cloudNetworkSettings = (mode: "packages" | "open", tier: DaytonaNetworkTier) =>
  tier === "restricted"
    ? {}
    : mode === "open"
      ? { networkBlockAll: false, networkAllowList: "", domainAllowList: "" }
      : { networkBlockAll: false, networkAllowList: "", domainAllowList: PACKAGE_INDEX_DOMAINS };
