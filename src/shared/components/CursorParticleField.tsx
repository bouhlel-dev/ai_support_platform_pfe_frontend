import { useEffect, useRef } from 'react';

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  baseX: number;
  baseY: number;
  size: number;
  alpha: number;
};

export function CursorParticleField() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let width = 0;
    let height = 0;
    let rafId = 0;
    let frame = 0;
    const particles: Particle[] = [];
    const pointer = {
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      lastX: 0,
      lastY: 0,
    };

    const createParticles = () => {
      particles.length = 0;
      const count = Math.max(52, Math.min(96, Math.round((width * height) / 18000)));

      for (let i = 0; i < count; i += 1) {
        const baseX = Math.random() * width;
        const baseY = Math.random() * height;
        particles.push({
          x: baseX,
          y: baseY,
          vx: (Math.random() - 0.5) * 0.35,
          vy: (Math.random() - 0.5) * 0.35,
          baseX,
          baseY,
          size: 0.8 + Math.random() * 2.2,
          alpha: 0.3 + Math.random() * 0.6,
        });
      }
    };

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      width = bounds.width;
      height = bounds.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      createParticles();
    };

    const onPointerMove = (event: PointerEvent) => {
      pointer.active = true;
      pointer.lastX = pointer.x;
      pointer.lastY = pointer.y;
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.vx = pointer.x - pointer.lastX;
      pointer.vy = pointer.y - pointer.lastY;
    };

    const onPointerLeave = () => {
      pointer.active = false;
    };

    const draw = () => {
      frame += 1;
      context.clearRect(0, 0, width, height);

      const cursorRadius = 180;

      if (pointer.active) {
        context.save();
        context.globalCompositeOperation = 'lighter';
        context.lineWidth = 1;

        for (const particle of particles) {
          const dx = particle.x - pointer.x;
          const dy = particle.y - pointer.y;
          const distance = Math.max(Math.hypot(dx, dy), 0.001);

          if (distance < cursorRadius) {
            const strength = (1 - distance / cursorRadius) * 0.45;
            const sway = (pointer.vx * -dy + pointer.vy * dx) * 0.00008;
            const alpha = Math.max(0.05, strength * 0.35);

            context.strokeStyle = `rgba(107, 114, 128, ${alpha})`;
            context.beginPath();
            context.moveTo(pointer.x, pointer.y);
            context.lineTo(particle.x, particle.y);
            context.stroke();

            particle.vx += (dx / distance) * strength * 0.25 + sway;
            particle.vy += (dy / distance) * strength * 0.25 - sway;
          }
        }

        context.restore();
      }

      for (const particle of particles) {
        const driftX = Math.sin((frame + particle.baseY) * 0.012) * 0.03;
        const driftY = Math.cos((frame + particle.baseX) * 0.011) * 0.03;
        particle.vx += (particle.baseX - particle.x) * 0.00035 + driftX;
        particle.vy += (particle.baseY - particle.y) * 0.00035 + driftY;

        if (pointer.active) {
          const dx = particle.x - pointer.x;
          const dy = particle.y - pointer.y;
          const distance = Math.max(Math.hypot(dx, dy), 0.001);
          const pull = Math.max(0, 1 - distance / cursorRadius);
          particle.vx += (dx / distance) * pull * 0.06;
          particle.vy += (dy / distance) * pull * 0.06;
        }

        particle.vx *= 0.94;
        particle.vy *= 0.94;
        particle.x += particle.vx;
        particle.y += particle.vy;

        if (particle.x < -20) particle.x = width + 20;
        if (particle.x > width + 20) particle.x = -20;
        if (particle.y < -20) particle.y = height + 20;
        if (particle.y > height + 20) particle.y = -20;

        const speed = Math.min(1, Math.hypot(particle.vx, particle.vy) / 4);
        context.beginPath();
        context.fillStyle = `rgba(107, 114, 128, ${particle.alpha + speed * 0.2})`;
        context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        context.fill();
      }

      rafId = window.requestAnimationFrame(draw);
    };

    resize();
    rafId = window.requestAnimationFrame(draw);

    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerleave', onPointerLeave);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerleave', onPointerLeave);
    };
  }, []);

  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true" />;
}
