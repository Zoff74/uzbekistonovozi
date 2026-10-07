"use client";
//src/components/HeaderCanvas.tsx

import React, { useEffect, useRef } from "react";

class Spark {
  x: number; y: number; px: number; py: number;
  vx: number; vy: number; alpha: number;
  color: string; size: number; decay: number;
  type: 'avatar' | 'header' | 'click';

  constructor(x: number, y: number, type: 'avatar' | 'header' | 'click', colors: string[], forceMultiplier = 1, isUpward = false, isWide = false, color?: string) {
    this.x = x; this.y = y; this.px = x; this.py = y;
    this.type = type;

    let angle;
    if (isWide) {
      angle = Math.PI + (Math.random() * Math.PI);
    } else {
      angle = isUpward ? (Math.random() * Math.PI + Math.PI) : (Math.random() * Math.PI * 2);
    }

    if (this.type === 'avatar') {
      const force = (Math.random() * 5 + 3) * forceMultiplier;
      this.vx = Math.cos(angle) * force;
      this.vy = Math.sin(angle) * force;
      this.decay = Math.random() * 0.008 + 0.004;
    } else if (this.type === 'header') {
      const force = (Math.random() * 4 + 2.5) * forceMultiplier;
      this.vx = Math.cos(angle) * force;
      this.vy = Math.sin(angle) * force;
      this.decay = Math.random() * 0.01 + 0.006;
    } else {
      const force = (Math.random() * 3 + 2.5) * forceMultiplier;
      this.vx = Math.cos(angle) * force;
      this.vy = Math.sin(angle) * force;
      this.decay = Math.random() * 0.018 + 0.012;
    }

    this.alpha = 1;
    this.size = Math.random() * 1.5 + 1;
    this.color = color || colors[Math.floor(Math.random() * colors.length)];
  }

  update(maxWidth: number, maxHeight: number) {
    this.px = this.x; this.py = this.y;

    if (this.type === 'avatar') {
      this.vx *= 0.98; this.vy *= 0.98; this.vy += 0.08;
    } else if (this.type === 'header') {
      this.vx *= 0.97; this.vy *= 0.97; this.vy += 0.07;
    } else {
      this.vx *= 0.95; this.vy *= 0.95; this.vy += 0.12;
    }

    this.x += this.vx; this.y += this.vy;
    this.alpha -= this.decay;

    if (this.alpha < 0.1 || this.y >= maxHeight) {
      this.alpha = 0;
    }
  }

  draw(context: CanvasRenderingContext2D) {
    if (this.alpha <= 0) return;
    context.globalAlpha = this.alpha;
    context.strokeStyle = this.color;
    context.lineWidth = this.size;
    context.lineCap = "round";
    context.beginPath();
    context.moveTo(this.px, this.py);
    context.lineTo(this.x, this.y);
    context.stroke();
  }
}

interface HeaderCanvasProps {
  avatarContainerRef: React.RefObject<HTMLDivElement | null>;
  navRef: React.RefObject<HTMLElement | null>;
}

export default function HeaderCanvas({ avatarContainerRef, navRef }: HeaderCanvasProps) {
  const globalCanvasRef = useRef<HTMLCanvasElement>(null);
  const headerCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    // Запускаем анимацию с задержкой 1.5 секунды, чтобы дать странице отрисовать LCP без нагрузки
    const startDelay = setTimeout(() => {
      if (!globalCanvasRef.current || !headerCanvasRef.current || !navRef.current) return;

      const gCanvas = globalCanvasRef.current;
      const gCtx = gCanvas.getContext("2d");
      const hCanvas = headerCanvasRef.current;
      const hCtx = hCanvas.getContext("2d");

      if (!gCtx || !hCtx) return;

      let animationFrameId: number;
      let globalParticles: Spark[] = [];
      let backgroundParticles: Spark[] = [];

      const colors = [
        "#FFDA09", "#f80707", "#FFFF00", "#39FF14", "#41f7e7",
        "#0626d6", "#ee0ea3", "#FAFAFA", "#00FFFF",
        "#FF0000", "#FF00FF", "#00FF00", "#FF4500", "#1E90FF",
        "#ADFF2F", "#9400D3"
      ];

      const resize = () => {
        gCanvas.width = window.innerWidth;
        gCanvas.height = window.innerHeight;

        const navRect = navRef.current?.getBoundingClientRect();
        if (navRect) {
          hCanvas.width = navRect.width;
          hCanvas.height = navRect.height;
        }
      };
      resize();
      window.addEventListener('resize', resize);

      const spawnMultiColor = (list: Spark[], x: number, y: number, type: 'header' | 'click', count: number) => {
        for (let i = 0; i < count; i++) {
          const color = colors[i % colors.length];
          list.push(new Spark(x, y, type, colors, 2.5, false, false, color));
        }
      };

      const spawnSingleColor = (list: Spark[], x: number, y: number, type: 'avatar', count: number) => {
        const selectedColor = colors[Math.floor(Math.random() * colors.length)];
        for (let i = 0; i < count; i++) {
          list.push(new Spark(x, y, type, colors, 1.5, true, true, selectedColor));
        }
      };

      const handleMouseDown = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (target.closest('a') || target.closest('button')) {
          return;
        }
        spawnMultiColor(globalParticles, e.clientX, e.clientY, 'click', 204);
      };

      window.addEventListener("mousedown", handleMouseDown);

      let lastTime = performance.now();
      const fps = 30;
      const interval = 1000 / fps;

      const animate = (currentTime: number) => {
        animationFrameId = requestAnimationFrame(animate);

        const delta = currentTime - lastTime;
        if (delta < interval) return;
        lastTime = currentTime - (delta % interval);

        if (globalParticles.length === 0) {
          gCtx.clearRect(0, 0, gCanvas.width, gCanvas.height);
        } else {
          gCtx.globalCompositeOperation = 'destination-out';
          gCtx.fillStyle = 'rgba(0, 0, 0, 0.4)';
          gCtx.fillRect(0, 0, gCanvas.width, gCanvas.height);
          gCtx.globalCompositeOperation = 'lighter';
        }

        hCtx.clearRect(0, 0, hCanvas.width, hCanvas.height);
        hCtx.globalCompositeOperation = 'lighter';

        if (Math.random() < 0.05) {
          spawnMultiColor(backgroundParticles, Math.random() * hCanvas.width, Math.random() * hCanvas.height, 'header', 12);
        }

        if (Math.random() < 0.06 && avatarContainerRef.current) {
          const rect = avatarContainerRef.current.getBoundingClientRect();
          const centerX = rect.left + rect.width / 2;
          const centerY = rect.top + 16;
          spawnSingleColor(globalParticles, centerX, centerY, 'avatar', 12);
        }

        globalParticles = globalParticles.filter(p => p.alpha > 0);
        globalParticles.forEach(p => { p.update(gCanvas.width, gCanvas.height); p.draw(gCtx); });

        backgroundParticles = backgroundParticles.filter(p => p.alpha > 0);
        backgroundParticles.forEach(p => { p.update(hCanvas.width, hCanvas.height); p.draw(hCtx); });
      };

      animationFrameId = requestAnimationFrame(animate);

      return () => {
        cancelAnimationFrame(animationFrameId);
        window.removeEventListener("mousedown", handleMouseDown);
        window.removeEventListener('resize', resize);
      };
    }, 1500); // 1.5 секунды фоновой форы для быстрой отрисовки текста

    return () => clearTimeout(startDelay);
  }, [avatarContainerRef, navRef]);

  return (
    <>
      <canvas ref={headerCanvasRef} className="absolute inset-0 pointer-events-none z-[20]" />
      <canvas ref={globalCanvasRef} className="fixed inset-0 pointer-events-none z-[9999]" />
    </>
  );
}