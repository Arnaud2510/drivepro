import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Copy, Download, LogOut, Mail, Trash2, Users, ShieldCheck } from 'lucide-react';
import { useStore } from '../data/store';
import { supabase } from '../data/supabaseRepo';
import { fleetApi, type Invite, type InvitePreview, type Membership, type RosterEntry } from '../data/services';
import { Badge, Button, Card, Checkbox, EmptyState, Input, Notice, PageHeader, Select, Stat, Toggle, cx } from '../components/ui';
import { ProfitBars } from '../components/charts';
import { useToday } from '../components/hooks';
import { CURRENCIES } from '../config/catalog';
import { computeFleet, type DriverData, type FleetResult } from '../lib/fleet';
import { normalizeProfile } from '../data/defaults';
import { addDays, addMonths, formatDate, monthEnd, monthStart } from '../lib/dates';
import { currencyDigits, formatMoney, formatNumber, formatRate, toMajor } from '../lib/money';
import { toCSV, download } from '../lib/csv';
import type { DataSet } from '../lib/finance/engine';

function useFleetApi() {
  const { session } = useStore();
  return useMemo(() => (supabase && session ? fleetApi(supabase, session.user.id) : null), [session]);
}

type Range = 'month' | 'lastMonth' | '30d';

/* ------------------------------------------------------------------ manager: dashboard */

function FleetDashboard({ org, roster }: { org: Membership; roster: RosterEntry[] }) {
  const { t } = useTranslation();
  const { locale } = useStore();
  const api = useFleetApi();
  const today = useToday();
  const [range, setRange] = useState<Range>('month');
  const [drivers, setDrivers] = useState<DriverData[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const currency = org.currency ?? 'EUR';
  const sharing = roster.filter((r) => r.sharesData);
  const notSharing = roster.filter((r) => !r.sharesData && r.role === 'driver');

  useEffect(() => {
    if (!api) return;
    setDrivers(null);
    Promise.all(
      sharing.map(async (r) => {
        const d = await api.driverData(r.userId);
        if (!d.profile) return null;
        const profile = normalizeProfile(d.profile);
        const dataset: DataSet = { profile, vehicles: d.vehicles, platforms: d.platforms, days: d.days, expenses: d.expenses, fixedCosts: d.fixedCosts };
        return { userId: r.userId, name: r.displayName || r.email, dataset };
      }),
    )
      .then((x) => setDrivers(x.filter((d): d is DriverData => !!d)))
      .catch((e) => setError((e as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, sharing.map((r) => r.userId).join()]);

  const [from, to] =
    range === 'month' ? [monthStart(today), monthEnd(today)] : range === 'lastMonth' ? [addMonths(monthStart(today), -1), monthEnd(addMonths(monthStart(today), -1))] : [addDays(today, -29), today];
  const fleet: FleetResult | null = useMemo(() => (drivers ? computeFleet(drivers, from, to, today, currency) : null), [drivers, from, to, today, currency]);

  const money = (v: number, sign = false) => formatMoney(v, currency, locale, { sign });
  const perHour = (v: number | null) => (v == null ? t('common.insufficientData') : `${formatRate(v, currency, locale, 0)}/h`);
  const perKm = (v: number | null) => (v == null ? t('common.insufficientData') : `${formatRate(v, currency, locale, 1)}/km`);

  function exportCSV() {
    if (!fleet) return;
    const m = (v: number) => toMajor(v, currency).toFixed(currencyDigits(currency));
    const rows: (string | number | null)[][] = [
      [org.organizationName, `${from} → ${to}`, currency],
      [],
      [t('fleet.driver'), t('compare.days'), t('dashboard.revenue'), t('dashboard.commissions'), t('compare.costs'), t('dashboard.profit'), t('dashboard.hours'), 'km', t('dashboard.perHour'), t('dashboard.perKm'), t('fleet.lastActivity'), t('settings.currency')],
      ...fleet.drivers.map((d) => [
        d.name, d.period.workedDays, m(d.period.grossRevenue), m(d.period.commissions + d.period.platformFees), m(d.period.totalCostsExclCommission),
        m(d.period.profit), d.period.hours.toFixed(1), d.period.km, d.period.profitPerHour?.toFixed(2) ?? '', d.period.profitPerKm?.toFixed(3) ?? '', d.lastActivity ?? '', d.currency,
      ]),
      [],
      [t('day.vehicle'), t('fleet.driver'), t('compare.days'), 'km', t('dashboard.revenue'), t('dashboard.profit'), t('dashboard.perKm')],
      ...fleet.vehicles.map((v) => [v.vehicleName, v.driverName, v.days, v.km, m(v.grossRevenue), m(v.profit), v.profitPerKm?.toFixed(3) ?? '']),
    ];
    download(`fleet-${from}_${to}.csv`, toCSV(rows));
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Toggle<Range>
          label={t('common.period')}
          value={range}
          onChange={setRange}
          options={[
            { value: 'month', label: t('stats.rMonth') },
            { value: 'lastMonth', label: t('fleet.lastMonth') },
            { value: '30d', label: t('stats.r30d') },
          ]}
        />
        <Button variant="secondary" disabled={!fleet} onClick={exportCSV}>
          <Download className="h-4 w-4" aria-hidden /> CSV / Excel
        </Button>
      </div>
      {notSharing.length > 0 && <Notice>{t('fleet.notSharing', { count: notSharing.length })}</Notice>}
      {error && <Notice tone="loss">{error}</Notice>}
      {sharing.length === 0 ? (
        <EmptyState icon={<Users className="h-8 w-8" />} title={t('fleet.noSharedData')} text={t('fleet.noSharedDataText')} />
      ) : !fleet ? (
        <p className="text-sm text-slate-500" role="status">{t('common.loading')}</p>
      ) : (
        <>
          {fleet.otherCurrencies.length > 0 && <Notice tone="warn">{t('fleet.otherCurrencies', { currencies: fleet.otherCurrencies.join(', '), currency })}</Notice>}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label={t('dashboard.revenue')} value={money(fleet.totals.grossRevenue)} sub={t('fleet.activeDrivers', { count: fleet.totals.activeDrivers })} />
            <Stat label={t('dashboard.profit')} value={money(fleet.totals.profit, true)} tone={fleet.totals.profit >= 0 ? 'gain' : 'loss'} sub={`${t('dashboard.margin')} ${fleet.totals.marginPct == null ? t('common.notComputable') : formatNumber(fleet.totals.marginPct, locale) + ' %'}`} estimated={fleet.totals.daysWithEstimates > 0} />
            <Stat label={t('dashboard.perHour')} value={perHour(fleet.totals.profitPerHour)} sub={`${formatNumber(fleet.totals.hours, locale)} h`} />
            <Stat label={t('dashboard.perKm')} value={perKm(fleet.totals.profitPerKm)} sub={`${formatNumber(fleet.totals.km, locale, 0)} km`} />
          </div>
          <Card title={t('fleet.byDriver')} className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3">{t('fleet.driver')}</th>
                  <th className="py-2 pr-3 text-right">{t('compare.days')}</th>
                  <th className="py-2 pr-3 text-right">{t('dashboard.revenue')}</th>
                  <th className="py-2 pr-3 text-right">{t('dashboard.profit')}</th>
                  <th className="py-2 pr-3 text-right">{t('dashboard.perHour')}</th>
                  <th className="py-2 pr-3 text-right">{t('dashboard.perKm')}</th>
                  <th className="py-2 text-right">{t('fleet.lastActivity')}</th>
                </tr>
              </thead>
              <tbody>
                {fleet.drivers.map((d) => {
                  const f = (v: number, sign = false) => formatMoney(v, d.currency, locale, { sign });
                  return (
                    <tr key={d.userId} className="border-t border-slate-100">
                      <td className="py-2 pr-3 font-medium">
                        {d.name} {!d.aggregated && <Badge tone="warn">{d.currency}</Badge>}
                        {d.period.daysWithIssues > 0 && <Badge tone="warn">{t('history.incomplete', { count: d.period.daysWithIssues })}</Badge>}
                      </td>
                      <td className="tabular py-2 pr-3 text-right">{d.period.workedDays}</td>
                      <td className="tabular py-2 pr-3 text-right">{f(d.period.grossRevenue)}</td>
                      <td className={cx('tabular py-2 pr-3 text-right font-semibold', d.period.profit < 0 ? 'text-loss' : d.period.profit > 0 ? 'text-gain' : '')}>{f(d.period.profit, true)}</td>
                      <td className="tabular py-2 pr-3 text-right">{d.period.profitPerHour == null ? '—' : `${formatRate(d.period.profitPerHour, d.currency, locale, 0)}/h`}</td>
                      <td className="tabular py-2 pr-3 text-right">{d.period.profitPerKm == null ? '—' : `${formatRate(d.period.profitPerKm, d.currency, locale, 1)}/km`}</td>
                      <td className="py-2 text-right text-xs text-slate-500">{d.lastActivity ? formatDate(d.lastActivity, locale) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
          <div className="grid gap-5 lg:grid-cols-2">
            <Card title={t('fleet.profitByDriver')}>
              <ProfitBars data={fleet.drivers.filter((d) => d.aggregated).map((d) => ({ label: d.name.split('@')[0].slice(0, 12), profit: d.period.profit }))} currency={currency} />
            </Card>
            <Card title={t('fleet.vehicles')}>
              {fleet.vehicles.length === 0 ? (
                <p className="text-sm text-slate-500">{t('common.noDataPeriod')}</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-500">
                      <th className="py-1">{t('day.vehicle')}</th>
                      <th className="py-1 text-right">km</th>
                      <th className="py-1 text-right">{t('dashboard.profit')}</th>
                      <th className="py-1 text-right">{t('dashboard.perKm')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fleet.vehicles.map((v) => (
                      <tr key={v.vehicleId} className="border-t border-slate-100">
                        <td className="py-1.5">
                          {v.vehicleName} <span className="text-xs text-slate-500">· {v.driverName}</span>
                        </td>
                        <td className="tabular py-1.5 text-right">{formatNumber(v.km, locale, 0)}</td>
                        <td className="tabular py-1.5 text-right">{money(v.profit, true)}</td>
                        <td className="tabular py-1.5 text-right">{perKm(v.profitPerKm)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </div>
          <p className="text-xs text-slate-500">{t('fleet.method')}</p>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ manager: drivers & invitations */

function FleetMembers({ org, roster, reload }: { org: Membership; roster: RosterEntry[]; reload: () => void }) {
  const { t } = useTranslation();
  const { session, locale } = useStore();
  const api = useFleetApi();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'driver' | 'manager'>('driver');
  const [lastLink, setLastLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const linkFor = (token: string) => `${location.origin}/app/fleet/join/${token}`;
  const loadInvites = useCallback(() => api?.invites(org.organizationId).then(setInvites).catch((e) => setError(e.message)), [api, org.organizationId]);
  useEffect(() => {
    loadInvites();
  }, [loadInvites]);

  const guard = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      reload();
      loadInvites();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const status = (i: Invite) => (i.acceptedAt ? 'accepted' : new Date(i.expiresAt) < new Date() ? 'expired' : 'pending');

  return (
    <div className="space-y-5">
      {error && <Notice tone="loss">{error}</Notice>}
      <Card title={t('fleet.invite')}>
        <form
          className="grid gap-3 sm:grid-cols-[1fr_auto_auto]"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!api || !/^\S+@\S+\.\S+$/.test(email.trim())) return setError(t('errors.email'));
            await guard(async () => {
              setLastLink(linkFor(await api.invite(org.organizationId, email, role)));
              setEmail('');
            });
          }}
        >
          <Input label={t('auth.email')} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Select label={t('fleet.role')} value={role} onChange={(e) => setRole(e.target.value as 'driver' | 'manager')}>
            <option value="driver">{t('fleet.roles.driver')}</option>
            {org.role === 'owner' && <option value="manager">{t('fleet.roles.manager')}</option>}
          </Select>
          <Button type="submit" className="self-end">
            <Mail className="h-4 w-4" aria-hidden /> {t('fleet.createInvite')}
          </Button>
        </form>
        <p className="mt-2 text-xs text-slate-500">{t('fleet.inviteHint')}</p>
        {lastLink && (
          <div className="mt-3 rounded-xl bg-gain-bg p-3 text-sm">
            <p className="font-medium text-gain">{t('fleet.inviteCreated')}</p>
            <div className="mt-2 flex gap-2">
              <input readOnly value={lastLink} aria-label={t('fleet.inviteLink')} className="min-w-0 flex-1 rounded-lg border border-green-200 bg-white px-2 py-1 text-xs" />
              <Button variant="secondary" onClick={() => navigator.clipboard?.writeText(lastLink)}>
                <Copy className="h-4 w-4" aria-hidden /> {t('fleet.copy')}
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Card title={t('fleet.members', { count: roster.length })} className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2 pr-3">{t('fleet.driver')}</th>
              <th className="py-2 pr-3">{t('fleet.role')}</th>
              <th className="py-2 pr-3">{t('fleet.dataSharing')}</th>
              <th className="py-2 text-right">{t('fleet.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {roster.map((m) => {
              const self = m.userId === session?.user.id;
              return (
                <tr key={m.userId} className="border-t border-slate-100">
                  <td className="py-2 pr-3">
                    <p className="font-medium">{m.displayName || m.email}</p>
                    {m.displayName && <p className="text-xs text-slate-500">{m.email}</p>}
                  </td>
                  <td className="py-2 pr-3">
                    <Badge tone={m.role === 'driver' ? 'neutral' : 'info'}>{t(`fleet.roles.${m.role}`)}</Badge>
                  </td>
                  <td className="py-2 pr-3">
                    {m.role === 'driver' ? (
                      m.sharesData ? (
                        <Badge tone="gain">✓ {t('fleet.sharing', { date: m.consentAt ? formatDate(m.consentAt.slice(0, 10), locale) : '' })}</Badge>
                      ) : (
                        <Badge tone="warn">{t('fleet.notSharingBadge')}</Badge>
                      )
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="py-2 text-right">
                    {!self && m.role !== 'owner' && (
                      <div className="flex justify-end gap-1">
                        {org.role === 'owner' && (
                          <Button variant="ghost" onClick={() => guard(() => api!.setRole(org.organizationId, m.userId, m.role === 'driver' ? 'manager' : 'driver'))}>
                            {m.role === 'driver' ? t('fleet.makeManager') : t('fleet.makeDriver')}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          aria-label={t('fleet.remove')}
                          onClick={() => confirm(t('fleet.confirmRemove', { name: m.displayName || m.email })) && guard(() => api!.removeMember(org.organizationId, m.userId))}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-slate-500">{t('fleet.consentExplain')}</p>
      </Card>

      {invites.length > 0 && (
        <Card title={t('fleet.invites')}>
          <ul className="divide-y divide-slate-100">
            {invites.map((i) => {
              const s = status(i);
              return (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span>
                    {i.email} · {t(`fleet.roles.${i.role}`)}{' '}
                    <Badge tone={s === 'accepted' ? 'gain' : s === 'expired' ? 'loss' : 'info'}>{t(`fleet.inviteStatus.${s}`)}</Badge>
                  </span>
                  {s === 'pending' && (
                    <span className="flex gap-1">
                      <Button variant="ghost" onClick={() => navigator.clipboard?.writeText(linkFor(i.token))}>
                        <Copy className="h-4 w-4" aria-hidden /> {t('fleet.copy')}
                      </Button>
                      <Button variant="ghost" onClick={() => guard(() => api!.revokeInvite(i.id))}>
                        {t('fleet.revoke')}
                      </Button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ page */

function CreateFleet({ onCreated }: { onCreated: () => void }) {
  const { t } = useTranslation();
  const { profile } = useStore();
  const api = useFleetApi();
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState(profile?.currency ?? 'EUR');
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="grid gap-3 sm:grid-cols-[1fr_10rem_auto]"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim()) return setError(t('errors.required'));
        try {
          await api!.createOrganization(name.trim(), profile?.countryCode ?? null, currency);
          setName('');
          onCreated();
        } catch (err) {
          setError((err as Error).message);
        }
      }}
    >
      <Input label={t('fleet.name')} value={name} error={error} onChange={(e) => setName(e.target.value)} />
      <Select label={t('settings.currency')} value={currency} onChange={(e) => setCurrency(e.target.value)}>
        {CURRENCIES.map((c) => (
          <option key={c}>{c}</option>
        ))}
      </Select>
      <Button type="submit" className="self-end">
        {t('fleet.create')}
      </Button>
    </form>
  );
}

export function Fleet() {
  const { t } = useTranslation();
  const { mode, locale } = useStore();
  const api = useFleetApi();
  const [memberships, setMemberships] = useState<Membership[] | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [tab, setTab] = useState<'dashboard' | 'members'>('dashboard');
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(() => {
    api?.memberships().then(setMemberships).catch((e) => setError(e.message));
  }, [api]);
  useEffect(load, [load]);

  const managed = (memberships ?? []).filter((m) => m.role !== 'driver');
  const org = managed.find((m) => m.organizationId === orgId) ?? managed[0];
  const loadRoster = useCallback(() => {
    if (api && org) api.roster(org.organizationId).then(setRoster).catch((e) => setError(e.message));
  }, [api, org?.organizationId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(loadRoster, [loadRoster]);

  if (mode !== 'supabase')
    return (
      <div className="space-y-5">
        <PageHeader title={t('fleet.title')} subtitle={t('fleet.subtitle')} />
        <Notice>{t('fleet.needsAccount')}</Notice>
      </div>
    );

  const driverOf = (memberships ?? []).filter((m) => m.role === 'driver');
  return (
    <div className="space-y-5">
      <PageHeader
        title={t('fleet.title')}
        subtitle={t('fleet.subtitle')}
        actions={
          managed.length > 1 ? (
            <Select label={<span className="sr-only">{t('fleet.title')}</span>} value={org?.organizationId} onChange={(e) => setOrgId(e.target.value)}>
              {managed.map((m) => (
                <option key={m.organizationId} value={m.organizationId}>
                  {m.organizationName}
                </option>
              ))}
            </Select>
          ) : undefined
        }
      />
      {error && <Notice tone="loss">{error}</Notice>}
      {memberships === null ? (
        <p className="text-sm text-slate-500" role="status">{t('common.loading')}</p>
      ) : (
        <>
          {org && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 text-lg font-semibold text-brand-900">
                  <ShieldCheck className="h-5 w-5" aria-hidden /> {org.organizationName} <Badge tone="info">{t(`fleet.roles.${org.role}`)}</Badge>
                </h2>
                <Toggle
                  label={t('fleet.title')}
                  value={tab}
                  onChange={setTab}
                  options={[
                    { value: 'dashboard', label: t('fleet.tabDashboard') },
                    { value: 'members', label: t('fleet.tabMembers') },
                  ]}
                />
              </div>
              {tab === 'dashboard' ? <FleetDashboard org={org} roster={roster} /> : <FleetMembers org={org} roster={roster} reload={loadRoster} />}
            </>
          )}

          {driverOf.length > 0 && (
            <Card title={t('fleet.myFleets')}>
              <ul className="divide-y divide-slate-100">
                {driverOf.map((m) => (
                  <li key={m.organizationId} className="space-y-2 py-3">
                    <p className="font-medium text-brand-900">{m.organizationName}</p>
                    <Checkbox
                      checked={m.sharesData}
                      onChange={async (v) => {
                        // Optimistic: reflect the choice at once, roll back if the server refuses.
                        const set = (share: boolean) =>
                          setMemberships((ms) => ms && ms.map((x) => (x.organizationId === m.organizationId ? { ...x, sharesData: share, consentAt: share ? new Date().toISOString() : x.consentAt } : x)));
                        set(v);
                        try {
                          await api!.setConsent(m.organizationId, v);
                          load();
                        } catch (e) {
                          set(!v);
                          setError((e as Error).message);
                        }
                      }}
                      label={t('fleet.shareMyData', { org: m.organizationName })}
                      hint={m.sharesData && m.consentAt ? t('fleet.sharingSince', { date: formatDate(m.consentAt.slice(0, 10), locale) }) : t('fleet.shareHint')}
                    />
                    <Button
                      variant="ghost"
                      onClick={async () => {
                        if (!confirm(t('fleet.confirmLeave', { org: m.organizationName }))) return;
                        await api!.leave(m.organizationId);
                        load();
                      }}
                    >
                      <LogOut className="h-4 w-4" aria-hidden /> {t('fleet.leave')}
                    </Button>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {managed.length === 0 || showCreate ? (
            <Card title={t('fleet.createTitle')}>
              <p className="mb-3 text-sm text-slate-600">{t('fleet.createText')}</p>
              <CreateFleet
                onCreated={() => {
                  setShowCreate(false);
                  load();
                }}
              />
            </Card>
          ) : (
            <Button variant="ghost" onClick={() => setShowCreate(true)}>
              {t('fleet.createAnother')}
            </Button>
          )}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ invitation */

export function JoinFleet() {
  const { t } = useTranslation();
  const { token = '' } = useParams();
  const nav = useNavigate();
  const { mode, session } = useStore();
  const api = useFleetApi();
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [share, setShare] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api?.preview(token).then(setPreview).catch((e) => setError(e.message));
  }, [api, token]);

  if (mode !== 'supabase') return <Notice>{t('fleet.needsAccount')}</Notice>;
  return (
    <div className="mx-auto max-w-lg space-y-5">
      <PageHeader title={t('fleet.joinTitle')} />
      {error && <Notice tone="loss">{error}</Notice>}
      {!preview ? (
        <p className="text-sm text-slate-500" role="status">{t('common.loading')}</p>
      ) : preview.status !== 'valid' ? (
        <Notice tone="warn">{t(`fleet.inviteInvalid.${preview.status}`, { email: preview.email ?? '', current: session?.user.email ?? '' })}</Notice>
      ) : (
        <Card>
          <p className="text-slate-700">{t('fleet.joinText', { org: preview.organization, role: t(`fleet.roles.${preview.role}`) })}</p>
          <div className="mt-4 rounded-xl bg-slate-50 p-3">
            <Checkbox checked={share} onChange={setShare} label={t('fleet.shareMyData', { org: preview.organization })} hint={t('fleet.shareHint')} />
          </div>
          <div className="mt-4 flex gap-2">
            <Button
              onClick={async () => {
                try {
                  await api!.accept(token, share);
                  nav('/app/fleet');
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              {t('fleet.accept')}
            </Button>
            <Link to="/app" className="inline-flex min-h-11 items-center px-4 text-sm font-semibold text-brand-700">
              {t('common.cancel')}
            </Link>
          </div>
        </Card>
      )}
    </div>
  );
}
