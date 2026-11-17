# Relay

Relay is a small organization chat application built with Next.js, MongoDB, and Socket.IO. It includes account signup/login, Google OAuth, organization invitations and roles, direct and group conversations, message delivery/read receipts, and password recovery.

## Requirements

- Node.js 22 or later
- MongoDB 6 or later
- npm

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and set `MONGO_URL`. Configure `APP_ORIGIN`, `NEXT_PUBLIC_WS_URL`, `SOCKET_SERVER_URL`, `SOCKET_ALLOWED_ORIGINS`, and a strong `SOCKET_INTERNAL_SECRET` for the Socket.IO service. Google OAuth and SMTP are optional; their related features need their provider settings.

3. Check the database schema migration before applying it:

   ```bash
   npm run db:schema:check
   ```

   The command reports collection counts and incompatible documents. It changes no data. Resolve any incompatible documents and rerun the check. Once it reports zero invalid documents, apply MongoDB collection validators:

   ```bash
   npm run db:schema:apply
   ```

   The validators use MongoDB `moderate` validation so new documents and updates are checked while existing records are not rejected solely because they predate the validator. The migration defines validators for users, organizations, memberships, invitations, conversations, messages, read receipts, sessions, password resets, and rate limits.

4. Start the Next.js app and Socket.IO server:

   ```bash
   npm run dev
   ```

   The app normally uses `http://localhost:3000`; Socket.IO normally uses port `8080`. The browser connects to `NEXT_PUBLIC_WS_URL`, while the app server publishes events through `SOCKET_SERVER_URL`.

## Build and type checks

Run the TypeScript check:

```bash
npx tsc --noEmit
```

Build the app as part of release checks:

```bash
npm run build
```

## Deployment notes

The Next.js application and persistent Socket.IO server are separate runtime services. A serverless static host such as Netlify can host the Next.js side only if its Next.js adapter supports the app's server routes and authentication requirements; it cannot keep this Socket.IO process alive. Host the Socket.IO script on a persistent Node service, such as Render, and configure the public and internal URLs accordingly. Set the Socket service's `PORT` using the platform-provided value; local development uses `WS_PORT`.

Never commit `.env`, SMTP credentials, OAuth secrets, database credentials, or `SOCKET_INTERNAL_SECRET`. Use the hosting provider's secret environment settings.
