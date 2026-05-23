'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { reconcilePayment } from '@/lib/payments-api';

interface AutoRefreshProps {
  delayMs?: number;
  orderId?: string;
  paymentIntentId?: string;
}

// Used after a 3DS redirect (returnedFromStripe=true). When orderId +
// paymentIntentId are provided the component tries the reconcile endpoint with
// retries before falling back to a plain timed refresh. This way the page
// transitions to PAID as soon as the backend confirms it rather than waiting a
// fixed delay for the Stripe webhook.
export function AutoRefresh({ delayMs = 3000, orderId, paymentIntentId }: AutoRefreshProps) {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (orderId && paymentIntentId) {
        const MAX_ATTEMPTS = 5;
        for (let i = 0; i < MAX_ATTEMPTS; i++) {
          if (i > 0) await sleep(2000);
          if (cancelled) return;
          try {
            const result = await reconcilePayment(orderId, paymentIntentId);
            if (result.reconciled || result.alreadyPaid) {
              if (!cancelled) router.refresh();
              return;
            }
            // Only keep retrying while Stripe says the PI is still processing.
            if (result.piStatus && result.piStatus !== 'processing') break;
          } catch {
            break; // network error — fall through to timed refresh
          }
        }
      }

      // Fallback: wait and let the webhook land before refreshing.
      await sleep(delayMs);
      if (!cancelled) router.refresh();
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [router, delayMs, orderId, paymentIntentId]);

  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
