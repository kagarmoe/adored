import { TutorialArticle } from "@/features/tutorials/TutorialArticle";
import { getTutorial } from "@/features/tutorials/tutorials";

const steps = [
  {
    title: "Open People",
    body: "Collection owners can open People from a collection and invite someone by email.",
  },
  {
    title: "Invite a collaborator",
    body: "An accepted invitation gives that person curator access to the collection, so they can help with the collection itself.",
  },
  {
    title: "Save a result",
    body: "Public sharing starts after sorting. Open a result, adjust it if needed, then finalize it.",
  },
  {
    title: "Create a public link",
    body: "Saved results show a Create link control for the result curator. The link opens a read-only result without requiring an account.",
  },
] as const;

export default function SharingTutorialPage() {
  return (
    <TutorialArticle
      tutorial={getTutorial("sharing")}
      intro="Invite and share are two different things in Adored. Invite gives a person access to a collection. Share creates a read-only link to a saved result."
      steps={steps}
      closing="Use invites for collaboration. Use shared links when you have a result you want someone else to see."
    />
  );
}
