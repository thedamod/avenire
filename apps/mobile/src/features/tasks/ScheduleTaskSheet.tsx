import type { ScreenProps } from "../../navigation";
import { Screen } from "../../ui/Screen";
import { TaskScheduleForm } from "./TaskScheduleForm";

export function ScheduleTaskSheet({ navigation }: ScreenProps<"ScheduleTask">) {
  return (
    <Screen edges={["left", "right", "bottom"]} style={{ backgroundColor: "#131313" }}>
      <TaskScheduleForm onClose={() => navigation.goBack()} />
    </Screen>
  );
}
