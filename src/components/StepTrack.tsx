import { motion } from "motion/react";
import { clock, pathSteps, type GamePlan, type SelectedPath } from "../lib/gamePlans";
import { SplitChips, UnitIcons } from "./PlanTree";

const AGE_NAMES = { 1: "Dark", 2: "Feudal", 3: "Castle" } as const;

/**
 * The chosen path as a timed checklist: clock, villager split, one short
 * action. With `now` (seconds into a live game) the current step lights up
 * and earlier ones fade; with `limit` only that many steps show, starting one
 * before the current step.
 */
export function StepTrack({ plan, path, now, limit }: { plan: GamePlan; path: SelectedPath; now?: number | null; limit?: number }) {
  const all = pathSteps(plan, path);
  let current = -1;
  if (now != null) all.forEach(({ step }, i) => clock(step.t) <= now && (current = i));
  const from = limit ? Math.max(0, Math.min(current - 1, all.length - limit)) : 0;
  const steps = limit ? all.slice(from, from + limit) : all;
  const showGoal = !limit || from + limit >= all.length;
  return (
    <div className="step-track">
      {steps.map(({ age, step }, k) => {
        const i = from + k;
        const newAge = i === 0 || all[i - 1].age !== age;
        const state = now == null ? "" : i === current ? " now" : i < current ? " done" : "";
        return (
          <motion.div
            key={`${path.feudal.id}-${path.castle.id}-${i}`}
            className={`step age-${age}${newAge ? " new-age" : ""}${state}`}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: k * 0.025 }}
          >
            <span className="step-age">{newAge ? AGE_NAMES[age] : ""}</span>
            <span className="step-time">{step.t}</span>
            <span className="step-body">
              <SplitChips split={step.v} builders={step.b} />
              <span className="step-do">{step.do}</span>
            </span>
          </motion.div>
        );
      })}
      {showGoal && path.castle.goal && (
        <div className="step goal">
          <span className="step-age">Goal</span>
          <span className="step-time" />
          <span className="step-body">
            <UnitIcons names={path.castle.army} civ={plan.civ} size="md" />
            <span className="step-do">{path.castle.goal}</span>
          </span>
        </div>
      )}
    </div>
  );
}
