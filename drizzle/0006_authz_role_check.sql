UPDATE memberships SET role='curator' WHERE role NOT IN ('owner','curator');
--> statement-breakpoint
UPDATE memberships m SET role='owner' FROM collections c WHERE m.collection_id=c.id AND m.user_id=c.owner_id AND m.role<>'owner';
--> statement-breakpoint
UPDATE memberships m SET role='curator' FROM collections c WHERE m.collection_id=c.id AND m.user_id<>c.owner_id AND m.role<>'curator';
--> statement-breakpoint
ALTER TABLE memberships ADD CONSTRAINT memberships_role_check CHECK (role IN ('owner','curator'));
