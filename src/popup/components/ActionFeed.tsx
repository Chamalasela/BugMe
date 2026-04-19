import type { UserAction, ActionType } from '../../shared/types';

interface Props {
  actions: UserAction[];
}

const ACTION_ICONS: Record<ActionType, string> = {
  click: '🖱',
  input: '⌨',
  navigate: '→',
  scroll: '↕',
};

export default function ActionFeed({ actions }: Props) {
  if (actions.length === 0) {
    return (
      <div className="text-xs text-center py-4" style={{ color: '#606060' }}>
        No actions yet — start interacting with the page
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 max-h-28 overflow-y-auto">
      {actions.map((a, i) => (
        <div key={a.id} className="flex items-start gap-1 text-xs py-0.5">
          <span className="shrink-0 w-5 text-right font-mono" style={{ color: '#606060' }}>
            {i + 1}.
          </span>
          <span className="shrink-0">{ACTION_ICONS[a.type]}</span>
          <span className="truncate" style={{ color: '#1a1a1a' }} title={a.naturalLanguage}>
            {a.naturalLanguage}
          </span>
        </div>
      ))}
    </div>
  );
}
