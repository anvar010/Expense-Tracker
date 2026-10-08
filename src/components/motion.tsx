"use client";

import { animate, MotionConfig, motion, useMotionValue, useReducedMotion, useTransform, type HTMLMotionProps } from "motion/react";
import { useEffect, type ReactNode } from "react";

/** One place to honour the OS "reduce motion" setting for every animation below. */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

const SPRING = { type: "spring", stiffness: 260, damping: 28 } as const;

/** Parent that reveals its <Item> children one after another. Order of arrival tells the eye where to read first. */
export function Stagger({ children, className, delay = 0, ...rest }: HTMLMotionProps<"div"> & { delay?: number }) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: delay } } }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

export function Item({ children, className, ...rest }: HTMLMotionProps<"div">) {
  return (
    <motion.div className={className} variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: SPRING } }} {...rest}>
      {children}
    </motion.div>
  );
}

/** Counts from the previous value to the new one, so a change in money is something you see happen. */
export function AnimatedNumber({ value, format, className }: { value: number; format: (n: number) => string; className?: string }) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(reduce ? value : 0);
  const text = useTransform(mv, (n) => format(n));
  useEffect(() => {
    if (reduce) return void mv.set(value);
    const c = animate(mv, value, { duration: 0.9, ease: [0.16, 1, 0.3, 1] });
    return () => c.stop();
  }, [value, reduce, mv]);
  return <motion.span className={className}>{text}</motion.span>;
}

/** Progress bar that grows into place. Width is the only thing that moves. */
export function Bar({ pct, className, trackClassName }: { pct: number; className?: string; trackClassName?: string }) {
  return (
    <div className={trackClassName ?? "h-2 rounded-full bg-surface-2"} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <motion.div
        className={className ?? "h-full rounded-full bg-accent"}
        initial={{ width: 0 }}
        animate={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      />
    </div>
  );
}

/** Circular gauge (used for the savings rate). */
export function Ring({ pct, size = 112, stroke = 10, children }: { pct: number; size?: number; stroke?: number; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(255 255 255 / 0.14)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#34d399" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - clamped / 100) }}
          transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

/** Same stagger, but as a real <ul>/<li> pair so lists keep their semantics. */
export function StaggerList({ children, className, ...rest }: HTMLMotionProps<"ul">) {
  return (
    <motion.ul className={className} initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }} {...rest}>
      {children}
    </motion.ul>
  );
}

export function ItemLi({ children, className, ...rest }: HTMLMotionProps<"li">) {
  return (
    <motion.li className={className} variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: SPRING } }} {...rest}>
      {children}
    </motion.li>
  );
}
