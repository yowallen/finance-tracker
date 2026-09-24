import { formatMoney } from '../lib/format'

interface CreditLimitBarProps {
  cardName: string
  cardLimit: number
  availableCredit: number
  madnessLimit: number
  madnessUsed: number
  compact?: boolean
}

export function CreditLimitBar({
  cardName,
  cardLimit,
  availableCredit,
  madnessLimit,
  madnessUsed,
  compact = false,
}: CreditLimitBarProps) {
  const safeMadnessLimit = Math.max(0, madnessLimit)
  const safeMadnessUsed = Math.min(safeMadnessLimit, Math.max(0, madnessUsed))
  const madnessAvailable = Math.max(0, safeMadnessLimit - safeMadnessUsed)
  const creditAvailable = Math.max(0, availableCredit)
  const total = Math.max(0, cardLimit) + safeMadnessLimit
  const used = Math.max(0, total - madnessAvailable - creditAvailable)

  const label = safeMadnessLimit > 0
    ? `${cardName} limits. Available madness ${formatMoney(madnessAvailable)} of ${formatMoney(safeMadnessLimit)}. Available credit ${formatMoney(creditAvailable)} of ${formatMoney(cardLimit)}.`
    : `${cardName} limits. Available credit ${formatMoney(creditAvailable)} of ${formatMoney(cardLimit)}.`

  return (
    <div className={`cc-limits ${compact ? 'compact' : ''}`}>
      {!compact && <h5 className="cc-limits-title">Credit card limits</h5>}
      <div className="cc-limits-track" role="img" aria-label={label}>
        {madnessAvailable > 0 && (
          <span className="cc-limits-seg madness" style={{ flexGrow: madnessAvailable }} />
        )}
        {creditAvailable > 0 && (
          <span className="cc-limits-seg credit" style={{ flexGrow: creditAvailable }} />
        )}
        {used > 0 && <span className="cc-limits-seg used" style={{ flexGrow: used }} />}
      </div>
      <ul className="cc-limits-legend">
        {safeMadnessLimit > 0 && (
          <li>
            <span className="cc-limits-dot madness" aria-hidden="true" />
            <span className="cc-limits-copy">
              <span>Available madness limit</span>
              <strong>
                {formatMoney(madnessAvailable)} of {formatMoney(safeMadnessLimit)}
              </strong>
            </span>
          </li>
        )}
        <li>
          <span className="cc-limits-dot credit" aria-hidden="true" />
          <span className="cc-limits-copy">
            <span>Available credit limit</span>
            <strong>
              {formatMoney(creditAvailable)} of {formatMoney(cardLimit)}
            </strong>
          </span>
        </li>
      </ul>
    </div>
  )
}
