'use client';

interface QuantitySelectorProps {
  quantity: number;
  onIncrease: () => void;
  onDecrease: () => void;
  disabled?: boolean;
}

export function QuantitySelector({
  quantity,
  onIncrease,
  onDecrease,
  disabled = false,
}: QuantitySelectorProps) {
  return (
    <div className="flex items-center border border-stone-200">
      <button
        onClick={onDecrease}
        disabled={disabled || quantity <= 1}
        aria-label="Reducir cantidad"
        className="w-9 h-9 flex items-center justify-center text-stone-500 hover:text-stone-900 disabled:text-stone-300 disabled:cursor-not-allowed transition-colors"
      >
        −
      </button>
      <span className="w-10 text-center text-sm font-medium text-stone-900">{quantity}</span>
      <button
        onClick={onIncrease}
        disabled={disabled}
        aria-label="Aumentar cantidad"
        className="w-9 h-9 flex items-center justify-center text-stone-500 hover:text-stone-900 disabled:text-stone-300 disabled:cursor-not-allowed transition-colors"
      >
        +
      </button>
    </div>
  );
}
