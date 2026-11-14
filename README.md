# Nexora Business Hub — Complete Local VS Code Project

This is a complete, independent local full-stack implementation of Nexora Business Hub. It is designed to run on your computer with Node.js and VS Code. It is not a byte-for-byte export of the AppDeploy-hosted source: the hosted version uses AppDeploy-managed auth/database/secrets, while this local version replaces those services with an Express API and a JSON file database so it can run independently.

## Requirements
- Node.js 20 or newer
- VS Code

## Setup
1. Extract the ZIP.
2. Open the `Nexora_Business_Hub_Complete` folder in VS Code.
3. Open Terminal → New Terminal.
4. Run:

```bash
npm install
cp .env.example .env
```

5. Open `.env` and replace `NEXORA_ADMIN_KEY` with a long private key of your choice. Do not share it or commit `.env` to GitHub.
6. Start the app:

```bash
npm run dev
```

7. Visit http://localhost:3000

## Features included
- Owner account registration and sign-in
- Restaurant/food-vendor workspace setup
- Public restaurant storefront with unique slug
- Menu item create, edit, hide/show and delete
- Customer cart and checkout
- Delivery and pickup orders
- Server-calculated order totals
- Customer order tracking links
- OPay transfer reference collection for orders
- Owner order status updates and manual payment confirmation
- Monthly subscription ₦4,999 and yearly subscription ₦49,990
- Subscription transfer reference submission
- Private Super Admin login using `.env`
- Admin subscription approval/rejection and store suspension/restoration
- Subscription expiry and storefront access enforcement
- Persistent local JSON database in `data/db.json`

## Important payment note
OPay payment is manual in this version. The app collects transfer references; an administrator must verify the transfer in OPay before approving a subscription. It does not debit accounts or automatically verify payments. Do not treat a submitted reference as proof of payment.

## Data and security
- Local data is stored in `data/db.json` and is created automatically.
- Sessions are held in server memory and are cleared when the server restarts.
- This is suitable for local development/testing, not production hosting as-is.
- Before production, move data to PostgreSQL, use a robust session store, add rate limiting, email verification, CSRF protections, HTTPS, backups and a payment provider integration.
- Change the sample admin key before using the admin page.

## Useful pages
- App: http://localhost:3000
- Admin: http://localhost:3000/#/admin
- Storefront: open a store link shown in the owner dashboard.

## Notes about the hosted Nexora
The currently deployed AppDeploy app remains at:
https://nexora-business-hub-9q1qeg.v2.appdeploy.ai/

The hosted deployment and this local project use separate databases. Changes made locally do not change the live hosted app, and vice versa.
# nexora_store
# nexora_store
