'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import type { Appearance } from '@stripe/stripe-js';
import { createPaymentIntent, reconcilePayment } from '@/lib/payments-api';
import { formatPrice } from '@/lib/utils';

// Singleton — loadStripe is called once per page load, never on every render.
const stripePublicKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const stripePromise = stripePublicKey ? loadStripe(stripePublicKey) : null;

const appearance: Appearance = {
  theme: 'stripe',
  variables: {
    colorPrimary: '#1d4ed8',
    colorBackground: '#ffffff',
    colorText: '#1c1917',
    colorDanger: '#dc2626',
    fontFamily: 'Inter, system-ui, sans-serif',
    borderRadius: '2px',
    spacingUnit: '4px',
  },
};

type OuterStatus =
  | 'loading-intent'
  | 'ready'
  | 'reconciled'
  | 'success'
  | 'error'
  | 'config-error'
  | 'already-paid';

// Stripe PaymentIntent clientSecrets always follow pi_<id>_secret_<token>
function isValidClientSecret(cs: string): boolean {
  return /^pi_[A-Za-z0-9]+_secret_[A-Za-z0-9]+$/.test(cs);
}

// Retry loop: calls reconcilePayment up to MAX_ATTEMPTS times with a 2 s gap
// between retries while the PI reports status 'processing'. Returns true when
// the order is confirmed paid, false when retries are exhausted or the PI
// reaches a non-recoverable state.
async function attemptReconcile(orderId: string, paymentIntentId: string): Promise<boolean> {
  const MAX_ATTEMPTS = 4;
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    if (i > 0) await new Promise<void>((r) => setTimeout(r, 2000));
    const result = await reconcilePayment(orderId, paymentIntentId);
    if (result.reconciled || result.alreadyPaid) return true;
    // Only keep retrying if Stripe says the PI is still processing.
    if (result.piStatus !== 'processing') break;
  }
  return false;
}

interface PaymentFormProps {
  orderId: string;
  totalInCents: number;
}

export function PaymentForm({ orderId, totalInCents }: PaymentFormProps) {
  const router = useRouter();
  const [status, setStatus] = useState<OuterStatus>(
    stripePromise ? 'loading-intent' : 'config-error',
  );
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    console.log('[PaymentForm] mounted — orderId:', orderId, '| stripePromise:', !!stripePromise);
    if (!stripePromise) return;

    console.log('[PaymentForm] calling createPaymentIntent for orderId:', orderId);
    createPaymentIntent(orderId)
      .then(({ clientSecret: cs, paymentIntentId: piId, amountInCents, currency }) => {
        console.log(
          '[PaymentForm] createPaymentIntent OK —',
          'PI:', piId,
          '| amount:', amountInCents, currency,
          '| clientSecret tail:', cs.slice(-6),
        );
        if (!isValidClientSecret(cs)) {
          console.error('[PaymentForm] clientSecret format invalid:', cs.slice(0, 12));
          setFetchError('El pago no pudo iniciarse correctamente. Por favor, recarga la página.');
          setStatus('error');
          return;
        }
        setClientSecret(cs);
        setPaymentIntentId(piId);
        setStatus('ready');
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Error al preparar el pago';
        console.error('[PaymentForm] createPaymentIntent FAILED:', msg);
        if (msg === 'ORDER_ALREADY_PAID') {
          setStatus('already-paid');
          return;
        }
        setFetchError(msg);
        setStatus('error');
      });
  }, [orderId]);

  // reconciled: reconcile confirmed the order is PAID — refresh almost immediately.
  useEffect(() => {
    if (status !== 'reconciled') return;
    const timer = setTimeout(() => router.refresh(), 500);
    return () => clearTimeout(timer);
  }, [status, router]);

  // success (webhook fallback): give the webhook a few seconds to land, then refresh.
  useEffect(() => {
    if (status !== 'success') return;
    const timer = setTimeout(() => router.refresh(), 2500);
    return () => clearTimeout(timer);
  }, [status, router]);

  // already-paid: order was paid concurrently — refresh to show updated state.
  useEffect(() => {
    if (status !== 'already-paid') return;
    const timer = setTimeout(() => router.refresh(), 1500);
    return () => clearTimeout(timer);
  }, [status, router]);

  if (status === 'config-error') {
    return (
      <div className="bg-stone-50 border border-stone-200 rounded-sm p-6">
        <p className="text-sm font-medium text-stone-600 mb-1">
          Configuración de pago no disponible
        </p>
        <p className="text-xs text-stone-400">Por favor, contacta con soporte.</p>
      </div>
    );
  }

  if (status === 'loading-intent') {
    return (
      <div className="space-y-3 animate-pulse" aria-label="Cargando formulario de pago">
        <div className="h-10 bg-stone-100 rounded-sm" />
        <div className="h-10 bg-stone-100 rounded-sm" />
        <div className="h-10 bg-stone-100 rounded-sm" />
        <div className="h-12 bg-stone-100 rounded-sm mt-4" />
        <p className="text-xs text-stone-400 text-center pt-1">Preparando pago seguro...</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="bg-red-50 border border-red-100 rounded-sm p-5">
        <p className="text-sm font-medium text-red-700 mb-1">No se pudo preparar el pago</p>
        <p className="text-xs text-red-600 leading-relaxed">{fetchError ?? 'Error desconocido'}</p>
      </div>
    );
  }

  if (status === 'already-paid') {
    return (
      <div className="bg-green-50 border border-green-200 rounded-sm p-6">
        <p className="text-sm font-medium text-green-800 mb-2">Pago ya confirmado</p>
        <p className="text-sm text-green-700 leading-relaxed">
          Este pedido ya ha sido procesado. Actualizando la página...
        </p>
        <div className="mt-4 flex items-center gap-2 text-green-600">
          <div className="h-4 w-4 rounded-full border-2 border-green-300 border-t-green-600 animate-spin flex-shrink-0" />
          <span className="text-xs">Actualizando estado...</span>
        </div>
      </div>
    );
  }

  // reconciled: reconcile API confirmed the order is paid. Refresh fires after 500 ms.
  if (status === 'reconciled') {
    return (
      <div className="bg-green-50 border border-green-200 rounded-sm p-6">
        <p className="text-sm font-medium text-green-800 mb-2">Pago confirmado</p>
        <p className="text-sm text-green-700 leading-relaxed">
          Tu pedido ha sido procesado correctamente.
        </p>
        <div className="mt-4 flex items-center gap-2 text-green-600">
          <div className="h-4 w-4 rounded-full border-2 border-green-300 border-t-green-600 animate-spin flex-shrink-0" />
          <span className="text-xs">Actualizando...</span>
        </div>
      </div>
    );
  }

  // success (webhook fallback): refreshes after 2500 ms so the webhook has time to land.
  if (status === 'success') {
    return (
      <div className="bg-green-50 border border-green-200 rounded-sm p-6">
        <p className="text-sm font-medium text-green-800 mb-2">Pago enviado</p>
        <p className="text-sm text-green-700 leading-relaxed">
          Verificando con el banco. La página se actualizará automáticamente en unos segundos.
        </p>
        <div className="mt-4 flex items-center gap-2 text-green-600">
          <div className="h-4 w-4 rounded-full border-2 border-green-300 border-t-green-600 animate-spin flex-shrink-0" />
          <span className="text-xs">Verificando...</span>
        </div>
      </div>
    );
  }

  // status === 'ready' — clientSecret was validated by isValidClientSecret() before this point
  if (!clientSecret || !paymentIntentId) return null;

  return (
    <Elements stripe={stripePromise} options={{ clientSecret, appearance }}>
      <InnerPaymentForm
        orderId={orderId}
        totalInCents={totalInCents}
        paymentIntentId={paymentIntentId}
        onPaid={() => setStatus('reconciled')}
        onSuccess={() => setStatus('success')}
      />
    </Elements>
  );
}

// ─── Inner form — has access to Elements context ───────────────────────────

interface InnerFormProps {
  orderId: string;
  totalInCents: number;
  paymentIntentId: string;
  onPaid: () => void;
  onSuccess: () => void;
}

function InnerPaymentForm({ orderId, totalInCents, paymentIntentId, onPaid, onSuccess }: InnerFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [stripeError, setStripeError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    console.log('[InnerPaymentForm] handleSubmit fired — stripe:', !!stripe, '| elements:', !!elements);
    if (!stripe || !elements || loadError) {
      console.warn('[InnerPaymentForm] stripe/elements not ready or loadError, aborting');
      return;
    }

    setSubmitting(true);
    setStripeError(null);

    console.log('[InnerPaymentForm] calling stripe.confirmPayment — redirect: if_required');
    const result = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/checkout/orders/${orderId}`,
      },
      redirect: 'if_required',
    });
    console.log('[InnerPaymentForm] stripe.confirmPayment result:', result);

    if (result.error) {
      console.error('[InnerPaymentForm] confirmPayment ERROR:', result.error.type, result.error.message);
      setStripeError(
        result.error.message ?? 'Error al procesar el pago. Por favor, inténtalo de nuevo.',
      );
      setSubmitting(false);
      return;
    }

    // confirmPayment succeeded (non-3DS path). Immediately try to reconcile so the
    // page can refresh to PAID without waiting for the Stripe webhook to arrive.
    console.log('[InnerPaymentForm] confirmPayment SUCCESS — attempting reconcile for PI:', paymentIntentId);
    try {
      const paid = await attemptReconcile(orderId, paymentIntentId);
      if (paid) {
        console.log('[InnerPaymentForm] reconcile confirmed order PAID — calling onPaid()');
        onPaid();
        return;
      }
    } catch (err) {
      console.warn('[InnerPaymentForm] reconcile attempt failed, falling back to webhook path:', err);
    }

    // Fallback: webhook will update Order.status to PAID asynchronously.
    console.log('[InnerPaymentForm] reconcile exhausted — calling onSuccess() (webhook fallback)');
    onSuccess();
  }

  const isReady = !!stripe && !!elements && !loadError;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="border border-stone-100 rounded-sm p-5 bg-white">
        <PaymentElement
          options={{ layout: 'tabs' }}
          onReady={() => {
            console.log('Stripe PaymentElement ready');
          }}
          onLoadError={(event) => {
            console.error('Stripe PaymentElement loaderror', event);
            setLoadError(
              event.error?.message ?? 'No se ha podido cargar el formulario de pago.',
            );
          }}
        />
      </div>

      {(loadError ?? stripeError) && (
        <div className="p-4 bg-red-50 border border-red-100 rounded-sm">
          <p className="text-xs text-red-700 leading-relaxed">
            <span className="font-medium">Error: </span>
            {loadError ?? stripeError}
          </p>
        </div>
      )}

      <button
        type="submit"
        disabled={!isReady || submitting}
        className={`w-full py-4 text-sm font-medium tracking-wide transition-colors ${
          !isReady || submitting
            ? 'bg-blue-300 text-white cursor-wait'
            : 'bg-blue-700 hover:bg-blue-800 text-white cursor-pointer'
        }`}
      >
        {submitting ? 'Procesando...' : `Pagar ${formatPrice(totalInCents)}`}
      </button>

      <p className="text-xs text-stone-400 text-center flex items-center justify-center gap-1.5">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="w-3.5 h-3.5 flex-shrink-0"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z"
            clipRule="evenodd"
          />
        </svg>
        Pago seguro procesado por Stripe
      </p>
    </form>
  );
}
