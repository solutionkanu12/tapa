"use client";

import { useEffect } from "react";

/**
 * Adds the `in` class to `.io` and `.scatter-card` elements as they enter the
 * viewport, driving the CSS reveal transitions. Renders nothing itself, so it
 * can sit alongside the server-rendered sections without making them client
 * components.
 */
export function ScrollReveal() {
  useEffect(() => {
    const targets =
      document.querySelectorAll<HTMLElement>(".io, .scatter-card");

    // Reveal everything immediately when the platform lacks IntersectionObserver,
    // so content is never stranded invisible.
    if (typeof IntersectionObserver === "undefined") {
      targets.forEach((el) => el.classList.add("in"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.2 }
    );

    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return null;
}
