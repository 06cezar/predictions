import { useEffect, useRef, useState } from 'react';
import { animate, stagger } from 'animejs';

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Plays the entrance of every `[data-reveal]` element as it appears: a quick
 * drop-in with a small tilt and overshoot, staggered when several arrive
 * together. Only the big moments are marked (the Hall of Fame cards and the
 * rankings after their drum roll), so motion means "something happened".
 */
export function startEntranceAnimations() {
  if (reducedMotion()) return;
  const seen = new WeakSet<Element>();
  let batch: HTMLElement[] = [];

  const play = () => {
    const targets = batch;
    batch = [];
    animate(targets, {
      opacity: [0, 1],
      translateY: [18, 0],
      scale: [0.96, 1],
      rotate: [(_el: unknown, i = 0) => (i % 2 === 0 ? -1.5 : 1.5), 0],
      // Short and snappy: long entrances get tiring by the third page
      delay: stagger(35, { start: 0 }),
      duration: 420,
      ease: 'outBack(1.6)',
    });
  };

  const collect = (node: Node) => {
    if (!(node instanceof HTMLElement)) return;
    const found = node.matches('[data-reveal]') ? [node] : [];
    found.push(...node.querySelectorAll<HTMLElement>('[data-reveal]'));
    for (const el of found) {
      if (seen.has(el)) continue;
      seen.add(el);
      el.style.opacity = '0'; // hidden until its turn, so nothing flashes before paint
      if (batch.length === 0) queueMicrotask(play);
      batch.push(el);
    }
  };

  collect(document.body);
  new MutationObserver(records => records.forEach(r => r.addedNodes.forEach(collect))).observe(document.body, {
    childList: true,
    subtree: true,
  });
}

/** A number that counts up to its value when it first appears or changes. */
export function useCountUp(value: number, decimals = 0) {
  const [shown, setShown] = useState(reducedMotion() ? value : 0);
  const from = useRef(0);

  useEffect(() => {
    if (reducedMotion()) return setShown(value);
    const counter = { n: from.current };
    const animation = animate(counter, {
      n: value,
      duration: 700,
      ease: 'outExpo',
      onUpdate: () => setShown(counter.n),
      onComplete: () => (from.current = value),
    });
    return () => {
      from.current = counter.n;
      animation.pause();
    };
  }, [value]);

  return shown.toFixed(decimals);
}

/** Wobbles an element for as long as `active` is true (the drum roll before a reveal). */
export function useWobble<T extends HTMLElement>(active: boolean) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!active || !ref.current || reducedMotion()) return;
    const animation = animate(ref.current, {
      rotate: [-2.5, 2.5],
      scale: [1, 1.03],
      duration: 110,
      loop: true,
      alternate: true,
      ease: 'inOutSine',
    });
    return () => {
      animation.revert();
    };
  }, [active]);
  return ref;
}
