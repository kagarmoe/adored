# Phase 3 Completion Status: API Routes

**Date:** 2026-05-29  
**Status:** ~60% Complete - Core Workflows Enabled, Additional Routes Remaining

---

## Completed (✅)

### Controllers (All 13)
- ✅ UserController - Profile management
- ✅ CollectionController - Collection CRUD
- ✅ MemberController - Permission management
- ✅ InvitationController - Token-based invitations
- ✅ ItemController - Item CRUD
- ✅ PhotoController - Photo management (stubs)
- ✅ SessionController - Session management
- ✅ DecisionController - Decision events
- ✅ PreferenceController - Preference queries
- ✅ ResultController - Result management
- ✅ ResultItemController - Manual re-ranking
- ✅ ShareController - Result sharing
- ✅ All with Zod validation schemas

### Critical Stubs Implemented
- ✅ MemberController.removeMember() - Actually deletes membership
- ✅ InvitationController.revokeInvitation() - Updates status to revoked
- ✅ ResultController.createDraftResult() - Creates draft from preferences
- ✅ DecisionController errors - Clear messages on what's needed
- ✅ Purge confirmation - Removed redundant double-check

### Route Files Completed (17/40+)
**Users:**
- ✅ GET/PATCH/DELETE /users/me

**Collections:**
- ✅ GET/POST /collections
- ✅ GET/PATCH/DELETE /collections/{id}
- ✅ POST /collections/{id}/archive
- ✅ POST /collections/{id}/restore
- ✅ POST /collections/{id}/purge

**Members:**
- ✅ GET/POST /collections/{id}/members
- ✅ GET/PATCH/DELETE /collections/{id}/members/{mid}

**Items:**
- ✅ GET/POST /collections/{id}/items
- ✅ GET/PATCH/DELETE /items/{id}
- ✅ POST /items/{id}/restore
- ✅ POST /items/{id}/purge

**Sessions:**
- ✅ GET/POST /collections/{id}/sessions
- ✅ GET /collections/{id}/sessions/active
- ✅ GET/PATCH/DELETE /sessions/{id}

**Decisions:**
- ✅ GET/POST /sessions/{id}/decisions

**Infrastructure:**
- ✅ Auth utilities (getSession, requireAuth, UnauthorizedError)
- ✅ Error handling (api-errors.ts with Zod formatting)
- ✅ ID generation (ULID-based generateId utility)
- ✅ Database access (getDb injection pattern)

---

## Remaining (⏳)

### Route Files Needed (23+ routes)

**Invitations (5 routes)**
- POST /collections/{id}/invitations (create)
- GET /collections/{id}/invitations (list collection invitations)
- GET /invitations/{id} (get)
- PATCH /invitations/{id} (update permissions)
- DELETE /invitations/{id} (revoke)
- POST /invitations/{id}/resend (resend email)
- POST /invitations/{token}/accept (accept invitation)

**Photos (5 routes)**
- GET /items/{id}/photos (list)
- POST /items/{id}/photos (upload)
- GET /items/{id}/photos/{pid} (get metadata)
- PATCH /items/{id}/photos/{pid} (update metadata)
- DELETE /items/{id}/photos/{pid} (delete and remove blob)

**Preferences (5 routes)**
- GET /collections/{id}/preferences (summary)
- GET /collections/{id}/preferences/items (list all)
- GET /collections/{id}/preferences/items/{id} (single)
- POST /collections/{id}/preferences/recalculate (force recalculate)
- DELETE /collections/{id}/preferences (clear)

**Results (6 routes)**
- GET /collections/{id}/sort-results (list curator results)
- POST /sessions/{id}/results/draft (create draft)
- GET /sessions/{id}/results/draft (get session draft)
- GET /sort-results/{id} (get result)
- PATCH /sort-results/{id} (update name/visibility)
- DELETE /sort-results/{id} (delete draft)
- POST /sort-results/{id}/finalize (finalize)
- POST /sort-results/{id}/supersede (create new from finalized)

**Result Items (4 routes)**
- GET /sort-results/{id}/items (list)
- GET /sort-results/{id}/items/{rid} (get)
- PATCH /sort-results/{id}/items/{rid} (set manual rank/bucket)
- POST /sort-results/{id}/items/{rid}/reset (remove override)
- DELETE /sort-results/{id}/items/{rid} (remove from result)

**Shares (4 routes)**
- GET /sort-results/{id}/shares (list)
- POST /sort-results/{id}/shares (create share token)
- GET /sort-results/{id}/shares/{sid} (get)
- PATCH /sort-results/{id}/shares/{sid} (update expiration)
- DELETE /sort-results/{id}/shares/{sid} (revoke)
- GET /shared-results/{token} (public view)

**Decision Events (1 route)**
- GET /decision-events/{id} (get by ID)

### Implementation Work Remaining

**Database Repository Methods Needed:**
- [ ] DecisionEventRepository.findById()
- [ ] DecisionEventRepository.findBySession()
- [ ] InvitationRepository.findByCollection()
- [ ] InvitationRepository.findByToken()
- [ ] PreferenceRepository.findByItem(itemId, curatorId)
- [ ] ResultRepository.findByCollection(collectionId, curatorId)
- [ ] SortResultShareRepository.findByResult(resultId)
- [ ] SortResultShareRepository.findByToken(token)

**Service Integration Needed:**
- [ ] SortResultService integration for draft creation
- [ ] PhotoService for blob upload/delete
- [ ] Email service for invitation resends
- [ ] Token validation for invitation/share acceptance

**Security/Access Control:**
- [ ] Collection membership validation on item access
- [ ] Permission flag checks (can_sort, can_view_outputs)
- [ ] Expiration checks on share tokens and invitations
- [ ] Curator validation for session operations

---

## Effort Estimate

| Category | Tasks | Est. Hours |
|----------|-------|-----------|
| Route file creation | 23 endpoints | 4-5 |
| Repository method implementation | 8 methods | 3-4 |
| Service integration | 4 integrations | 3-4 |
| Access control fixes | 5 areas | 2-3 |
| Bug fixes from review | 3 items | 1-2 |
| **Total** | **43 tasks** | **13-18 hours** |

---

## Phase 3 Readiness Assessment

### For Phase 4 UI Development:
**Status: ⚠️ PARTIAL - Core Workflows Work, Many Features Blocked**

**Can Build UI For:**
- ✅ Authentication (sign in/up)
- ✅ Collections (list, create, archive/restore)
- ✅ Items (list, create, view, edit, delete)
- ✅ Members (list, add, edit permissions, remove)
- ✅ Sessions (create, get active)
- ✅ Decision recording (triage/pairwise)

**Cannot Build UI For (API Missing):**
- ❌ Invitations (no routes for creation/acceptance)
- ❌ Photos (no upload/list endpoints)
- ❌ Preferences (no query/recalculate endpoints)
- ❌ Sort Results (no draft/finalize/supersede endpoints)
- ❌ Result sharing (no share creation/public view)

### Recommendation:
**Complete remaining routes before starting UI development** to avoid:
1. Building UI that can't call API endpoints
2. Rewriting UI when endpoints are added later
3. Uneven feature coverage across app

---

## Next Steps

1. **Complete Route File Creation** (4-5 hours)
   - Create 23 remaining route files following established patterns
   - Each following: auth → validate → service → response

2. **Implement Repository Methods** (3-4 hours)
   - Add missing finder methods to repositories
   - Ensure filtering/scoping is correct

3. **Add Access Control** (2-3 hours)
   - Collection membership checks
   - Permission flag validation
   - Token expiration checks

4. **Service Integration** (3-4 hours)
   - Wire SortResultService for result creation
   - Photo upload to Vercel Blob
   - Email sending for invitations

5. **Testing & Verification** (1-2 hours)
   - Verify all 40+ endpoints work
   - Test authorization boundaries
   - Confirm error handling

---

## Code Quality Notes

✅ **Strengths:**
- Clean controller design with consistent patterns
- Proper use of TypeScript interfaces
- Comprehensive Zod validation
- Good separation of concerns
- ULID-based ID generation

⚠️ **Improvements Made:**
- Fixed ID generation inconsistency (Collections)
- Implemented critical stubs (removeMember, purge, etc.)
- Clarified error messages on unimplemented methods

⚠️ **Still Needed:**
- Resource-level access control (collection membership checks)
- Permission flag validation
- Error message sanitization (no Zod parser internals)

---

**Branch:** `complete-refactor`  
**Last Updated:** 2026-05-29 (after code review)  
**Status:** Ready for continued implementation
