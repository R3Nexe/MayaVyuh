import React, { useState, useEffect, useRef, useCallback } from "react";
import { useSyncState, broadcastEvent, useEventListener } from "./useSync.js";

import bg1 from "./assets/bg-1.jpg";
import bg2 from "./assets/bg-2.jpg";
import bg3 from "./assets/bg-3.jpg";
import bg4 from "./assets/bg-4.jpg";
import bg5 from "./assets/bg-5.jpg";

const BG_IMAGES = [bg1, bg2, bg3, bg4, bg5];

const INIT_TEAMS = [];
const INIT_WORDS = ["dragon", "ancient", "fire"];
const INIT_TIMERS = { round1: 300, round2: 300, round3: 300, discussion: 120, swap: 60 };
const INIT_EVENT_STATE = { started: false, phase: "lobby" };

// ─── GLOBAL STYLES ────────────────────────────────────────────────────────────
const GlobalStyles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@400;700;900&family=Cinzel:wght@400;600;700&family=IM+Fell+English:ital@0;1&family=Share+Tech+Mono&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --void:#04050a; --abyss:#080c14; --stone:#0e1420; --slate:#141c2e;
      --rune-gold:#c8920a; --rune-gold-glow:#f5b800; --rune-amber:#d4780a;
      --oracle-blue:#00d4ff; --oracle-glow:#0099cc;
      --spirit-purple:#8b5cf6; --spirit-glow:#a78bfa;
      --blood-red:#cc2200; --blood-glow:#ff3300;
      --parchment:#c4a46b; --parchment-dim:#7a6340;
      --text-bright:#e8dcc8; --text-dim:#6b5e4a;
      --border-rune:rgba(200,146,10,0.3); --border-oracle:rgba(0,212,255,0.3);
      --nav-w:260px;
    }
    html,body { background:var(--void); color:var(--text-bright); font-family:'Cinzel',serif; overflow-x:hidden; }
    #root { width:100%; max-width:100%; margin:0; text-align:left; border:none; min-height:100svh; }
    ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-track{background:var(--abyss)} ::-webkit-scrollbar-thumb{background:var(--rune-gold);border-radius:2px}

    /* ─── BACKGROUNDS ─── */
    .immersive-bg{position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden}
    .bg-layer{position:absolute;inset:-5%;background-size:cover;background-position:center;opacity:0;transition:opacity 2.5s ease-in-out;filter:sepia(0.4) contrast(1.15) brightness(0.5)}
    .bg-layer.active{opacity:1}
    .bg-layer.pan-a{animation:panBg 40s linear infinite}
    .bg-layer.pan-b{animation:panBgSlow 55s linear infinite}
    .bg-layer.pan-c{animation:panBg 45s linear infinite reverse}
    .bg-overlay{position:absolute;inset:0;background:radial-gradient(ellipse at center,rgba(4,5,10,0.75) 0%,rgba(4,5,10,0.94) 100%)}
    /* Section-level bg images (3D parallax feel) */
    .section-bg{position:relative;overflow:hidden}
    .section-bg::before{content:'';position:absolute;inset:0;background-size:cover;background-position:center;opacity:0.07;filter:sepia(0.6) brightness(0.8);pointer-events:none;z-index:0;transform:scale(1.04);transition:transform 8s ease-in-out}
    .section-bg:hover::before{transform:scale(1.0)}
    .section-bg > *{position:relative;z-index:1}
    .bg-temple{background-image:url("${bg2}")}
    .bg-scroll{background-image:url("${bg1}")}
    .bg-map{background-image:url("${bg5}")}
    .bg-dark{background-image:url("${bg3}")}
    .bg-warm{background-image:url("${bg4}")}
    .particle-canvas{position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:1;opacity:0.4}
    .grid-bg{position:fixed;inset:0;z-index:1;pointer-events:none;background-image:linear-gradient(rgba(200,146,10,0.022) 1px,transparent 1px),linear-gradient(90deg,rgba(200,146,10,0.022) 1px,transparent 1px);background-size:60px 60px}
    .bg-runes{position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:1;opacity:0.04}
    .bg-rune{position:absolute;font-size:80px;color:var(--rune-gold);animation:runeFloat 6s ease-in-out infinite}

    /* ─── KEYFRAMES ─── */
    @keyframes goldPulse{0%,100%{text-shadow:0 0 8px var(--rune-gold),0 0 20px var(--rune-gold-glow)}50%{text-shadow:0 0 15px var(--rune-gold),0 0 40px var(--rune-gold-glow),0 0 60px var(--rune-amber)}}
    @keyframes oraclePulse{0%,100%{box-shadow:0 0 15px var(--oracle-glow)}50%{box-shadow:0 0 30px var(--oracle-glow),0 0 60px rgba(0,212,255,0.3)}}
    @keyframes screenShake{0%,100%{transform:translate(0,0)}10%{transform:translate(-8px,4px)}20%{transform:translate(8px,-4px)}30%{transform:translate(-6px,6px)}40%{transform:translate(6px,-2px)}50%{transform:translate(-4px,8px)}60%{transform:translate(4px,-6px)}70%{transform:translate(-2px,4px)}80%{transform:translate(2px,-2px)}90%{transform:translate(-1px,1px)}}
    @keyframes fadeInUp{from{opacity:0;transform:translateY(30px)}to{opacity:1;transform:translateY(0)}}
    @keyframes runeFloat{0%,100%{transform:translateY(0) rotate(0deg);opacity:0.6}50%{transform:translateY(-20px) rotate(5deg);opacity:1}}
    @keyframes labyLoading{0%{stroke-dashoffset:300}100%{stroke-dashoffset:0}}
    @keyframes banPulse{0%,100%{box-shadow:0 0 15px var(--blood-red),0 0 30px var(--blood-red)}50%{box-shadow:0 0 30px var(--blood-glow),0 0 60px var(--blood-glow),0 0 100px rgba(255,51,0,0.5)}}
    @keyframes toastSlide{0%{transform:translateY(-120px);opacity:0}15%{transform:translateY(0);opacity:1}85%{transform:translateY(0);opacity:1}100%{transform:translateY(-120px);opacity:0}}
    @keyframes disqualFlash{0%,100%{opacity:1}50%{opacity:0.7}}
    @keyframes shimmer{0%{background-position:-200% center}100%{background-position:200% center}}
    @keyframes panBg{0%{transform:scale(1.05) translate(0,0)}25%{transform:scale(1.1) translate(-1%,1%)}50%{transform:scale(1.05) translate(1%,-1%)}75%{transform:scale(1.1) translate(1%,1%)}100%{transform:scale(1.05) translate(0,0)}}
    @keyframes panBgSlow{0%{transform:scale(1.1) translate(1%,1%)}50%{transform:scale(1.05) translate(-1%,-1%)}100%{transform:scale(1.1) translate(1%,1%)}}
    @keyframes victoryGlow{0%,100%{filter:drop-shadow(0 0 8px var(--rune-gold))}50%{filter:drop-shadow(0 0 24px var(--rune-gold-glow)) drop-shadow(0 0 48px var(--rune-amber))}}
    @keyframes pendingPulse{0%,100%{border-color:rgba(255,200,0,0.3)}50%{border-color:rgba(255,200,0,0.9)}}
    @keyframes growBar{from{width:0}to{width:100%}}

    /* ─── ADMIN SHELL ─── */
    .app-shell{min-height:100vh;position:relative;z-index:2}
    .admin-nav{position:fixed;left:0;top:0;height:100vh;width:var(--nav-w);background:linear-gradient(180deg,var(--abyss) 0%,var(--stone) 100%);border-right:1px solid var(--border-rune);display:flex;flex-direction:column;z-index:100;overflow:hidden;transition:transform 0.3s}
    .admin-nav::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,transparent,var(--rune-gold),transparent)}
    .nav-logo{padding:28px 20px 20px;border-bottom:1px solid var(--border-rune)}
    .nav-logo h1{font-family:'Cinzel Decorative',serif;font-size:18px;font-weight:900;color:var(--rune-gold);animation:goldPulse 3s infinite;letter-spacing:2px;line-height:1.3}
    .nav-logo p{font-family:'IM Fell English',serif;font-size:13px;color:var(--parchment-dim);margin-top:4px;letter-spacing:3px;font-style:italic}
    .nav-items{flex:1;padding:20px 0;overflow-y:auto}
    .nav-section-title{font-family:'Share Tech Mono',monospace;font-size:12px;color:var(--parchment-dim);letter-spacing:3px;padding:16px 20px 8px;text-transform:uppercase}
    .nav-item{display:flex;align-items:center;gap:12px;padding:12px 20px;cursor:pointer;border-left:3px solid transparent;transition:all 0.3s;font-size:14px;letter-spacing:1px;color:var(--parchment-dim);white-space:nowrap}
    .nav-item:hover,.nav-item.active{background:rgba(200,146,10,0.08);border-left-color:var(--rune-gold);color:var(--rune-gold)}
    .nav-footer{padding:16px 20px;border-top:1px solid var(--border-rune)}
    .system-status{display:flex;align-items:center;gap:8px;font-family:'Share Tech Mono',monospace;font-size:13px;color:var(--parchment-dim)}
    .status-dot{width:6px;height:6px;border-radius:50%;background:#00ff88;box-shadow:0 0 8px #00ff88;animation:oraclePulse 2s infinite}
    .admin-main{margin-left:var(--nav-w);min-height:100vh;padding:0 30px 30px;transition:margin-left 0.3s}
    .top-bar{height:50px;background:var(--abyss);border-bottom:1px solid var(--border-rune);display:flex;align-items:center;padding:0 20px;justify-content:space-between;position:sticky;top:0;z-index:50;flex-wrap:wrap;gap:8px}
    /* Mobile hamburger */
    .nav-toggle{display:none;background:transparent;border:1px solid var(--border-rune);color:var(--rune-gold);padding:6px 10px;cursor:pointer;border-radius:3px;font-size:16px}
    .nav-overlay{display:none;position:fixed;inset:0;background:rgba(4,5,10,0.7);z-index:99}

    /* ─── CARDS ─── */
    .card{background:linear-gradient(135deg,rgba(8,12,20,0.96),rgba(14,20,32,0.96));border:1px solid var(--border-rune);border-radius:4px;padding:24px;position:relative;overflow:hidden}
    .card::after{content:'';position:absolute;inset:0;background:linear-gradient(135deg,rgba(200,146,10,0.03) 0%,transparent 60%);pointer-events:none}
    .card-title{font-family:'Cinzel',serif;font-size:14px;color:var(--rune-gold);letter-spacing:3px;text-transform:uppercase;margin-bottom:16px;padding-bottom:10px;border-bottom:1px solid var(--border-rune)}
    .grid-2{display:grid;grid-template-columns:1fr 1fr;gap:20px}
    .grid-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px}
    .stat-card{background:linear-gradient(135deg,rgba(8,12,20,0.96),rgba(14,20,32,0.96));border:1px solid var(--border-rune);border-radius:4px;padding:20px 24px;position:relative;overflow:hidden}
    .stat-card::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:var(--rune-gold)}
    .stat-value{font-family:'Cinzel Decorative',serif;font-size:28px;color:var(--rune-gold);line-height:1}
    .stat-label{font-family:'Share Tech Mono',monospace;font-size:12px;color:var(--parchment-dim);letter-spacing:2px;margin-top:6px}
    .stat-icon{position:absolute;right:16px;top:50%;transform:translateY(-50%);font-size:24px;opacity:0.2}
    .page-header{margin-bottom:28px}
    .page-header h2{font-family:'Cinzel Decorative',serif;font-size:20px;color:var(--rune-gold);animation:goldPulse 3s infinite;letter-spacing:3px}
    .page-header p{font-family:'IM Fell English',serif;color:var(--parchment-dim);font-size:15px;margin-top:6px;font-style:italic}
    .breadcrumb{font-family:'Share Tech Mono',monospace;font-size:12px;color:var(--parchment-dim);letter-spacing:2px;margin-bottom:8px}

    /* ─── BUTTONS ─── */
    .btn{display:inline-flex;align-items:center;gap:8px;padding:10px 20px;border:none;cursor:pointer;font-family:'Cinzel',serif;font-size:13px;letter-spacing:2px;text-transform:uppercase;border-radius:3px;transition:all 0.3s;position:relative;overflow:hidden}
    .btn-gold{background:linear-gradient(135deg,var(--rune-amber),var(--rune-gold));color:var(--void);font-weight:700;box-shadow:0 0 20px rgba(200,146,10,0.3)}
    .btn-gold:hover{box-shadow:0 0 30px rgba(200,146,10,0.6)}
    .btn-ghost{background:transparent;color:var(--rune-gold);border:1px solid var(--border-rune)}
    .btn-ghost:hover{border-color:var(--rune-gold);background:rgba(200,146,10,0.08)}
    .btn-danger{background:linear-gradient(135deg,#8b0000,var(--blood-red));color:#fff;box-shadow:0 0 20px rgba(204,34,0,0.5)}
    .btn-danger:hover{transform:scale(1.02);cursor:crosshair}
    .btn-oracle{background:linear-gradient(135deg,rgba(0,153,204,0.2),rgba(0,212,255,0.15));color:var(--oracle-blue);border:1px solid rgba(0,212,255,0.4)}
    .btn-oracle:hover{box-shadow:0 0 20px rgba(0,212,255,0.3);border-color:var(--oracle-blue)}
    .btn-approve{background:linear-gradient(135deg,rgba(0,100,60,0.4),rgba(0,200,100,0.2));color:#00ff88;border:1px solid rgba(0,255,136,0.4)}
    .btn-approve:hover{box-shadow:0 0 20px rgba(0,255,136,0.3)}

    /* ─── FORMS ─── */
    .form-group{margin-bottom:20px}
    .form-label{font-family:'Share Tech Mono',monospace;font-size:12px;color:var(--rune-gold);letter-spacing:2px;text-transform:uppercase;display:block;margin-bottom:8px}
    .form-input,.form-select,.form-textarea{width:100%;background:var(--abyss);border:1px solid var(--border-rune);color:var(--text-bright);padding:10px 14px;border-radius:3px;font-family:'Share Tech Mono',monospace;font-size:14px;outline:none;transition:border-color 0.3s}
    .form-input:focus,.form-select:focus,.form-textarea:focus{border-color:var(--rune-gold)}
    .form-select option{background:var(--stone)}
    .form-textarea{resize:vertical;min-height:100px;font-family:'IM Fell English',serif;font-size:15px}

    /* ─── TAGS ─── */
    .tag-input-wrap{background:var(--abyss);border:1px solid var(--border-rune);border-radius:4px;padding:10px 14px;min-height:50px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;transition:border-color 0.3s}
    .tag-input-wrap:focus-within{border-color:var(--rune-gold)}
    .tag{background:rgba(200,146,10,0.15);border:1px solid rgba(200,146,10,0.4);color:var(--rune-gold);border-radius:2px;padding:3px 8px;font-family:'Share Tech Mono',monospace;font-size:13px;display:flex;align-items:center;gap:6px}
    .tag-remove{cursor:pointer;opacity:0.6;transition:opacity 0.2s}
    .tag-remove:hover{opacity:1;color:var(--blood-red)}
    .tag-input{background:none;border:none;outline:none;color:var(--text-bright);font-family:'Share Tech Mono',monospace;font-size:14px;min-width:100px;flex:1}

    /* ─── TABLES ─── */
    .data-table{width:100%;border-collapse:collapse}
    .data-table th{font-family:'Share Tech Mono',monospace;font-size:12px;letter-spacing:2px;color:var(--parchment-dim);text-align:left;padding:10px 12px;border-bottom:1px solid var(--border-rune);text-transform:uppercase}
    .data-table tr.team-row{cursor:pointer;transition:all 0.3s;border-bottom:1px solid rgba(200,146,10,0.08)}
    .data-table tr.team-row:hover{background:rgba(200,146,10,0.05)}
    .data-table tr.team-row.expanded{background:rgba(200,146,10,0.08)}
    .data-table td{padding:12px;font-size:13px;color:var(--text-bright);font-family:'Share Tech Mono',monospace;vertical-align:middle}
    .status-badge{display:inline-flex;align-items:center;gap:5px;padding:3px 8px;border-radius:2px;font-size:11px;letter-spacing:1px;font-weight:600}
    .badge-active{background:rgba(0,255,136,0.12);color:#00ff88;border:1px solid rgba(0,255,136,0.3)}
    .badge-penalized{background:rgba(255,200,0,0.12);color:#ffc800;border:1px solid rgba(255,200,0,0.3)}
    .badge-banned{background:rgba(204,34,0,0.12);color:var(--blood-glow);border:1px solid rgba(204,34,0,0.3)}
    .badge-pending{background:rgba(255,200,0,0.08);color:#ffc800;border:1px solid rgba(255,200,0,0.3);animation:pendingPulse 2s infinite}
    .badge-approved{background:rgba(0,255,136,0.08);color:#00ff88;border:1px solid rgba(0,255,136,0.3)}
    .expand-row{background:var(--abyss);border-bottom:1px solid var(--border-rune)}
    .spectator-feed{padding:16px;display:grid;grid-template-columns:1fr 1fr;gap:12px}
    .feed-panel{background:var(--stone);border:1px solid var(--border-oracle);border-radius:4px;padding:12px}
    .feed-title{font-family:'Share Tech Mono',monospace;font-size:12px;color:var(--oracle-blue);letter-spacing:2px;margin-bottom:8px}
    .feed-text{font-family:'IM Fell English',serif;font-size:14px;color:var(--parchment-dim);font-style:italic;line-height:1.6}
    .live-dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:#ff4444;box-shadow:0 0 6px #ff4444;animation:oraclePulse 1s infinite;margin-right:6px}
    .leaderboard-row{display:flex;align-items:center;gap:16px;padding:12px 16px;border-bottom:1px solid rgba(200,146,10,0.06);transition:background 0.2s}
    .leaderboard-row:hover{background:rgba(200,146,10,0.04)}
    .activity-item{display:flex;align-items:flex-start;gap:12px;padding:10px 0;border-bottom:1px solid rgba(200,146,10,0.06)}
    .alert-panel{background:rgba(204,34,0,0.08);border:1px solid rgba(204,34,0,0.3);border-radius:4px;padding:16px;margin-bottom:12px}

    /* ─── MODALS ─── */
    .modal-overlay{position:fixed;inset:0;z-index:1000;background:rgba(4,5,10,0.85);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:16px}
    .modal-glass{background:rgba(14,20,32,0.97);border:1px solid var(--rune-gold);box-shadow:0 0 60px rgba(200,146,10,0.2);border-radius:6px;padding:32px;max-width:500px;width:100%;position:relative;overflow:hidden}
    .modal-glass::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,var(--rune-gold),transparent)}
    .modal-title{font-family:'Cinzel Decorative',serif;font-size:19px;color:var(--rune-gold);margin-bottom:6px;animation:goldPulse 3s infinite}
    .modal-subtitle{font-family:'IM Fell English',serif;font-size:15px;color:var(--parchment-dim);font-style:italic;margin-bottom:24px}
    .modal-danger{border-color:var(--blood-red);box-shadow:0 0 60px rgba(204,34,0,0.3)}
    .modal-danger::before{background:linear-gradient(90deg,transparent,var(--blood-red),transparent)}
    .live-screen-modal{width:90%;max-width:800px;height:80vh;max-height:600px;padding:0;display:flex;flex-direction:column}

    /* ─── DISCIPLINARY ─── */
    .disciplinary-layout{display:grid;grid-template-columns:280px 1fr;gap:24px}
    .team-list{display:flex;flex-direction:column;gap:12px;max-height:600px;overflow-y:auto;padding-right:8px}
    .team-card{background:var(--abyss);border:1px solid var(--border-rune);border-radius:4px;padding:14px;cursor:pointer;transition:all 0.3s;position:relative;overflow:hidden}
    .team-card:hover,.team-card.selected{border-color:var(--rune-gold);background:rgba(200,146,10,0.05);transform:translateX(4px)}
    .team-card.selected::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--rune-gold);box-shadow:0 0 10px var(--rune-gold)}

    /* ─── DIFFICULTY ─── */
    .difficulty-pills{display:flex;gap:8px;flex-wrap:wrap}
    .diff-pill{padding:5px 14px;border-radius:20px;cursor:pointer;font-family:'Share Tech Mono',monospace;font-size:12px;letter-spacing:1px;border:1px solid;transition:all 0.3s}
    .diff-novice{border-color:rgba(0,255,136,0.3);color:#00ff88} .diff-novice.active{background:rgba(0,255,136,0.15)}
    .diff-adept{border-color:rgba(255,200,0,0.3);color:#ffc800} .diff-adept.active{background:rgba(255,200,0,0.15)}
    .diff-arcane{border-color:rgba(204,34,0,0.3);color:var(--blood-glow)} .diff-arcane.active{background:rgba(204,34,0,0.15)}
    .drop-zone{border:2px dashed var(--border-rune);border-radius:4px;padding:40px 24px;text-align:center;transition:all 0.3s;cursor:pointer;background:rgba(200,146,10,0.02)}
    .drop-zone:hover,.drop-zone.dragging{border-color:var(--rune-gold);background:rgba(200,146,10,0.06)}

    /* ─── PLAYER ─── */
    .player-shell{min-height:100vh;position:relative;background:var(--void);overflow:hidden}
    .lobby-wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;position:relative;z-index:2;padding:24px}
    .lobby-title{font-family:'Cinzel Decorative',serif;font-size:clamp(28px,6vw,52px);font-weight:900;background:linear-gradient(135deg,var(--rune-gold),var(--rune-gold-glow),var(--rune-amber));background-size:200% auto;-webkit-background-clip:text;-webkit-text-fill-color:transparent;animation:shimmer 3s linear infinite;line-height:1.1;margin-bottom:8px}
    .role-cards{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:32px}
    .role-card{border:1px solid rgba(200,146,10,0.2);border-radius:6px;padding:28px 22px;cursor:pointer;position:relative;overflow:hidden;transition:all 0.4s;background:rgba(8,12,20,0.85);text-align:left}
    .role-card::before{content:'';position:absolute;inset:0;opacity:0;transition:opacity 0.4s}
    .role-card.observer::before{background:radial-gradient(circle at 50% 100%,rgba(0,212,255,0.15),transparent 70%)}
    .role-card.creator::before{background:radial-gradient(circle at 50% 100%,rgba(139,92,246,0.15),transparent 70%)}
    .role-card:hover::before{opacity:1}
    .role-card.observer:hover,.role-card.selected.observer{border-color:var(--oracle-blue);box-shadow:0 0 40px rgba(0,212,255,0.2);transform:translateY(-4px)}
    .role-card.creator:hover,.role-card.selected.creator{border-color:var(--spirit-purple);box-shadow:0 0 40px rgba(139,92,246,0.2);transform:translateY(-4px)}
    .phase-label{font-family:'Share Tech Mono',monospace;font-size:12px;color:var(--oracle-blue);letter-spacing:4px;margin-bottom:8px}
    .phase-title{font-family:'Cinzel Decorative',serif;font-size:clamp(16px,3vw,22px);color:var(--text-bright);margin-bottom:20px}
    .observer-wrap{min-height:calc(100vh - 44px);display:grid;grid-template-columns:1fr 1fr;gap:0;position:relative;z-index:2}
    .observer-image-pane{padding:32px 24px;display:flex;flex-direction:column;border-right:1px solid var(--border-rune);background:rgba(8,12,20,0.6);position:relative;overflow:hidden}
    .observer-input-pane{padding:32px 24px;display:flex;flex-direction:column}
    .target-image-frame{position:relative;border:1px solid var(--border-rune);border-radius:4px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.8);flex:1;min-height:220px;display:flex;align-items:center;justify-content:center;perspective:600px}
    .spell-textarea{flex:1;background:rgba(8,12,20,0.9);border:1px solid var(--border-rune);border-radius:4px;color:var(--text-bright);padding:16px;font-family:'Share Tech Mono',monospace;font-size:14px;line-height:1.7;resize:none;outline:none;transition:border-color 0.3s,box-shadow 0.3s;min-height:220px}
    .spell-textarea:focus{border-color:var(--rune-gold)}
    .spell-textarea.forbidden{border-color:var(--blood-red)!important;animation:screenShake 0.5s ease-out;box-shadow:0 0 20px rgba(204,34,0,0.3)!important}
    .word-rejected-tooltip{position:fixed;top:20px;left:50%;transform:translateX(-50%);background:var(--blood-red);color:#fff;font-family:'Share Tech Mono',monospace;font-size:14px;padding:10px 24px;border-radius:3px;box-shadow:0 0 30px rgba(204,34,0,0.6);animation:toastSlide 2.5s ease-out forwards;z-index:9999;letter-spacing:2px;pointer-events:none;white-space:nowrap}
    .timer-bar{height:3px;background:var(--stone);border-radius:2px;overflow:hidden;margin:8px 0}
    .timer-fill{height:100%;background:linear-gradient(90deg,var(--rune-gold),var(--rune-gold-glow));transition:width 1s linear;box-shadow:0 0 8px var(--rune-gold)}
    .timer-fill.danger{background:linear-gradient(90deg,var(--blood-red),var(--blood-glow));box-shadow:0 0 8px var(--blood-red)}
    .timer-display{font-family:'Cinzel Decorative',serif;font-size:clamp(24px,4vw,36px);color:var(--rune-gold);letter-spacing:4px;text-align:center}
    .timer-display.danger{color:var(--blood-glow);animation:goldPulse 0.5s infinite}
    .transfer-screen{position:fixed;inset:0;z-index:500;background:rgba(4,5,10,0.97);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;text-align:center}
    .transfer-text{font-family:'Cinzel Decorative',serif;font-size:clamp(14px,3vw,20px);color:var(--rune-gold);animation:goldPulse 2s infinite;margin-top:24px;letter-spacing:3px}
    .creator-wrap{min-height:calc(100vh - 44px);display:grid;grid-template-columns:260px 1fr;grid-template-rows:1fr auto;position:relative;z-index:2}
    .transmission-pane{grid-row:1/3;padding:24px 18px;border-right:1px solid var(--border-rune);background:rgba(8,12,20,0.75);overflow-y:auto;position:relative}
    .prompt-box{background:var(--abyss);border:1px solid var(--border-oracle);border-radius:4px;padding:16px;resize:none;color:var(--text-bright);font-family:'Share Tech Mono',monospace;font-size:14px;line-height:1.6;outline:none;width:100%;min-height:140px;transition:border-color 0.3s}
    .prompt-box:focus{border-color:var(--oracle-blue);box-shadow:0 0 20px rgba(0,212,255,0.1)}
    .prompt-box.forbidden{border-color:var(--blood-red)!important;animation:screenShake 0.5s ease-out;box-shadow:0 0 16px rgba(204,34,0,0.3)!important}
    .generate-btn{width:100%;padding:18px;position:relative;overflow:hidden;background:linear-gradient(135deg,rgba(0,153,204,0.3),rgba(0,212,255,0.2));border:1px solid var(--oracle-blue);border-radius:4px;cursor:pointer;color:var(--oracle-blue);font-family:'Cinzel Decorative',serif;font-size:clamp(14px,2.5vw,19px);letter-spacing:3px;transition:all 0.3s;box-shadow:0 0 30px rgba(0,212,255,0.2)}
    .generate-btn:hover{box-shadow:0 0 50px rgba(0,212,255,0.4);transform:scale(1.01)}
    .submit-btn{width:100%;padding:16px;position:relative;overflow:hidden;background:rgba(8,12,20,0.9);border:1px solid var(--spirit-purple);border-radius:4px;cursor:pointer;color:var(--spirit-purple);font-family:'Cinzel Decorative',serif;font-size:clamp(13px,2vw,17px);letter-spacing:3px;transition:all 0.3s}
    .gallery-bar{padding:14px 18px;border-top:1px solid var(--border-rune);display:flex;gap:12px;overflow-x:auto}
    .gallery-item{flex-shrink:0;width:90px;height:68px;background:var(--stone);border:1px solid var(--border-rune);border-radius:3px;overflow:hidden;cursor:pointer;transition:border-color 0.3s;display:flex;align-items:center;justify-content:center;font-size:22px;opacity:0.6}
    .gallery-item:hover{border-color:var(--rune-gold);opacity:1}
    .penalty-overlay{position:fixed;inset:0;z-index:800;mix-blend-mode:overlay;pointer-events:none;background:repeating-linear-gradient(0deg,rgba(255,0,0,0.03) 0px,rgba(255,0,0,0.03) 2px,transparent 2px,transparent 4px);animation:screenShake 0.6s ease-out}
    .penalty-toast{position:fixed;top:0;left:0;right:0;z-index:9000;background:linear-gradient(90deg,var(--blood-red),#ff0000);padding:14px 20px;text-align:center;font-family:'Cinzel',serif;font-size:15px;letter-spacing:2px;color:#fff;animation:toastSlide 4s ease-out forwards;box-shadow:0 4px 40px rgba(255,0,0,0.5)}
    .disqual-screen{position:fixed;inset:0;z-index:9999;background:#0d0000;display:flex;flex-direction:column;align-items:center;justify-content:center;animation:disqualFlash 0.3s ease-out 4;padding:24px;text-align:center}
    .disqual-title{font-family:'Cinzel Decorative',serif;font-size:clamp(36px,8vw,64px);font-weight:900;color:var(--blood-glow);text-shadow:0 0 40px var(--blood-red),0 0 80px var(--blood-red);margin-bottom:16px;animation:goldPulse 1s infinite}
    .results-wrap{min-height:calc(100vh - 44px);display:grid;grid-template-columns:1fr auto 1fr;align-items:stretch;position:relative;z-index:2}
    .result-panel{display:flex;flex-direction:column;padding:32px 24px}
    .result-label{font-family:'Share Tech Mono',monospace;font-size:12px;letter-spacing:3px;margin-bottom:14px;text-transform:uppercase}
    .tab-warning{position:fixed;top:44px;left:0;right:0;z-index:9998;background:var(--blood-red);color:#fff;text-align:center;padding:12px;font-family:'Cinzel',serif;font-size:14px;letter-spacing:2px;animation:toastSlide 5s ease-out forwards}

    /* ─── ORACLE LOCK GAME ─── */
    .oracles-lock{display:flex;flex-direction:column;align-items:center;gap:16px;padding:16px}
    .lock-ring-wrap{position:relative;width:280px;height:280px}
    .lock-ring{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;cursor:pointer;border-radius:50%;transition:filter 0.3s}
    .lock-ring:hover{filter:brightness(1.3)}
    .lock-ring svg{position:absolute;inset:0;width:100%;height:100%;transition:transform 0.6s cubic-bezier(0.34,1.56,0.64,1)}
    .lock-ring.aligned svg{filter:drop-shadow(0 0 12px var(--rune-gold))}

    /* ─── LANDING ─── */
    .landing-wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;position:relative;z-index:2;padding:24px}
    .landing-cards{display:grid;grid-template-columns:1fr 1fr;gap:28px;max-width:700px;width:100%}
    .landing-card{border:1px solid var(--border-rune);border-radius:8px;padding:40px 28px;cursor:pointer;position:relative;overflow:hidden;transition:all 0.4s;background:rgba(8,12,20,0.85);text-align:center}
    .landing-card::before{content:'';position:absolute;inset:0;opacity:0;transition:opacity 0.4s}
    .landing-card.admin-card::before{background:radial-gradient(circle at 50% 0%,rgba(200,146,10,0.12),transparent 70%)}
    .landing-card.player-card::before{background:radial-gradient(circle at 50% 0%,rgba(0,212,255,0.12),transparent 70%)}
    .landing-card:hover::before{opacity:1}
    .landing-card.admin-card:hover{border-color:var(--rune-gold);box-shadow:0 0 60px rgba(200,146,10,0.15);transform:translateY(-6px)}
    .landing-card.player-card:hover{border-color:var(--oracle-blue);box-shadow:0 0 60px rgba(0,212,255,0.15);transform:translateY(-6px)}

    /* ─── VICTORY ─── */
    .victory-wrap{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px;position:relative;z-index:2}
    .winner-card{border:1px solid var(--rune-gold);border-radius:6px;padding:22px;background:rgba(8,12,20,0.9);animation:victoryGlow 2s infinite}
    .winner-card.gold{border-color:var(--rune-gold)}
    .winner-card.silver{border-color:#a8a8a8}
    .winner-card.bronze{border-color:#8b6533}

    /* ─── PLAYER SWAP CONFIRMATION ─── */
    .swap-gate{position:fixed;inset:0;z-index:600;background:rgba(4,5,10,0.96);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px;text-align:center}
    .swap-gate-title{font-family:'Cinzel Decorative',serif;font-size:clamp(22px,5vw,36px);color:var(--oracle-blue);margin-bottom:16px;animation:goldPulse 2s infinite}
    .pin-dots{display:flex;gap:16px;margin:24px 0}
    .pin-dot{width:18px;height:18px;border-radius:50%;border:2px solid var(--border-rune);transition:all 0.2s}
    .pin-dot.filled{background:var(--rune-gold);border-color:var(--rune-gold);box-shadow:0 0 12px var(--rune-gold)}
    .pin-keys{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;max-width:280px;width:100%}
    .pin-key{background:rgba(8,12,20,0.9);border:1px solid var(--border-rune);border-radius:4px;padding:16px;font-family:'Cinzel Decorative',serif;font-size:20px;color:var(--text-bright);cursor:pointer;transition:all 0.2s;text-align:center}
    .pin-key:hover{border-color:var(--rune-gold);color:var(--rune-gold);background:rgba(200,146,10,0.08)}
    .pin-key:active{transform:scale(0.95)}

    /* ─── RESPONSIVE — TABLET (≤900px) ─── */
    @media (max-width:900px){
      :root{--nav-w:0px}
      .admin-nav{transform:translateX(-100%)}
      .admin-nav.open{transform:translateX(0);width:260px}
      .admin-main{margin-left:0!important;padding:0 16px 24px}
      .nav-overlay.open{display:block}
      .nav-toggle{display:block}
      .top-bar{padding:0 14px}
      .grid-2{grid-template-columns:1fr}
      .grid-3{grid-template-columns:1fr 1fr}
      .disciplinary-layout{grid-template-columns:1fr}
      .spectator-feed{grid-template-columns:1fr}
    }

    /* ─── RESPONSIVE — MOBILE (≤600px) ─── */
    @media (max-width:600px){
      .observer-wrap{grid-template-columns:1fr;grid-template-rows:auto auto}
      .observer-image-pane{border-right:none;border-bottom:1px solid var(--border-rune);padding:20px 16px}
      .observer-input-pane{padding:20px 16px}
      .creator-wrap{grid-template-columns:1fr;grid-template-rows:auto 1fr auto}
      .transmission-pane{grid-row:auto;border-right:none;border-bottom:1px solid var(--border-rune);padding:16px;max-height:220px}
      .results-wrap{grid-template-columns:1fr;grid-template-rows:1fr auto 1fr}
      .result-panel{padding:20px 16px}
      .role-cards{grid-template-columns:1fr}
      .landing-cards{grid-template-columns:1fr}
      .grid-2{grid-template-columns:1fr}
      .grid-3{grid-template-columns:1fr}
      .landing-card{padding:28px 20px}
      .card{padding:16px}
      .stat-value{font-size:22px}
      .data-table th,.data-table td{padding:8px 8px;font-size:11px}
      .btn{font-size:11px;padding:8px 14px;letter-spacing:1px}
      .nav-section-title{font-size:10px;padding:12px 14px 6px}
      .nav-item{font-size:12px;padding:10px 14px}
      .lock-ring-wrap{width:220px;height:220px}
      .top-bar{height:auto;min-height:44px;padding:8px 14px}
      .admin-main{padding:0 12px 20px}
    }
  `}</style>
);

// ─── BACKGROUND ───────────────────────────────────────────────────────────────
const BackgroundWrapper = ({ bgIndex }) => {
  const [activeBg, setActiveBg] = useState(bgIndex !== undefined ? bgIndex : 0);
  useEffect(() => {
    if (bgIndex !== undefined) { setActiveBg(bgIndex); return; }
    const t = setInterval(() => setActiveBg(a => (a + 1) % BG_IMAGES.length), 14000);
    return () => clearInterval(t);
  }, [bgIndex]);
  return (
    <div className="immersive-bg">
      {BG_IMAGES.map((src, i) => (
        <div key={i} className={`bg-layer ${i === activeBg ? "active" : ""} ${["pan-a","pan-b","pan-c","pan-a","pan-b"][i]}`}
          style={{ backgroundImage: `url(${src})` }} />
      ))}
      <div className="bg-overlay" />
    </div>
  );
};

// ─── PARTICLES ────────────────────────────────────────────────────────────────
const ParticleCanvas = () => {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    const particles = Array.from({ length: 80 }, () => ({
      x: Math.random() * canvas.width, y: Math.random() * canvas.height,
      r: Math.random() * 1.5 + 0.3, dx: (Math.random() - 0.5) * 0.3,
      dy: -Math.random() * 0.4 - 0.1, opacity: Math.random() * 0.6 + 0.2,
    }));
    let raf;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p) => {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(200,146,10,${p.opacity})`; ctx.fill();
        p.x += p.dx; p.y += p.dy;
        if (p.y < -5) { p.y = canvas.height + 5; p.x = Math.random() * canvas.width; }
        if (p.x < -5 || p.x > canvas.width + 5) p.dx *= -1;
      });
      raf = requestAnimationFrame(draw);
    };
    draw();
    window.addEventListener("resize", resize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={canvasRef} className="particle-canvas" />;
};

const SceneWrapper = ({ children, bgIndex }) => (
  <>
    <BackgroundWrapper bgIndex={bgIndex} />
    <ParticleCanvas />
    <div className="grid-bg" />
    <div className="bg-runes">
      {["ᚠ","ᚢ","ᚦ","ᚨ","ᚱ","ᚲ","ᚷ","ᚹ"].map((r,i)=>(
        <span key={i} className="bg-rune" style={{left:`${[5,15,30,50,65,75,85,95][i]}%`,top:`${[10,60,20,80,30,70,15,50][i]}%`,animationDelay:`${i*0.8}s`,animationDuration:`${5+i}s`}}>{r}</span>
      ))}
    </div>
    {children}
  </>
);

// ─── LANDING PAGE ─────────────────────────────────────────────────────────────
const LandingPage = ({ onSelect }) => (
  <div className="landing-wrap">
    <div style={{textAlign:"center",maxWidth:800,width:"100%",animation:"fadeInUp 0.8s ease-out"}}>
      <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:13,color:"var(--oracle-blue)",letterSpacing:4,marginBottom:16}}>⬡ THE ANCIENT ORACLE AWAITS ⬡</div>
      <div className="lobby-title" style={{marginBottom:12}}>MayaVyuh</div>
      <div style={{fontFamily:"'IM Fell English',serif",fontSize:19,color:"var(--parchment-dim)",fontStyle:"italic",marginBottom:48,letterSpacing:2}}>The Prompt War — Enter Your Sanctum</div>
      <div className="landing-cards">
        <div className="landing-card admin-card section-bg bg-scroll" onClick={()=>onSelect("admin")}>
          <div style={{fontSize:52,marginBottom:18}}>👑</div>
          <div style={{fontFamily:"'Cinzel Decorative',serif",fontSize:20,color:"var(--rune-gold)",marginBottom:12,animation:"goldPulse 3s infinite"}}>Admin Sanctum</div>
          <p style={{fontFamily:"'IM Fell English',serif",color:"var(--parchment-dim)",fontStyle:"italic",lineHeight:1.6,marginBottom:20}}>"Command the labyrinth. Observe all. Cast judgment upon the worthy and the fallen."</p>
          <button className="btn btn-gold" style={{width:"100%",justifyContent:"center"}}>Enter as Admin →</button>
        </div>
        <div className="landing-card player-card section-bg bg-temple" onClick={()=>onSelect("player")}>
          <div style={{fontSize:52,marginBottom:18}}>⚔️</div>
          <div style={{fontFamily:"'Cinzel Decorative',serif",fontSize:20,color:"var(--oracle-blue)",marginBottom:12}}>Player Portal</div>
          <p style={{fontFamily:"'IM Fell English',serif",color:"var(--parchment-dim)",fontStyle:"italic",lineHeight:1.6,marginBottom:20}}>"Register your team, receive your role, and enter the ancient trial of vision and creation."</p>
          <button className="btn btn-oracle" style={{width:"100%",justifyContent:"center"}}>Enter as Player →</button>
        </div>
      </div>
    </div>
  </div>
);

// ─── ORACLE'S LOCK GAME ───────────────────────────────────────────────────────
const RUNE_SYMBOLS = ["ᚠ","ᚢ","ᚦ","ᚨ","ᚱ","ᚲ","ᚷ","ᚹ","ᚺ","ᚾ","ᛁ","ᛃ"];
const RING_COUNT = 3;
const SLOTS_PER_RING = [8, 6, 4];

const OraclesLockGame = ({ onWin }) => {
  const [rings, setRings] = useState(() =>
    Array.from({ length: RING_COUNT }, (_, ri) => ({
      runes: Array.from({ length: SLOTS_PER_RING[ri] }, () => Math.floor(Math.random() * RUNE_SYMBOLS.length)),
      rotation: Math.floor(Math.random() * SLOTS_PER_RING[ri]) + 1,
    }))
  );
  const [score, setScore] = useState(0);
  const [won, setWon] = useState(false);

  const allAligned = rings.every((r, i) => r.rotation % SLOTS_PER_RING[i] === 0);
  useEffect(() => {
    if (allAligned && !won) { setWon(true); setScore(s => s + 100); onWin?.(); }
  }, [allAligned, won, onWin]);

  const rotateRing = (ri, dir = 1) => {
    if (won) return;
    setRings(prev => prev.map((r, i) => {
      if (i !== ri) return r;
      const slots = SLOTS_PER_RING[i];
      return { ...r, rotation: ((r.rotation + dir) % slots + slots) % slots };
    }));
    setScore(s => s + 5);
  };

  const reset = () => {
    setRings(Array.from({ length: RING_COUNT }, (_, ri) => ({
      runes: Array.from({ length: SLOTS_PER_RING[ri] }, () => Math.floor(Math.random() * RUNE_SYMBOLS.length)),
      rotation: Math.floor(Math.random() * SLOTS_PER_RING[ri]) + 1,
    })));
    setWon(false);
  };

  const sizes = [260, 180, 100];
  const radii = [120, 80, 40];

  return (
    <div className="oracles-lock">
      <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:12,color:"var(--oracle-blue)",letterSpacing:2,marginBottom:4}}>ORACLE'S LOCK · SCORE: {score}</div>
      <div style={{fontFamily:"'IM Fell English',serif",fontSize:12,color:"var(--parchment-dim)",fontStyle:"italic",marginBottom:8,textAlign:"center"}}>"Align all runes to the apex ↑ — click a ring to rotate"</div>
      <div className="lock-ring-wrap" style={{width:280,height:280,margin:"0 auto"}}>
        {rings.map((ring, ri) => {
          const size = sizes[ri];
          const radius = radii[ri];
          const slots = SLOTS_PER_RING[ri];
          const aligned = ring.rotation % slots === 0;
          return (
            <div key={ri} className={`lock-ring ${aligned ? "aligned" : ""}`}
              style={{width:size,height:size,top:(280-size)/2,left:(280-size)/2,position:"absolute"}}
              onClick={() => rotateRing(ri)}>
              <svg viewBox={`0 0 ${size} ${size}`}
                style={{transform:`rotate(${(ring.rotation/slots)*360}deg)`,width:size,height:size}}>
                <circle cx={size/2} cy={size/2} r={radius} fill="none"
                  stroke={aligned?"var(--rune-gold)":"rgba(200,146,10,0.25)"}
                  strokeWidth="18" strokeDasharray="4 3"/>
                {ring.runes.map((runeIdx, si) => {
                  const angle = (si / slots) * 2 * Math.PI - Math.PI/2;
                  const x = size/2 + radius * Math.cos(angle);
                  const y = size/2 + radius * Math.sin(angle);
                  return (
                    <text key={si} x={x} y={y} textAnchor="middle" dominantBaseline="central"
                      fontSize={si === 0 ? 16 : 12}
                      fill={si === 0 ? (aligned ? "var(--rune-gold)" : "var(--oracle-blue)") : "rgba(200,146,10,0.45)"}
                      style={{fontFamily:"serif"}}>
                      {RUNE_SYMBOLS[runeIdx]}
                    </text>
                  );
                })}
              </svg>
            </div>
          );
        })}
        <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",width:30,height:30,borderRadius:"50%",background:allAligned?"var(--rune-gold)":"rgba(200,146,10,0.2)",border:"1px solid var(--rune-gold)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,transition:"all 0.3s"}}>
          {allAligned ? "★" : "◉"}
        </div>
        <div style={{position:"absolute",top:4,left:"50%",transform:"translateX(-50%)",width:4,height:14,background:"var(--rune-gold)",borderRadius:2,boxShadow:"0 0 8px var(--rune-gold)"}}/>
        {won && (
          <div style={{position:"absolute",inset:0,borderRadius:"50%",background:"rgba(8,12,20,0.9)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:8,animation:"fadeInUp 0.5s ease-out"}}>
            <div style={{fontSize:32}}>✨</div>
            <div style={{fontFamily:"'Cinzel Decorative',serif",fontSize:13,color:"var(--rune-gold)",animation:"goldPulse 1s infinite"}}>ALIGNED!</div>
          </div>
        )}
      </div>
      <div style={{display:"flex",gap:10,marginTop:8,justifyContent:"center",flexWrap:"wrap"}}>
        {rings.map((_,ri)=>(
          <div key={ri} style={{display:"flex",gap:6}}>
            <button className="btn btn-ghost" style={{padding:"3px 9px",fontSize:10}} onClick={()=>rotateRing(ri,-1)}>R{ri+1} ↺</button>
            <button className="btn btn-ghost" style={{padding:"3px 9px",fontSize:10}} onClick={()=>rotateRing(ri,1)}>R{ri+1} ↻</button>
          </div>
        ))}
      </div>
      {won && <button className="btn btn-gold" style={{marginTop:8,fontSize:11}} onClick={reset}>🔒 New Lock</button>}
    </div>
  );
};

// ─── ADMIN NAV (with mobile hamburger) ───────────────────────────────────────
const AdminNav = ({ activeView, setActiveView, pendingCount, isOpen, setIsOpen }) => {
  const navItems = [
    {id:"arsenal",icon:"⚗️",label:"Arsenal & Spell Book",section:"command"},
    {id:"roster",icon:"📜",label:"The Roster",section:"command"},
    {id:"disciplinary",icon:"⚖️",label:"Disciplinary Suite",section:"command"},
    {id:"leaderboard",icon:"🏆",label:"Hall of Champions",section:"intel"},
    {id:"activity",icon:"🔮",label:"Activity Oracle",section:"intel"},
    {id:"alerts",icon:"🚨",label:"Security Alerts",section:"system"},
    {id:"settings",icon:"⚙️",label:"Oracle Config",section:"system"},
  ];
  const handleClick = (id) => { setActiveView(id); setIsOpen(false); };
  return (
    <>
      <div className={`nav-overlay ${isOpen?"open":""}`} onClick={()=>setIsOpen(false)}/>
      <nav className={`admin-nav ${isOpen?"open":""}`}>
        <div className="nav-logo"><h1>MAYA<br/>VYUH</h1><p>⬡ Admin Sanctum ⬡</p></div>
        <div className="nav-items">
          {["command","intel","system"].map(sec=>(
            <div key={sec}>
              <div className="nav-section-title">{{command:"Command",intel:"Intelligence",system:"System"}[sec]}</div>
              {navItems.filter(n=>n.section===sec).map(item=>(
                <div key={item.id} className={`nav-item ${activeView===item.id?"active":""}`} onClick={()=>handleClick(item.id)}>
                  <span style={{fontSize:17,width:20,textAlign:"center"}}>{item.icon}</span>
                  <span>{item.label}</span>
                  {item.id==="roster"&&pendingCount>0&&(
                    <span style={{marginLeft:"auto",background:"rgba(255,200,0,0.2)",color:"#ffc800",border:"1px solid rgba(255,200,0,0.4)",borderRadius:10,padding:"1px 7px",fontSize:11,fontFamily:"'Share Tech Mono',monospace"}}>{pendingCount}</span>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="nav-footer"><div className="system-status"><span className="status-dot"/><span>ORACLE NETWORK LIVE</span></div></div>
      </nav>
    </>
  );
};

// ─── ARSENAL VIEW ─────────────────────────────────────────────────────────────
const ArsenalView = ({ globalTags, addForbiddenWord, removeForbiddenWord, timers, updateTimers, eventState, setEventState }) => {
  const [tagInput,setTagInput]=useState("");
  const [dragging,setDragging]=useState(false);
  const [difficulty,setDifficulty]=useState("adept");
  const [uploadedImage,setUploadedImage]=useState(null);

  const handleAddTag=(e)=>{ if(e.key==="Enter"&&tagInput.trim()){ addForbiddenWord(tagInput.trim().toLowerCase()); setTagInput(""); } };
  const handleTimerChange=(round,type,value)=>{
    const current=timers[round]||300;
    let m=Math.floor(current/60), s=current%60;
    const v=Math.max(0,parseInt(value)||0);
    if(type==="min") m=v;
    if(type==="sec") s=Math.min(59,v);
    updateTimers(round, m*60+s);
  };

  return (
    <div style={{animation:"fadeInUp 0.5s ease-out"}}>
      <div className="page-header"><div className="breadcrumb">ADMIN › ARSENAL</div><h2>The Arsenal & Spell Book</h2><p>"Configure the trial — forge the vision, seal the forbidden lexicon"</p></div>
      <div className="grid-2" style={{marginBottom:20}}>
        <div className="card section-bg bg-scroll">
          <div className="card-title">⚡ Target Vision</div>
          <div className={`drop-zone ${dragging?"dragging":""}`}
            onDragOver={e=>{e.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)}
            onDrop={e=>{e.preventDefault();setDragging(false);const f=e.dataTransfer.files[0];if(f&&f.type.startsWith("image/"))setUploadedImage(URL.createObjectURL(f));}}
            onClick={()=>document.getElementById("fInput").click()}>
            <input id="fInput" type="file" accept="image/*" style={{display:"none"}} onChange={e=>{const f=e.target.files[0];if(f)setUploadedImage(URL.createObjectURL(f));}}/>
            {uploadedImage?<img src={uploadedImage} alt="target" style={{maxWidth:"100%",maxHeight:200,objectFit:"contain",borderRadius:4}}/>:<>
              <div style={{fontSize:38,marginBottom:10,opacity:0.6}}>🗺️</div>
              <p style={{fontFamily:"'IM Fell English',serif",color:"var(--parchment-dim)",fontSize:16,fontStyle:"italic"}}>Cast your vision here</p>
              <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:12,color:"var(--rune-gold)",letterSpacing:2,display:"block",marginTop:8}}>DROP IMAGE OR CLICK TO INVOKE</span>
            </>}
          </div>
          <div style={{marginTop:14}}>
            <div className="form-label">Difficulty Tier</div>
            <div className="difficulty-pills">{["novice","adept","arcane"].map(d=><span key={d} className={`diff-pill diff-${d} ${difficulty===d?"active":""}`} onClick={()=>setDifficulty(d)}>{d.toUpperCase()}</span>)}</div>
          </div>
        </div>
        <div className="card section-bg bg-map">
          <div className="card-title">🚫 Forbidden Lexicon</div>
          <p style={{fontFamily:"'IM Fell English',serif",color:"var(--parchment-dim)",fontSize:15,fontStyle:"italic",marginBottom:14}}>"Words that must never pass the Observer's lips..."</p>
          <div className="tag-input-wrap">
            {globalTags.map((t,i)=><span key={i} className="tag">{t}<span className="tag-remove" onClick={()=>removeForbiddenWord(t)}>✕</span></span>)}
            <div style={{display:"flex",gap:8,flex:1}}>
              <input className="tag-input" value={tagInput} onChange={e=>setTagInput(e.target.value)} onKeyDown={handleAddTag} placeholder="Type word + Enter..."/>
              <button className="btn btn-ghost" style={{padding:"4px 10px",fontSize:12}} onClick={()=>{if(tagInput.trim()){addForbiddenWord(tagInput.trim().toLowerCase());setTagInput("");}}}> ➕</button>
            </div>
          </div>
          <p style={{fontFamily:"'Share Tech Mono',monospace",fontSize:12,color:"var(--parchment-dim)",marginTop:10}}>{globalTags.length} FORBIDDEN WORDS SEALED</p>
        </div>
      </div>
      <div className="card section-bg bg-dark">
        <div className="card-title">⚙️ Round Timer Configuration</div>
        <div className="grid-3">
          {["round1","round2","round3","discussion","swap"].map((round,idx)=>{
            const total=timers[round]||60, m=Math.floor(total/60), s=total%60;
            const labels=["Round 1","Round 2","Round 3","Discussion","Swap Interval"];
            return (
              <div className="form-group" key={round}>
                <label className="form-label">{labels[idx]}</label>
                <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                  <input className="form-input" type="number" min="0" value={m} onChange={e=>handleTimerChange(round,"min",e.target.value)} style={{width:60,flexShrink:0}} title="Minutes"/>
                  <span style={{color:"var(--parchment-dim)",fontFamily:"'Share Tech Mono',monospace",fontSize:11}}>M</span>
                  <input className="form-input" type="number" min="0" max="59" value={s} onChange={e=>handleTimerChange(round,"sec",e.target.value)} style={{width:60,flexShrink:0}} title="Seconds"/>
                  <span style={{color:"var(--parchment-dim)",fontFamily:"'Share Tech Mono',monospace",fontSize:11}}>S</span>
                </div>
                <div style={{display:"flex",gap:5,marginTop:5}}>
                  {[[60,"1M"],[300,"5M"],[600,"10M"]].map(([v,l])=><button key={l} className="btn btn-ghost" style={{padding:"2px 7px",fontSize:10}} onClick={()=>updateTimers(round,v)}>{l}</button>)}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{display:"flex",gap:12,marginTop:8,alignItems:"center",flexWrap:"wrap"}}>
          <button className="btn btn-gold" onClick={()=>{ setEventState(prev=>({...prev,started:true})); broadcastEvent("EVENT_STARTED",{timers}); }}>
            {eventState.started ? "🔄 Restart Event" : "⚡ Start Event"}
          </button>
          {eventState.started&&<span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:12,color:"#00ff88"}}>✓ EVENT IS LIVE</span>}
        </div>
      </div>
    </div>
  );
};

// ─── ROSTER VIEW ──────────────────────────────────────────────────────────────
const RosterView = ({ teams, setTeams, onLiveScreen, addAlert }) => {
  const [expanded,setExpanded]=useState(null);
  const fmt=(secs)=>{ if(secs==null)return"—"; const m=Math.floor(secs/60),s=secs%60; return`${m}:${s.toString().padStart(2,"0")}`; };

  const approve=(team)=>{
    setTeams(prev=>prev.map(t=>t.id===team.id?{...t,status:"approved"}:t));
    broadcastEvent("TEAM_APPROVED",{teamId:team.id});
    addAlert({type:"APPROVAL",team:team.name,message:`Team ${team.name} approved to enter the labyrinth.`,time:new Date().toLocaleTimeString()});
  };

  return (
    <div style={{animation:"fadeInUp 0.5s ease-out"}}>
      <div className="page-header"><div className="breadcrumb">ADMIN › ROSTER</div><h2>The Roster</h2><p>"All who enter the labyrinth are watched by the eternal eye"</p></div>
      {teams.filter(t=>t.status==="pending").length>0&&(
        <div style={{background:"rgba(255,200,0,0.05)",border:"1px solid rgba(255,200,0,0.3)",borderRadius:4,padding:14,marginBottom:18,fontFamily:"'Share Tech Mono',monospace",fontSize:12,color:"#ffc800",letterSpacing:2}}>
          🕯️ {teams.filter(t=>t.status==="pending").length} TEAM(S) AWAITING APPROVAL
        </div>
      )}
      <div className="card section-bg bg-temple">
        <div style={{overflowX:"auto"}}>
          <table className="data-table">
            <thead><tr><th>⬡ Team</th><th>Observer · Creator</th><th>Round</th><th>Time Left</th><th>Score</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {teams.map(team=>(
                <React.Fragment key={team.id}>
                  <tr className={`team-row ${expanded===team.id?"expanded":""}`} onClick={()=>setExpanded(expanded===team.id?null:team.id)}>
                    <td><span style={{color:"var(--rune-gold)"}}>{team.name}</span></td>
                    <td><span style={{fontSize:12,color:"var(--parchment-dim)"}}>{team.observer||"—"} · {team.creator||"—"}</span></td>
                    <td><span style={{color:"var(--oracle-blue)",fontSize:13}}>R{team.round||0}</span></td>
                    <td><span style={{color:"#ffc800",fontSize:13}}>{fmt(team.timeLeft)}</span></td>
                    <td><span style={{color:"var(--spirit-purple)"}}>{team.score||0}%</span></td>
                    <td><span className={`status-badge badge-${team.status==="active"?"active":team.status==="penalized"?"penalized":team.status==="banned"?"banned":team.status==="approved"?"approved":"pending"}`}>●{(team.status||"pending").toUpperCase()}</span></td>
                    <td onClick={e=>e.stopPropagation()}>
                      <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                        {team.status==="pending"&&<button className="btn btn-approve" style={{padding:"4px 9px",fontSize:10}} onClick={()=>approve(team)}>✓ APPROVE</button>}
                        <button className="btn btn-oracle" style={{padding:"4px 9px",fontSize:10}} onClick={()=>onLiveScreen(team)}>👁 VIEW</button>
                      </div>
                    </td>
                  </tr>
                  {expanded===team.id&&(
                    <tr className="expand-row" key={`${team.id}-ex`}><td colSpan={7}>
                      <div className="spectator-feed">
                        <div className="feed-panel"><div className="feed-title"><span className="live-dot"/>OBSERVER</div><p className="feed-text">{team.observerText||"No transmission yet."}</p></div>
                        <div className="feed-panel"><div className="feed-title"><span className="live-dot"/>CREATOR</div><p className="feed-text">{team.creatorText||"Awaiting Creator..."}</p></div>
                      </div>
                    </td></tr>
                  )}
                </React.Fragment>
              ))}
              {teams.length===0&&<tr><td colSpan={7} style={{textAlign:"center",padding:40,fontFamily:"'IM Fell English',serif",color:"var(--parchment-dim)",fontStyle:"italic"}}>No teams have registered yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ─── LIVE SCREEN MODAL ────────────────────────────────────────────────────────
const LiveScreenModal = ({ team, onClose }) => (
  <div className="modal-overlay" onClick={onClose}>
    <div className="modal-glass live-screen-modal" onClick={e=>e.stopPropagation()}>
      <div style={{padding:"20px 28px",borderBottom:"1px solid var(--border-rune)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div>
          <div className="modal-title" style={{margin:0}}>👁️ Oracle View — {team.name}</div>
          <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:13,color:"var(--oracle-blue)",marginTop:4}}>Live feed · Round {team.round||0} · {(team.status||"pending").toUpperCase()}</div>
        </div>
        <button className="btn btn-ghost" style={{padding:"6px 12px"}} onClick={onClose}>CLOSE</button>
      </div>
      <div style={{flex:1,padding:24,background:"rgba(0,0,0,0.4)",overflowY:"auto",display:"flex",flexDirection:"column",gap:16}}>
        <div>
          <div className="phase-label">OBSERVER TRANSMISSION</div>
          <div style={{fontFamily:"'IM Fell English',serif",color:"var(--parchment-dim)",fontStyle:"italic",lineHeight:1.7,padding:16,background:"rgba(0,212,255,0.05)",border:"1px solid var(--border-oracle)",borderRadius:4,minHeight:60}}>
            {team.observerText||"Observer has not started transmitting..."}
          </div>
        </div>
        <div>
          <div className="phase-label">CREATOR PROMPT</div>
          <textarea readOnly className="prompt-box" style={{height:100,opacity:0.85}} value={team.creatorText||""}/>
        </div>
        <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:12,color:"var(--parchment-dim)"}}>
          Score: <span style={{color:"var(--oracle-blue)"}}>{team.score||0}%</span>
        </div>
      </div>
    </div>
  </div>
);

// ─── DISCIPLINARY SUITE ───────────────────────────────────────────────────────
const DisciplinarySuite = ({ teams, setTeams, addAlert }) => {
  const [selected,setSelected]=useState(null);
  const [penaltyType,setPenaltyType]=useState("time_reduction");
  const [reason,setReason]=useState("");
  const [banTarget,setBanTarget]=useState(null);

  const handlePenalize=()=>{
    if(!selected)return;
    setTeams(prev=>prev.map(t=>t.id===selected.id?{...t,status:"penalized",timeLeft:Math.max(0,(t.timeLeft||0)-30)}:t));
    broadcastEvent("PENALTY_CAST",{teamId:selected.id,type:penaltyType,reason});
    addAlert({type:"PENALTY",team:selected.name,message:`Penalty (${penaltyType}): ${reason||"No reason"}`,time:new Date().toLocaleTimeString()});
    setReason("");
  };

  const handleBan=()=>{
    if(!banTarget)return;
    setTeams(prev=>prev.map(t=>t.id===banTarget.id?{...t,status:"banned"}:t));
    broadcastEvent("TEAM_BANNED",{teamId:banTarget.id});
    addAlert({type:"BAN",team:banTarget.name,message:`Team permanently disqualified.`,time:new Date().toLocaleTimeString()});
    setBanTarget(null);setSelected(null);
  };

  return (
    <div style={{animation:"fadeInUp 0.5s ease-out"}}>
      <div className="page-header"><div className="breadcrumb">ADMIN › DISCIPLINARY</div><h2>Disciplinary Suite</h2><p>"Select a team — then cast your judgment"</p></div>
      <div className="disciplinary-layout">
        <div className="team-list card section-bg bg-scroll" style={{padding:16}}>
          <div className="card-title" style={{marginBottom:12}}>SELECT TEAM</div>
          {teams.length===0&&<p style={{fontFamily:"'IM Fell English',serif",color:"var(--parchment-dim)",fontStyle:"italic",fontSize:14}}>No teams registered.</p>}
          {teams.map(t=>(
            <div key={t.id} className={`team-card ${selected?.id===t.id?"selected":""}`} onClick={()=>setSelected(t)}>
              <div style={{fontFamily:"'Cinzel',serif",fontSize:15,color:"var(--rune-gold)"}}>{t.name}</div>
              <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:12,color:"var(--parchment-dim)",marginTop:4}}>{t.observer||"—"} & {t.creator||"—"}</div>
              <span className={`status-badge badge-${t.status==="active"?"active":t.status==="penalized"?"penalized":t.status==="banned"?"banned":"pending"}`} style={{marginTop:6,display:"inline-flex"}}>●{(t.status||"pending").toUpperCase()}</span>
            </div>
          ))}
        </div>
        <div className="card" style={{opacity:selected?1:0.5,pointerEvents:selected?"auto":"none",transition:"opacity 0.3s"}}>
          {selected?(
            <>
              <div className="card-title" style={{color:"var(--blood-red)",borderColor:"rgba(204,34,0,0.3)"}}>⚖️ Judgment on {selected.name}</div>
              <div className="form-group"><label className="form-label">Penalty Type</label>
                <select className="form-select" value={penaltyType} onChange={e=>setPenaltyType(e.target.value)}>
                  <option value="time_reduction">Time Reduction (−30s)</option>
                  <option value="score_deduction">Score Deduction (−10 pts)</option>
                  <option value="round_skip">Round Skip</option>
                  <option value="warning">Official Warning</option>
                </select>
              </div>
              <div className="form-group"><label className="form-label">Reason</label><textarea className="form-textarea" value={reason} onChange={e=>setReason(e.target.value)} placeholder="Describe the transgression..."/></div>
              <div style={{display:"flex",gap:12,justifyContent:"flex-end",marginTop:16,flexWrap:"wrap"}}>
                <button className="btn btn-ghost" onClick={handlePenalize}>⚡ CAST PENALTY</button>
                <button className="btn btn-danger" style={{animation:"banPulse 2s infinite"}} onClick={()=>setBanTarget(selected)}>☠️ BAN HAMMER</button>
              </div>
            </>
          ):(
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100%",opacity:0.4,minHeight:200}}>
              <span style={{fontSize:44,marginBottom:14}}>⚖️</span>
              <p style={{fontFamily:"'IM Fell English',serif",color:"var(--parchment-dim)",fontStyle:"italic"}}>Select a team to cast judgment.</p>
            </div>
          )}
        </div>
      </div>
      {banTarget&&(
        <div className="modal-overlay" onClick={()=>setBanTarget(null)}>
          <div className="modal-glass modal-danger" onClick={e=>e.stopPropagation()}>
            <div className="modal-title" style={{color:"var(--blood-glow)",animation:"none"}}>☠️ THE BAN HAMMER</div>
            <div className="modal-subtitle" style={{color:"rgba(255,100,80,0.6)"}}>"{banTarget?.name} shall be cast from the labyrinth forever."</div>
            <div style={{background:"rgba(204,34,0,0.1)",border:"1px solid rgba(204,34,0,0.3)",borderRadius:4,padding:18,marginBottom:20,textAlign:"center"}}>
              <div style={{fontSize:44,marginBottom:10}}>🔴</div>
              <div style={{fontFamily:"'Cinzel',serif",color:"var(--blood-glow)",fontSize:15,letterSpacing:2}}>DISQUALIFY {banTarget?.name?.toUpperCase()}?</div>
            </div>
            <div style={{display:"flex",gap:12,justifyContent:"flex-end"}}>
              <button className="btn btn-ghost" onClick={()=>setBanTarget(null)}>SPARE THEM</button>
              <button className="btn btn-danger" style={{cursor:"crosshair"}} onClick={handleBan}>☠️ UNLEASH</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── LEADERBOARD + WINNER DECLARATION ────────────────────────────────────────
const LeaderboardView = ({ teams, winners, setWinners }) => {
  const sorted = [...teams].sort((a,b)=>(b.score||0)-(a.score||0));
  const [declaring,setDeclaring]=useState(false);
  const [selected,setSelected]=useState([]);

  const handleDeclare=()=>{
    const win=sorted.filter(t=>selected.includes(t.id)).slice(0,3);
    setWinners(win);
    broadcastEvent("WINNERS_DECLARED",{winners:win});
    setDeclaring(false);
  };

  return (
    <div style={{animation:"fadeInUp 0.5s ease-out"}}>
      <div className="page-header"><div className="breadcrumb">ADMIN › LEADERBOARD</div><h2>Hall of Champions</h2><p>"Only the most precise vision shall be crowned"</p></div>
      <div className="card section-bg bg-warm">
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:10}}>
          <div className="card-title" style={{marginBottom:0,border:"none",padding:0}}>LIVE RANKINGS</div>
          <button className="btn btn-gold" style={{fontSize:11}} onClick={()=>setDeclaring(d=>!d)}>
            {declaring?"Cancel":"🏆 Declare Winners"}
          </button>
        </div>
        {declaring&&(
          <div style={{background:"rgba(200,146,10,0.06)",border:"1px solid var(--border-rune)",borderRadius:4,padding:14,marginBottom:16}}>
            <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:11,color:"var(--rune-gold)",marginBottom:10,letterSpacing:2}}>SELECT UP TO 3 WINNERS</div>
            {sorted.map(t=>(
              <label key={t.id} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 0",borderBottom:"1px solid rgba(200,146,10,0.08)",cursor:"pointer"}}>
                <input type="checkbox" checked={selected.includes(t.id)} onChange={e=>{if(e.target.checked&&selected.length<3)setSelected(s=>[...s,t.id]);else setSelected(s=>s.filter(x=>x!==t.id));}} style={{accentColor:"var(--rune-gold)"}}/>
                <span style={{fontFamily:"'Cinzel',serif",color:"var(--rune-gold)",flex:1}}>{t.name}</span>
                <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:12,color:"var(--spirit-purple)"}}>{t.score||0}%</span>
              </label>
            ))}
            <button className="btn btn-gold" style={{marginTop:12,width:"100%",justifyContent:"center"}} onClick={handleDeclare}>✨ DECLARE WINNERS</button>
          </div>
        )}
        {sorted.map((team,i)=>(
          <div key={team.id} className="leaderboard-row">
            <div style={{fontFamily:"'Cinzel Decorative',serif",fontSize:20,color:["var(--rune-gold)","#a8a8a8","#8b6533","var(--parchment-dim)"][i]??`var(--parchment-dim)`,width:32,textAlign:"center"}}>{i+1}</div>
            <div><div style={{color:"var(--text-bright)",fontFamily:"'Cinzel',serif",fontSize:15}}>{team.name}</div><div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:12,color:"var(--parchment-dim)",marginTop:4}}>{team.observer||"—"} & {team.creator||"—"} · R{team.round||0}</div></div>
            <div style={{marginLeft:"auto",fontFamily:"'Cinzel Decorative',serif",fontSize:20,color:"var(--oracle-blue)"}}>{team.score||0}%</div>
          </div>
        ))}
        {sorted.length===0&&<p style={{fontFamily:"'IM Fell English',serif",color:"var(--parchment-dim)",fontStyle:"italic",textAlign:"center",padding:28}}>No results yet. The labyrinth awaits.</p>}
      </div>
    </div>
  );
};

// ─── ADMIN DASHBOARD ──────────────────────────────────────────────────────────
const AdminDashboard = ({ alerts, setAlerts, teams, setTeams, forbiddenWords, addForbiddenWord, removeForbiddenWord, timers, updateTimers, winners, setWinners, eventState, setEventState }) => {
  const [activeView,setActiveView]=useState("arsenal");
  const [liveTarget,setLiveTarget]=useState(null);
  const [navOpen,setNavOpen]=useState(false);

  const addAlert=useCallback(a=>setAlerts(prev=>[a,...prev]),[setAlerts]);
  const pendingCount=teams.filter(t=>t.status==="pending").length;

  return (
    <div className="app-shell">
      <AdminNav activeView={activeView} setActiveView={setActiveView} pendingCount={pendingCount} isOpen={navOpen} setIsOpen={setNavOpen}/>
      <div className="admin-main">
        <div className="top-bar">
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <button className="nav-toggle" onClick={()=>setNavOpen(o=>!o)}>☰</button>
            <div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:12,color:"var(--parchment-dim)"}}>⬡ MAYAVYUH · <span id="admin-clock">{new Date().toLocaleTimeString()}</span></div>
          </div>
          <div style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
            {alerts.length>0&&<span style={{background:"rgba(204,34,0,0.2)",border:"1px solid rgba(204,34,0,0.4)",color:"var(--blood-glow)",padding:"3px 9px",borderRadius:2,fontFamily:"'Share Tech Mono',monospace",fontSize:12,animation:"banPulse 2s infinite"}}>🚨 {alerts.length}</span>}
            <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:12,color:"#00ff88"}}>■ {teams.filter(t=>t.status==="active").length} ACTIVE</span>
            <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:12,color:"#ffc800"}}>■ {pendingCount} PENDING</span>
            <span style={{fontFamily:"'Share Tech Mono',monospace",fontSize:12,color:"var(--blood-glow)"}}>■ {teams.filter(t=>t.status==="banned").length} BANNED</span>
          </div>
        </div>
        <div style={{paddingTop:20}}>
          <div className="grid-3" style={{marginBottom:20}}>
            <div className="stat-card"><div className="stat-value">{teams.length}</div><div className="stat-label">Teams Registered</div><div className="stat-icon">👥</div></div>
            <div className="stat-card"><div className="stat-value">{Math.max(...teams.map(t=>t.score||0),0)}%</div><div className="stat-label">Peak Similarity</div><div className="stat-icon">🎯</div></div>
            <div className="stat-card"><div className="stat-value">{alerts.length}</div><div className="stat-label">Security Alerts</div><div className="stat-icon">🚨</div></div>
          </div>
          {activeView==="arsenal"&&<ArsenalView globalTags={forbiddenWords} addForbiddenWord={addForbiddenWord} removeForbiddenWord={removeForbiddenWord} timers={timers} updateTimers={updateTimers} eventState={eventState} setEventState={setEventState}/>}
          {activeView==="roster"&&<RosterView teams={teams} setTeams={setTeams} onLiveScreen={setLiveTarget} addAlert={addAlert}/>}
          {activeView==="disciplinary"&&<DisciplinarySuite teams={teams} setTeams={setTeams} addAlert={addAlert}/>}
          {activeView==="leaderboard"&&<LeaderboardView teams={teams} winners={winners} setWinners={setWinners}/>}
          {activeView==="activity"&&(
            <div style={{animation:"fadeInUp 0.5s ease-out"}}>
              <div className="page-header"><div className="breadcrumb">ADMIN › ACTIVITY</div><h2>Activity Oracle</h2></div>
              <div className="card section-bg bg-scroll">
                {alerts.length===0&&<p style={{fontFamily:"'IM Fell English',serif",color:"var(--parchment-dim)",fontStyle:"italic",textAlign:"center",padding:28}}>All is calm in the labyrinth...</p>}
                {alerts.map((a,i)=>(
                  <div key={i} className="activity-item">
                    <span style={{fontSize:16,flexShrink:0,marginTop:2}}>🔮</span>
                    <div><div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:13,color:"var(--text-dim)"}}><span style={{color:"var(--rune-gold)"}}>{a.team}</span> — {a.message}</div><div style={{fontSize:12,color:"var(--text-dim)",marginTop:2}}>{a.time}</div></div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {activeView==="alerts"&&(
            <div style={{animation:"fadeInUp 0.5s ease-out"}}>
              <div className="page-header"><div className="breadcrumb">ADMIN › ALERTS</div><h2>Security Alerts</h2><p>"No transgression goes unseen"</p></div>
              {alerts.length===0?<div className="card" style={{textAlign:"center",padding:52}}><div style={{fontSize:36,marginBottom:14}}>🔮</div><p style={{fontFamily:"'IM Fell English',serif",color:"var(--parchment-dim)",fontStyle:"italic"}}>All is calm in the labyrinth...</p></div>
              :alerts.map((a,i)=><div key={i} className="alert-panel"><div style={{fontFamily:"'Share Tech Mono',monospace",fontSize:13,color:"var(--blood-glow)",letterSpacing:2,marginBottom:5}}>🚨 {a.type} — {a.team}</div><p style={{fontFamily:"'Share Tech Mono',monospace",fontSize:13,color:"rgba(255,100,80,0.8)"}}>{a.message}</p><p style={{fontFamily:"'Share Tech Mono',monospace",fontSize:12,color:"var(--parchment-dim)",marginTop:3}}>{a.time}</p></div>)}
            </div>
          )}
          {activeView==="settings"&&(
            <div style={{animation:"fadeInUp 0.5s ease-out"}}>
              <div className="page-header"><div className="breadcrumb">ADMIN › SETTINGS</div><h2>Oracle Configuration</h2></div>
              <div className="card section-bg bg-dark">
                <div className="card-title">ANTI-CHEAT PROTOCOL</div>
                <div className="grid-2">
                  <div className="form-group"><label className="form-label">Auto-Disqualify on Tab Switch</label><select className="form-select"><option>Yes — Immediate</option><option>Yes — After 1 Warning</option><option>No — Alert Only</option></select></div>
                  <div className="form-group"><label className="form-label">Similarity Model</label><select className="form-select"><option>CLIP ViT-B/32</option><option>SSIM Algorithm</option><option>Gemini Vision API</option></select></div>
                </div>
                <button className="btn btn-gold">💾 Save Config</button>
              </div>
            </div>
          )}
        </div>
      </div>
      {liveTarget&&<LiveScreenModal team={liveTarget} onClose={()=>setLiveTarget(null)}/>}
    </div>
  );
};

export { AdminDashboard, LandingPage, BackgroundWrapper, ParticleCanvas, SceneWrapper, GlobalStyles, OraclesLockGame };
export { BG_IMAGES };