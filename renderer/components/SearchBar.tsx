import { Search } from 'lucide-react';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

export function SearchBar({ value, onChange, onSubmit }: SearchBarProps) {
  return (
    <div className="search-shell">
      <div className="search-input-wrap">
        <Search size={18} />
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Поиск сервера или игрока"
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              onSubmit();
            }
          }}
        />
      </div>
      <button className="primary-button glow-button" type="button" onClick={onSubmit}>
        Найти
      </button>
    </div>
  );
}
