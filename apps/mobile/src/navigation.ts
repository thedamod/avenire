import type { NavigationProp } from "@react-navigation/native";
import type { ClusterId } from "@avenire/contracts";

export type RootStackParamList = {
  Home: undefined;
  Cluster: { clusterId: ClusterId; name: string };
};

export type RootNavigation = NavigationProp<RootStackParamList>;
