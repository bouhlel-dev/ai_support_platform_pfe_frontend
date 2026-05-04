import { Link } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useTranslation } from 'react-i18next';
import { Languages } from 'lucide-react';
import { supportedLanguages, type SupportedLanguage } from '@/shared/i18n/resources';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Brain,
  ShieldCheck,
  Eye,
  MessagesSquare,
  Workflow,
  Gauge,
  ArrowRight,
  CheckCircle2,
  LineChart,
  Lock,
  Zap,
  Sparkles,
  FileSearch,
  Mic,
} from 'lucide-react';

const features = [
  { icon: Brain, title: 'Decision Engine', desc: 'Deterministic decision rules with risk scoring — LLMs are used only for phrasing.' },
  { icon: Eye, title: 'Visual AI', desc: 'Screenshot and screenshare analysis to detect UI gaps and provide guided fixes.' },
  { icon: MessagesSquare, title: 'Omnichannel Inbox', desc: 'Unified conversations across Email, WhatsApp and Chat with audit trails.' },
  { icon: Workflow, title: 'RAG Knowledge', desc: 'Retrieve and cite relevant documents, PDFs and ticket history for grounded replies.' },
  { icon: Gauge, title: 'Live Voice Agents', desc: 'Deploy voice agents via LiveKit for IVR, guided flows and post-call summaries.' },
  { icon: ShieldCheck, title: 'Traceability & Safety', desc: 'Full audit logs, human-in-the-loop escalation and guardrails for safe replies.' },
];

const DEMO_TABS = [
  { id: 'decision', label: 'Decision Engine', icon: Brain },
  { id: 'reply', label: 'Auto-Reply', icon: MessagesSquare },
  { id: 'rag', label: 'RAG Lookup', icon: FileSearch },
  { id: 'visual', label: 'Visual AI', icon: Eye },
  { id: 'voice', label: 'Voice', icon: Mic },
] as const;

type DemoTab = typeof DEMO_TABS[number]['id'];

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  baseX: number;
  baseY: number;
  size: number;
  alpha: number;
  hue: number;
};

const HOW_STEPS = [
  {
    icon: Zap,
    step: '01',
    title: 'Capture',
    desc: 'Messages arrive from email, WhatsApp, live chat, or screen share — unified in one place, nothing slips through.',
    tags: 'Email · WhatsApp · Chat · Screen share',
  },
  {
    icon: LineChart,
    step: '02',
    title: 'Reason',
    desc: 'The decision engine parses intent, weighs risk, and matches against your policy — in milliseconds, every time.',
    tags: 'Intent · Risk · Policy match',
  },
  {
    icon: Lock,
    step: '03',
    title: 'Resolve',
    desc: 'Confident? Auto-respond instantly. Uncertain? Route to the right human — with full context already attached.',
    tags: 'Auto-reply · Smart escalation',
  },
];

function CursorParticleField() {
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
    const pointer = { active: false, x: 0, y: 0, vx: 0, vy: 0, lastX: 0, lastY: 0 };
    const cursorRadius = 180;

    const createParticles = () => {
      particles.length = 0;
      const count = Math.max(52, Math.min(96, Math.round((width * height) / 18000)));
      for (let i = 0; i < count; i++) {
        const baseX = Math.random() * width;
        const baseY = Math.random() * height;
        particles.push({
          x: baseX, y: baseY,
          vx: (Math.random() - 0.5) * 0.35,
          vy: (Math.random() - 0.5) * 0.35,
          baseX, baseY,
          size: 0.8 + Math.random() * 2.2,
          alpha: 0.3 + Math.random() * 0.6,
          hue: 200 + Math.random() * 35,
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

    const onPointerMove = (e: PointerEvent) => {
      pointer.active = true;
      pointer.lastX = pointer.x;
      pointer.lastY = pointer.y;
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.vx = pointer.x - pointer.lastX;
      pointer.vy = pointer.y - pointer.lastY;
    };

    const onPointerLeave = () => { pointer.active = false; };

    const draw = () => {
      frame++;
      context.clearRect(0, 0, width, height);

      if (pointer.active) {
        context.save();
        context.globalCompositeOperation = 'lighter';
        context.lineWidth = 1;
        for (const p of particles) {
          const dx = p.x - pointer.x;
          const dy = p.y - pointer.y;
          const dist = Math.max(Math.hypot(dx, dy), 0.001);
          if (dist < cursorRadius) {
            const strength = (1 - dist / cursorRadius) * 0.45;
            const sway = (pointer.vx * -dy + pointer.vy * dx) * 0.00008;
            context.strokeStyle = `rgba(107,114,128,${Math.max(0.05, strength * 0.35)})`;
            context.beginPath();
            context.moveTo(pointer.x, pointer.y);
            context.lineTo(p.x, p.y);
            context.stroke();
            p.vx += (dx / dist) * strength * 0.25 + sway;
            p.vy += (dy / dist) * strength * 0.25 - sway;
          }
        }
        context.restore();
      }

      for (const p of particles) {
        p.vx += (p.baseX - p.x) * 0.00035 + Math.sin((frame + p.baseY) * 0.012) * 0.03;
        p.vy += (p.baseY - p.y) * 0.00035 + Math.cos((frame + p.baseX) * 0.011) * 0.03;
        if (pointer.active) {
          const dx = p.x - pointer.x;
          const dy = p.y - pointer.y;
          const dist = Math.max(Math.hypot(dx, dy), 0.001);
          const pull = Math.max(0, 1 - dist / cursorRadius);
          p.vx += (dx / dist) * pull * 0.06;
          p.vy += (dy / dist) * pull * 0.06;
        }
        p.vx *= 0.94; p.vy *= 0.94;
        p.x += p.vx; p.y += p.vy;
        if (p.x < -20) p.x = width + 20;
        if (p.x > width + 20) p.x = -20;
        if (p.y < -20) p.y = height + 20;
        if (p.y > height + 20) p.y = -20;
        const speed = Math.min(1, Math.hypot(p.vx, p.vy) / 4);
        context.beginPath();
        context.fillStyle = `rgba(107,114,128,${p.alpha + speed * 0.2})`;
        context.arc(p.x, p.y, p.size, 0, Math.PI * 2);
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

// ─── Scroll-Zoom Video Player ──────────────────────────────────────────────────

const YOUTUBE_VIDEO_ID = 'hnmJoNuZPvs';

function ScrollZoomVideo() {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(0.88);
  const [playing, setPlaying] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [cursor, setCursor] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const onScroll = () => {
      const el = wrapperRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const elementCenter = rect.top + rect.height / 2;
      const viewportCenter = window.innerHeight / 2;
      const distanceFromCenter = Math.abs(elementCenter - viewportCenter);
      const maxDistance = window.innerHeight / 2 + rect.height / 2;
      const t = Math.min(distanceFromCenter / maxDistance, 1);
      setScale(0.88 + (1 - t) * 0.12);
    };

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    setCursor({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  }

  return (
    <div ref={wrapperRef} className="mx-auto mt-20 max-w-5xl">
      <div
        style={{
          transform: `scale(${scale})`,
          transition: 'transform 0.15s ease-out',
          transformOrigin: 'center top',
        }}
      >
        <div className="relative overflow-hidden rounded-2xl shadow-2xl shadow-primary/10 border border-border/40">
          {!playing ? (
            <div
              className="relative w-full"
              style={{ paddingBottom: '56.25%', cursor: 'default' }}
              onMouseEnter={() => setHovered(true)}
              onMouseLeave={() => setHovered(false)}
              onMouseMove={handleMouseMove}
              onClick={() => setPlaying(true)}
            >
              <img
                src={`https://img.youtube.com/vi/${YOUTUBE_VIDEO_ID}/maxresdefault.jpg`}
                alt="Video preview"
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div
                className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent transition-opacity duration-300"
                style={{ opacity: hovered ? 1 : 0.4 }}
              />
              <div
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  left: cursor.x,
                  top: cursor.y - 12,
                  transform: `translateX(-50%) translateY(-50%) scale(${hovered ? 1 : 0.82})`,
                  transformOrigin: 'bottom center',
                  pointerEvents: 'none',
                  opacity: hovered ? 1 : 0,
                  transition: 'opacity 0.15s ease, transform 0.15s ease',
                  willChange: 'transform, opacity',
                  zIndex: 20,
                }}
              >
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    paddingTop: '9px',
                    paddingBottom: '9px',
                    paddingLeft: '16px',
                    paddingRight: '20px',
                    borderRadius: '9999px',
                    background: 'rgba(255,255,255,0.96)',
                    boxShadow: '0 2px 16px rgba(0,0,0,0.22), 0 1px 3px rgba(0,0,0,0.10)',
                    color: '#0f0f0f',
                    fontSize: '14px',
                    fontWeight: 600,
                    letterSpacing: '-0.01em',
                    whiteSpace: 'nowrap',
                    userSelect: 'none',
                    fontFamily: 'inherit',
                  }}
                >
                  <svg
                    width="10"
                    height="12"
                    viewBox="0 0 10 12"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    style={{ flexShrink: 0 }}
                  >
                    <path
                      d="M0.5 1.00673C0.5 0.36885 1.20447 -0.0176319 1.74329 0.329459L9.24329 5.32273C9.74207 5.64569 9.74207 6.35431 9.24329 6.67727L1.74329 11.6705C1.20447 12.0176 0.5 11.6312 0.5 10.9933V1.00673Z"
                      fill="#0f0f0f"
                    />
                  </svg>
                  Play intro
                </div>
              </div>
              <button
                type="button"
                aria-label="Play video"
                className="absolute inset-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/70 focus-visible:outline-offset-2"
                style={{ background: 'none', border: 'none', cursor: 'default' }}
              />
            </div>
          ) : (
            <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
              <iframe
                className="absolute inset-0 h-full w-full"
                src={`https://www.youtube.com/embed/${YOUTUBE_VIDEO_ID}?autoplay=1&rel=0&modestbranding=1&color=white&iv_load_policy=3&disablekb=0`}
                title="L2T product demo"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── How It Works Timeline ────────────────────────────────────────────────────

function HowItWorksSection() {
  const { t } = useTranslation();
  const stepRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const observers: IntersectionObserver[] = [];

    stepRefs.current.forEach((el, i) => {
      if (!el) return;
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              setTimeout(() => {
                el.classList.add('opacity-100', 'translate-y-0');
                el.classList.remove('opacity-0', 'translate-y-6');
              }, i * 120);
              observer.unobserve(el);
            }
          });
        },
        { threshold: 0.25 }
      );
      observer.observe(el);
      observers.push(observer);
    });

    return () => observers.forEach((o) => o.disconnect());
  }, []);

  return (
    <section id="how" className="border-t border-border bg-secondary/30">
      <div className="container mx-auto px-6 py-24">
        {/* Header */}
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-4xl font-semibold tracking-tight md:text-5xl">{t('landing.howTitle')}</h2>
          <p className="mt-4 text-lg text-muted-foreground">{t('landing.howSubtitle')}</p>
        </div>

        {/* Timeline */}
        <div className="relative mx-auto mt-16 max-w-xl px-4">
          {/* Vertical track line — left-[47px] centers on the 48px (w-12) node */}
          <div className="absolute bottom-0 left-[47px] top-0 w-px bg-border" />

          <div className="flex flex-col gap-10">
            {HOW_STEPS.map((s, i) => (
              <div
                key={s.step}
                ref={(el) => (stepRefs.current[i] = el)}
                className="flex items-start gap-6 opacity-0 translate-y-6 transition-all duration-500 ease-out"
              >
                {/* Node */}
                <div className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border bg-background transition-colors duration-300">
                  <s.icon className="h-5 w-5 text-muted-foreground" />
                </div>

                {/* Content */}
                <div className="pt-2">
                  <p className="mb-1 text-[11px] font-medium uppercase tracking-widest text-muted-foreground/60">
                    Step {s.step}
                  </p>
                  <h3 className="text-lg font-semibold text-foreground">{s.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{s.desc}</p>
                  <span className="mt-3 inline-block rounded-full border border-border px-3 py-1 text-xs text-muted-foreground/70">
                    {s.tags}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Landing Page ─────────────────────────────────────────────────────────────

export function LandingPage() {
  const { t, i18n } = useTranslation();
  const currentLanguage = (i18n.resolvedLanguage || i18n.language || 'en')
    .toLowerCase()
    .split('-')[0] as SupportedLanguage;

  return (
    <div className="min-h-screen bg-white text-foreground dark:bg-background">
      {/* Nav */}
      <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-white/90 backdrop-blur dark:bg-background/80">
        <div className="container mx-auto flex h-16 items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-2">
            <img src="/logo-l2t.png" alt="L2T" className="h-8 w-auto" />
          </Link>
          <nav className="hidden items-center gap-8 md:flex">
            <a href="#features" className="text-sm text-muted-foreground transition-colors hover:text-foreground">{t('common.features')}</a>
            <a href="#how" className="text-sm text-muted-foreground transition-colors hover:text-foreground">{t('common.howItWorks')}</a>
            <a href="#demo" className="text-sm text-muted-foreground transition-colors hover:text-foreground">{t('common.demo')}</a>
            <a href="#about" className="text-sm text-muted-foreground transition-colors hover:text-foreground">{t('common.about')}</a>
          </nav>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/login">{t('common.signIn')}</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/register">{t('common.getStarted')}</Link>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t('common.language')}
                  className="h-9 w-9 shrink-0 border border-border/70 bg-background/80 text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                >
                  <Languages className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuLabel>{t('common.language')}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {supportedLanguages.map((language) => (
                  <DropdownMenuItem
                    key={language}
                    onSelect={() => void i18n.changeLanguage(language)}
                    className={language === currentLanguage ? 'bg-accent text-accent-foreground' : ''}
                  >
                    {t(`common.${language === 'en' ? 'english' : language === 'fr' ? 'french' : 'arabic'}`)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative isolate overflow-hidden bg-white dark:bg-background">
        <CursorParticleField />
        <div className="relative z-10 container mx-auto px-6 py-24 md:py-32">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-xs font-medium text-muted-foreground">
              <span className="flex h-2 w-2 rounded-full bg-[hsl(var(--success))]" />
              {t('landing.badge')}
            </div>
            <h1 className="text-balance text-4xl font-semibold tracking-tight md:text-5xl">
              {t('landing.headline')}
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-balance text-lg text-muted-foreground">
              {t('landing.subheadline')}
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button
                size="lg"
                className="group"
                onClick={() => document.getElementById('demo')?.scrollIntoView({ behavior: 'smooth' })}
              >
                <span className="inline-flex items-center">
                  {t('landing.tryDemo')}
                  <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </span>
              </Button>
            </div>
            <p className="mt-6 text-xs text-muted-foreground">
              {t('landing.demoPrompt')}{' '}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono">admin@example.com</code> /{' '}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono">Admin123.</code>
            </p>
          </div>

          <ScrollZoomVideo />
        </div>
      </section>

      {/* How it works */}
      <HowItWorksSection />

      {/* Features */}
      <section id="features" className="container mx-auto px-6 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-4xl font-semibold tracking-tight md:text-5xl">{t('landing.featuresTitle')}</h2>
          <p className="mt-4 text-lg text-muted-foreground">{t('landing.featuresSubtitle')}</p>
        </div>
        <div className="mt-16 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <Card key={f.title} className="group border-border/60 transition-all hover:border-primary/40 hover:shadow-lg">
              <CardContent className="p-6">
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-md bg-accent text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Demo Section */}
      <section id="demo" className="border-y border-border bg-secondary/40">
        <div className="container mx-auto px-6 py-20">
          <div className="mx-auto max-w-2xl text-center mb-12">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-xs font-medium text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5" />
              {t('landing.interactiveDemos')}
            </div>
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
              {t('landing.interactiveDemos')}
            </h2>
            <p className="mt-3 text-muted-foreground">{t('landing.livePreview')}</p>
          </div>
          <InteractiveDemoShell />
        </div>
      </section>

      {/* About */}
      <section id="about" className="container mx-auto px-6 py-16">
        <div className="grid gap-6 items-center md:grid-cols-2">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">{t('landing.aboutTitle')}</h2>
            <p className="mt-4 text-lg text-muted-foreground leading-relaxed">
              {t('landing.aboutDescription')}
            </p>
          </div>
          <div className="flex items-center justify-center md:justify-end">
            <img src="/l2t.png" alt="L2T" className="h-64 w-auto drop-shadow-lg" />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="container mx-auto px-6 py-24">
        <div className="relative overflow-hidden rounded-2xl bg-primary px-8 py-16 text-center text-primary-foreground md:px-16 md:py-24">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,hsl(0_0%_100%/0.15),transparent_60%)]" />
          <div className="relative">
            <h2 className="text-balance text-4xl font-semibold tracking-tight md:text-5xl">
              {t('landing.ctaTitle')}
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-primary-foreground/80">
              {t('landing.ctaSubtitle')}
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" variant="secondary">
                <Link to="/login">{t('common.openDashboard')}</Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
              >
                <Link to="/register">{t('common.createAccount')}</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="container mx-auto flex flex-col items-center justify-between gap-4 px-6 py-8 md:flex-row">
          <div className="flex items-center gap-2">
            <img src="/logo-l2t.png" alt="L2T" className="h-6 w-auto" />
          </div>
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} L2T AI · Decision-support for support teams.
          </p>
        </div>
      </footer>
    </div>
  );
}

export default LandingPage;

// ─── Interactive Demo Shell ───────────────────────────────────────────────────

function InteractiveDemoShell() {
  const [activeTab, setActiveTab] = useState<DemoTab>('decision');

  return (
    <div className="mx-auto max-w-5xl overflow-hidden rounded-2xl border border-border bg-card shadow-xl shadow-primary/5">
      <div className="flex items-center gap-1 overflow-x-auto border-b border-border bg-muted/30 px-3 py-2">
        {DEMO_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-background text-foreground shadow-sm border border-border'
                  : 'text-muted-foreground hover:text-foreground hover:bg-background/60'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>
      <div className="p-6 md:p-8">
        {activeTab === 'decision' && <DecisionDemo />}
        {activeTab === 'reply' && <ReplyEditorDemo />}
        {activeTab === 'rag' && <RagDemo />}
        {activeTab === 'visual' && <VisualSnapshotDemo />}
        {activeTab === 'voice' && <VoiceSnippetDemo />}
      </div>
    </div>
  );
}

// ─── Risk Slider ──────────────────────────────────────────────────────────────

function RiskSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const pct = Math.round(value * 100);
  const color =
    value < 0.3
      ? { track: 'bg-emerald-500', label: 'text-emerald-600 dark:text-emerald-400', zone: 'Low', pill: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800' }
      : value < 0.7
      ? { track: 'bg-amber-500', label: 'text-amber-600 dark:text-amber-400', zone: 'Medium', pill: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800' }
      : { track: 'bg-red-500', label: 'text-red-600 dark:text-red-400', zone: 'High', pill: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800' };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Risk score</span>
        <div className="flex items-center gap-2">
          <span className={`text-sm font-semibold tabular-nums ${color.label}`}>{value.toFixed(2)}</span>
          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${color.pill}`}>
            {color.zone}
          </span>
        </div>
      </div>
      <div className="relative flex items-center">
        <div className="absolute inset-0 h-2 rounded-full bg-gradient-to-r from-emerald-400 via-amber-400 to-red-500 opacity-25 top-1/2 -translate-y-1/2" />
        <div
          className={`absolute left-0 h-2 rounded-full top-1/2 -translate-y-1/2 transition-all duration-150 ${color.track}`}
          style={{ width: `${pct}%` }}
        />
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="relative w-full cursor-pointer appearance-none bg-transparent [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-background [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:ring-1 [&::-webkit-slider-thumb]:ring-border [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-110 [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-background [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:shadow-md [&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-transparent [&::-moz-range-track]:h-2 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-transparent"
        />
      </div>
      <div className="grid grid-cols-3 text-[10px] font-medium">
        <span className="text-emerald-600 dark:text-emerald-400">Low · 0–0.29</span>
        <span className="text-center text-amber-600 dark:text-amber-400">Medium · 0.30–0.69</span>
        <span className="text-right text-red-600 dark:text-red-400">High · 0.70–1.0</span>
      </div>
      <div className="flex h-1 gap-0.5 rounded-full overflow-hidden">
        <div className="flex-[30] rounded-l-full bg-emerald-400/40" />
        <div className="flex-[40] bg-amber-400/40" />
        <div className="flex-[30] rounded-r-full bg-red-400/40" />
      </div>
    </div>
  );
}

// ─── Decision Engine ──────────────────────────────────────────────────────────

function DecisionDemo() {
  const [issue, setIssue] = useState('Refund request');
  const [orderId, setOrderId] = useState('4821');
  const [policyMatch, setPolicyMatch] = useState(true);
  const [customerGood, setCustomerGood] = useState(true);
  const [risk, setRisk] = useState(0.12);
  const [result, setResult] = useState<null | { action: string; confidence: string; color: string; reasons: string[] }>(null);

  function runDecision() {
    const reasons: string[] = [];
    if (policyMatch) reasons.push('Policy match found');
    if (customerGood) reasons.push('Customer in good standing');
    reasons.push(`Risk score: ${risk.toFixed(2)}`);
    if (!policyMatch) reasons.push('No matching policy rule');

    let action = 'Suggest reply — human review required';
    let color = 'warning';
    if (policyMatch && risk < 0.3) { action = `Auto-approve: ${issue}`; color = 'success'; }
    if (risk >= 0.7) { action = 'Escalate to Ops'; color = 'destructive'; }

    const base = policyMatch ? 0.92 : 0.72;
    const conf = Math.max(0, Math.min(1, base * (1 - risk * 0.6) + (customerGood ? 0.05 : -0.05)));
    setResult({ action, confidence: `${Math.round(conf * 100)}%`, color, reasons });
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold">Decision Engine</h3>
        <p className="mt-1 text-sm text-muted-foreground">Adjust the parameters and run the deterministic policy engine.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Issue type</label>
          <input
            value={issue}
            onChange={(e) => setIssue(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Order ID</label>
          <input
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
      </div>
      <div className="rounded-xl border border-border bg-muted/30 p-5 space-y-5">
        <div className="flex flex-wrap gap-3">
          {[
            { label: 'Policy match', checked: policyMatch, onChange: setPolicyMatch },
            { label: 'Customer good standing', checked: customerGood, onChange: setCustomerGood },
          ].map(({ label, checked, onChange }) => (
            <label
              key={label}
              className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors select-none ${
                checked
                  ? 'border-primary/40 bg-primary/5 text-primary'
                  : 'border-border bg-background text-muted-foreground hover:border-border/80 hover:text-foreground'
              }`}
            >
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                  checked ? 'border-primary bg-primary' : 'border-border bg-background'
                }`}
              >
                {checked && (
                  <svg viewBox="0 0 10 8" className="h-2.5 w-2.5 fill-none stroke-white stroke-2">
                    <polyline points="1 4 4 7 9 1" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
              {label}
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => onChange(e.target.checked)}
                className="sr-only"
              />
            </label>
          ))}
        </div>
        <RiskSlider value={risk} onChange={setRisk} />
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={runDecision} className="gap-1.5">
          <Zap className="h-3.5 w-3.5" />
          Run decision
        </Button>
        <Button size="sm" variant="outline" onClick={() => setResult(null)}>Reset</Button>
      </div>
      {result && (
        <div className={`rounded-xl border p-4 space-y-3 ${
          result.color === 'success' ? 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30' :
          result.color === 'destructive' ? 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30' :
          'border-yellow-200 bg-yellow-50 dark:border-yellow-900 dark:bg-yellow-950/30'
        }`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Decision</p>
              <p className="mt-0.5 text-sm font-semibold">{result.action}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-xs font-medium text-muted-foreground">Confidence</p>
              <p className="mt-0.5 text-lg font-bold">{result.confidence}</p>
            </div>
          </div>
          <div className="space-y-1.5 pt-2 border-t border-border/40">
            {result.reasons.map((r) => (
              <div key={r} className="flex items-center gap-2 text-xs text-muted-foreground">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-500" />
                {r}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Auto-Reply Editor ─────────────────────────────────────────────────────────

function ReplyEditorDemo() {
  const [tone, setTone] = useState<'neutral' | 'friendly' | 'formal'>('neutral');
  const [length, setLength] = useState<'short' | 'medium' | 'long'>('medium');
  const [generated, setGenerated] = useState('');
  const [edited, setEdited] = useState('');
  const [sent, setSent] = useState<null | string>(null);

  const templates: Record<string, Record<string, string>> = {
    neutral: {
      short: `Your refund request for Order #4821 has been received and is being processed.`,
      medium: `Thank you for reaching out. Your refund request for Order #4821 has been received. We'll process this within 3–5 business days and notify you by email once complete.`,
      long: `Thank you for contacting support. We've received your refund request for Order #4821 and have reviewed your account details. Based on our policy, your request qualifies for a full refund. Please allow 3–5 business days for the amount to appear on your original payment method. We'll send a confirmation email once processed. Please don't hesitate to reach out if you have any further questions.`,
    },
    friendly: {
      short: `Got it — we're on it! Your refund for Order #4821 is being processed.`,
      medium: `Hey there! Thanks for reaching out. We've received your refund request for Order #4821 and we're already on it. You'll hear back from us within 3–5 business days. Hang tight!`,
      long: `Hey! So sorry to hear things didn't go as expected with Order #4821. We totally understand how frustrating that can be. The great news is your refund request has been approved and is already being processed. You should see the amount back in your account within 3–5 business days. We'll also send a confirmation email so you have a paper trail. Thanks for your patience — and please don't hesitate to reach out if you need anything else!`,
    },
    formal: {
      short: `We acknowledge receipt of your refund request for Order #4821 and confirm that it is under review.`,
      medium: `Dear Customer, we acknowledge receipt of your refund request pertaining to Order #4821. Following a review of your account, we confirm that your request meets the applicable criteria. The refund will be processed within 3–5 business days. You will be notified upon completion.`,
      long: `Dear Customer, we acknowledge receipt of your refund request pertaining to Order #4821. Upon thorough review of your account history and the applicable refund policy, we are pleased to confirm that your request has been approved. The refund of the full order amount will be processed within 3–5 business days and credited to your original payment method. A formal confirmation will be dispatched to your registered email address upon completion. Should you require any further assistance, please do not hesitate to contact our support team.`,
    },
  };

  function generate() {
    const text = templates[tone][length];
    setGenerated(text);
    setEdited(text);
    setSent(null);
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold">Auto-Reply Editor</h3>
        <p className="mt-1 text-sm text-muted-foreground">Generate a contextual reply, then tweak it before sending.</p>
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Tone</label>
          <select
            value={tone}
            onChange={(e) => setTone(e.target.value as typeof tone)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="neutral">Neutral</option>
            <option value="friendly">Friendly</option>
            <option value="formal">Formal</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Length</label>
          <select
            value={length}
            onChange={(e) => setLength(e.target.value as typeof length)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="short">Short</option>
            <option value="medium">Medium</option>
            <option value="long">Long</option>
          </select>
        </div>
        <Button size="sm" onClick={generate} className="gap-1.5">
          <Sparkles className="h-3.5 w-3.5" />
          Generate reply
        </Button>
      </div>
      {generated ? (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Generated reply — edit before sending</label>
            <textarea
              value={edited}
              onChange={(e) => setEdited(e.target.value)}
              rows={5}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setSent(new Date().toLocaleTimeString())} disabled={!!sent}>
              {sent ? `Sent at ${sent}` : 'Send (simulate)'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setEdited(generated); setSent(null); }}>
              Reset edits
            </Button>
          </div>
          {sent && (
            <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 dark:border-green-900 dark:bg-green-950/30">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span className="text-sm text-green-700 dark:text-green-400">Reply delivered to customer inbox at {sent}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
          Select tone and length, then click generate
        </div>
      )}
    </div>
  );
}

// ─── RAG Lookup ────────────────────────────────────────────────────────────────

function RagDemo() {
  const docs = [
    { id: 'd1', title: 'Refund policy', snippet: 'Refunds are issued within 7 days for unopened items in original condition.', src: 'policy.pdf', tag: 'Policy' },
    { id: 'd2', title: 'Shipping FAQ', snippet: 'Delays may occur due to carrier disruption outside our control.', src: 'faq.md', tag: 'FAQ' },
    { id: 'd3', title: 'Billing guide', snippet: 'Duplicate charges can be reversed after verification by our billing team.', src: 'billing.pdf', tag: 'Billing' },
    { id: 'd4', title: 'Return window', snippet: 'Customers have 30 days from delivery to initiate a return request.', src: 'returns.pdf', tag: 'Policy' },
  ];
  const [q, setQ] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  const results = q.trim()
    ? docs.filter(d => d.title.toLowerCase().includes(q.toLowerCase()) || d.snippet.toLowerCase().includes(q.toLowerCase()))
    : docs;

  function insert(snippet: string, id: string) {
    try { navigator.clipboard?.writeText(snippet); } catch { /* ignore */ }
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold">RAG Knowledge Lookup</h3>
        <p className="mt-1 text-sm text-muted-foreground">Search the knowledge base and insert cited snippets into your reply.</p>
      </div>
      <div className="relative">
        <FileSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search policies, FAQs, billing docs…"
          className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm"
        />
      </div>
      <div className="space-y-2">
        {results.length === 0 ? (
          <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
            No documents match your query
          </div>
        ) : (
          results.map((r) => (
            <div key={r.id} className="group rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/30">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{r.title}</span>
                    <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{r.tag}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{r.src}</p>
                  <p className="mt-2 text-sm text-foreground/80 leading-relaxed">{r.snippet}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 h-7 px-2.5 text-xs"
                  onClick={() => insert(r.snippet, r.id)}
                >
                  {copied === r.id ? (
                    <><CheckCircle2 className="h-3 w-3 text-green-500 mr-1" />Copied</>
                  ) : 'Insert'}
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Visual AI ─────────────────────────────────────────────────────────────────

function VisualSnapshotDemo() {
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [issues, setIssues] = useState<{ label: string; severity: 'high' | 'medium' | 'low' }[]>([]);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileUrl(URL.createObjectURL(f));
    setIssues([
      { label: 'Missing primary CTA on checkout step', severity: 'high' },
      { label: 'Overlapping elements near header at mobile breakpoint', severity: 'medium' },
      { label: 'Low contrast on disabled button text', severity: 'low' },
    ]);
  }

  const severityStyle = {
    high: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900',
    medium: 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950/30 dark:text-yellow-400 dark:border-yellow-900',
    low: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-900',
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold">Visual Snapshot Analyzer</h3>
        <p className="mt-1 text-sm text-muted-foreground">Upload a UI screenshot to detect issues and get guided fixes.</p>
      </div>
      {!fileUrl ? (
        <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border bg-muted/20 p-12 transition-colors hover:border-primary/40 hover:bg-muted/30">
          <Eye className="h-8 w-8 text-muted-foreground" />
          <div className="text-center">
            <p className="text-sm font-medium">Upload a screenshot</p>
            <p className="mt-1 text-xs text-muted-foreground">PNG, JPG or WebP up to 10 MB</p>
          </div>
          <input type="file" accept="image/*" onChange={onPick} className="sr-only" />
        </label>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">Uploaded snapshot</p>
              <img src={fileUrl} alt="snapshot" className="w-full rounded-xl border border-border object-cover" />
            </div>
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">Detected issues ({issues.length})</p>
              <div className="space-y-2">
                {issues.map((issue, i) => (
                  <div key={i} className={`rounded-lg border px-3 py-2.5 text-xs font-medium ${severityStyle[issue.severity]}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span>{issue.label}</span>
                      <span className="shrink-0 capitalize opacity-70">{issue.severity}</span>
                    </div>
                  </div>
                ))}
              </div>
              <Button size="sm" className="mt-4 w-full" onClick={() => alert('Suggestions applied (mock)')}>
                Apply all suggestions
              </Button>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => { setFileUrl(null); setIssues([]); }}>
            Upload another
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Voice Snippet ─────────────────────────────────────────────────────────────

function VoiceSnippetDemo() {
  const PRESETS = [
    'Customer: I want a refund, I received the wrong item.',
    'Customer: My account has been charged twice this month.',
    'Customer: I need to update my shipping address urgently.',
  ];

  const [input, setInput] = useState(PRESETS[0]);
  const [transcript, setTranscript] = useState<null | { text: string; action: string; intent: string; confidence: number }>(null);

  function transcribe() {
    const lower = input.toLowerCase();
    let action = 'Create support ticket';
    let intent = 'General inquiry';
    let confidence = 72;

    if (lower.includes('refund')) { action = 'Open refund flow → Order lookup'; intent = 'Refund request'; confidence = 94; }
    else if (lower.includes('charged') || lower.includes('charge')) { action = 'Open billing dispute form'; intent = 'Billing issue'; confidence = 88; }
    else if (lower.includes('address') || lower.includes('shipping')) { action = 'Update shipping details'; intent = 'Logistics change'; confidence = 91; }

    setTranscript({ text: input, action, intent, confidence });
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold">Voice Snippet Tester</h3>
        <p className="mt-1 text-sm text-muted-foreground">Paste or type a voice transcript and see the suggested action.</p>
      </div>
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">Quick presets</label>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p, i) => (
            <button
              key={i}
              type="button"
              onClick={() => { setInput(p); setTranscript(null); }}
              className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                input === p
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground'
              }`}
            >
              Preset {i + 1}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Transcript</label>
        <textarea
          value={input}
          onChange={(e) => { setInput(e.target.value); setTranscript(null); }}
          rows={3}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none"
        />
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={transcribe} className="gap-1.5">
          <Mic className="h-3.5 w-3.5" />
          Transcribe & analyze
        </Button>
        <Button size="sm" variant="outline" onClick={() => setTranscript(null)}>Reset</Button>
      </div>
      {transcript && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-muted/40 p-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Intent</p>
              <p className="mt-1 text-sm font-medium">{transcript.intent}</p>
            </div>
            <div className="rounded-lg bg-muted/40 p-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Confidence</p>
              <p className="mt-1 text-sm font-medium">{transcript.confidence}%</p>
            </div>
            <div className="col-span-2 rounded-lg bg-primary/5 border border-primary/20 p-3 sm:col-span-1">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Suggested action</p>
              <p className="mt-1 text-sm font-medium text-primary">{transcript.action}</p>
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Confidence bar</p>
            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${transcript.confidence}%` }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}