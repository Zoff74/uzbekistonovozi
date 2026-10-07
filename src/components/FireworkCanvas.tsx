"use client";
//src\components\FireworkCanvas.tsx
import { useEffect, useRef } from "react";

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
      const force = (Math.random() * 5 + 3) * forceMultiplier;
      this.vx = Math.cos(angle) * force;
      this.vy = Math.sin(angle) * force;
      this.decay = Math.random() * 0.008 + 0.005;
    } else {
      const force = (Math.random() * 4 + 3) * forceMultiplier;
      this.vx = Math.cos(angle) * force;
      this.vy = Math.sin(angle) * force;
      this.decay = Math.random() * 0.015 + 0.01;
    }

    this.alpha = 1;
    this.size = Math.random() * 2 + 1.2;
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

interface FireworkCanvasProps {
  disableClick?: boolean; // Флаг отключения клик-салюта для конкретной страницы
}

export default function FireworkCanvas({ disableClick = false }: FireworkCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let particles: Spark[] = [];

    const colors = [
      "#FFDA09", "#f80707", "#FFFF00", "#39FF14", "#41f7e7",
      "#0626d6", "#ee0ea3", "#FAFAFA", "#00FFFF",
      "#FF0000", "#FF00FF", "#00FF00", "#FF4500", "#1E90FF",
      "#ADFF2F", "#9400D3"
    ];

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const spawnMultiColor = (list: Spark[], x: number, y: number, type: 'header' | 'click', count: number) => {
      for (let i = 0; i < count; i++) {
        const color = colors[i % colors.length];
        //Сила разлета искр. 3.0- отвечает за то, как далеко разлетаются искры от центра взрыва.
        list.push(new Spark(x, y, type, colors, 3.0, false, false, color)); 
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (disableClick) return; // Если передан флаг, клик игнорируется

      const target = e.target as HTMLElement;
      if (
        target.closest('a') || 
        target.closest('button') || 
        target.closest('[role="button"]') || 
        target.closest('.cursor-pointer') ||
        target.closest('svg')
      ) {
        return;
      }
      
      spawnMultiColor(particles, e.clientX, e.clientY, 'click', 408); // Увеличенные в 2 раза искры по клику (было 204)
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

      if (particles.length === 0) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      } else {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.globalCompositeOperation = 'lighter';
      }

      // < 0.06 - Это шанс срабатывания салюта на каждом кадре. Если поставить число больше (например, 0.15), салюты будут взрываться гораздо чаще. Если меньше (например, 0.03) — реже.
      // Шанс срабатывания (остается 0.06 - довольно часто)
      if (Math.random() < 0.03) {
        // КОЛИЧЕСТВО ИСКР УВЕЛИЧЕНО В 2 РАЗА (было 12 -> стало 16)
        spawnMultiColor(particles, Math.random() * canvas.width, Math.random() * canvas.height, 'header', 16);
      }

      particles = particles.filter(p => p.alpha > 0);
      particles.forEach(p => { 
        p.update(canvas.width, canvas.height); 
        p.draw(ctx); 
      });
    };

    const timer = setTimeout(() => {
      animationFrameId = requestAnimationFrame(animate);
    }, 500);

    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener('resize', resize);
    };
  }, [disableClick]);

  return (
    <canvas 
      ref={canvasRef} 
      className="fixed inset-0 pointer-events-none z-[9999]" 
    />
  );
}