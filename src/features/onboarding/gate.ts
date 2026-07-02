// The ONE place the first-run walkthrough decision lives. The collections server
// component calls this with its already-loaded collection count and the dismissal
// cookie; zero collections AND not dismissed -> show the walkthrough (redirect to
// /welcome server-side, before rendering — no flash).
export function shouldShowWelcome(collectionCount: number, dismissed: boolean): boolean {
  return collectionCount === 0 && !dismissed;
}
