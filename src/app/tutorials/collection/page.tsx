import { TutorialArticle } from "@/features/tutorials/TutorialArticle";
import { getTutorial } from "@/features/tutorials/tutorials";

const steps = [
  {
    title: "Create the collection",
    body: "Start with a name for the group of things you want to understand. You can refine details later.",
  },
  {
    title: "Add photos first",
    body: "Upload photos into the collection pool. Photos can wait there while you decide what each one should become.",
  },
  {
    title: "Make items when you are ready",
    body: "Group photos into items, add names when they help, and leave unfinished details alone until they matter.",
  },
] as const;

export default function CollectionTutorialPage() {
  return (
    <TutorialArticle
      tutorial={getTutorial("collection")}
      intro="A collection starts with the things in front of you. Photos can come first; item details can follow when they are useful."
      steps={steps}
      closing="You do not need a perfect catalog before sorting. Start with enough material to recognize each piece."
    />
  );
}
