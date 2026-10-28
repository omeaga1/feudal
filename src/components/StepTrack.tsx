import { motion } from "motion/react";
import { pathSteps, type GamePlan, type SelectedPath } from "../lib/gamePlans";
import { SplitChips, UnitIcons } from "./PlanTree";

const AGE_NAMES = { 1: "Dark", 2: "Feudal", 3: "Castle" } as const;

/** The chosen path as a timed checklist: clock, villager split, one short action. */
export function StepTrack({ plan, path }: { plan: GamePlan; path: SelectedPath }) {
  const steps = pathSteps(plan, path);
  return (
    <div className="step-track">
      {steps.map(({ age, step }, i) => {
        const newAge = i === 0 || steps[i - 1].age !== age;
        return (
          <motion.div
            key={`${path.feudal.id}-${path.castle.id}-${i}`}
            className={`step age-${age}${newAge ? " new-age" : ""}`}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.025 }}
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
      {path.castle.goal && (
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
