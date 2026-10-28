// Confetti effects from the prototype. Both do nothing when the user prefers reduced motion.

function reducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function layer(): HTMLElement {
  let el = document.getElementById("fx");
  if (!el) {
    el = document.createElement("div");
    el.id = "fx";
    el.className = "fx";
    el.setAttribute("aria-hidden", "true");
    document.body.appendChild(el);
  }
  return el;
}

/** Small burst from a point, used when a habit is checked off. */
export function burst(x: number, y: number, color: string): void {
  if (reducedMotion()) return;
  const fx = layer();
  const colors = [color, "#FFB23E", "#FFFFFF", "#6FE3B8"];
  for (let i = 0; i < 18; i++) {
    const p = document.createElement("i");
    p.style.left = `${x}px`;
    p.style.top = `${y}px`;
    p.style.background = colors[i % colors.length]!;
    fx.appendChild(p);
    const angle = Math.random() * Math.PI * 2;
    const r = 50 + Math.random() * 80;
    p.animate(
      [
        { transform: "translate(0,0) rotate(0)", opacity: 1 },
        {
          transform: `translate(${Math.cos(angle) * r}px,${Math.sin(angle) * r - 30}px) rotate(${Math.random() * 540}deg)`,
          opacity: 0,
        },
      ],
      { duration: 650 + Math.random() * 350, easing: "cubic-bezier(.2,.8,.3,1)" },
    ).onfinish = () => p.remove();
  }
}

/** Full-screen confetti fall, used when every habit is done for the day. */
export function rain(): void {
  if (reducedMotion()) return;
  const fx = layer();
  const colors = ["#FFB23E", "#6FE3B8", "#3B6FD8", "#C2569A", "#FFFFFF", "#F2780C"];
  const w = window.innerWidth;
  const h = window.innerHeight;
  for (let i = 0; i < 80; i++) {
    const p = document.createElement("i");
    const size = 6 + Math.random() * 7;
    p.style.left = `${Math.random() * w}px`;
    p.style.top = "-16px";
    p.style.width = `${size}px`;
    p.style.height = `${size * 1.4}px`;
    p.style.background = colors[i % colors.length]!;
    fx.appendChild(p);
    const dx = (Math.random() - 0.5) * 160;
    p.animate(
      [
        { transform: "translate(0,0) rotate(0)", opacity: 1 },
        { transform: `translate(${dx}px,${h + 40}px) rotate(${Math.random() * 900 - 450}deg)`, opacity: 1 },
      ],
      {
        duration: 1900 + Math.random() * 1500,
        delay: Math.random() * 700,
        easing: "cubic-bezier(.3,.1,.6,1)",
        fill: "backwards",
      },
    ).onfinish = () => p.remove();
  }
}
