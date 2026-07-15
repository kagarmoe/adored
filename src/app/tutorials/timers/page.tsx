import { TutorialArticle } from "@/features/tutorials/TutorialArticle";
import { getTutorial } from "@/features/tutorials/tutorials";

const steps = [
  {
    title: "Choose a round length",
    body: "A timer gives a sorting round a soft edge. Pick a length that helps you stay with one decision at a time.",
  },
  {
    title: "Use no timer when that feels better",
    body: "No timer is valid. It keeps the round open when you want more room or are sorting at an uneven pace.",
  },
  {
    title: "Let expiry be a pause, not a failure",
    body: "When time runs out, the round can stop cleanly. You can continue sorting from the dashboard.",
  },
  {
    title: "Take a break",
    body: "Stepping away is part of the flow. A break preserves the work without turning the timer into pressure.",
  },
] as const;

export default function TimersTutorialPage() {
  return (
    <TutorialArticle
      tutorial={getTutorial("timers")}
      intro="Timers are there to shape a round, not to rush you. Use them only when they make sorting feel easier."
      steps={steps}
      closing="The point is a calm stopping place. The timer should support that, not compete with it."
    />
  );
}
