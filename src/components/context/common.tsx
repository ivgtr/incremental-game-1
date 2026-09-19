import type { PropsWithChildren, ReactNode } from 'react';
import { useGameRuntime } from '../../app/GameProvider';
import type { GameCommand } from '../../runtime/commands';

export function ContextLayout({ title, meta, children }: PropsWithChildren<{ title: string; meta: ReactNode }>) {
  return (
    <section className="context-strip" aria-live="polite">
      <div className="context-copy">
        <h1 className="context-title">{title}</h1>
        <p className="context-meta">{meta}</p>
      </div>
      <div className="context-actions">{children}</div>
    </section>
  );
}

export function ActionButton({ command, disabled = false, className = '', children }: PropsWithChildren<{
  command: GameCommand;
  disabled?: boolean;
  className?: string;
}>) {
  return <CommandButton command={command} className={`action ${className}`.trim()} disabled={disabled}>{children}</CommandButton>;
}

export function CommandButton({ command, disabled = false, className, children }: PropsWithChildren<{
  command: GameCommand;
  disabled?: boolean;
  className: string;
}>) {
  const runtime = useGameRuntime();
  return <button className={className} disabled={disabled} onClick={() => { runtime.unlockAudio(); runtime.dispatch(command); }}>{children}</button>;
}
