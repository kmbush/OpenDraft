/**
 * The league's brand lockup: logo + name, shown in every header (board strip,
 * station/admin chrome, export). Falls back to the OpenDraft trophy + wordmark
 * when no logo/name is set, and drops a broken/oversized logo gracefully so bad
 * branding data can never break a header (AD-10).
 */
import { Trophy } from 'lucide-react';
import { useState } from 'react';
import { useLeague } from '../hooks/useLeague.js';
import { cn } from '../lib/cn.js';

export function BrandMark({
  className,
  nameClassName,
  iconClassName,
  logoClassName,
}: {
  className?: string;
  nameClassName?: string;
  iconClassName?: string;
  logoClassName?: string;
}) {
  const league = useLeague();
  const [logoBroken, setLogoBroken] = useState(false);
  const logo = logoBroken ? undefined : league?.theme?.logo;
  const name = league?.name?.trim() || 'OpenDraft';
  return (
    <span className={cn('flex items-center gap-2', className)}>
      {logo ? (
        <img
          src={logo}
          alt=""
          onError={() => setLogoBroken(true)}
          className={cn('h-6 w-auto max-w-[160px] object-contain', logoClassName)}
        />
      ) : (
        <Trophy className={cn('h-5 w-5 text-accent', iconClassName)} />
      )}
      <span className={cn('font-semibold tracking-tight', nameClassName)}>{name}</span>
    </span>
  );
}
