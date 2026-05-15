import type { ReactNode } from 'react';
import { Copy, Radio, Server, Star, Wifi } from 'lucide-react';
import type { ServerStatus } from '../types';

interface ServerCardProps {
  server: ServerStatus;
  favorite: boolean;
  changedRecently: boolean;
  searchQuery: string;
  onOpen: () => void;
  onToggleFavorite: () => void;
  onCopy: () => void;
  formatTime: (timestamp: number) => string;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightMatches(text: string, query: string): ReactNode {
  const trimmed = query.trim();
  if (!trimmed) {
    return text;
  }

  const regex = new RegExp(`(${escapeRegex(trimmed)})`, 'ig');
  const parts = text.split(regex);

  return parts.map((part, index) =>
    regex.test(part) ? (
      <mark key={`${part}-${index}`} className="search-highlight">
        {part}
      </mark>
    ) : (
      <span key={`${part}-${index}`}>{part}</span>
    )
  );
}

export function ServerCard({
  server,
  favorite,
  changedRecently,
  searchQuery,
  onOpen,
  onToggleFavorite,
  onCopy,
  formatTime
}: ServerCardProps) {
  const visiblePlayers = server.playerNames.slice(0, 8);
  const hiddenPlayers = Math.max(0, server.playerNames.length - visiblePlayers.length);

  return (
    <button type="button" className="server-card" onClick={onOpen}>
      <div className="server-card-top">
        <div className="server-badge">
          <Server size={16} />
          <span>{server.online ? 'Minecraft Server' : 'Недоступен'}</span>
        </div>
        <div className="server-card-actions">
          {changedRecently ? <span className="change-dot" title="Появились новые игроки" /> : null}
          <button
            type="button"
            className="icon-button subtle-button"
            onClick={(event) => {
              event.stopPropagation();
              onCopy();
            }}
            aria-label="Скопировать адрес"
          >
            <Copy size={16} />
          </button>
          <button
            type="button"
            className={`icon-button subtle-button ${favorite ? 'favorite-active' : ''}`}
            onClick={(event) => {
              event.stopPropagation();
              onToggleFavorite();
            }}
            aria-label="Переключить избранное"
          >
            <Star size={16} fill={favorite ? 'currentColor' : 'none'} />
          </button>
        </div>
      </div>

      <div className="server-card-main">
        <div className="server-ip-line">
          <h3>{highlightMatches(`${server.ip}:${server.port}`, searchQuery)}</h3>
          <span className={`status-pill ${server.online ? 'status-online' : 'status-offline'}`}>
            <Wifi size={14} />
            {server.online ? 'Online' : 'Offline'}
          </span>
        </div>
        <p className="server-version">{highlightMatches(server.version || 'Неизвестная версия', searchQuery)}</p>
        <p className="server-motd-preview">
          {highlightMatches(server.motd || server.announcedMotd || 'MOTD отсутствует', searchQuery)}
        </p>
      </div>

      <div className="server-card-footer">
        <div className="players-row">
          {visiblePlayers.length ? (
            visiblePlayers.map((player) => (
              <span key={`${server.ip}:${server.port}-${player}`} className="player-chip">
                {highlightMatches(player, searchQuery)}
              </span>
            ))
          ) : (
            <span className="player-chip muted-chip">Игроки не раскрыты</span>
          )}
          {hiddenPlayers > 0 ? <span className="player-chip">+{hiddenPlayers}</span> : null}
        </div>
        <div className="server-meta-inline">
          <span>
            {server.playersOnline}/{server.playersMax || '?'} слотов
          </span>
          <span>
            <Radio size={14} /> multicast {formatTime(server.lastAnnouncementAt)}
          </span>
        </div>
      </div>
    </button>
  );
}
