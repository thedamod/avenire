import "react-native-gesture-handler";
import "@expo/metro-runtime";
import { registerRootComponent } from "expo";
import App from "./src/App";

import { AppRegistry } from "react-native";
import { runAvaTask } from "./src/features/native-screen/task";

AppRegistry.registerHeadlessTask("AvenireAva", () => runAvaTask);
registerRootComponent(App);
