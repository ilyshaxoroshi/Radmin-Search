import { useEffect, useRef, useState } from 'react';
import { BellRing, Copy, HeartPulse, Radio, RefreshCw, Server, Star, Users, Wifi } from 'lucide-react';
import { Modal } from './components/Modal';
import { ProgressBar } from './components/ProgressBar';
import { SearchBar } from './components/SearchBar';
import { ServerCard } from './components/ServerCard';
import { ServerSearchBar } from './components/ServerSearchBar';
import { Tabs } from './components/Tabs';
import { electronApi, isElectronRuntime } from './electronApi';
import type { DebugLogEntry, FavoriteServer, MotdSegment, ScanProgress, ServerStatus } from './types';

const FAVORITES_STORAGE_KEY = 'lan-scanner-favorites';

function getServerKey(ip: string, port: number): string {
  return `${ip}:${port}`;
}

function arraysEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

function serverEquals(left: ServerStatus, right: ServerStatus): boolean {
  return (
    left.ip === right.ip &&
    left.port === right.port &&
    left.online === right.online &&
    left.version === right.version &&
    left.protocol === right.protocol &&
    left.motd === right.motd &&
    left.playersOnline === right.playersOnline &&
    left.playersMax === right.playersMax &&
    left.favicon === right.favicon &&
    left.ping === right.ping &&
    left.source === right.source &&
    left.error === right.error &&
    left.announcedMotd === right.announcedMotd &&
    arraysEqual(left.playerNames, right.playerNames)
  );
}

function createOfflineServer(ip: string, port: number, previous?: ServerStatus): ServerStatus {
  return {
    ip,
    port,
    online: false,
    version: previous?.version ?? 'Недоступен',
    protocol: previous?.protocol ?? null,
    motd: previous?.motd ?? 'Сервер недоступен',
    motdSegments: previous?.motdSegments ?? [{ text: 'Сервер недоступен', color: '#ff9999' }],
    playersOnline: 0,
    playersMax: previous?.playersMax ?? 0,
    playerNames: [],
    favicon: previous?.favicon,
    ping: null,
    lastSeen: previous?.lastSeen ?? Date.now(),
    lastAnnouncementAt: previous?.lastAnnouncementAt ?? Date.now(),
    announcedMotd: previous?.announcedMotd,
    source: previous?.source ?? 'favorite',
    error: 'Недоступен'
  };
}

function renderMotdSegments(segments: MotdSegment[]) {
  if (!segments.length) {
    return <span>Нет MOTD</span>;
  }

  return segments.map((segment, index) => (
    <span
      key={`${segment.text}-${index}`}
      style={{
        color: segment.color,
        fontWeight: segment.bold ? 700 : 400,
        fontStyle: segment.italic ? 'italic' : 'normal',
        textDecoration: [segment.underlined ? 'underline' : '', segment.strikethrough ? 'line-through' : '']
          .filter(Boolean)
          .join(' ')
      }}
    >
      {segment.text}
    </span>
  ));
}

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(timestamp);
}

function normalizeFavorite(entry: unknown): FavoriteServer | null {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const candidate = entry as Partial<FavoriteServer> & { ip?: unknown; port?: unknown; addedAt?: unknown };
  if (typeof candidate.ip !== 'string') {
    return null;
  }

  return {
    ip: candidate.ip,
    port: typeof candidate.port === 'number' && candidate.port > 0 ? candidate.port : 25565,
    addedAt: typeof candidate.addedAt === 'number' ? candidate.addedAt : Date.now()
  };
}

function getSourceKind(server: ServerStatus): 'lan' | 'radmin' {
  return server.ip.startsWith('26.') ? 'radmin' : 'lan';
}

export default function App() {
  const [servers, setServers] = useState<Record<string, ServerStatus>>({});
  const [favorites, setFavorites] = useState<FavoriteServer[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'favorites'>('all');
  const [selectedServer, setSelectedServer] = useState<ServerStatus | null>(null);
  const [searchValue, setSearchValue] = useState('');
  const [serverSearchValue, setServerSearchValue] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'online'>('all');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'lan' | 'radmin'>('all');
  const [searchResultsOpen, setSearchResultsOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<ServerStatus[]>([]);
  const [progress, setProgress] = useState<ScanProgress>({
    scanned: 0,
    total: 0,
    percent: 100,
    found: 0,
    active: 0
  });
  const [listening, setListening] = useState(false);
  const [toast, setToast] = useState('');
  const [recentChanges, setRecentChanges] = useState<Record<string, number>>({});
  const [listenerSummary, setListenerSummary] = useState('');
  const [debugLogs, setDebugLogs] = useState<DebugLogEntry[]>([]);
  const [hasListenerRun, setHasListenerRun] = useState(false);
  const toastTimerRef = useRef<number | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(FAVORITES_STORAGE_KEY);
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw) as unknown[];
      setFavorites(parsed.map(normalizeFavorite).filter((entry): entry is FavoriteServer => Boolean(entry)));
    } catch {
      localStorage.removeItem(FAVORITES_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    const unsubscribeServer = electronApi.onServerFound((server) => {
      setServers((current) => {
        const key = getServerKey(server.ip, server.port);
        const previous = current[key];
        const mergedServer: ServerStatus = previous
          ? {
              ...server,
              lastAnnouncementAt: previous.lastAnnouncementAt,
              announcedMotd: server.announcedMotd ?? previous.announcedMotd
            }
          : server;

        if (previous) {
          const previousPlayers = new Set(previous.playerNames);
          const hasNewPlayer = mergedServer.playerNames.some((player) => !previousPlayers.has(player));
          if (hasNewPlayer) {
            setRecentChanges((changes) => ({ ...changes, [key]: Date.now() }));
          }

          if (serverEquals(previous, mergedServer)) {
            return current;
          }

          mergedServer.lastAnnouncementAt = server.lastAnnouncementAt;
        }

        return { ...current, [key]: mergedServer };
      });
    });

    const unsubscribeProgress = electronApi.onScanProgress((nextProgress) => {
      setProgress(nextProgress);
    });

    const unsubscribeComplete = electronApi.onScanComplete((payload) => {
      setListening(false);
      setHasListenerRun(true);
      setListenerSummary(
        payload.stopped
          ? `Прослушивание остановлено. Получено объявлений: ${payload.total}. Найдено серверов: ${payload.found}.`
          : `Прослушивание завершено за ${(payload.durationMs / 1000).toFixed(1)} c. Получено объявлений: ${payload.total}.`
      );
    });

    const unsubscribeDebug = electronApi.onDebugLog((entry) => {
      const tag = `[${new Date(entry.timestamp).toLocaleTimeString('ru-RU')}] [${entry.scope}] ${entry.message}`;
      if (entry.level === 'error') {
        console.error(tag, entry.details ?? '');
      } else if (entry.level === 'warn') {
        console.warn(tag, entry.details ?? '');
      } else {
        console.log(tag, entry.details ?? '');
      }

      setDebugLogs((current) => [...current.slice(-159), entry]);
    });

    return () => {
      unsubscribeServer();
      unsubscribeProgress();
      unsubscribeComplete();
      unsubscribeDebug();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!favorites.length) {
      return undefined;
    }

    const refreshFavorites = async () => {
      const results = await Promise.all(
        favorites.map(async (favorite) => {
          try {
            const server = await electronApi.pingServer(favorite.ip, favorite.port, 5000);
            return { favorite, server };
          } catch {
            return { favorite, server: null };
          }
        })
      );

      setServers((current) => {
        let changed = false;
        const next = { ...current };
        results.forEach(({ favorite, server }) => {
          const key = getServerKey(favorite.ip, favorite.port);
          const previous = current[key];
          if (server) {
            const mergedServer: ServerStatus = {
              ...server,
              lastAnnouncementAt: previous?.lastAnnouncementAt ?? server.lastAnnouncementAt ?? Date.now(),
              announcedMotd: previous?.announcedMotd ?? server.announcedMotd
            };

            if (!previous || !serverEquals(previous, mergedServer) || previous.lastAnnouncementAt !== mergedServer.lastAnnouncementAt) {
              next[key] = mergedServer;
              changed = true;
            }
            return;
          }

          const offlineServer = createOfflineServer(favorite.ip, favorite.port, previous);
          if (!previous || !serverEquals(previous, offlineServer) || previous.lastAnnouncementAt !== offlineServer.lastAnnouncementAt) {
            next[key] = offlineServer;
            changed = true;
          }
        });
        return changed ? next : current;
      });
    };

    void refreshFavorites();
    const timer = window.setInterval(() => {
      void refreshFavorites();
    }, 30_000);

    return () => window.clearInterval(timer);
  }, [favorites]);

  useEffect(() => {
    if (!Object.keys(recentChanges).length) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      const threshold = Date.now() - 12_000;
      setRecentChanges((current) =>
        Object.fromEntries(Object.entries(current).filter(([, timestamp]) => timestamp > threshold))
      );
    }, 2_000);

    return () => window.clearInterval(timer);
  }, [recentChanges]);

  const allServers = Object.values(servers).sort((left, right) => {
    if (left.lastAnnouncementAt !== right.lastAnnouncementAt) {
      return right.lastAnnouncementAt - left.lastAnnouncementAt;
    }
    return getServerKey(left.ip, left.port).localeCompare(getServerKey(right.ip, right.port), 'en');
  });

  const favoriteMap = favorites.reduce<Record<string, FavoriteServer>>((acc, favorite) => {
    acc[getServerKey(favorite.ip, favorite.port)] = favorite;
    return acc;
  }, {});

  const favoriteServers = favorites
    .map((favorite) => {
      const key = getServerKey(favorite.ip, favorite.port);
      return servers[key] ?? createOfflineServer(favorite.ip, favorite.port);
    })
    .sort((left, right) => {
      if (left.lastAnnouncementAt !== right.lastAnnouncementAt) {
        return right.lastAnnouncementAt - left.lastAnnouncementAt;
      }
      return getServerKey(left.ip, left.port).localeCompare(getServerKey(right.ip, right.port), 'en');
    });

  const baseVisibleServers = activeTab === 'all' ? allServers : favoriteServers;
  const normalizedServerQuery = serverSearchValue.trim().toLowerCase();

  const activeTabIsFavorites = activeTab === 'favorites';
  const visibleServers = baseVisibleServers.filter((server) => {
    if (statusFilter === 'online' && !server.online) {
      return false;
    }

    if (!activeTabIsFavorites && sourceFilter !== 'all' && getSourceKind(server) !== sourceFilter) {
      return false;
    }

    if (!normalizedServerQuery) {
      return true;
    }

    const haystack = [
      server.ip,
      `${server.ip}:${server.port}`,
      server.motd,
      server.announcedMotd,
      server.version,
      ...server.playerNames
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return haystack.includes(normalizedServerQuery);
  });

  const stats = {
    discovered: allServers.length,
    onlineCount: allServers.filter((server) => server.online).length,
    players: allServers.reduce((sum, server) => sum + server.playersOnline, 0),
    favorites: favorites.length
  };

  const showToast = (message: string) => {
    setToast(message);
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => setToast(''), 2400);
  };

  const toggleFavorite = (server: ServerStatus) => {
    const key = getServerKey(server.ip, server.port);
    setFavorites((current) => {
      const exists = current.some((entry) => getServerKey(entry.ip, entry.port) === key);
      if (exists) {
        showToast('Сервер удален из избранного');
        return current.filter((entry) => getServerKey(entry.ip, entry.port) !== key);
      }
      showToast('Сервер добавлен в избранное');
      return [...current, { ip: server.ip, port: server.port, addedAt: Date.now() }];
    });
  };

  const copyAddress = async (server: ServerStatus) => {
    const address = `${server.ip}:${server.port}`;
    await electronApi.copyText(address);
    showToast('IP:порт скопирован!');
  };

  const startListening = async () => {
    setProgress({ scanned: 0, total: 0, percent: 100, found: 0, active: 1 });
    setListening(true);
    setHasListenerRun(true);
    setListenerSummary('');
    await electronApi.startScan({ timeoutMs: 5000 });
  };

  const stopListening = async () => {
    await electronApi.stopScan();
    setListening(false);
  };

  const runSearch = () => {
    const query = searchValue.trim().toLowerCase();
    if (!query) {
      setSearchResults([]);
      setSearchResultsOpen(true);
      return;
    }

    const matches = allServers.filter((server) => {
      const haystack = [
        server.ip,
        `${server.ip}:${server.port}`,
        server.motd,
        server.announcedMotd,
        server.version,
        ...server.playerNames
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(query);
    });

    setSearchResults(matches);
    setSearchResultsOpen(true);
  };

  const selectedIsFavorite = selectedServer
    ? Boolean(favoriteMap[getServerKey(selectedServer.ip, selectedServer.port)])
    : false;

  const hasActiveServerFilters = Boolean(serverSearchValue.trim()) || statusFilter !== 'all' || sourceFilter !== 'all';

  return (
    <div className="app-shell">
      <div className="background-orb orb-left" />
      <div className="background-orb orb-right" />

      <header className="hero-panel">
        <div className="hero-copy">
          <div className="hero-tag">Minecraft LAN Multicast Discovery</div>
          <h1>LAN Scanner &amp; Player Finder</h1>
          <p>
            Приложение слушает UDP multicast объявления Minecraft LAN на `224.0.2.60:4445` и автоматически подтягивает
            серверы по мере появления в сети.
          </p>
          {!isElectronRuntime ? (
            <p className="runtime-note">
              Открыт браузерный preview-режим. Реальное multicast-прослушивание работает только в Electron-окне.
            </p>
          ) : null}
        </div>
        <SearchBar value={searchValue} onChange={setSearchValue} onSubmit={runSearch} />
      </header>

      <section className="stats-grid">
        <div className="stat-card">
          <Server size={18} />
          <div>
            <span>Всего найдено</span>
            <strong>{stats.discovered}</strong>
          </div>
        </div>
        <div className="stat-card">
          <Wifi size={18} />
          <div>
            <span>Сейчас онлайн</span>
            <strong>{stats.onlineCount}</strong>
          </div>
        </div>
        <div className="stat-card">
          <Users size={18} />
          <div>
            <span>Игроков онлайн</span>
            <strong>{stats.players}</strong>
          </div>
        </div>
        <div className="stat-card">
          <Star size={18} />
          <div>
            <span>Избранное</span>
            <strong>{stats.favorites}</strong>
          </div>
        </div>
      </section>

      <section className="panel controls-panel">
        <div className="controls-row">
          <div className="button-cluster">
            <button className="primary-button glow-button" type="button" onClick={() => void startListening()} disabled={listening}>
              <Radio size={18} />
              Начать прослушивание
            </button>
            <button className="secondary-button" type="button" onClick={() => void stopListening()} disabled={!listening}>
              <BellRing size={18} />
              Остановить
            </button>
          </div>
          <Tabs active={activeTab} onChange={setActiveTab} />
        </div>

        <ProgressBar progress={progress} listening={listening} />
        {listenerSummary ? <p className="scan-summary">{listenerSummary}</p> : null}
      </section>

      <section className={`panel listing-panel ${activeTabIsFavorites ? 'favorites-panel' : ''}`}>
        <div className="section-head">
          <div>
            <h2>{activeTab === 'all' ? 'Все сервера' : 'Избранные сервера'}</h2>
            <p>
              {activeTab === 'all'
                ? 'Сервера появляются автоматически, когда Minecraft LAN хост рассылает multicast-объявления.'
                : 'Избранные сервера перепроверяются каждые 30 секунд, даже если новых multicast не было.'}
            </p>
          </div>
          {activeTab === 'favorites' ? (
            <div className="refresh-note">
              <RefreshCw size={16} />
              Автомониторинг включен
            </div>
          ) : null}
        </div>

        <ServerSearchBar
          value={serverSearchValue}
          onChange={setServerSearchValue}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          sourceFilter={sourceFilter}
          onSourceFilterChange={setSourceFilter}
          showSourceFilter={!activeTabIsFavorites}
          resultCount={visibleServers.length}
        />

        {visibleServers.length ? (
          <div className="server-grid search-results-grid">
            {visibleServers.map((server) => {
              const key = getServerKey(server.ip, server.port);
              return (
                <ServerCard
                  key={key}
                  server={server}
                  favorite={Boolean(favoriteMap[key])}
                  changedRecently={Boolean(recentChanges[key])}
                  searchQuery={serverSearchValue}
                  onOpen={() => setSelectedServer(server)}
                  onToggleFavorite={() => toggleFavorite(server)}
                  onCopy={() => void copyAddress(server)}
                  formatTime={formatTime}
                />
              );
            })}
          </div>
        ) : (
          <div className="empty-state">
            <HeartPulse size={28} />
            <h3>
              {hasActiveServerFilters
                ? 'Ничего не найдено :('
                : hasListenerRun
                  ? 'Объявления серверов пока не получены'
                  : 'Прослушивание еще не запускалось'}
            </h3>
            <p>
              {hasActiveServerFilters
                ? 'Попробуй изменить запрос или сбросить фильтры поиска.'
                : hasListenerRun
                  ? 'Запусти LAN-мир на другом клиенте Minecraft в той же сети или Radmin VPN и смотри debug-лог ниже.'
                  : 'Нажмите «Начать прослушивание», затем откройте мир для LAN на другом клиенте Minecraft.'}
            </p>
          </div>
        )}
      </section>

      <section className="panel debug-panel">
        <div className="section-head">
          <div>
            <h2>Debug Log</h2>
            <p>Сообщения также дублируются в консоль Electron DevTools.</p>
          </div>
        </div>
        <div className="debug-log-list">
          {debugLogs.length ? (
            debugLogs.slice().reverse().map((entry, index) => (
              <div key={`${entry.timestamp}-${index}`} className={`debug-log-entry debug-log-${entry.level}`}>
                <strong>
                  [{formatTime(entry.timestamp)}] [{entry.scope}] {entry.message}
                </strong>
                {entry.details ? <span>{entry.details}</span> : null}
              </div>
            ))
          ) : (
            <div className="debug-log-entry debug-log-info">
              <strong>Лог пока пуст.</strong>
              <span>После старта прослушивания здесь появятся multicast пакеты, IP отправителей и JSON-ответы status ping.</span>
            </div>
          )}
        </div>
      </section>

      <Modal open={Boolean(selectedServer)} onClose={() => setSelectedServer(null)} title="Подробности сервера" width="wide">
        {selectedServer ? (
          <div className="details-grid">
            <div className="details-main-card">
              <div className="details-heading">
                <div className="details-ip-block">
                  {selectedServer.favicon ? (
                    <img src={selectedServer.favicon} alt="Server favicon" className="server-favicon" />
                  ) : (
                    <div className="server-favicon placeholder-favicon">
                      <Server size={28} />
                    </div>
                  )}
                  <div>
                    <h3>
                      {selectedServer.ip}:{selectedServer.port}
                    </h3>
                    <p>{selectedServer.version}</p>
                  </div>
                </div>
                <span
                  className={`ping-pill ${
                    (selectedServer.ping ?? 999) < 50
                      ? 'ping-good'
                      : (selectedServer.ping ?? 999) <= 150
                        ? 'ping-mid'
                        : 'ping-bad'
                  }`}
                >
                  {selectedServer.ping !== null ? `${selectedServer.ping} ms` : 'Offline'}
                </span>
              </div>

              <div className="details-actions">
                <button className="primary-button glow-button" type="button" onClick={() => void copyAddress(selectedServer)}>
                  <Copy size={16} />
                  Скопировать IP:порт
                </button>
                <button className="secondary-button" type="button" onClick={() => toggleFavorite(selectedServer)}>
                  <Star size={16} fill={selectedIsFavorite ? 'currentColor' : 'none'} />
                  {selectedIsFavorite ? 'Удалить из избранного' : 'Добавить в избранное'}
                </button>
              </div>

              <div className="detail-block">
                <span className="detail-label">MOTD</span>
                <div className="motd-render">{renderMotdSegments(selectedServer.motdSegments)}</div>
              </div>
            </div>

            <div className="details-side-card">
              <div className="detail-block">
                <span className="detail-label">Статус</span>
                <div className="status-stack">
                  <span className={`status-pill ${selectedServer.online ? 'status-online' : 'status-offline'}`}>
                    <Wifi size={14} />
                    {selectedServer.online ? 'Сервер онлайн' : 'Сервер недоступен'}
                  </span>
                  <span>
                    Слоты: {selectedServer.playersOnline}/{selectedServer.playersMax || '?'}
                  </span>
                  <span>Последний TCP-ответ: {formatTime(selectedServer.lastSeen)}</span>
                  <span>Последнее multicast-объявление: {formatTime(selectedServer.lastAnnouncementAt)}</span>
                </div>
              </div>

              <div className="detail-block">
                <span className="detail-label">Игроки онлайн</span>
                <div className="players-column">
                  {selectedServer.playerNames.length ? (
                    selectedServer.playerNames.map((player) => (
                      <span key={`${selectedServer.ip}:${selectedServer.port}-player-${player}`} className="player-line">
                        {player}
                      </span>
                    ))
                  ) : (
                    <span className="player-line muted-line">Список игроков пуст или сервер его не раскрывает</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal open={searchResultsOpen} onClose={() => setSearchResultsOpen(false)} title="Результаты поиска серверов">
        <div className="search-results">
          {searchValue.trim() && !searchResults.length ? (
            <div className="search-result-empty">По запросу "{searchValue}" ничего не найдено.</div>
          ) : null}
          {!searchValue.trim() ? <div className="search-result-empty">Введите IP, название, версию или ник игрока.</div> : null}
          {searchResults.map((server) => (
            <div key={`search-${server.ip}:${server.port}`} className="search-result-card">
              <div>
                <strong>
                  {server.ip}:{server.port}
                </strong>
                <p>
                  {server.version} · {server.playersOnline}/{server.playersMax || '?'} игроков
                </p>
              </div>
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  setSelectedServer(server);
                  setSearchResultsOpen(false);
                }}
              >
                Перейти к серверу
              </button>
            </div>
          ))}
        </div>
      </Modal>

      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
}
