import React from 'react';
import { FlaskConical, History, Instagram, ArrowUpRight } from 'lucide-react';

interface EcosystemApp {
  name: string;
  desc: string;
  icon: string;
  url: string;
}

const ECOSYSTEM_APPS: EcosystemApp[] = [
  {
    name: 'Kirpi',
    desc: 'ERP & MES Platformu',
    icon: 'https://labs.anticvalley.com.tr/assets/img/kirpi.png',
    url: 'https://anticvalley.com.tr'
  },
  {
    name: 'Kirpi Fab',
    desc: 'Endüstriyel Akıllı Üretim',
    icon: 'https://labs.anticvalley.com.tr/assets/img/kirpifab.png',
    url: 'https://anticvalley.com.tr'
  },
  {
    name: 'Lir',
    desc: 'Gelişmiş Ses Yönetimi',
    icon: 'https://labs.anticvalley.com.tr/assets/img/lir.png',
    url: 'https://anticvalley.com.tr'
  },
  {
    name: 'MFGI',
    desc: 'Operasyonel Altyapı',
    icon: 'https://labs.anticvalley.com.tr/assets/img/mfgi.png',
    url: 'https://anticvalley.com.tr'
  }
];

export function Footer() {
  return (
    <footer className="w-full p-4 sm:p-5 lg:p-6 rounded-3xl bg-card border border-subtle transition-colors shadow-sm select-none">
      {/* Top Header Row: Brand & Quick Links */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Left: Brand Identity Box */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-inner/80 border border-subtle flex items-center justify-center p-2 shrink-0 shadow-sm">
            <img
              src="https://labs.anticvalley.com.tr/assets/img/anticvalley.png"
              alt="Antic Valley"
              className="w-full h-full object-contain"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = `${import.meta.env.BASE_URL}assets/img/icon.png`;
              }}
            />
          </div>
          <div className="min-w-0">
            <span className="font-bold text-sm text-primary tracking-tight block">Antic Valley</span>
            <p className="text-[11px] text-muted leading-tight mt-0.5 truncate">
              Antic Valley tarafından geliştirildi.
            </p>
          </div>
        </div>

        {/* Right: Keşfet Links & Sosyal Buttons */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
          {/* Keşfet Capsule Links */}
          <a
            href="https://anticvalley.com.tr"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-inner/60 hover:bg-inner border border-subtle hover:border-hover text-xs font-medium text-secondary hover:text-primary transition-all cursor-pointer outline-none focus:outline-none"
          >
            <FlaskConical className="w-3.5 h-3.5 text-muted" />
            <span>Projeler</span>
          </a>
          <a
            href="https://anticvalley.com.tr"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-inner/60 hover:bg-inner border border-subtle hover:border-hover text-xs font-medium text-secondary hover:text-primary transition-all cursor-pointer outline-none focus:outline-none"
          >
            <History className="w-3.5 h-3.5 text-muted" />
            <span>Günlük gelişmeler</span>
          </a>

          <div className="w-[1px] h-4 bg-subtle hidden sm:block mx-0.5" />

          {/* Social Circle Buttons */}
          <div className="flex items-center gap-1.5">
            <a
              href="https://github.com/anticvalley"
              target="_blank"
              rel="noopener noreferrer"
              title="GitHub"
              aria-label="GitHub"
              className="w-8 h-8 rounded-full bg-inner/60 hover:bg-inner border border-subtle hover:border-hover flex items-center justify-center text-secondary hover:text-primary transition-all cursor-pointer outline-none focus:outline-none"
            >
              <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                />
              </svg>
            </a>
            <a
              href="https://instagram.com/anticvalley"
              target="_blank"
              rel="noopener noreferrer"
              title="Instagram"
              aria-label="Instagram"
              className="w-8 h-8 rounded-full bg-inner/60 hover:bg-inner border border-subtle hover:border-hover flex items-center justify-center text-secondary hover:text-primary transition-all cursor-pointer outline-none focus:outline-none"
            >
              <Instagram className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </div>

      {/* Middle Section: Ekosistemimizle Tanışın (Modern Proje Kutuları) */}
      <div className="mt-4">
        <div className="flex items-center gap-2 mb-2.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
            Ekosistemimizle Tanışın
          </span>
          <div className="h-[1px] flex-1 bg-subtle/40" />
        </div>

        {/* Project Tiles Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {ECOSYSTEM_APPS.map((app) => (
            <a
              key={app.name}
              href={app.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-2.5 rounded-2xl bg-inner/50 hover:bg-inner border border-subtle hover:border-hover transition-all duration-200 group cursor-pointer outline-none focus:outline-none"
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--accent)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '';
              }}
            >
              {/* Proje İkonu Kutusu */}
              <div className="w-10 h-10 rounded-xl bg-card border border-subtle flex items-center justify-center p-2 shrink-0 group-hover:scale-105 transition-transform duration-200 shadow-sm">
                <img
                  src={app.icon}
                  alt={app.name}
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    (e.currentTarget as HTMLElement).style.display = 'none';
                  }}
                />
              </div>

              {/* Proje Bilgileri */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="font-bold text-xs text-primary group-hover:text-accent transition-colors truncate">
                    {app.name}
                  </span>
                  <ArrowUpRight className="w-3 h-3 text-muted group-hover:text-primary group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all opacity-0 group-hover:opacity-100 shrink-0" />
                </div>
                <span className="text-[10px] text-muted block truncate mt-0.5">
                  {app.desc}
                </span>
              </div>
            </a>
          ))}
        </div>
      </div>

      {/* Divider */}
      <div className="w-full h-[1px] bg-subtle/40 my-3" />

      {/* Centered Copyright */}
      <div className="text-center">
        <p className="text-[11px] text-muted tracking-wide">
          © 2026 Antic Valley - Tüm Hakları Saklıdır.
        </p>
      </div>
    </footer>
  );
}
