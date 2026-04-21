import { useState } from 'react';
import { cn } from '../lib/utils';

const AVATAR_COLORS = [
  'bg-emerald-500',
  'bg-blue-500',
  'bg-violet-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-cyan-500',
  'bg-orange-500',
  'bg-pink-500',
];

function avatarColor(ticker: string) {
  const sum = ticker.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}

interface StockLogoProps {
  ticker: string;
  logo?: string | null;
  /** Tailwind size classes applied to both the img and the fallback div, e.g. "w-10 h-10" */
  size?: string;
  /** Extra classes for the wrapper element */
  className?: string;
  /** Text size for the fallback letter avatar, e.g. "text-sm" */
  textSize?: string;
}

/**
 * Renders a company logo from TradingView's CDN.
 * Falls back to a coloured letter-avatar if the image URL is absent or fails to load.
 */
export default function StockLogo({
  ticker,
  logo,
  size = 'w-10 h-10',
  className,
  textSize = 'text-xs',
}: StockLogoProps) {
  const [imgFailed, setImgFailed] = useState(false);

  if (logo && !imgFailed) {
    return (
      <img
        src={logo}
        alt={ticker}
        onError={() => setImgFailed(true)}
        className={cn(size, 'rounded-xl object-contain bg-white p-1 border border-slate-100', className)}
      />
    );
  }

  return (
    <div
      className={cn(
        size,
        'rounded-xl flex items-center justify-center shrink-0',
        avatarColor(ticker),
        className,
      )}
    >
      <span className={cn('text-white font-black tracking-tight', textSize)}>
        {ticker.slice(0, 2)}
      </span>
    </div>
  );
}
