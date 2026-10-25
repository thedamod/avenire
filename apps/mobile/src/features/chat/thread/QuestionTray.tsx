import { useState } from "react";
import { View } from "react-native";
import { colors } from "../../../theme/tokens";
import { Icon, Text } from "../../../ui";
import { splitChoice, type PendingQuestion } from "./requests";
import { ThreadTray, TrayButton, TrayRow } from "./ThreadTray";

/** Parent keys this by toolCallId, so a subsequent question starts with no stale choice. */
export function QuestionTray({ question, total, busy, onAnswer, onSkip }: {
  question: PendingQuestion; total: number; busy: boolean;
  onAnswer: (answers: readonly string[]) => void; onSkip: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [selected, setSelected] = useState<readonly string[]>([]);
  const toggle = (choice: string) => {
    if (busy) return;
    setSelected((current) => question.multiSelect ? current.includes(choice) ? current.filter((item) => item !== choice) : [...current, choice] : [choice]);
  };
  return <ThreadTray title={question.question} meta={question.multiSelect ? "Choose any that apply" : "Ruth needs one answer to continue"} expanded={expanded} onToggle={() => setExpanded(!expanded)} step={total > 1 ? `1/${total}` : undefined}
    footer={<><TrayButton variant="ghost" disabled={busy} onPress={onSkip}>Skip</TrayButton><View style={{ flex: 1 }} />{question.choices.length ? <TrayButton disabled={busy || !selected.length} onPress={() => onAnswer(selected)}>{total > 1 ? "Next" : "Send"}</TrayButton> : null}</>}>
    {question.choices.map((choice, index) => {
      const { label, detail } = splitChoice(choice);
      const isSelected = selected.includes(choice);
      return <TrayRow key={choice} title={label} detail={detail} selected={isSelected} onPress={() => toggle(choice)} trailing={isSelected ? <Icon name="check" color={colors.accent} size={16} /> : <Text variant="mono" color="fg-3">{index + 1}</Text>} />;
    })}
  </ThreadTray>;
}
