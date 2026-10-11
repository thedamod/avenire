import type { NavigationProp } from "@react-navigation/native";
import type { FolderId } from "@avenire/contracts";

export type RootStackParamList = {
  Home: undefined;
  Folder: { folderId: FolderId; name: string };
};

export type RootNavigation = NavigationProp<RootStackParamList>;
