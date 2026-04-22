# AI Support Agent Frontend

Production-grade React 18 + TypeScript UI for the AI Support Agent backend.

## Tech Stack

- React 18 + TypeScript + Vite
- React Router v6
- TanStack Query
- React Hook Form + Zod
- shadcn/ui primitives + Tailwind CSS
- Lucide icons
- Recharts (analytics)
- Vitest + RTL (unit tests)

## Setup

1. Install dependencies:
   - `cd frontend`
   - `npm install`

2. Environment:
   - Copy `frontend/.env.example` to `frontend/.env`
   - Set at least `VITE_API_BASE_URL` (and optionally `VITE_QR_BRIDGE_URL`)

3. Run dev server:
   - `npm run dev`

4. Build:
   - `npm run build`

5. Tests:
   - `npm test`

## Scripts

- `dev` - run Vite dev server
- `build` - build for production
- `lint` - eslint
- `test` - run Vitest suite

## Environment Variables

- `VITE_API_BASE_URL` - Backend API base URL (default: `http://localhost:8000/api/v1`)
- `VITE_QR_BRIDGE_URL` - QR bridge iframe URL (default: `http://localhost:3000/qr`)
- `VITE_DEFAULT_SCREENSHARE_TARGET_FPS` - default screenshare target FPS
- `VITE_DEFAULT_SCREENSHARE_USE_GEMINI_EMBEDDINGS` - default Gemini embeddings toggle

### Admin Settings Note

The Admin `Settings` page now includes advanced tabbed sections (General, Branding, Tickets,
Security, Notifications, System) plus runtime env overrides.
All values are stored in `localStorage` (including import/export of a local settings profile).
It does not restart the backend; it updates frontend defaults and the API base URL used by the app.

## Architecture Notes

- Feature-based structure:
  - `src/features/*` pages and feature-specific UI
  - `src/shared/api/*` typed API client layer
  - `src/shared/components/*` reusable UI primitives and app layout
  - `src/shared/config/*` runtime config helper (localStorage + Vite env)
  - `src/shared/types/*` DTO-like TypeScript types

- Error normalization:
  - `src/shared/api/client.ts` attaches JWT tokens and provides `normalizeError()` for consistent error messaging.

## Notification Action URL Conventions

Frontend routing expects notification `action_url` values in these forms:

- Conversations: `/conversations?user=<user_id>&conversation=<conversation_id>`
- WhatsApp: `/whatsapp?conversation=<conversation_id>`

Behavior contract:

- Pages should auto-select the exact `conversation` target when provided.
- If current tab/search filters hide the target conversation, clear or adjust filters first, then select.
- Keep `action_url` relative (no absolute host) to ensure client-side navigation.

## Implemented Key Screens

- Screenshare Assistance
  - Frame upload mode: `POST /visual-ai/screenshare/assist`
  - Video upload mode: `POST /visual-ai/screenshare/assist-video`
  - RHF + Zod validation (consent required)

- Human-in-the-loop escalation workspace
  - Insights: `POST /decision-engine/escalate/{ticket_id}`
  - Suggested replies: `GET /decision-engine/suggestions/{ticket_id}`

## Tests

- `authGuard.test.tsx` - ProtectedRoute redirects by auth/roles
- `apiErrorMapper.test.ts` - `normalizeError` maps backend errors cleanly
- `screenshareValidation.test.tsx` - screenshare form validation
- `tableComponent.test.tsx` - table primitives render correctly
