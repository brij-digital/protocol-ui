import { useEffect, useMemo, useState } from 'react';

type AdminDashboardTabProps = {
  adminApiBaseUrl: string;
};

type ProtocolSummary = {
  protocol_id: string;
  index_count: number;
  state_rows: number;
  record_rows: number;
  series_points: number;
  avg_freshness_seconds: number | null;
  stale_count: number;
  active_count: number;
  records_last_5m: number;
  records_last_1h: number;
  projection_lag_seconds: number | null;
};

type IndexSummary = {
  index_id: string;
  protocol_id: string;
  operation_id: string;
  projection_kind: string | null;
  source: string;
  record_kind: string | null;
  record_names: string[];
  series_id: string | null;
  state_rows: number;
  record_rows: number;
  series_points: number;
  avg_freshness_seconds: number | null;
  stale_count: number;
  active_count: number;
  records_last_5m: number;
  records_last_1h: number;
};

type OverviewResponse = {
  ok: boolean;
  protocols?: ProtocolSummary[];
  totals?: {
    protocol_count: number;
    index_count: number;
    state_rows: number;
    record_rows: number;
    series_points: number;
    active_count: number;
    max_projection_lag_seconds: number | null;
    storage_bytes?: {
      total?: number;
    };
  };
  now?: string;
};

type ProtocolDetailResponse = {
  ok: boolean;
  protocol?: ProtocolSummary & {
    storage_bytes?: Record<string, number>;
  };
  indexes?: IndexSummary[];
  record_names?: Array<{ record_name: string; count: number }>;
  state_names?: Array<{ record_name: string; count: number }>;
  top_subjects?: Array<{ subject_id: string; count: number }>;
  now?: string;
  error?: string;
};

function formatCompactNumber(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '—';
  }
  return value.toLocaleString(undefined, { notation: 'compact', maximumFractionDigits: 2 });
}

function formatInteger(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '—';
  }
  return value.toLocaleString();
}

function formatSeconds(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '—';
  }
  if (value < 60) {
    return `${Math.round(value)}s`;
  }
  if (value < 3600) {
    return `${(value / 60).toFixed(1)}m`;
  }
  if (value < 86400) {
    return `${(value / 3600).toFixed(1)}h`;
  }
  return `${(value / 86400).toFixed(1)}d`;
}

function formatBytes(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '—';
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let current = value;
  let unitIndex = 0;
  while (current >= 1024 && unitIndex < units.length - 1) {
    current /= 1024;
    unitIndex += 1;
  }
  return `${current.toFixed(current >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function shortId(value: string): string {
  if (value.length <= 18) {
    return value;
  }
  return `${value.slice(0, 8)}…${value.slice(-8)}`;
}

export function AdminDashboardTab({ adminApiBaseUrl }: AdminDashboardTabProps) {
  const baseUrl = useMemo(() => adminApiBaseUrl.trim().replace(/\/+$/, ''), [adminApiBaseUrl]);
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [selectedProtocolId, setSelectedProtocolId] = useState<string>('');
  const [protocolDetail, setProtocolDetail] = useState<ProtocolDetailResponse | null>(null);
  const [isLoadingOverview, setIsLoadingOverview] = useState(false);
  const [isLoadingProtocol, setIsLoadingProtocol] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  async function loadOverview(preserveSelection = true): Promise<void> {
    setIsLoadingOverview(true);
    setErrorText(null);
    try {
      const response = await fetch(`${baseUrl}/admin/overview`);
      const body = (await response.json()) as OverviewResponse;
      if (!response.ok || !body.ok) {
        throw new Error('Failed to load admin overview.');
      }
      setOverview(body);
      const nextProtocolId = preserveSelection && selectedProtocolId
        ? selectedProtocolId
        : (body.protocols?.[0]?.protocol_id ?? '');
      if (nextProtocolId && nextProtocolId !== selectedProtocolId) {
        setSelectedProtocolId(nextProtocolId);
      } else if (!selectedProtocolId) {
        setSelectedProtocolId(nextProtocolId);
      }
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : 'Failed to load admin overview.');
    } finally {
      setIsLoadingOverview(false);
    }
  }

  async function loadProtocol(protocolId: string): Promise<void> {
    if (!protocolId) {
      setProtocolDetail(null);
      return;
    }
    setIsLoadingProtocol(true);
    setErrorText(null);
    try {
      const response = await fetch(`${baseUrl}/admin/protocols/${encodeURIComponent(protocolId)}`);
      const body = (await response.json()) as ProtocolDetailResponse;
      if (!response.ok || !body.ok) {
        throw new Error(body.error ?? `Failed to load ${protocolId}.`);
      }
      setProtocolDetail(body);
    } catch (error) {
      setProtocolDetail(null);
      setErrorText(error instanceof Error ? error.message : `Failed to load ${protocolId}.`);
    } finally {
      setIsLoadingProtocol(false);
    }
  }

  useEffect(() => {
    void loadOverview(false);
  }, [baseUrl]);

  useEffect(() => {
    if (!selectedProtocolId) {
      return;
    }
    void loadProtocol(selectedProtocolId);
  }, [baseUrl, selectedProtocolId]);

  return (
    <section className="admin-shell">
      <div className="admin-header">
        <div>
          <h2>Indexing Admin</h2>
          <p>Inspect protocol freshness, index volume, projection lag, and top indexed entities from the canonical indexing backend.</p>
        </div>
        <div className="admin-header-actions">
          <code>{baseUrl}</code>
          <button type="button" onClick={() => void loadOverview(true)} disabled={isLoadingOverview || isLoadingProtocol}>
            {isLoadingOverview ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {errorText ? <p className="view-playground-error">{errorText}</p> : null}

      <div className="admin-grid admin-summary-grid">
        <div className="admin-card">
          <span>Protocols</span>
          <strong>{formatInteger(overview?.totals?.protocol_count)}</strong>
        </div>
        <div className="admin-card">
          <span>Indexes</span>
          <strong>{formatInteger(overview?.totals?.index_count)}</strong>
        </div>
        <div className="admin-card">
          <span>Raw State Rows</span>
          <strong>{formatCompactNumber(overview?.totals?.state_rows)}</strong>
        </div>
        <div className="admin-card">
          <span>Raw Record Rows</span>
          <strong>{formatCompactNumber(overview?.totals?.record_rows)}</strong>
        </div>
        <div className="admin-card">
          <span>Series Points</span>
          <strong>{formatCompactNumber(overview?.totals?.series_points)}</strong>
        </div>
        <div className="admin-card">
          <span>Storage</span>
          <strong>{formatBytes(overview?.totals?.storage_bytes?.total)}</strong>
        </div>
      </div>

      <div className="admin-grid admin-main-grid">
        <section className="admin-panel">
          <div className="admin-panel-header">
            <h3>Protocols</h3>
            <span>{overview?.now ?? '—'}</span>
          </div>
          <div className="admin-list">
            {(overview?.protocols ?? []).map((protocol) => {
              const active = protocol.protocol_id === selectedProtocolId;
              return (
                <button
                  key={protocol.protocol_id}
                  type="button"
                  className={active ? 'admin-list-item active' : 'admin-list-item'}
                  onClick={() => setSelectedProtocolId(protocol.protocol_id)}
                >
                  <div className="admin-list-head">
                    <strong>{protocol.protocol_id}</strong>
                    <code>{formatSeconds(protocol.projection_lag_seconds)}</code>
                  </div>
                  <div className="admin-list-meta">
                    <span>{protocol.index_count} indexes</span>
                    <span>{formatCompactNumber(protocol.record_rows)} records</span>
                    <span>{formatCompactNumber(protocol.state_rows)} state</span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="admin-panel">
          <div className="admin-panel-header">
            <h3>Selected Protocol</h3>
            <span>{selectedProtocolId || '—'}</span>
          </div>
          {protocolDetail?.protocol ? (
            <>
              <div className="admin-grid admin-protocol-stats">
                <div className="admin-card">
                  <span>Projection Lag</span>
                  <strong>{formatSeconds(protocolDetail.protocol.projection_lag_seconds)}</strong>
                </div>
                <div className="admin-card">
                  <span>Avg Freshness</span>
                  <strong>{formatSeconds(protocolDetail.protocol.avg_freshness_seconds)}</strong>
                </div>
                <div className="admin-card">
                  <span>Records</span>
                  <strong>{formatCompactNumber(protocolDetail.protocol.record_rows)}</strong>
                </div>
                <div className="admin-card">
                  <span>State Rows</span>
                  <strong>{formatCompactNumber(protocolDetail.protocol.state_rows)}</strong>
                </div>
              </div>

              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Index</th>
                      <th>Kind</th>
                      <th>Source</th>
                      <th>Rows</th>
                      <th>Freshness</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(protocolDetail.indexes ?? []).map((index) => (
                      <tr key={index.index_id}>
                        <td>{index.operation_id}</td>
                        <td>{index.projection_kind ?? '—'}</td>
                        <td>{index.source}</td>
                        <td>{formatInteger(index.record_rows + index.state_rows + index.series_points)}</td>
                        <td>{formatSeconds(index.avg_freshness_seconds)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="admin-empty">{isLoadingProtocol ? 'Loading protocol details…' : 'Select a protocol to inspect its indexes.'}</p>
          )}
        </section>
      </div>

      <div className="admin-grid admin-lists-grid">
        <section className="admin-panel">
          <div className="admin-panel-header">
            <h3>Record Names</h3>
            <span>{formatInteger(protocolDetail?.record_names?.length)}</span>
          </div>
          <div className="admin-key-value-list">
            {(protocolDetail?.record_names ?? []).map((row) => (
              <div key={row.record_name} className="admin-key-value-row">
                <code>{row.record_name}</code>
                <strong>{formatInteger(row.count)}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="admin-panel">
          <div className="admin-panel-header">
            <h3>State Names</h3>
            <span>{formatInteger(protocolDetail?.state_names?.length)}</span>
          </div>
          <div className="admin-key-value-list">
            {(protocolDetail?.state_names ?? []).map((row) => (
              <div key={row.record_name} className="admin-key-value-row">
                <code>{row.record_name}</code>
                <strong>{formatInteger(row.count)}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="admin-panel">
          <div className="admin-panel-header">
            <h3>Top Subjects</h3>
            <span>{formatInteger(protocolDetail?.top_subjects?.length)}</span>
          </div>
          <div className="admin-key-value-list">
            {(protocolDetail?.top_subjects ?? []).map((row) => (
              <div key={row.subject_id} className="admin-key-value-row">
                <code title={row.subject_id}>{shortId(row.subject_id)}</code>
                <strong>{formatInteger(row.count)}</strong>
              </div>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
