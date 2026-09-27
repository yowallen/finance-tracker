import { useEffect, useMemo, useState } from 'react'
import { CalendarRange } from 'lucide-react'
import { formatMoney } from '../lib/format'
import { estimatePayslip } from '../services/phPayroll'
import { settingsFromPreset } from '../services/paydayBudget'
import {
  PAYDAY_PRESETS,
  type PaydayPeriodSummary,
  type PaydayScheduleId,
  type PaydaySettings,
} from '../types/paydayBudget'

interface PaydayBudgetProps {
  settings: PaydaySettings
  periods: PaydayPeriodSummary[]
  onSave: (settings: PaydaySettings) => Promise<void>
}

function formatDay(date: Date): string {
  return new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric' }).format(date)
}

export function PaydayBudget({ settings, periods, onSave }: Readonly<PaydayBudgetProps>) {
  const [allowance, setAllowance] = useState(String(settings.allowance || ''))
  const [gross, setGross] = useState(String(settings.monthlyGross || ''))
  const [deMinimisInput, setDeMinimisInput] = useState(String(settings.deMinimisPerPayday || ''))
  const [customFirst, setCustomFirst] = useState(String(settings.firstDay))
  const [customSecond, setCustomSecond] = useState(String(settings.secondDay))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setAllowance(String(settings.allowance || ''))
    setGross(String(settings.monthlyGross || ''))
    setDeMinimisInput(String(settings.deMinimisPerPayday || ''))
    setCustomFirst(String(settings.firstDay))
    setCustomSecond(String(settings.secondDay))
  }, [settings.allowance, settings.monthlyGross, settings.deMinimisPerPayday, settings.firstDay, settings.secondDay])

  async function persist(next: PaydaySettings) {
    setError(null)
    try {
      await onSave(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save payday budget.')
    }
  }

  function chooseSchedule(id: PaydayScheduleId) {
    const next = settingsFromPreset(id, settings)
    if (id === 'custom') {
      setCustomFirst(String(next.firstDay))
      setCustomSecond(String(next.secondDay))
    }
    void persist(next)
  }

  const payslip = useMemo(() => {
    const amount = Number.parseFloat(gross)
    const deMinimis = Number.parseFloat(deMinimisInput)
    if (!Number.isFinite(amount) || amount <= 0) return null
    return estimatePayslip(amount, {
      deMinimisPerPayday: Number.isFinite(deMinimis) ? deMinimis : 0,
    })
  }, [gross, deMinimisInput])

  function saveGross() {
    const amount = Number.parseFloat(gross)
    if (gross.trim() === '') {
      void persist({ ...settings, monthlyGross: 0 })
      return
    }
    if (!Number.isFinite(amount) || amount < 0) {
      setError('Monthly basic pay must be zero or more.')
      return
    }
    void persist({ ...settings, monthlyGross: amount, deMinimisPerPayday: Number.parseFloat(deMinimisInput) || 0 })
  }

  function saveDeMinimis() {
    const amount = deMinimisInput.trim() === '' ? 0 : Number.parseFloat(deMinimisInput)
    if (!Number.isFinite(amount) || amount < 0) {
      setError('De minimis must be zero or more.')
      return
    }
    void persist({ ...settings, deMinimisPerPayday: amount })
  }

  function useTakeHomeAsAllowance() {
    if (!payslip) return
    const perPayday = Math.round(payslip.paydayWithDeductions * 100) / 100
    setAllowance(String(perPayday))
    void persist({
      ...settings,
      monthlyGross: payslip.monthlyBasic,
      deMinimisPerPayday: payslip.deMinimisPerPayday,
      allowance: perPayday,
    })
  }
  function saveAllowance() {
    const amount = Number.parseFloat(allowance)
    if (!Number.isFinite(amount) || amount < 0) {
      setError('Allowance must be zero or more.')
      return
    }
    void persist({ ...settings, allowance: amount })
  }

  function saveCustomDays() {
    const firstDay = Number.parseInt(customFirst, 10)
    const secondDay = Number.parseInt(customSecond, 10)
    if (!Number.isInteger(firstDay) || !Number.isInteger(secondDay) || firstDay < 1 || secondDay < 1 || firstDay > 31 || secondDay > 31) {
      setError('Custom paydays must be two different days from 1 to 31.')
      return
    }
    if (firstDay === secondDay) {
      setError('Choose two different payday dates.')
      return
    }
    void persist({ ...settings, schedule: 'custom', firstDay, secondDay })
  }

  return (
    <section id="payday" className="payday-budget" aria-labelledby="payday-heading">
      <div className="payday-budget__header">
        <h2 id="payday-heading" className="section-title">
          <CalendarRange className="section-icon" aria-hidden="true" />
          Payday budget
        </h2>
        <p className="payday-budget__note">Each period uses the same allowance. Income is shown and does not raise it.</p>
      </div>

      <div className="payday-schedule" role="group" aria-label="Payday schedule">
        {PAYDAY_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={`payday-schedule__option ${settings.schedule === preset.id ? 'active' : ''}`}
            aria-pressed={settings.schedule === preset.id}
            onClick={() => chooseSchedule(preset.id)}
          >
            {preset.label}
          </button>
        ))}
        <button
          type="button"
          className={`payday-schedule__option ${settings.schedule === 'custom' ? 'active' : ''}`}
          aria-pressed={settings.schedule === 'custom'}
          onClick={() => chooseSchedule('custom')}
        >
          Custom
        </button>
      </div>

      {settings.schedule === 'custom' && (
        <div className="payday-custom">
          <label>
            First payday
            <input
              type="number"
              min={1}
              max={31}
              value={customFirst}
              onChange={(event) => setCustomFirst(event.target.value)}
              onBlur={saveCustomDays}
            />
          </label>
          <label>
            Second payday
            <input
              type="number"
              min={1}
              max={31}
              value={customSecond}
              onChange={(event) => setCustomSecond(event.target.value)}
              onBlur={saveCustomDays}
            />
          </label>
        </div>
      )}

      <div className="payday-controls">
        <label>
          Monthly basic pay
          <input
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            value={gross}
            onChange={(event) => setGross(event.target.value)}
            onBlur={saveGross}
            placeholder="Before deductions"
          />
        </label>
        <label>
          De minimis each payday
          <input
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            value={deMinimisInput}
            onChange={(event) => setDeMinimisInput(event.target.value)}
            onBlur={saveDeMinimis}
            placeholder="0"
          />
        </label>
        <label>
          Allowance per period
          <input
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            value={allowance}
            onChange={(event) => setAllowance(event.target.value)}
            onBlur={saveAllowance}
            placeholder="0 = use logged income"
          />
        </label>
        <label className="payday-rollover">
          <input
            type="checkbox"
            checked={settings.rollover}
            onChange={(event) => {
              void persist({ ...settings, rollover: event.target.checked })
            }}
          />
          Roll unspent into the next period
        </label>
      </div>
      {settings.allowance <= 0 && (
        <p className="payday-budget__note">
          Allowance is empty, so each period is funded by logged income. Set an allowance if you want a fixed budget instead of salary deposits.
        </p>
      )}

      {payslip && (
        <div className="payday-payslip">
          <p>Contributions are based on monthly basic pay only. De minimis is added to each payday and is not part of SSS, PhilHealth, or Pag-IBIG. The full month of those contributions is taken on one payday, which matches a cutoff like yours.</p>
          <dl>
            <div><dt>SSS</dt><dd>{formatMoney(payslip.sss)}</dd></div>
            <div><dt>PhilHealth</dt><dd>{formatMoney(payslip.philHealth)}</dd></div>
            <div><dt>Pag-IBIG</dt><dd>{formatMoney(payslip.pagIbig)}</dd></div>
            <div><dt>Withholding tax</dt><dd>{formatMoney(payslip.withholdingTax)}</dd></div>
            <div><dt>Payday with deductions</dt><dd>{formatMoney(payslip.paydayWithDeductions)}</dd></div>
            <div><dt>Other payday</dt><dd>{formatMoney(payslip.paydayWithoutDeductions)}</dd></div>
          </dl>
          <button type="button" className="btn-ghost payday-use-net" onClick={useTakeHomeAsAllowance}>
            Use the payday with deductions as the allowance
          </button>
        </div>
      )}

      {error && <p className="form-error" role="alert">{error}</p>}

      <div className="payday-periods">
        {periods.map((period) => (
          <article
            key={`${period.start.toISOString()}-${period.end.toISOString()}`}
            className={`payday-period ${period.active ? 'active' : ''}`}
          >
            <header>
              <h3>{formatDay(period.start)} – {formatDay(period.end)}</h3>
              {period.active && <span className="payday-period__badge">This period</span>}
            </header>
            {period.active && (
              <div className={`payday-safe-spend ${period.left < 0 ? 'negative' : ''}`}>
                <p className="payday-safe-spend__label">Safe to spend</p>
                <p className="payday-safe-spend__amount">{formatMoney(period.left)}</p>
                {period.perDay !== null && (
                  <p className="payday-safe-spend__daily">
                    {formatMoney(period.perDay)} a day for {period.daysRemaining}{' '}
                    {period.daysRemaining === 1 ? 'day' : 'days'}
                  </p>
                )}
              </div>
            )}
            <dl>
              <div>
                <dt>Income</dt>
                <dd>{formatMoney(period.income)}</dd>
              </div>
              <div>
                <dt>Spent</dt>
                <dd>{formatMoney(period.spent)}</dd>
              </div>
              <div>
                <dt>Still due</dt>
                <dd>{formatMoney(period.stillDue)}</dd>
              </div>
              {period.rolloverIn !== 0 && (
                <div>
                  <dt>From last period</dt>
                  <dd className={period.rolloverIn < 0 ? 'negative' : ''}>
                    {formatMoney(period.rolloverIn)}
                  </dd>
                </div>
              )}
              {!period.active && (
                <div>
                  <dt>Safe to spend</dt>
                  <dd className={period.left < 0 ? 'negative' : ''}>{formatMoney(period.left)}</dd>
                </div>
              )}
            </dl>
            {!period.active && period.perDay !== null && (
              <p className="payday-period__daily">
                {formatMoney(period.perDay)} a day for {period.daysRemaining}{' '}
                {period.daysRemaining === 1 ? 'day' : 'days'}
              </p>
            )}
          </article>
        ))}
      </div>
    </section>
  )
}
