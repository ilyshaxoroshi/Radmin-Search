import type { ScanProgress } from '../types';

interface ProgressBarProps {
  progress: ScanProgress;
  listening: boolean;
}

export function ProgressBar({ progress, listening }: ProgressBarProps) {
  return (
    <div className="progress-shell">
      <div className="progress-copy">
        <span>{listening ? 'Прослушивание Minecraft LAN multicast' : 'Прослушивание остановлено'}</span>
        <strong>{listening ? 'LIVE' : 'STOP'}</strong>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: listening ? '100%' : '0%' }} />
      </div>
      <div className="progress-meta">
        <span>Получено объявлений: {progress.scanned}</span>
        <span>Найдено серверов: {progress.found}</span>
        <span>Статус listener: {progress.active ? 'активен' : 'неактивен'}</span>
      </div>
    </div>
  );
}
