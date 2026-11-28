# Enable live Donator checkout

The production Worker is `amqtours-gatcha`. It serves Gacha and Play. Both avatar menus show Donator Membership when the Worker has all five Live settings. One-time passes and recurring subscriptions both start at USD 1.00. A verified completed payment credits the signed-in account for one month.

**Windows shortcut.** After obtaining your Live app credentials, run `tools\paypal-live.cmd` in a checkout with the project dependencies and authenticated Wrangler. Enter the client ID and secret at the prompts. The launcher prepares the plan and webhook and sends all five settings directly to Cloudflare. It hides the secret during entry. The steps below are the manual alternative.

1. In your verified PayPal Business account, open [Apps & Credentials](https://developer.paypal.com/dashboard/applications/live), select **Live**, and create or select the AMQ Tours REST app. Enable subscriptions for that app.
2. Set `PAYPAL_LIVE_CLIENT_ID` and `PAYPAL_LIVE_CLIENT_SECRET` in a private local shell environment. Use the credentials for that Live app. Keep their values out of chat, Git and shell history.
3. From the repository root, run `node tools/paypal-sandbox.mjs --live`. The explicit Live option registers or reuses the product, the USD 1 monthly plan and the webhook on the Live app. It prints the product, plan and webhook IDs. This setup creates no orders or charges.
4. In Cloudflare, open **Workers & Pages → amqtours-gatcha → Settings → Variables and Secrets**. Add the five values below as secrets and deploy the updated bindings. Production already sets `PAYPAL_LIVE_ENABLED=1`. Keep the existing secrets and bindings.

| Worker secret | Value |
| --- | --- |
| `PAYPAL_LIVE_CLIENT_ID` | Live REST app client ID |
| `PAYPAL_LIVE_CLIENT_SECRET` | Live REST app secret |
| `PAYPAL_LIVE_PRODUCT_ID` | Setup output `productId` |
| `PAYPAL_LIVE_PLAN_ID` | Setup output `planId` |
| `PAYPAL_LIVE_WEBHOOK_ID` | Setup output `webhookId` |

Sign in to Gacha or Play, select **Donator Membership** in the avatar menu, then choose a one-time pass or monthly renewal. Starting a checkout opens PayPal for buyer approval. To verify a real transaction, check the completed payment in the Live PayPal dashboard and the membership on the same AMQ Tours account.

The webhook address is `https://amqtours.app/gacha/api/paypal-donator-webhook`. The app verifies PayPal signatures and reconciles completed sales and captures, including refunds and reversals. The Live webhook subscribes to `CHECKOUT.ORDER.APPROVED`, `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.REFUNDED`, `PAYMENT.CAPTURE.REVERSED`, `PAYMENT.SALE.COMPLETED`, `PAYMENT.SALE.REFUNDED` and `PAYMENT.SALE.REVERSED`. [PayPal production guide](https://developer.paypal.com/api/rest/production/) · [Webhook setup](https://developer.paypal.com/api/rest/webhooks/rest/)
