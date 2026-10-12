/** Domain firewall policy; package indexes only, with no provider or Avenire hosts. */
export const PACKAGE_INDEX_DOMAINS = "registry.npmjs.org,pypi.org,files.pythonhosted.org";
export const cloudNetworkSettings = (mode: "packages" | "open") =>
  mode === "open"
    ? { networkBlockAll: false, networkAllowList: "", domainAllowList: "" }
    : { networkBlockAll: false, networkAllowList: "", domainAllowList: PACKAGE_INDEX_DOMAINS };
