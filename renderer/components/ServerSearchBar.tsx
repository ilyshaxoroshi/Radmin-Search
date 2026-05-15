import { Search, X } from 'lucide-react';

interface ServerSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  statusFilter: 'all' | 'online';
  onStatusFilterChange: (value: 'all' | 'online') => void;
  sourceFilter: 'all' | 'lan' | 'radmin';
  onSourceFilterChange: (value: 'all' | 'lan' | 'radmin') => void;
  resultCount: number;
}

export function ServerSearchBar({
  value,
  onChange,
  statusFilter,
  onStatusFilterChange,
  sourceFilter,
  onSourceFilterChange,
  resultCount
}: ServerSearchBarProps) {
  return (
    <div className="server-search-panel">
      <div className="server-search-row">
        <div className="search-input-wrap server-search-input">
          <Search size={18} />
          <input
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="Поиск по IP, названию, версии, никам..."
          />
          {value ? (
            <button
              type="button"
              className="icon-button subtle-button"
              onClick={() => onChange('')}
              aria-label="Очистить поиск"
            >
              <X size={16} />
            </button>
          ) : null}
        </div>

        <select
          className="filter-select"
          value={statusFilter}
          onChange={(event) => onStatusFilterChange(event.target.value as 'all' | 'online')}
        >
          <option value="all">Любые статусы</option>
          <option value="online">Только онлайн</option>
        </select>

        <select
          className="filter-select"
          value={sourceFilter}
          onChange={(event) => onSourceFilterChange(event.target.value as 'all' | 'lan' | 'radmin')}
        >
          <option value="all">Все источники</option>
          <option value="lan">LAN</option>
          <option value="radmin">Radmin VPN</option>
        </select>
      </div>

      <div className="server-search-meta">Найдено {resultCount} сервера</div>
    </div>
  );
}
