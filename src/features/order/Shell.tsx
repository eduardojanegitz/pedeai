import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

/** Moldura das telas "de cartão" (identificação, estados). */
export function Shell({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-5 py-16">
      <motion.div
        aria-hidden
        className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-secondary"
        initial={reduce ? false : { scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 120, damping: 14 }}
      />
      <motion.div
        aria-hidden
        className="absolute -bottom-20 -left-16 h-56 w-56 rounded-[3rem] bg-accent"
        initial={reduce ? false : { scale: 0, rotate: -30 }}
        animate={{ scale: 1, rotate: 12 }}
        transition={{ type: "spring", stiffness: 100, damping: 12, delay: 0.1 }}
      />
      <motion.section
        className="pop-card relative z-10 w-full max-w-md p-7 text-center sm:p-8"
        initial={reduce ? false : { y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 140, damping: 16, delay: 0.1 }}
      >
        {children}
      </motion.section>
    </main>
  );
}
