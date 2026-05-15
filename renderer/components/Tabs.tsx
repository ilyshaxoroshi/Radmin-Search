interface TabsProps {
  active: 'all' | 'favorites';
  onChange: (tab: 'all' | 'favorites') => void;
}

export function Tabs({ active, onChange }: TabsProps) {
  return (
    <div className="tabs-shell">
      <button
        type="button"
        className={`tab-button ${active === 'all' ? 'tab-button-active' : ''}`}
        onClick={() => onChange('all')}
      >
        Все сервера
      </button>
      <button
        type="button"
        className={`tab-button ${active === 'favorites' ? 'tab-button-active' : ''}`}
        onClick={() => onChange('favorites')}
      >
        Избранное
      </button>
    </div>
  );
}
