import { ChevronRight } from "lucide-react";
import { motion } from "motion/react";
import { Collapsible } from "radix-ui";
import type { IconType } from "react-icons";
import { GiCamel, GiCastle, GiChurch, GiCrossedSwords, GiGreekTemple, GiHolySymbol, GiWheat } from "react-icons/gi";
import { useEffect, useMemo, useState } from "react";
import type { CivStat } from "../lib/aoe4world";
import { civs, getCiv, rosterAt, type Age } from "../lib/gameData";
import { findUnit } from "../lib/gamePlans";
import { usePersisted } from "../lib/persisted";
import { getPlaybook, type WinConditionKind } from "../lib/playbooks";
import { civTempo, TEMPO_LABELS } from "../lib/tempo";
import { loadCivStats, WinRing } from "./BriefView";
import { CivSearch } from "./CivPicker";
import { Flag } from "./Flag";
import { Tip, UnitHover } from "./ui";
import { YourPlan } from "./YourPlan";

const sortedCivs = [...civs].sort((a, b) => a.name.localeCompare(b.name));

const WIN_ICONS: Record<WinConditionKind, IconType> = {
  army: GiCrossedSwords,
  relics: GiHolySymbol,
  sacred_sites: GiChurch,
  wonder: GiGreekTemple,
  trade: GiCamel,
  economy: GiWheat,
  defense: GiCastle,
};

/** "Knights + Archers" -> unit icons; words that aren't units stay as text. */
function PairingIcons({ units, civAbbr }: { units: string; civAbbr: string }) {
  const parts = units.split("+").map((p) => p.trim());
  return (
    <span className="pairing-icons">
      {parts.map((p, i) => {
        const singular = p.replace(/men$/, "man").replace(/s$/, "");
        const unit = findUnit(p, civAbbr) ?? findUnit(singular, civAbbr) ?? findUnit(`${singular}man`, civAbbr);
        return (
          <span key={p} className="pairing-part">
            {i > 0 && <span className="plus">+</span>}
            {unit ? (
              <UnitHover unit={unit}>
                <img src={unit.icon} alt={p} loading="lazy" />
              </UnitHover>
            ) : (
              <span className="unit-chip">{p}</span>
            )}
          </span>
        );
      })}
    </span>
  );
}

/** Everything about one civ: stats, the full branching plan, signature armies, win conditions and roster. */
export function CivAnalysis({ defaultCiv }: { defaultCiv?: string }) {
  const [civId, setCivId] = usePersisted("feudal.analysis.civ", defaultCiv ?? "english");
  const civ = getCiv(civId) ?? civs[0];
  const playbook = getPlaybook(civ.id);
  const [stats, setStats] = useState<CivStat[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadCivStats()
      .then((s) => !cancelled && setStats(s))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const stat = stats?.find((s) => s.civilization === civ.id);
  const tempo = stats ? civTempo(civ.id, stats) : null;
  const roster = useMemo(
    () =>
      ([2, 3, 4] as Age[]).map((age) => {
        const earlier = new Set(rosterAt(civ, (age - 1) as Age).map((u) => u.baseId));
        return { age, units: rosterAt(civ, age).filter((u) => !earlier.has(u.baseId) && u.baseId !== "scout") };
      }),
    [civ],
  );

  return (
    <div className="stack">
      <div className="civ-toolbar">
        <CivSearch onPick={setCivId} />
        <div className="flag-strip" role="listbox" aria-label="Civilization">
          {sortedCivs.map((c) => (
            <Tip key={c.id} label={c.name} side="bottom">
              <button
                type="button"
                role="option"
                aria-selected={c.id === civ.id}
                className={c.id === civ.id ? "strip-flag active" : "strip-flag"}
                onClick={() => setCivId(c.id)}
              >
                <Flag civ={c.id} size="sm" />
              </button>
            </Tip>
          ))}
        </div>
      </div>

      <motion.section key={civ.id} className="panel civ-hero" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <Flag civ={civ.id} size="xl" />
        <div className="civ-hero-text">
          <h2>{civ.name}</h2>
          <div className="chips">
            {civ.classes.split(",").map((c) => (
              <span key={c} className="chip">
                {c.trim()}
              </span>
            ))}
          </div>
          <p className="muted">{playbook?.summary ?? civ.description}</p>
        </div>
        <div className="civ-hero-stats">
          <WinRing value={stat?.win_rate ?? null} label="Ranked win rate" loading={stats === null} />
          <div className="stats">
            {stat && <div className="stat"><span className="stat-value">{stat.pick_rate.toFixed(1)}%</span><span className="stat-label">Pick rate</span></div>}
            {tempo && <div className={`stat ${tempo.tempo}`}><span className="stat-value">{TEMPO_LABELS[tempo.tempo]}</span><span className="stat-label">Tempo</span></div>}
          </div>
        </div>
      </motion.section>

      <YourPlan civ={civ.id} full title="Game plan" />

      <div className="brief-split">
        {playbook?.pairings && playbook.pairings.length > 0 && (
          <section className="panel">
            <div className="panel-head">
              <h3>Signature armies</h3>
            </div>
            <div className="pairings">
              {playbook.pairings.map((p) => (
                <div key={p.units} className="pairing">
                  <PairingIcons units={p.units} civAbbr={civ.abbr} />
                  <span className="pairing-name">{p.units}</span>
                  <span className="muted small">{p.why}</span>
                </div>
              ))}
            </div>
          </section>
        )}
        {playbook?.winConditions && playbook.winConditions.length > 0 && (
          <section className="panel">
            <div className="panel-head">
              <h3>How {civ.name} wins</h3>
            </div>
            <div className="win-conditions">
              {playbook.winConditions.map((w) => (
                <div key={w.detail} className="win-condition">
                  <span className={`win-icon win-${w.kind}`} aria-hidden="true">
                    {(() => {
                      const Icon = WIN_ICONS[w.kind];
                      return <Icon />;
                    })()}
                  </span>
                  <span>{w.detail}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      <section className="panel">
        <div className="panel-head">
          <h3>New units each age</h3>
          <span className="muted small">Gold border: unique to {civ.name}</span>
        </div>
        <div className="roster">
          {roster.map(({ age, units }) => (
            <div key={age} className="roster-age">
              <span className="roster-age-name">{["", "Dark", "Feudal", "Castle", "Imperial"][age]}</span>
              <div className="roster-units">
                {units.map((u) => (
                  <UnitHover key={u.id} unit={u}>
                    <img src={u.icon} alt={u.name} className={u.unique ? "unique" : undefined} loading="lazy" />
                  </UnitHover>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <Collapsible.Root className="panel bonuses">
        <Collapsible.Trigger className="bonuses-trigger">
          <ChevronRight className="bonuses-chevron" size={16} aria-hidden="true" />
          Civ bonuses
          <span className="muted small">{civ.bonuses.length}</span>
        </Collapsible.Trigger>
        <Collapsible.Content className="bonuses-content">
          <ul className="tight">
            {civ.bonuses.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </Collapsible.Content>
      </Collapsible.Root>
    </div>
  );
}
