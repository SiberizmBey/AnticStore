import React from "react";
import { Store, PackageCheck, Settings, RefreshCw } from "lucide-react";
import { motion } from "motion/react";
import { useStore } from "../context/StoreContext";
import { WindowControls } from "./WindowControls";
import { SignalsPopover } from "./SignalsPopover";

export type NavTab = "store" | "installed" | "settings";

interface NavbarProps {
    currentTab: NavTab;
    onSelectTab: (tab: NavTab) => void;
    onSelectAppById?: (appId: string) => void;
}

export function Navbar({ currentTab, onSelectTab, onSelectAppById }: NavbarProps) {
    const { isSyncing, syncCatalog, installedApps, updatableApps } = useStore();

    const navItems: {
        id: NavTab;
        label: string;
        icon: React.ReactNode;
        badge?: string | number;
        badgeHighlight?: boolean;
    }[] = [
        {
            id: "store",
            label: "Mağaza",
            icon: <Store className="w-4 h-4" />,
        },
        {
            id: "installed",
            label: "Yüklü",
            icon: <PackageCheck className="w-4 h-4" />,
            badge:
                updatableApps.length > 0
                    ? `${updatableApps.length} Güncelleme`
                    : installedApps.length > 0
                      ? installedApps.length
                      : undefined,
            badgeHighlight: updatableApps.length > 0,
        },
        {
            id: "settings",
            label: "Ayarlar",
            icon: <Settings className="w-4 h-4" />,
        },
    ];

    return (
        <header className="koza-window-drag-region sticky top-0 z-40 w-full py-3 px-3 sm:px-6 lg:px-8 pointer-events-none koza-navbar-wrapper">
            <div className="koza-window-interactive w-full flex items-center justify-between gap-2 sm:gap-4 pointer-events-auto koza-navbar-container">
                {/* Sol Kapsül: Brand Identity */}
                <button
                    type="button"
                    onClick={() => onSelectTab("store")}
                    title="Koru Ana Sayfa"
                    className="koza-nav-capsule flex items-center gap-2 px-2.5 sm:px-3.5 py-1.5 rounded-full bg-island border border-subtle shadow-sm shrink-0 transition-colors cursor-pointer hover:border-hover"
                >
                    <div className="w-7 h-7 rounded-full bg-card border border-subtle flex items-center justify-center shrink-0 overflow-hidden p-0.5">
                        <img
                            src={`${import.meta.env.BASE_URL}assets/img/icon.png`}
                            alt="Koru"
                            className="w-full h-full object-contain"
                            referrerPolicy="no-referrer"
                        />
                    </div>
                    <span className="hidden sm:inline font-bold text-xs tracking-tight text-primary pr-0.5 whitespace-nowrap shrink-0">
                        Koru
                    </span>
                </button>

                {/* Orta Kapsül: Navigation Capsule Tabs */}
                <nav
                    className="koza-nav-capsule flex items-center gap-1 p-1.5 sm:px-2 rounded-full bg-island border border-subtle shadow-sm overflow-x-auto no-scrollbar transition-colors min-w-0"
                    aria-label="Ana Gezinti Menüsü"
                >
                    {navItems.map((item) => {
                        const isActive = currentTab === item.id;
                        return (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => onSelectTab(item.id)}
                                className={`relative flex items-center gap-2 px-2.5 sm:px-3.5 py-1.5 rounded-full text-xs font-semibold tracking-wide transition-colors duration-200 select-none whitespace-nowrap shrink-0 cursor-pointer outline-none ${
                                    isActive
                                        ? "text-white font-bold"
                                        : "text-secondary hover:text-primary hover:bg-card-hover/40"
                                }`}
                            >
                                {isActive && (
                                    <motion.div
                                        layoutId="activePillIndicator"
                                        className="absolute inset-0 rounded-full shadow-sm nav-indicator"
                                        style={{
                                            backgroundColor: "var(--accent)",
                                        }}
                                        transition={{
                                            type: "spring",
                                            stiffness: 450,
                                            damping: 32,
                                        }}
                                    />
                                )}
                                <span className="relative z-10 flex items-center gap-1.5 sm:gap-2">
                                    {item.icon}
                                    <span className="hidden sm:inline">
                                        {item.label}
                                    </span>
                                    {item.badge !== undefined && (
                                        <span
                                            className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold border tabular-nums transition-colors ${
                                                isActive
                                                    ? "bg-black/20 text-white border-white/20"
                                                    : item.badgeHighlight
                                                      ? "accent-subtle accent-text accent-border"
                                                      : "bg-card text-secondary border-subtle"
                                            }`}
                                        >
                                            {item.badge}
                                        </span>
                                    )}
                                </span>
                            </button>
                        );
                    })}
                </nav>

                {/* Sağ Bölge: Sinyaller Kapsülü (Sol) + Yenile & Pencere Kontrolleri Kapsülü (Sağ) */}
                <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                    <SignalsPopover onSelectAppById={onSelectAppById} />

                    <div className="koza-nav-capsule flex items-center gap-1.5 sm:gap-2 p-1.5 sm:px-2 rounded-full bg-island border border-subtle shadow-sm shrink-0 transition-colors">
                        <button
                            type="button"
                            onClick={() => void syncCatalog()}
                            disabled={isSyncing}
                            title="Mağaza Kataloğunu ve Güncellemeleri Yenile"
                            aria-label="Kataloğu yenile"
                            className="h-7 px-2.5 sm:px-3 rounded-full flex items-center gap-1.5 text-xs font-semibold bg-card border border-subtle hover:bg-card-hover text-primary transition-colors cursor-pointer disabled:opacity-50 shrink-0 whitespace-nowrap"
                        >
                            <RefreshCw
                                className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin accent-text" : "accent-text"}`}
                            />
                            <span className="hidden sm:inline">Yenile</span>
                        </button>

                        {window.anticStoreDesktop && (
                            <>
                                <div className="w-[1px] h-4 bg-subtle hidden sm:block mx-0.5" />
                                <WindowControls />
                            </>
                        )}
                    </div>
                </div>
            </div>
        </header>
    );
}
