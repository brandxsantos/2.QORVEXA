# QORVEXA

**Connect Beyond Limits.**

QORVEXA is a social platform in development. The responsive landing page, Supabase email authentication, password recovery, protected member route, profile schema, and first database-backed text-post feed are in place.

## Get started

1. Install [Node.js LTS](https://nodejs.org/) and Git.
2. From this folder, install dependencies:

   ```sh
   npm install
   ```

   In Windows PowerShell, use `npm.cmd` instead if script execution blocks `npm.ps1`.

3. Configure the local Supabase environment. Copy `.env.example` to `.env.local` and add your project URL and publishable key. Vite requires the `VITE_` prefix.

4. Apply migrations **in order** in the Supabase Dashboard’s SQL Editor:

   `supabase/migrations/20261106230000_profiles_auth.sql`

   `supabase/migrations/20261106235900_admin_security.sql`

   `supabase/migrations/20261107003000_admin_dashboard_metrics.sql`

   `supabase/migrations/20261107010000_posts_feed.sql`

   `supabase/migrations/20261107011500_comments.sql`

   `supabase/migrations/20261107020000_friends_messaging.sql`

   `supabase/migrations/20261107021500_realtime_presence_policy_fix.sql` (apply after the friends/messaging migration if it was already run)

   `supabase/migrations/20261107023000_admin_management.sql` (apply once, after all migrations above; adds staff role support, report intake, user restrictions, content moderation, and admin management RPCs)

5. In Supabase Authentication settings, enable email/password sign-in and email confirmations. Add the local and production `/app` and `/reset-password` URLs to the allowed redirect URLs (for local development, include both `localhost:5173` and `127.0.0.1:5173`).

6. Create an account and verify its email. In Authentication → Users, copy the account UUID, replace `null::uuid` in `supabase/setup/bootstrap_super_admin.sql` with that UUID, then run that script once in the SQL Editor. The bootstrap script writes a security audit entry and cannot be run from the website.

7. Start the development server:

   ```sh
   npm run dev
   ```

8. Check the production build and lint:

   ```sh
   npm run build
   npm run lint
   ```

## Technology blueprint

| Layer | Technology |
| --- | --- |
| Frontend | React + Vite |
| Routing | React Router |
| Styling | Tailwind CSS |
| Icons | Lucide React |
| Language | JavaScript |
| Backend, authentication, database, storage, and real-time | Supabase + PostgreSQL |
| Hosting and analytics | Cloudflare Pages + Cloudflare Web Analytics |
| Source control | Git + GitHub |
| Access control | Supabase Row Level Security (RLS) |

## Project structure

```text
src/
  components/
    auth/
    landing/
  context/
  lib/
  pages/
  App.jsx
  App.css
  index.css
public/
supabase/
  migrations/
  setup/
```

The authentication routes are `/signup`, `/login`, and `/forgot-password`; `/app` is protected. The profile migration creates a public profile containing only display name, username, bio, and avatar URL, with Row Level Security and self-only updates. Do not put an email address or other private account information in this public table. The first feed migration adds text posts: authenticated members can read posts and insert only posts attributed to their own account. The initial feed shows the newest 50 posts and limits post text to 1,000 characters. The comments migration adds comments and one-level replies, permits signed-in members to read and publish comments as themselves, and permits users to delete only their own comments. Comment text is limited to 1,000 characters.

The friends/messaging migration adds protected friend requests and friendships, in-app notifications, direct conversations and messages, and database functions for relationship changes and exact unread-message summaries. Network pages are `/app/discover`, `/app/friends`, `/app/notifications`, and `/app/messages`. Online presence and typing use authorized Supabase Realtime channels; last-active times are updated while the app is visible and when it is hidden, so abrupt disconnects may leave a timestamp up to one heartbeat interval old. Discovery is paged in batches of 200 profiles. Users must remain accepted friends to access their conversation and messages.

The initial `/admin/overview` is protected twice: the client requires an authenticated session, and its overview data is returned only by a database `SECURITY DEFINER` function that checks `admin_roles`. Regular clients cannot read or modify `admin_roles`; the initial owner is provisioned only through the trusted SQL Editor bootstrap script. The dashboard metrics migration adds authorized counts from Supabase Auth (total, verified/unverified, registrations today, this week, and this month) and a seven-day registration chart. It intentionally does not invent activity, suspension, or content metrics that the current schema does not support.

The admin foundation includes authorization, owner bootstrap, an immutable-to-client audit table, and the real-data overview. The admin-management migration adds report intake, staff review, per-action restrictions for posting, commenting, messaging, and friend requests, and auditable hide/restore moderation. These restrictions do not disable sign-in or read access. Permanent Auth-account deletion is deliberately not included; it requires a separately secured server-side function and an agreed retention policy. The migration cannot verify the live project schema from this workspace, so apply it only after the listed prerequisite migrations have succeeded.

Frontend environment variables are public in the built app: use only the Supabase publishable key and never use a `service_role` key. Enable and test RLS policies for every table before exposing data.

For Cloudflare Pages, connect the GitHub repository and set the build command to `npm run build` and the output directory to `dist`. Add the two `VITE_SUPABASE_*` variables in the Cloudflare Pages project settings. Cloudflare Web Analytics can be enabled in the Pages dashboard once the site is deployed.

## Development phases

1. Project setup, branding, global styles, responsive landing page.
2. Authentication and initial user profile schema (in progress).
3. Feed, posts, likes, comments, and bookmarks.
4. Friends, discovery, friend notifications, messaging, and realtime presence (initial implementation).
5. Likes, follows, bookmarks, media, and expanded notifications.
6. Stories and groups.
7. Admin authorization foundation (in progress); settings, moderation, and administration follow their data schemas.
8. Security review, responsive testing, optimization, and deployment.
