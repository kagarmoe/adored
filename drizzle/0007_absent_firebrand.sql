ALTER TABLE "invitations" DROP COLUMN IF EXISTS "can_manage_collection";--> statement-breakpoint
ALTER TABLE "invitations" DROP COLUMN IF EXISTS "can_invite_members";--> statement-breakpoint
ALTER TABLE "invitations" DROP COLUMN IF EXISTS "can_add_items";--> statement-breakpoint
ALTER TABLE "invitations" DROP COLUMN IF EXISTS "can_edit_metadata";--> statement-breakpoint
ALTER TABLE "invitations" DROP COLUMN IF EXISTS "can_add_photos";--> statement-breakpoint
ALTER TABLE "invitations" DROP COLUMN IF EXISTS "can_delete_photos";--> statement-breakpoint
ALTER TABLE "invitations" DROP COLUMN IF EXISTS "can_sort";--> statement-breakpoint
ALTER TABLE "invitations" DROP COLUMN IF EXISTS "can_view_outputs";--> statement-breakpoint
ALTER TABLE "memberships" DROP COLUMN IF EXISTS "can_manage_collection";--> statement-breakpoint
ALTER TABLE "memberships" DROP COLUMN IF EXISTS "can_invite_members";--> statement-breakpoint
ALTER TABLE "memberships" DROP COLUMN IF EXISTS "can_add_items";--> statement-breakpoint
ALTER TABLE "memberships" DROP COLUMN IF EXISTS "can_delete_items";--> statement-breakpoint
ALTER TABLE "memberships" DROP COLUMN IF EXISTS "can_edit_metadata";--> statement-breakpoint
ALTER TABLE "memberships" DROP COLUMN IF EXISTS "can_add_photos";--> statement-breakpoint
ALTER TABLE "memberships" DROP COLUMN IF EXISTS "can_delete_photos";--> statement-breakpoint
ALTER TABLE "memberships" DROP COLUMN IF EXISTS "can_sort";--> statement-breakpoint
ALTER TABLE "memberships" DROP COLUMN IF EXISTS "can_view_outputs";