import Link from 'next/link'

export interface OnboardingInvite {
  collectionId: number
  collectionName: string
  role: 'operator' | 'curator'
}

interface Props {
  invites: OnboardingInvite[]
}

/**
 * First-run screen for a signed-in user with no collection memberships. They
 * can create their first collection, and — for the edge case where an invite
 * arrived this session and was not auto-claimed at sign-in — join any pending
 * invites directly.
 */
export function OnboardingScreen({ invites }: Props) {
  return (
    <div className="max-w-md">
      <h1 className="font-display text-heading text-text-primary mb-2">
        Welcome to PurseInator
      </h1>
      <p className="font-body text-text-muted mb-8">
        Start by creating a collection — or join one you&apos;ve been invited to.
      </p>

      {invites.length > 0 && (
        <div className="mb-8">
          <p className="font-display text-label uppercase tracking-widest text-text-muted mb-3">
            You&apos;ve been invited
          </p>
          <ul className="flex flex-col gap-3">
            {invites.map(invite => (
              <li
                key={invite.collectionId}
                className="flex items-center justify-between bg-surface rounded-lg px-5 py-4"
              >
                <span className="font-display text-text-primary">
                  {invite.collectionName}
                  <span className="font-body text-sm text-text-muted ml-2">
                    · {invite.role}
                  </span>
                </span>
                <Link
                  href={`/${invite.collectionId}`}
                  className="font-display text-label uppercase tracking-widest text-accent no-underline"
                >
                  Join →
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Link
        href="/collections/new"
        className="inline-block bg-accent text-ground font-display text-label uppercase tracking-widest px-6 py-3 rounded no-underline hover:opacity-90 transition-opacity"
      >
        Create a new collection
      </Link>
    </div>
  )
}
