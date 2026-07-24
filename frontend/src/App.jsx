/* eslint-disable */
import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, User, Users, Crosshair } from "lucide-react";
import { broadcastEvent, useEventListener } from "./useSync.js";
import { ScoreDigits } from "./ScoreReveal.jsx";
import { AdminDashboard, SceneWrapper, GlobalStyles, BG_IMAGES } from "./AdminComponents.jsx";
import gdgLogo from "./assets/gdg-logo.png";
const API = import.meta.env.VITE_API_URL || "https://mayavyuh-backend.onrender.com";
const INIT_TEAMS = [];
const INIT_EVENT = { started: false, phase: "lobby" };

// ============================================================
// ANTI-CHEAT HOOK
// Runs only on the player view. Silently logs violations and
// sends them to the backend. Never alerts or disrupts gameplay.
// ============================================================
function useAntiCheat({ isPlayer, teamId, onDisqualify, isPaused, forceCloseWindow, isActiveRound }) {
  const violationCountRef = useRef(0);
  const geminiWindowRef = useRef(null);
  const bannerTimerRef = useRef(null);

  useEffect(() => {
    if (isPaused || forceCloseWindow) {
      const tryClose = () => {
        window.focus();
        if (geminiWindowRef.current && !geminiWindowRef.current.closed) {
          try { geminiWindowRef.current.close(); } catch (e) { }
        }
        try {
          const fallbackWin = window.open('', 'GeminiPopup');
          if (fallbackWin && !fallbackWin.closed) fallbackWin.close();
        } catch (e) { }
      };
      tryClose();
      setTimeout(tryClose, 500);
      setTimeout(tryClose, 1500);
    }
  }, [isPaused, forceCloseWindow]);

  // Store a ref to the gemini popup so we can track it
  // We expose a setter so RoundDisplay can register the popup
  const registerGeminiWindow = useCallback((win) => {
    geminiWindowRef.current = win;
  }, []);

  const showBanner = useCallback((msg) => {
    const banner = document.getElementById("ac-violation-banner");
    if (!banner) return;
    banner.textContent = `⚠ SECURITY ALERT: ${msg}`;
    banner.classList.add("ac-show");
    clearTimeout(bannerTimerRef.current);
    bannerTimerRef.current = setTimeout(() => {
      banner.classList.remove("ac-show");
    }, 3000);
  }, []);

  const reportViolation = useCallback((type) => {
    if (!isPlayer) return;
    violationCountRef.current += 1;
    const count = violationCountRef.current;

    // Silent report to backend — fire and forget
    fetch(`${API}/api/anticheat/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamId, type, count, ts: Date.now() }),
    }).catch(() => { }); // intentionally swallow errors — never disrupt gameplay

    // Trigger instant disqualification for critical offenses
    if (type === "copy_attempt" || type === "screenshot_attempt") {
      if (isActiveRound && onDisqualify) {
        onDisqualify(type);
      }
      return; // Stop here, no need to show a banner if they are disqualified or if we ignore it
    }

    showBanner(
      type === "devtools"
        ? "DEVTOOLS DETECTED"
        : "UNAUTHORIZED ACTION"
    );
  }, [isPlayer, teamId, showBanner, onDisqualify, isActiveRound]);

  useEffect(() => {
    if (!isPlayer) return;

    // ----------------------------------------------------------
    // 1. Tab / window visibility — detect switching away
    // ----------------------------------------------------------
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // [TEMPORARILY DISABLED]
        // reportViolation("tab_switch");
        // document.body.classList.add("ac-focus-lost");
      } else {
        document.body.classList.remove("ac-focus-lost");
      }
    };

    // ----------------------------------------------------------
    // 2. Window blur — fires when focus moves to another window/tab
    //    We allow blur to Gemini popup by checking if our own
    //    popup is what caused it (best-effort).
    // ----------------------------------------------------------
    const handleWindowBlur = () => {
      // Short delay so the popup's focus can register first
      setTimeout(() => {
        const geminiWin = geminiWindowRef.current;
        const geminiAlive = geminiWin && !geminiWin.closed;
        // If Gemini popup is open and was just opened, don't flag
        if (!geminiAlive) {
          // [TEMPORARILY DISABLED]
          // document.body.classList.add("ac-focus-lost");
        }
      }, 200);
    };

    const handleWindowFocus = () => {
      document.body.classList.remove("ac-focus-lost");
    };

    // ----------------------------------------------------------
    // 3. Keyboard shortcut interception
    //    Ctrl+C / Cmd+C: silently swallowed — no alert, no error
    //    Screenshot keys (PrintScreen): silently swallowed
    //    Ctrl+S, Ctrl+U, Ctrl+P, F12, Ctrl+Shift+I: blocked silently
    // ----------------------------------------------------------
    const handleKeyDown = (e) => {
      const ctrl = e.ctrlKey || e.metaKey;

      // Ctrl+C — intercept silently (player sees nothing wrong)
      if (ctrl && e.key === "c") {
        // Clear the clipboard silently so they can't paste the image
        try {
          navigator.clipboard.writeText("").catch(() => { });
        } catch (_) { }
        reportViolation("copy_attempt");
        // DO NOT call e.preventDefault() — requirement says it shouldn't fail
        // Just poison the clipboard content instead
        return;
      }

      // PrintScreen
      if (e.key === "PrintScreen") {
        // Poison clipboard after screenshot key
        try {
          navigator.clipboard.writeText("").catch(() => { });
        } catch (_) { }
        reportViolation("screenshot_attempt");
        e.preventDefault();
        return;
      }

      // Block devtools shortcuts silently
      if (
        e.key === "F12" ||
        (ctrl && e.shiftKey && (e.key === "I" || e.key === "J" || e.key === "C")) ||
        (ctrl && e.key === "U") ||
        (ctrl && e.key === "s") ||
        (ctrl && e.key === "p")
      ) {
        e.preventDefault();
        reportViolation("devtools");
        return;
      }
    };

    // ----------------------------------------------------------
    // 4. Context menu (right-click) — disable silently on images
    // ----------------------------------------------------------
    const handleContextMenu = (e) => {
      if (e.target.tagName === "IMG") {
        e.preventDefault();
      }
    };

    // ----------------------------------------------------------
    // 5. Drag prevention on images
    // ----------------------------------------------------------
    const handleDragStart = (e) => {
      if (e.target.tagName === "IMG") {
        e.preventDefault();
        reportViolation("drag_attempt");
      }
    };

    // ----------------------------------------------------------
    // 6. Paste interception — block pasting images into the page
    // ----------------------------------------------------------
    const handlePaste = (e) => {
      const items = e.clipboardData?.items || [];
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          reportViolation("paste_image_attempt");
          return;
        }
      }
      // Text paste is allowed (needed for Gemini link input)
    };

    // ----------------------------------------------------------
    // 7. DevTools size detection (heuristic — best effort)
    // ----------------------------------------------------------
    let devToolsCheckInterval = null;
    const checkDevTools = () => {
      const threshold = 160;
      if (
        window.outerWidth - window.innerWidth > threshold ||
        window.outerHeight - window.innerHeight > threshold
      ) {
        reportViolation("devtools");
      }
    };
    devToolsCheckInterval = setInterval(checkDevTools, 3000);

    // Attach all listeners
    document.addEventListener("visibilitychange", handleVisibilityChange);
    document.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("dragstart", handleDragStart);
    document.addEventListener("paste", handlePaste);
    window.addEventListener("keydown", handleKeyDown, true); // capture phase

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      document.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("dragstart", handleDragStart);
      document.removeEventListener("paste", handlePaste);
      window.removeEventListener("keydown", handleKeyDown, true);
      clearInterval(devToolsCheckInterval);
      clearTimeout(bannerTimerRef.current);
      document.body.classList.remove("ac-focus-lost");
    };
  }, [isPlayer, reportViolation]);

  return { registerGeminiWindow };
}

// ============================================================

const DisqualifiedScreen = ({ teamName, reason }) => {
  const displayReason =
    reason === "tab_switch" ? "TAB SWITCH DETECTED" :
      reason === "copy_attempt" ? "CLIPBOARD INTERCEPTED" :
        reason === "screenshot_attempt" ? "SCREENSHOT ATTEMPT DETECTED" :
          "UNAUTHORIZED ACTION";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 3, ease: "easeInOut" }}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "#000",
        color: "#fff",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 99999,
        fontFamily: "'Cinzel', serif",
        textAlign: "center"
      }}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 4, delay: 1, ease: "easeOut" }}
        style={{
          fontSize: "4rem",
          letterSpacing: "8px",
          color: "#8a0303",
          textShadow: "0 0 20px rgba(255, 0, 0, 0.4), 0 0 40px rgba(255, 0, 0, 0.2)",
          marginBottom: "40px",
          textTransform: "uppercase"
        }}
      >
        TEAM {teamName}<br />YOU ARE DISQUALIFIED
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 2, delay: 3 }}
        style={{
          fontFamily: "'Share Tech Mono', monospace",
          fontSize: "1.2rem",
          color: "rgba(255, 255, 255, 0.5)",
          letterSpacing: "4px"
        }}
      >
        Reason: {displayReason}
      </motion.div>
    </motion.div>
  );
};

const ComplexInput = ({ icon: Icon, placeholder, value, setter, fieldId, activeInput, setActiveInput }) => {
  const isFocused = activeInput === fieldId;
  const isFilled = value.length > 0;

  return (
    <div style={{ position: "relative", marginBottom: "16px", width: "100%", display: "flex", justifyContent: "center" }}>

      {/* Futuristic ornate input container with bevel */}
      <div style={{
        position: "relative",
        width: "90%",
        height: "54px",
        background: isFocused ? "linear-gradient(90deg, rgba(212,175,55,0.15) 0%, rgba(10,10,12,0.97) 20%, rgba(10,10,12,0.97) 80%, rgba(212,175,55,0.15) 100%)" : "linear-gradient(180deg, rgba(20,20,20,0.9) 0%, rgba(5,5,5,0.98) 100%)",
        clipPath: "polygon(14px 0, calc(100% - 14px) 0, 100% 14px, 100% calc(100% - 14px), calc(100% - 14px) 100%, 14px 100%, 0 calc(100% - 14px), 0 14px)",
        border: "none",
        transition: "all 0.5s cubic-bezier(0.25, 0.8, 0.25, 1)",
        display: "flex",
        alignItems: "center",
        boxShadow: isFocused
          ? "0 0 0 1px rgba(212,175,55,0.6), 0 0 40px rgba(212,175,55,0.2), inset 0 1px 0 rgba(255,255,255,0.06)"
          : "0 0 0 1px rgba(255,255,255,0.04), inset 0 1px 0 rgba(255,255,255,0.03)"
      }}>
        {/* Bevel Outline using inset clip-path */}
        <div style={{
          position: "absolute",
          inset: "1px",
          background: isFocused
            ? "linear-gradient(180deg, rgba(25,22,10,0.98) 0%, rgba(5,5,5,0.99) 100%)"
            : "linear-gradient(180deg, #151515 0%, #000 100%)",
          clipPath: "polygon(13px 0, calc(100% - 13px) 0, 100% 13px, 100% calc(100% - 13px), calc(100% - 13px) 100%, 13px 100%, 0 calc(100% - 13px), 0 13px)",
          transition: "all 0.5s",
          zIndex: 0
        }} />

        {/* Top scan line on focus */}
        {isFocused && (
          <motion.div
            initial={{ scaleX: 0, opacity: 0 }}
            animate={{ scaleX: 1, opacity: 1 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            style={{
              position: "absolute", top: 0, left: 0, right: 0, height: "1px",
              background: "linear-gradient(90deg, transparent, #FFDF73, #D4AF37, #FFDF73, transparent)",
              boxShadow: "0 0 12px rgba(255,223,115,0.9)",
              transformOrigin: "left",
              zIndex: 3
            }}
          />
        )}
        {/* Bottom scan line on focus */}
        {isFocused && (
          <motion.div
            initial={{ scaleX: 0, opacity: 0 }}
            animate={{ scaleX: 1, opacity: 1 }}
            transition={{ duration: 0.4, ease: "easeOut", delay: 0.1 }}
            style={{
              position: "absolute", bottom: 0, left: 0, right: 0, height: "1px",
              background: "linear-gradient(90deg, transparent, rgba(212,175,55,0.5), rgba(212,175,55,0.8), rgba(212,175,55,0.5), transparent)",
              boxShadow: "0 0 6px rgba(212,175,55,0.5)",
              transformOrigin: "right",
              zIndex: 3
            }}
          />
        )}

        {/* Glowing Side Accents */}
        <div style={{ position: "absolute", left: 0, top: "15%", bottom: "15%", width: "2px", background: isFocused ? "linear-gradient(180deg, transparent, #FFDF73, #D4AF37, transparent)" : "rgba(255,255,255,0.03)", boxShadow: isFocused ? "0 0 20px rgba(255,223,115,0.8)" : "none", transition: "all 0.5s ease", zIndex: 2 }} />
        <div style={{ position: "absolute", right: 0, top: "15%", bottom: "15%", width: "2px", background: isFocused ? "linear-gradient(180deg, transparent, #FFDF73, #D4AF37, transparent)" : "rgba(255,255,255,0.03)", boxShadow: isFocused ? "0 0 20px rgba(255,223,115,0.8)" : "none", transition: "all 0.5s ease", zIndex: 2 }} />

        <div style={{
          padding: "0 16px",
          display: "flex",
          alignItems: "center",
          borderRight: `1px solid ${isFocused ? 'rgba(212,175,55,0.6)' : 'rgba(255,255,255,0.05)'}`,
          height: "70%",
          transition: "all 0.4s",
          zIndex: 2
        }}>
          <Icon size={18} color={isFocused ? "#FFDF73" : "rgba(255,255,255,0.2)"} style={{ filter: isFocused ? "drop-shadow(0 0 10px rgba(255,223,115,1))" : "none", transition: "all 0.4s" }} />
        </div>

        <div style={{ position: "relative", flex: 1, height: "100%", zIndex: 2 }}>
          <div style={{
            position: "absolute",
            top: (isFocused || isFilled) ? "6px" : "19px",
            left: "16px",
            fontSize: (isFocused || isFilled) ? "9px" : "11px",
            letterSpacing: "4px",
            color: (isFocused || isFilled) ? "#FFDF73" : "rgba(255,255,255,0.25)",
            textTransform: "uppercase",
            fontFamily: "'Orbitron', sans-serif",
            fontWeight: 600,
            pointerEvents: "none",
            transition: "all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)",
            textShadow: (isFocused || isFilled) ? "0 0 8px rgba(255,223,115,0.6)" : "none"
          }}>
            {placeholder}
          </div>

          <input
            value={value}
            onChange={e => setter(e.target.value.toUpperCase())}
            onFocus={() => setActiveInput(fieldId)}
            onBlur={() => setActiveInput(null)}
            required
            style={{
              width: "100%",
              height: "100%",
              background: "transparent",
              border: "none",
              color: "#fff",
              padding: "18px 16px 0",
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: "14px",
              fontWeight: 500,
              letterSpacing: "3px",
              outline: "none",
              caretColor: "#FFDF73"
            }}
          />
        </div>
      </div>
    </div>
  );
};

const RegistrationScreen = ({ onRegister }) => {
  const [teamName, setTeamName] = useState("");
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [registering, setRegistering] = useState(false);
  const [activeInput, setActiveInput] = useState(null);

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!teamName || !p1 || !p2) return;

    setRegistering(true);
    try {
      const res = await fetch(`${API}/api/game/teams/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamName, player1: p1, player2: p2, role: "observer" })
      });
      const data = await res.json();

      if (data.success && data.team) {
        onRegister({
          id: data.team._id,
          name: data.team.name,
          player1: data.team.observer,
          player2: data.team.creator,
          status: data.team.status,
          round: data.team.round
        });
      } else {
        alert(data.error || "Registration failed on server.");
      }
    } catch (err) {
      console.error(err);
      alert("Failed to connect to backend for registration.");
    } finally {
      setRegistering(false);
    }
  };

  return (
    <div style={{
      height: "100vh",
      width: "100%",
      position: "relative",
      backgroundColor: "#030303",
      backgroundImage: `url(${BG_IMAGES[0] || ''})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden"
    }}>
      {/* Deep cinematic vignette + golden center bloom */}
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 70% 60% at 50% 50%, rgba(40,30,5,0.4) 0%, rgba(5,4,0,0.75) 55%, rgba(0,0,0,0.99) 100%)", zIndex: 1 }} />
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 35% 25% at 50% 50%, rgba(212,175,55,0.09) 0%, transparent 70%)", zIndex: 1 }} />

      {/* Horizontal cinematic light streaks */}
      {[12, 32, 50, 68, 85].map((top, i) => (
        <motion.div
          key={`streak-${i}`}
          animate={{ scaleX: [0, 1, 0], opacity: [0, 0.14 - i * 0.015, 0] }}
          transition={{ duration: 7 + i * 1.8, repeat: Infinity, ease: "easeInOut", delay: i * 3.2 + 0.5 }}
          style={{
            position: "absolute",
            top: `${top}%`,
            left: 0, right: 0,
            height: "1px",
            background: "linear-gradient(90deg, transparent, rgba(212,175,55,0.8), rgba(255,223,115,1), rgba(212,175,55,0.8), transparent)",
            transformOrigin: i % 2 === 0 ? "left" : "right",
            zIndex: 1,
            pointerEvents: "none"
          }}
        />
      ))}

      {/* High-End Volumetric Sparks */}
      <div style={{ position: "absolute", inset: 0, zIndex: 2, pointerEvents: "none", overflow: "hidden" }}>
        {[...Array(30)].map((_, i) => (
          <motion.div
            key={i}
            animate={{
              y: ["100vh", "-10vh"],
              x: [Math.random() * 30 - 15, Math.random() * 60 - 30],
              opacity: [0, Math.random() * 0.8 + 0.2, 0],
              scale: [0, Math.random() * 1.5 + 0.5, 0]
            }}
            transition={{
              duration: Math.random() * 8 + 8,
              repeat: Infinity,
              ease: "linear",
              delay: Math.random() * 10
            }}
            style={{
              position: "absolute",
              left: `${Math.random() * 100}%`,
              width: `${Math.random() * 3 + 1}px`,
              height: `${Math.random() * 3 + 1}px`,
              background: "linear-gradient(180deg, #FFFFFF 0%, #FFDF73 50%, #D4AF37 100%)",
              borderRadius: "50%",
              boxShadow: "0 0 20px #FFDF73, 0 0 5px #FFFFFF",
              filter: "blur(0.5px)"
            }}
          />
        ))}
      </div>

      {/* Outer ring — slow rotation with bright arc */}
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 200, repeat: Infinity, ease: "linear" }}
        style={{
          position: "absolute",
          width: "130vh", height: "130vh",
          borderRadius: "50%",
          border: "1px solid rgba(212,175,55,0.04)",
          borderTop: "2px solid rgba(212,175,55,0.28)",
          borderBottom: "1px solid rgba(212,175,55,0.1)",
          zIndex: 1,
          boxShadow: "0 0 80px rgba(212,175,55,0.07), inset 0 0 80px rgba(212,175,55,0.03)"
        }}
      />
      {/* Middle counter-rotating ring */}
      <motion.div
        animate={{ rotate: -360 }}
        transition={{ duration: 300, repeat: Infinity, ease: "linear" }}
        style={{
          position: "absolute",
          width: "108vh", height: "108vh",
          borderRadius: "50%",
          border: "1px solid transparent",
          borderLeft: "2px solid rgba(212,175,55,0.2)",
          borderRight: "1px solid rgba(212,175,55,0.06)",
          zIndex: 1
        }}
      />
      {/* Inner pulsing ring */}
      <motion.div
        animate={{ scale: [1, 1.04, 1], opacity: [0.25, 0.6, 0.25] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        style={{
          position: "absolute",
          width: "86vh", height: "86vh",
          borderRadius: "50%",
          border: "1px solid rgba(212,175,55,0.18)",
          zIndex: 1,
          boxShadow: "0 0 50px rgba(212,175,55,0.08), inset 0 0 50px rgba(212,175,55,0.05)"
        }}
      />

      <div style={{
        position: "relative",
        zIndex: 10,
        width: "100%",
        maxWidth: "950px",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: "20px",
        perspective: "1000px"
      }}>

        {/* Left Ornate Pillar (3D Metallic) */}
        <motion.div
          initial={{ opacity: 0, x: -80, rotateY: 15 }}
          animate={{ opacity: 1, x: 0, rotateY: 0 }}
          transition={{ duration: 1.5, ease: "easeOut" }}
          style={{
            width: "60px",
            height: "450px",
            background: "linear-gradient(90deg, #050505 0%, #2a2a2a 30%, #444 50%, #2a2a2a 70%, #050505 100%)",
            clipPath: "polygon(20px 0, 40px 0, 60px 25px, 60px calc(100% - 25px), 40px 100%, 20px 100%, 0 calc(100% - 25px), 0 25px)",
            position: "absolute",
            left: "20px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "40px 0",
            boxShadow: "20px 0 50px rgba(0,0,0,0.9)",
            zIndex: 15
          }}
        >
          {/* Inner Pillar Engraving */}
          <div style={{ position: "absolute", inset: "2px", background: "linear-gradient(180deg, #0e0e0e 0%, #050505 100%)", clipPath: "polygon(19px 0, 39px 0, 58px 24px, 58px calc(100% - 24px), 39px 100%, 19px 100%, 0 calc(100% - 24px), 0 24px)", zIndex: 0 }} />
          {/* Pillar inner glow line */}
          <div style={{ position: "absolute", top: 0, bottom: 0, left: "50%", width: "1px", background: "linear-gradient(180deg, transparent, rgba(212,175,55,0.15), rgba(212,175,55,0.3), rgba(212,175,55,0.15), transparent)", transform: "translateX(-50%)", zIndex: 0 }} />
          <motion.div animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }} style={{ width: "2px", height: "80px", background: "linear-gradient(180deg, transparent, #FFDF73, #D4AF37, transparent)", zIndex: 1, boxShadow: "0 0 20px rgba(255,223,115,0.8)" }} />
          <div style={{ writingMode: "vertical-rl", fontFamily: "'Cinzel', serif", color: "#D4AF37", letterSpacing: "10px", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", transform: "rotate(180deg)", zIndex: 1, textShadow: "0 0 15px rgba(212,175,55,0.7), 0 0 30px rgba(212,175,55,0.3)" }}>
            Alpha
          </div>
          <motion.div animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 1.5 }} style={{ width: "2px", height: "80px", background: "linear-gradient(180deg, transparent, #FFDF73, #D4AF37, transparent)", zIndex: 1, boxShadow: "0 0 20px rgba(255,223,115,0.8)" }} />
        </motion.div>

        {/* Right Ornate Pillar — Premium metallic */}
        <motion.div
          initial={{ opacity: 0, x: 100, rotateY: -25 }}
          animate={{ opacity: 1, x: 0, rotateY: 0 }}
          transition={{ duration: 1.8, ease: [0.16, 1, 0.3, 1] }}
          style={{
            width: "60px",
            height: "450px",
            background: "linear-gradient(90deg, #050505 0%, #1e1e1e 25%, #3a3a3a 50%, #1e1e1e 75%, #050505 100%)",
            clipPath: "polygon(20px 0, 40px 0, 60px 25px, 60px calc(100% - 25px), 40px 100%, 20px 100%, 0 calc(100% - 25px), 0 25px)",
            position: "absolute",
            right: "20px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "40px 0",
            boxShadow: "-20px 0 60px rgba(0,0,0,0.95), 0 0 40px rgba(212,175,55,0.08)",
            zIndex: 15
          }}
        >
          <div style={{ position: "absolute", inset: "2px", background: "linear-gradient(180deg, #0e0e0e 0%, #050505 100%)", clipPath: "polygon(19px 0, 39px 0, 58px 24px, 58px calc(100% - 24px), 39px 100%, 19px 100%, 0 calc(100% - 24px), 0 24px)", zIndex: 0 }} />
          <div style={{ position: "absolute", top: 0, bottom: 0, left: "50%", width: "1px", background: "linear-gradient(180deg, transparent, rgba(212,175,55,0.15), rgba(212,175,55,0.3), rgba(212,175,55,0.15), transparent)", transform: "translateX(-50%)", zIndex: 0 }} />
          <motion.div animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 0.8 }} style={{ width: "2px", height: "80px", background: "linear-gradient(180deg, transparent, #FFDF73, #D4AF37, transparent)", zIndex: 1, boxShadow: "0 0 20px rgba(255,223,115,0.8)" }} />
          <div style={{ writingMode: "vertical-rl", fontFamily: "'Cinzel', serif", color: "#D4AF37", letterSpacing: "10px", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", zIndex: 1, textShadow: "0 0 15px rgba(212,175,55,0.7), 0 0 30px rgba(212,175,55,0.3)" }}>
            Omega
          </div>
          <motion.div animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut", delay: 2.3 }} style={{ width: "2px", height: "80px", background: "linear-gradient(180deg, transparent, #FFDF73, #D4AF37, transparent)", zIndex: 1, boxShadow: "0 0 20px rgba(255,223,115,0.8)" }} />
        </motion.div>

        {/* Central Hexagonal Core Structure — no floating, stationary */}
        <motion.div
          initial={{ opacity: 0, scale: 0.85, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 1.8, ease: [0.16, 1, 0.3, 1] }}
          style={{ position: "relative", width: "100%", maxWidth: "600px", zIndex: 10, display: "flex", justifyContent: "center" }}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, ease: "easeOut" }}
            style={{
              position: "relative",
              width: "100%",
              background: "url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPgo8cmVjdCB3aWR0aD0iNCIgaGVpZ2h0PSI0IiBmaWxsPSIjZmZmIiBmaWxsLW9wYWNpdHk9IjAuMDIiLz4KPC9zdmc+') repeat, linear-gradient(180deg, rgba(20,18,10,0.85) 0%, rgba(5,5,5,0.95) 100%)",
              backdropFilter: "blur(30px) saturate(120%)",
              WebkitBackdropFilter: "blur(30px) saturate(120%)",
              clipPath: "polygon(45px 0, calc(100% - 45px) 0, 100% 45px, 100% calc(100% - 45px), calc(100% - 45px) 100%, 45px 100%, 0 calc(100% - 45px), 0 45px)",
              padding: "60px 40px 40px",
              boxShadow: "0 40px 120px rgba(0,0,0,1), inset 0 2px 0 rgba(255,255,255,0.1), inset 0 -2px 20px rgba(212,175,55,0.15)",
            }}
          >
            {/* Animated Liquid Gold Vault Border */}
            <motion.div
              animate={{ backgroundPosition: ["0% 0%", "200% 200%"] }}
              transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
              style={{
                position: "absolute", inset: "0",
                background: "linear-gradient(135deg, #FFDF73 0%, #D4AF37 25%, #8a6a1c 50%, #D4AF37 75%, #FFDF73 100%)",
                backgroundSize: "300% 300%",
                clipPath: "polygon(45px 0, calc(100% - 45px) 0, 100% 45px, 100% calc(100% - 45px), calc(100% - 45px) 100%, 45px 100%, 0 calc(100% - 45px), 0 45px)",
                zIndex: 0
              }}
            />
            <div style={{
              position: "absolute", inset: "3px",
              background: "linear-gradient(180deg, rgba(10,10,10,0.9) 0%, rgba(2,2,2,0.98) 100%)",
              backdropFilter: "blur(10px)",
              clipPath: "polygon(43px 0, calc(100% - 43px) 0, 100% 43px, 100% calc(100% - 43px), calc(100% - 43px) 100%, 43px 100%, 0 calc(100% - 43px), 0 43px)",
              zIndex: 0
            }} />
            <div style={{
              position: "absolute", inset: "10px",
              border: "1px solid rgba(212,175,55,0.15)",
              clipPath: "polygon(38px 0, calc(100% - 38px) 0, 100% 38px, 100% calc(100% - 38px), calc(100% - 38px) 100%, 38px 100%, 0 calc(100% - 38px), 0 38px)",
              zIndex: 0
            }} />

            {/* 4 Golden Corner Accents */}
            {[
              { top: "12px", left: "12px", borderTop: "2px solid #FFDF73", borderLeft: "2px solid #FFDF73", boxShadow: "inset 0 0 10px rgba(255,223,115,0.4), -3px -3px 12px rgba(255,223,115,0.5)" },
              { top: "12px", right: "12px", borderTop: "2px solid #FFDF73", borderRight: "2px solid #FFDF73", boxShadow: "inset 0 0 10px rgba(255,223,115,0.4), 3px -3px 12px rgba(255,223,115,0.5)" },
              { bottom: "12px", left: "12px", borderBottom: "2px solid #FFDF73", borderLeft: "2px solid #FFDF73", boxShadow: "inset 0 0 10px rgba(255,223,115,0.4), -3px 3px 12px rgba(255,223,115,0.5)" },
              { bottom: "12px", right: "12px", borderBottom: "2px solid #FFDF73", borderRight: "2px solid #FFDF73", boxShadow: "inset 0 0 10px rgba(255,223,115,0.4), 3px 3px 12px rgba(255,223,115,0.5)" }
            ].map((style, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.6, ease: "easeOut", delay: 1.2 + i * 0.1 }}
                style={{
                  position: "absolute",
                  width: "24px", height: "24px",
                  zIndex: 4,
                  ...style
                }}
              />
            ))}

            {/* Slow Ambient Scanner Sweep (horizontal line that sweeps top-to-bottom once) */}
            <motion.div
              initial={{ top: "10%", opacity: 0 }}
              animate={{ top: ["10%", "90%", "10%"], opacity: [0, 0.6, 0] }}
              transition={{ duration: 8, repeat: Infinity, ease: "linear", repeatDelay: 4 }}
              style={{
                position: "absolute", left: "10px", right: "10px", height: "1px",
                background: "linear-gradient(90deg, transparent, rgba(212,175,55,0.8), rgba(255,223,115,1), rgba(212,175,55,0.8), transparent)",
                boxShadow: "0 0 15px rgba(255,223,115,0.6)",
                zIndex: 3,
                pointerEvents: "none"
              }}
            />

            {/* Pulsing amber ambient inner glow at bottom */}
            <motion.div
              animate={{ opacity: [0.3, 0.7, 0.3] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              style={{
                position: "absolute", bottom: 0, left: 0, right: 0, height: "60px",
                background: "radial-gradient(ellipse at 50% 100%, rgba(212,175,55,0.25) 0%, transparent 70%)",
                zIndex: 3,
                pointerEvents: "none"
              }}
            />

            {/* Top Overlapping Royal Crest */}
            <div style={{
              position: "absolute",
              top: "-20px",
              left: "50%",
              transform: "translateX(-50%)",
              width: "110px",
              height: "70px",
              background: "linear-gradient(180deg, #1a1a1a 0%, #050505 100%)",
              clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              zIndex: 20,
              boxShadow: "0 10px 20px rgba(0,0,0,1)"
            }}>
              {/* Crest Bevel */}
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, #D4AF37 0%, #664d0c 100%)", clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)", zIndex: 0 }} />
              <div style={{ position: "absolute", inset: "2px", background: "#0a0a0a", clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)", zIndex: 0 }} />
              <motion.img
                src={gdgLogo} alt="GDG"
                animate={{ filter: ["drop-shadow(0 0 10px rgba(212,175,55,0.5))", "drop-shadow(0 0 20px rgba(212,175,55,1))", "drop-shadow(0 0 10px rgba(212,175,55,0.5))"] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                style={{ width: 40, zIndex: 1, position: "relative" }}
              />
            </div>

            <div style={{ position: "relative", zIndex: 5, textAlign: "center", marginTop: "10px", marginBottom: "24px" }}>
              {/* Cinematic Lens Flare */}
              <motion.div
                animate={{ opacity: [0.4, 0.8, 0.4], scaleX: [1, 1.5, 1] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "120%", height: "2px", background: "radial-gradient(ellipse at center, rgba(212,175,55,0.8) 0%, transparent 70%)", filter: "blur(2px)", zIndex: -1 }}
              />
              <motion.div
                animate={{ opacity: [0.2, 0.5, 0.2], scale: [1, 1.2, 1] }}
                transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "80%", height: "40px", background: "radial-gradient(ellipse at center, rgba(212,175,55,0.3) 0%, transparent 70%)", filter: "blur(10px)", zIndex: -1 }}
              />

              <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "10px", letterSpacing: "10px", color: "rgba(212,175,55,0.9)", textTransform: "uppercase", marginBottom: "8px", fontWeight: 700, textShadow: "0 0 10px rgba(212,175,55,0.4)" }}>
                Sector Unlocked
              </div>
              <motion.h1
                initial={{ letterSpacing: "30px", opacity: 0, filter: "blur(10px)" }}
                animate={{ letterSpacing: "10px", opacity: 1, filter: "blur(0px)" }}
                transition={{ duration: 2, ease: "easeOut", delay: 0.5 }}
                style={{ position: "relative", fontFamily: "'Cinzel', serif", fontSize: "44px", fontWeight: "900", color: "#fff", margin: 0, textShadow: "0 20px 40px rgba(0,0,0,0.8), 0 0 30px rgba(212,175,55,0.8)" }}
              >
                <span style={{ background: "linear-gradient(180deg, #FFFFFF 0%, #FFDF73 30%, #D4AF37 60%, #8A6A1C 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", position: "relative", zIndex: 2 }}>MAYAVYUH</span>
              </motion.h1>

              {/* Highly Intricate Royal Divider */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", margin: "16px 0" }}>
                <div style={{ width: "35%", height: "1px", background: "linear-gradient(90deg, transparent, rgba(212,175,55,1))" }} />
                <div style={{ width: "8px", height: "8px", transform: "rotate(45deg)", border: "2px solid #D4AF37" }} />
                <motion.div
                  animate={{ scale: [1, 1.2, 1], rotate: [45, 225] }} transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
                  style={{ width: "5px", height: "5px", background: "#D4AF37", boxShadow: "0 0 20px #D4AF37" }}
                />
                <div style={{ width: "8px", height: "8px", transform: "rotate(45deg)", border: "2px solid #D4AF37" }} />
                <div style={{ width: "35%", height: "1px", background: "linear-gradient(270deg, transparent, rgba(212,175,55,1))" }} />
              </div>

              <p style={{ fontFamily: "'Inter', sans-serif", fontSize: "12px", color: "rgba(255,255,255,0.5)", letterSpacing: "2px" }}>
                Synchronize sequence to enter the labyrinth.
              </p>
            </div>

            <form onSubmit={handleRegister} style={{ position: "relative", zIndex: 5, width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}>

              <motion.div initial={{ opacity: 0, x: -50, filter: "blur(10px)" }} animate={{ opacity: 1, x: 0, filter: "blur(0px)" }} transition={{ duration: 0.8, ease: "easeOut", delay: 1.0 }} style={{ width: "100%" }}>
                <ComplexInput icon={Shield} placeholder="HOUSE DESIGNATION" value={teamName} setter={setTeamName} fieldId="team" activeInput={activeInput} setActiveInput={setActiveInput} />
              </motion.div>

              <motion.div initial={{ opacity: 0, x: 50, filter: "blur(10px)" }} animate={{ opacity: 1, x: 0, filter: "blur(0px)" }} transition={{ duration: 0.8, ease: "easeOut", delay: 1.2 }} style={{ width: "100%" }}>
                <ComplexInput icon={User} placeholder="OPERATIVE I IDENTIFIER" value={p1} setter={setP1} fieldId="p1" activeInput={activeInput} setActiveInput={setActiveInput} />
              </motion.div>

              <motion.div initial={{ opacity: 0, x: -50, filter: "blur(10px)" }} animate={{ opacity: 1, x: 0, filter: "blur(0px)" }} transition={{ duration: 0.8, ease: "easeOut", delay: 1.4 }} style={{ width: "100%" }}>
                <ComplexInput icon={Users} placeholder="OPERATIVE II IDENTIFIER" value={p2} setter={setP2} fieldId="p2" activeInput={activeInput} setActiveInput={setActiveInput} />
              </motion.div>

              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2 }}
                style={{ width: "95%", marginTop: "12px" }}
              >
                <button
                  type="submit"
                  disabled={registering}
                  style={{
                    width: "100%",
                    height: "56px",
                    background: "linear-gradient(90deg, rgba(212,175,55,0.2) 0%, rgba(255,223,115,0.5) 50%, rgba(212,175,55,0.2) 100%)",
                    clipPath: "polygon(14px 0, calc(100% - 14px) 0, 100% 14px, 100% calc(100% - 14px), calc(100% - 14px) 100%, 14px 100%, 0 calc(100% - 14px), 0 14px)",
                    border: "none",
                    color: "#fff",
                    fontFamily: "'Cinzel', serif",
                    fontWeight: 900,
                    fontSize: "16px",
                    letterSpacing: "6px",
                    cursor: registering ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "16px",
                    transition: "all 0.5s cubic-bezier(0.19, 1, 0.22, 1)",
                    boxShadow: "0 10px 30px rgba(0,0,0,0.8), 0 0 20px rgba(212,175,55,0.4), inset 0 0 20px rgba(255,223,115,0.2)",
                    textTransform: "uppercase",
                    position: "relative",
                    overflow: "hidden"
                  }}
                  onMouseOver={(e) => {
                    if (!registering) {
                      e.currentTarget.style.background = "linear-gradient(90deg, rgba(255,223,115,0.6) 0%, rgba(255,255,255,0.9) 50%, rgba(255,223,115,0.6) 100%)";
                      e.currentTarget.style.boxShadow = "0 15px 40px rgba(0,0,0,0.9), 0 0 60px rgba(255,223,115,0.8), inset 0 0 30px rgba(255,255,255,0.5)";
                      e.currentTarget.style.transform = "scale(1.02) translateY(-2px)";
                      if (e.currentTarget.children[0]) e.currentTarget.children[0].style.opacity = "0.2";
                      e.currentTarget.style.textShadow = "0 0 15px rgba(255,255,255,1)";
                    }
                  }}
                  onMouseOut={(e) => {
                    if (!registering) {
                      e.currentTarget.style.background = "linear-gradient(90deg, rgba(212,175,55,0.2) 0%, rgba(255,223,115,0.5) 50%, rgba(212,175,55,0.2) 100%)";
                      e.currentTarget.style.boxShadow = "0 10px 30px rgba(0,0,0,0.8), 0 0 20px rgba(212,175,55,0.4), inset 0 0 20px rgba(255,223,115,0.2)";
                      e.currentTarget.style.transform = "scale(1) translateY(0)";
                      if (e.currentTarget.children[0]) e.currentTarget.children[0].style.opacity = "0.9";
                      e.currentTarget.style.textShadow = "none";
                    }
                  }}
                >
                  {/* Thick Button Bevel Outline */}
                  <div style={{ position: "absolute", inset: "2px", background: "linear-gradient(180deg, rgba(20,20,20,0.95) 0%, rgba(5,5,5,0.98) 100%)", clipPath: "polygon(13px 0, calc(100% - 13px) 0, 100% 13px, 100% calc(100% - 13px), calc(100% - 13px) 100%, 13px 100%, 0 calc(100% - 13px), 0 13px)", zIndex: -1, transition: "opacity 0.4s", opacity: 0.9 }} />

                  {/* Sweep animation div */}
                  <motion.div
                    initial={{ left: "-100%" }}
                    animate={{ left: "200%" }}
                    transition={{ duration: 2, repeat: Infinity, ease: "linear", delay: 1 }}
                    style={{ position: "absolute", top: 0, width: "30%", height: "100%", background: "linear-gradient(90deg, transparent, rgba(212,175,55,0.6), transparent)", transform: "skewX(-20deg)", zIndex: 0 }}
                  />

                  <span style={{ position: "relative", zIndex: 1 }}>{registering ? "SYNCHRONIZING..." : "ENTER SANCTUM"}</span>
                </button>
              </motion.div>

            </form>
          </motion.div>
        </motion.div>

      </div>
    </div>
  );
};

const LobbyScreen = () => (
  <div style={{
    minHeight: "100vh",
    width: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    zIndex: 1,
    padding: 24
  }}>
    {/* Ambient Aura Spheres */}
    <motion.div
      animate={{ opacity: [0.25, 0.5, 0.25], scale: [1, 1.2, 1] }}
      transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
      style={{
        position: "absolute",
        width: 650,
        height: 650,
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(212,175,55,0.18) 0%, rgba(0,0,0,0) 70%)",
        pointerEvents: "none",
        zIndex: 0
      }}
    />
    <motion.div
      animate={{ opacity: [0.15, 0.35, 0.15], scale: [1.15, 0.95, 1.15] }}
      transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
      style={{
        position: "absolute",
        width: 800,
        height: 800,
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(0,255,255,0.08) 0%, rgba(0,0,0,0) 70%)",
        pointerEvents: "none",
        zIndex: 0
      }}
    />

    {/* Imperial Glass Card */}
    <motion.div
      initial={{ opacity: 0, y: 35, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.8, ease: "easeOut" }}
      className="glass-panel"
      style={{
        position: "relative",
        zIndex: 2,
        width: "100%",
        maxWidth: 740,
        padding: "60px 48px",
        textAlign: "center",
        border: "1px solid rgba(212,175,55,0.45)",
        borderRadius: 20,
        background: "linear-gradient(180deg, rgba(12,16,26,0.88) 0%, rgba(5,7,12,0.96) 100%)",
        boxShadow: "0 25px 70px rgba(0,0,0,0.95), 0 0 50px rgba(212,175,55,0.18), inset 0 1px 0 rgba(255,255,255,0.15)",
        backdropFilter: "blur(24px)",
        overflow: "hidden"
      }}
    >
      {/* Classic Imperial Corner Accents */}
      <div style={{ position: "absolute", top: 18, left: 18, width: 22, height: 22, borderTop: "2px solid #D4AF37", borderLeft: "2px solid #D4AF37", opacity: 0.85 }} />
      <div style={{ position: "absolute", top: 18, right: 18, width: 22, height: 22, borderTop: "2px solid #D4AF37", borderRight: "2px solid #D4AF37", opacity: 0.85 }} />
      <div style={{ position: "absolute", bottom: 18, left: 18, width: 22, height: 22, borderBottom: "2px solid #D4AF37", borderLeft: "2px solid #D4AF37", opacity: 0.85 }} />
      <div style={{ position: "absolute", bottom: 18, right: 18, width: 22, height: 22, borderBottom: "2px solid #D4AF37", borderRight: "2px solid #D4AF37", opacity: 0.85 }} />

      {/* Top Emblem Logo */}
      <motion.div
        animate={{ filter: ["drop-shadow(0 0 15px rgba(212,175,55,0.4))", "drop-shadow(0 0 30px rgba(212,175,55,0.8))", "drop-shadow(0 0 15px rgba(212,175,55,0.4))"] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        style={{ display: "inline-block", marginBottom: 36, position: "relative" }}
      >
        <img src={gdgLogo} alt="GDG Logo" style={{ width: 90, margin: "0 auto", mixBlendMode: "screen" }} />
      </motion.div>

      {/* Animated Sacred Geometry Core */}
      <div style={{ position: "relative", width: 130, height: 130, margin: "0 auto 40px auto", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            border: "1px dashed rgba(212,175,55,0.5)",
            boxShadow: "0 0 20px rgba(212,175,55,0.2)"
          }}
        />
        <motion.div
          animate={{ rotate: -360 }}
          transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
          style={{
            position: "absolute",
            inset: 14,
            borderRadius: "50%",
            border: "1px dotted rgba(0,255,255,0.6)"
          }}
        />
        <motion.div
          animate={{ scale: [0.94, 1.06, 0.94], opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
          style={{
            width: 60,
            height: 60,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(212,175,55,0.35) 0%, rgba(0,0,0,0) 70%)",
            border: "1px solid #D4AF37",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 0 25px rgba(212,175,55,0.5)"
          }}
        >
          <div style={{ width: 14, height: 14, borderRadius: "50%", background: "#D4AF37", boxShadow: "0 0 12px #D4AF37" }} />
        </motion.div>
      </div>

      {/* Royal Titles */}
      <div style={{ fontSize: 13, fontFamily: "'Orbitron'", letterSpacing: 8, color: "var(--neon-cyan)", marginBottom: 14, textTransform: "uppercase", fontWeight: 700 }}>
        Imperial Protocol Active
      </div>
      <h1 className="title-primary" style={{ fontSize: 40, letterSpacing: 6, color: "var(--neon-gold)", textShadow: "0 0 25px rgba(212,175,55,0.65)", marginBottom: 22 }}>
        AWAITING OVERRIDE
      </h1>

      {/* Classic Gold Filigree Divider */}
      <div style={{ width: 160, height: 2, background: "linear-gradient(90deg, transparent, #D4AF37, transparent)", margin: "0 auto 28px auto" }} />

      {/* Futuristic Telemetry Status Box */}
      <div style={{
        fontFamily: "'Share Tech Mono'",
        color: "var(--text-main)",
        fontSize: 16,
        letterSpacing: 1.5,
        background: "rgba(0, 0, 0, 0.65)",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        padding: "16px 28px",
        borderRadius: 8,
        display: "inline-flex",
        alignItems: "center",
        gap: 14,
        boxShadow: "inset 0 0 25px rgba(0,0,0,0.8)"
      }}>
        <motion.span
          animate={{ opacity: [1, 0.25, 1] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: "#00FF66", boxShadow: "0 0 10px #00FF66" }}
        />
        <span>SYNCHRONIZED WITH DATACRON — STAND BY FOR ADMIN INITIATION</span>
      </div>

      {/* Footer Security Note */}
      <div style={{ marginTop: 38, fontSize: 12, fontFamily: "'Inter'", color: "var(--text-dim)", letterSpacing: 2.5, textTransform: "uppercase", opacity: 0.65 }}>
        Do not refresh or navigate away • Connection secured
      </div>
    </motion.div>
  </div>
);

const IntervalScreen = ({ title, message, timeLeft, isPaused, localDurationKey, localDuration }) => {
  const [localTimeLeft, setLocalTimeLeft] = useState(() => {
    if (!localDurationKey) return 0;
    const startTime = localStorage.getItem(`maya_timer_${localDurationKey}`);
    if (startTime) {
      const elapsed = Math.floor((Date.now() - parseInt(startTime)) / 1000);
      return Math.max(0, localDuration - elapsed);
    }
    localStorage.setItem(`maya_timer_${localDurationKey}`, Date.now().toString());
    return localDuration;
  });

  useEffect(() => {
    if (!localDurationKey) return;

    let startTime = localStorage.getItem(`maya_timer_${localDurationKey}`);
    if (!startTime) {
      startTime = Date.now().toString();
      localStorage.setItem(`maya_timer_${localDurationKey}`, startTime);
      setLocalTimeLeft(localDuration);
    } else {
      const elapsed = Math.floor((Date.now() - parseInt(startTime)) / 1000);
      setLocalTimeLeft(Math.max(0, localDuration - elapsed));
    }

    const interval = setInterval(() => {
      const st = localStorage.getItem(`maya_timer_${localDurationKey}`);
      if (st) {
        const elapsed = Math.floor((Date.now() - parseInt(st)) / 1000);
        setLocalTimeLeft(Math.max(0, localDuration - elapsed));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [localDurationKey, localDuration]);

  const displayTime = localDurationKey ? localTimeLeft : timeLeft;
  const isFinished = localDurationKey ? localTimeLeft <= 0 : (timeLeft <= 0 && !isPaused);

  return (
    <div style={{
      minHeight: "100vh",
      width: "100%",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      position: "relative",
      zIndex: 1,
      padding: 24
    }}>
      {/* Ambient Aura Spheres */}
      <motion.div
        animate={{ opacity: [0.2, 0.45, 0.2], scale: [1, 1.18, 1] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        style={{
          position: "absolute",
          width: 650,
          height: 650,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(212,175,55,0.16) 0%, rgba(0,0,0,0) 70%)",
          pointerEvents: "none",
          zIndex: 0
        }}
      />

      {/* Imperial Glass Card */}
      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
        className="glass-panel"
        style={{
          position: "relative",
          zIndex: 2,
          width: "100%",
          maxWidth: 740,
          padding: "54px 44px",
          textAlign: "center",
          border: "1px solid rgba(212,175,55,0.45)",
          borderRadius: 20,
          background: "linear-gradient(180deg, rgba(12,16,26,0.88) 0%, rgba(5,7,12,0.96) 100%)",
          boxShadow: "0 25px 70px rgba(0,0,0,0.95), 0 0 50px rgba(212,175,55,0.18), inset 0 1px 0 rgba(255,255,255,0.15)",
          backdropFilter: "blur(24px)",
          overflow: "hidden"
        }}
      >
        {/* Classic Corner Accents */}
        <div style={{ position: "absolute", top: 18, left: 18, width: 22, height: 22, borderTop: "2px solid #D4AF37", borderLeft: "2px solid #D4AF37", opacity: 0.85 }} />
        <div style={{ position: "absolute", top: 18, right: 18, width: 22, height: 22, borderTop: "2px solid #D4AF37", borderRight: "2px solid #D4AF37", opacity: 0.85 }} />
        <div style={{ position: "absolute", bottom: 18, left: 18, width: 22, height: 22, borderBottom: "2px solid #D4AF37", borderLeft: "2px solid #D4AF37", opacity: 0.85 }} />
        <div style={{ position: "absolute", bottom: 18, right: 18, width: 22, height: 22, borderBottom: "2px solid #D4AF37", borderRight: "2px solid #D4AF37", opacity: 0.85 }} />

        {/* Top Logo */}
        <motion.div
          animate={{ filter: ["drop-shadow(0 0 15px rgba(212,175,55,0.4))", "drop-shadow(0 0 30px rgba(212,175,55,0.8))", "drop-shadow(0 0 15px rgba(212,175,55,0.4))"] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          style={{ display: "inline-block", marginBottom: 28, position: "relative" }}
        >
          <img src={gdgLogo} alt="GDG Logo" style={{ width: 70, margin: "0 auto", mixBlendMode: "screen" }} />
        </motion.div>

        {/* Animated Sacred Geometry Ring */}
        <div style={{ position: "relative", width: 100, height: 100, margin: "0 auto 32px auto", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              border: "1px dashed rgba(212,175,55,0.5)",
              boxShadow: "0 0 15px rgba(212,175,55,0.2)"
            }}
          />
          <motion.div
            animate={{ rotate: -360 }}
            transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
            style={{
              position: "absolute",
              inset: 12,
              borderRadius: "50%",
              border: "1px dotted rgba(0,255,255,0.6)"
            }}
          />
          <motion.div
            animate={{ scale: [0.95, 1.05, 0.95], opacity: [0.7, 1, 0.7] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            style={{
              width: 48,
              height: 48,
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(212,175,55,0.3) 0%, rgba(0,0,0,0) 70%)",
              border: "1px solid #D4AF37",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 0 20px rgba(212,175,55,0.5)"
            }}
          >
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#D4AF37", boxShadow: "0 0 10px #D4AF37" }} />
          </motion.div>
        </div>

        <div style={{ fontSize: 13, fontFamily: "'Orbitron'", letterSpacing: 8, color: "var(--neon-cyan)", marginBottom: 12, textTransform: "uppercase", fontWeight: 700 }}>
          Temporal Phase Transition
        </div>
        <h1 className="title-primary" style={{ fontSize: 38, letterSpacing: 5, color: "var(--neon-gold)", textShadow: "0 0 25px rgba(212,175,55,0.65)", marginBottom: 16 }}>
          {title}
        </h1>
        <div style={{ width: 140, height: 2, background: "linear-gradient(90deg, transparent, #D4AF37, transparent)", margin: "0 auto 24px auto" }} />

        <div style={{ fontFamily: "'Share Tech Mono'", color: "var(--text-main)", fontSize: 18, maxWidth: 580, margin: "0 auto 32px auto", lineHeight: 1.6, background: "rgba(0,0,0,0.5)", padding: "16px 20px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)" }}>
          {message}
        </div>

        {isPaused && !localDurationKey ? (
          <div style={{ fontSize: 44, fontFamily: "'Orbitron'", color: "#ff2a2a", marginBottom: 28, textShadow: "0 0 15px rgba(255,42,42,0.6)", fontWeight: "bold" }}>
            TEMPORAL HALT
          </div>
        ) : displayTime > 0 ? (
          <div style={{ fontSize: 52, fontFamily: "'Orbitron'", color: "#D4AF37", marginBottom: 28, textShadow: "0 0 20px rgba(212,175,55,0.5)", fontWeight: 900 }}>
            {Math.floor(displayTime / 60)}:{String(displayTime % 60).padStart(2, '0')}
          </div>
        ) : (
          <div style={{ fontSize: 44, fontFamily: "'Orbitron'", color: "#ff2a2a", marginBottom: 28, textShadow: "0 0 15px rgba(255,42,42,0.6)" }}>
            00:00
          </div>
        )}

        <div style={{ fontFamily: "'Cinzel', serif", color: "var(--neon-cyan)", letterSpacing: 4, fontSize: 14, fontWeight: 600 }}>
          {isFinished ? (localDurationKey ? "TIME UP • AWAITING ADMIN COMMANDS" : "WAITING FOR ADMIN INSTRUCTIONS • HALTED !!") : "AWAITING PROTOCOL SYNCHRONIZATION..."}
        </div>
      </motion.div>
    </div>
  );
};

const RoundDisplay = ({ playerLabel, targetImage, onComplete, onImageUploaded, roundLabel, storageKey, isPaused, timeLeft, isRoundEnded, teamId, registerGeminiWindow }) => {
  const [uploading, setUploading] = useState(false);
  const [uploadedImgUrl, setUploadedImgUrl] = useState(null);
  const [isGeminiLaunched, setIsGeminiLaunched] = useState(false);
  const [geminiLink, setGeminiLink] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [savedSessionLink, setSavedSessionLink] = useState(() => localStorage.getItem(`gemini_session_${teamId}_${storageKey}`) || "");
  const [tempSessionLink, setTempSessionLink] = useState("");

  const isTimeUp = timeLeft <= 0;
  const effectivelyEnded = isRoundEnded || isTimeUp;

  const [isSubmitted, setIsSubmitted] = useState(() => {
    try {
      return localStorage.getItem(`maya_submitted_${teamId}_${storageKey}`) === "true";
    } catch { return false; }
  });

  const [submittedLink, setSubmittedLink] = useState(() => {
    try {
      return localStorage.getItem(`maya_sublink_${teamId}_${storageKey}`) || "";
    } catch { return ""; }
  });

  useEffect(() => {
    try {
      setIsSubmitted(localStorage.getItem(`maya_submitted_${teamId}_${storageKey}`) === "true");
      setSubmittedLink(localStorage.getItem(`maya_sublink_${teamId}_${storageKey}`) || "");
    } catch {}
  }, [storageKey, teamId]);

  useEffect(() => {
    let timer;
    if (timeLeft === 300) setTimeWarning("⚠️ CRITICAL ALERT: 5 MINUTES REMAINING ⚠️");
    else if (timeLeft === 60) setTimeWarning("🚨 PROTOCOL WARNING: 60 SECONDS LEFT! SUBMIT IMMEDIATELY! 🚨");
    else if (timeLeft === 10) setTimeWarning("⏳ FINAL COUNTDOWN: 10 SECONDS UNTIL LOCKDOWN! ⏳");
    if (timeLeft === 300 || timeLeft === 60 || timeLeft === 10) {
      timer = setTimeout(() => setTimeWarning(""), 8000);
    }
    return () => clearTimeout(timer);
  }, [timeLeft]);

  const [timeWarning, setTimeWarning] = useState("");

  useEffect(() => {
    if (effectivelyEnded && !isPaused) {
      const handleBeforeUnload = (e) => {
        e.preventDefault();
        e.returnValue = "An active round is running! Leaving now is prohibited.";
        return e.returnValue;
      };
      window.addEventListener("beforeunload", handleBeforeUnload);
      return () => window.removeEventListener("beforeunload", handleBeforeUnload);
    }
  }, [effectivelyEnded, isPaused]);

  useEffect(() => {
    if (effectivelyEnded && isSubmitted && uploadedImgUrl) {
      const linkToUse = submittedLink || geminiLink || savedSessionLink;
      onComplete(uploadedImgUrl, linkToUse);
    }
  }, [effectivelyEnded, isSubmitted, uploadedImgUrl, submittedLink, geminiLink, savedSessionLink, onComplete]);

  const warningBanner = timeWarning ? (
    <motion.div initial={{ y: -50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} style={{ position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", background: "linear-gradient(90deg, rgba(255,0,85,0.95), rgba(212,175,55,0.95))", padding: "14px 36px", borderRadius: 8, border: "2px solid #FFDF73", color: "#fff", fontFamily: "'Orbitron'", fontSize: 16, fontWeight: "bold", zIndex: 99999, boxShadow: "0 0 40px rgba(255,0,85,0.9)", textAlign: "center", pointerEvents: "none" }}>
      {timeWarning}
    </motion.div>
  ) : null;

  useEffect(() => {
    if (isPaused) setIsGeminiLaunched(false);
  }, [isPaused]);

  const fmtTime = (s) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const launchGemini = () => {
    const w = window.open("https://gemini.google.com/app", "GeminiSplitScreen", "width=800,height=900,left=800,top=50");
    if (registerGeminiWindow && w) registerGeminiWindow(w);
    setIsGeminiLaunched(true);
  };

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("image", file);
    if (teamId) formData.append("teamId", teamId);
    if (storageKey) formData.append("round", storageKey.replace('r', ''));
    try {
      const uploadRes = await fetch(`${API}/api/player/upload-submission`, { method: "POST", body: formData });
      const data = await uploadRes.json();
      if (!data.success) throw new Error(data.error || data.message || "Upload failed");
      setUploadedImgUrl(data.url);
      if (onImageUploaded) onImageUploaded(data.url, storageKey);
    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to upload image. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async () => {
    if (!uploadedImgUrl) {
      alert("SECURITY LOCK: You must upload your generated image artifact before submitting to Datacron!");
      return;
    }
    const linkToVerify = geminiLink.trim() || savedSessionLink;
    if (!linkToVerify) {
      alert("SECURITY LOCK: You must paste your Gemini Chat Link to verify this spell.");
      return;
    }
    setVerifying(true);
    try {
      const res = await fetch(`${API}/api/verify-gemini`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ link: linkToVerify })
      });
      const data = await res.json();
      if (!res.ok) {
        alert("LOCK REJECTED: " + (data.error || "Verification failed."));
        return;
      }
      try {
        localStorage.setItem(`maya_submitted_${teamId}_${storageKey}`, "true");
        localStorage.setItem(`maya_sublink_${teamId}_${storageKey}`, linkToVerify);
        if (uploadedImgUrl) localStorage.setItem(`maya_subimg_${teamId}_${storageKey}`, uploadedImgUrl);
      } catch (e) {}
      setIsSubmitted(true);
      setSubmittedLink(linkToVerify);
      if (onImageUploaded) onImageUploaded(uploadedImgUrl, storageKey);
      if (effectivelyEnded) {
        onComplete(uploadedImgUrl, linkToVerify);
      }
    } catch (err) {
      alert("Error verifying the Gemini link.");
    } finally {
      setVerifying(false);
    }
  };

  if (isSubmitted && !effectivelyEnded) {
    return (
      <motion.div
        layout
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          width: "100%",
          padding: "40px 20px",
          zIndex: 10,
          position: "relative",
          background: "radial-gradient(circle at 50% 30%, rgba(60, 40, 10, 0.35) 0%, rgba(10, 8, 14, 0.85) 60%, rgba(3, 2, 5, 0.98) 100%)"
        }}
      >
        {warningBanner}

        {/* Ambient background gold glow particles */}
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "800px", height: "800px", background: "radial-gradient(circle, rgba(212, 175, 55, 0.08) 0%, transparent 70%)", pointerEvents: "none", filter: "blur(40px)" }} />

        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.7 }}
          style={{
            width: "100%",
            maxWidth: 760,
            textAlign: "center",
            padding: "56px 48px",
            borderRadius: 16,
            background: "linear-gradient(145deg, rgba(24, 20, 28, 0.85) 0%, rgba(12, 10, 16, 0.95) 100%)",
            border: "1px solid rgba(212, 175, 55, 0.4)",
            boxShadow: "0 30px 80px rgba(0, 0, 0, 0.9), 0 0 50px rgba(212, 175, 55, 0.15), inset 0 1px 2px rgba(255, 235, 170, 0.3), inset 0 -1px 2px rgba(0, 0, 0, 0.8)",
            position: "relative",
            overflow: "hidden",
            backdropFilter: "blur(20px)"
          }}
        >
          {/* Top Royal Accent Line */}
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: "linear-gradient(90deg, transparent 0%, #D4AF37 30%, #FFF8DC 50%, #D4AF37 70%, transparent 100%)", boxShadow: "0 0 15px rgba(212, 175, 55, 0.8)" }} />

          {/* Animated Royal Emblem */}
          <div style={{ position: "relative", width: 100, height: 100, margin: "0 auto 28px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
              style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "1px dashed rgba(212, 175, 55, 0.4)", boxShadow: "0 0 20px rgba(212, 175, 55, 0.1)" }}
            />
            <motion.div
              animate={{ rotate: -360 }}
              transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
              style={{ position: "absolute", inset: 8, borderRadius: "50%", border: "1px dotted rgba(212, 175, 55, 0.6)" }}
            />
            <motion.div
              animate={{ scale: [1, 1.08, 1], filter: ["drop-shadow(0 0 15px rgba(212,175,55,0.6))", "drop-shadow(0 0 25px rgba(255,215,0,0.9))", "drop-shadow(0 0 15px rgba(212,175,55,0.6))"] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              style={{ fontSize: 52, zIndex: 2, lineHeight: 1 }}
            >
              🛡️
            </motion.div>
          </div>

          {/* Title */}
          <h1 style={{
            fontFamily: "'Cinzel', 'Orbitron', serif",
            fontSize: 34,
            fontWeight: 900,
            letterSpacing: 4,
            margin: "0 0 12px 0",
            background: "linear-gradient(135deg, #FFFFFF 0%, #F5E6B3 35%, #D4AF37 70%, #AA771C 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            textShadow: "0 2px 10px rgba(0,0,0,0.5)",
            textTransform: "uppercase"
          }}>
            Artifact Sealed & Transmitted
          </h1>

          {/* Royal Spear Divider */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, margin: "20px auto 28px", opacity: 0.8 }}>
            <div style={{ height: 1, width: 80, background: "linear-gradient(90deg, transparent, #D4AF37)" }} />
            <div style={{ color: "#D4AF37", fontSize: 14, letterSpacing: 2 }}>❖ DATACRON PROTOCOL ❖</div>
            <div style={{ height: 1, width: 80, background: "linear-gradient(90deg, #D4AF37, transparent)" }} />
          </div>

          {/* Security Vault Notification */}
          <div style={{
            background: "linear-gradient(90deg, rgba(40, 15, 20, 0.6) 0%, rgba(20, 12, 18, 0.8) 50%, rgba(40, 15, 20, 0.6) 100%)",
            border: "1px solid rgba(255, 60, 60, 0.3)",
            borderRadius: 8,
            padding: "16px 24px",
            marginBottom: 36,
            display: "inline-block",
            maxWidth: "90%",
            boxShadow: "0 4px 20px rgba(0,0,0,0.4)"
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, color: "#FF5555", fontFamily: "'Orbitron', sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: 2, marginBottom: 4 }}>
              <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "#FF5555", boxShadow: "0 0 8px #FF5555" }} />
              LOCKDOWN PROTOCOL ACTIVE
            </div>
            <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 13, color: "rgba(255, 235, 235, 0.85)", letterSpacing: 0.5, lineHeight: 1.5 }}>
              Your submission is locked in the sanctuary. You must remain at this terminal until the trial countdown concludes.
            </div>
          </div>

          {/* Luxury Chronometer Display */}
          <div style={{
            background: "linear-gradient(180deg, rgba(20, 16, 22, 0.9) 0%, rgba(8, 6, 10, 0.95) 100%)",
            padding: "28px 36px",
            borderRadius: 12,
            border: "1px solid rgba(212, 175, 55, 0.35)",
            boxShadow: "0 15px 35px rgba(0,0,0,0.7), inset 0 0 30px rgba(212, 175, 55, 0.08)",
            marginBottom: 36,
            position: "relative"
          }}>
            <div style={{ position: "absolute", top: 8, left: 8, width: 8, height: 8, borderTop: "1px solid #D4AF37", borderLeft: "1px solid #D4AF37" }} />
            <div style={{ position: "absolute", top: 8, right: 8, width: 8, height: 8, borderTop: "1px solid #D4AF37", borderRight: "1px solid #D4AF37" }} />
            <div style={{ position: "absolute", bottom: 8, left: 8, width: 8, height: 8, borderBottom: "1px solid #D4AF37", borderLeft: "1px solid #D4AF37" }} />
            <div style={{ position: "absolute", bottom: 8, right: 8, width: 8, height: 8, borderBottom: "1px solid #D4AF37", borderRight: "1px solid #D4AF37" }} />

            <div style={{ fontSize: 11, fontFamily: "'Orbitron', sans-serif", color: "rgba(212, 175, 55, 0.8)", letterSpacing: 5, marginBottom: 12 }}>ROUND TIME REMAINING</div>

            <motion.div
              animate={{ opacity: [0.95, 1, 0.95] }}
              transition={{ duration: 2, repeat: Infinity }}
              style={{
                fontSize: 60,
                fontFamily: "'Orbitron', sans-serif",
                fontWeight: 900,
                letterSpacing: 4,
                color: "#FDF5E6",
                textShadow: "0 0 20px rgba(212,175,55,0.7), 0 0 40px rgba(212,175,55,0.3), 0 2px 4px rgba(0,0,0,0.8)"
              }}
            >
              {fmtTime(timeLeft)}
            </motion.div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 14 }}>
              <div style={{ width: 4, height: 4, borderRadius: "50%", background: "#D4AF37" }} />
              <div style={{ fontSize: 11, fontFamily: "'Space Grotesk', sans-serif", color: "rgba(255, 255, 255, 0.6)", letterSpacing: 1.5 }}>
                AUTOMATIC PHASE TRANSITION AT 00:00
              </div>
              <div style={{ width: 4, height: 4, borderRadius: "50%", background: "#D4AF37" }} />
            </div>
          </div>


        </motion.div>
      </motion.div>
    );
  }

  if (isGeminiLaunched) {
    return (
      <motion.div layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="ac-protected-content" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', width: "50vw", padding: "32px 40px", boxSizing: "border-box", position: "relative", zIndex: 1 }}>
        {warningBanner}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32 }}>
          <div style={{ fontSize: 40, fontFamily: "'Orbitron'", color: (isPaused || effectivelyEnded) ? "#ff2a2a" : "#D4AF37", textShadow: `0 0 10px ${(isPaused || effectivelyEnded) ? 'rgba(255,42,42,0.5)' : 'rgba(212,175,55,0.5)'}`, letterSpacing: 2, marginTop: 4 }}>
            {(isPaused || effectivelyEnded) ? "00:00" : fmtTime(timeLeft)}
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 12 }}>
            <div className="title-secondary" style={{ marginBottom: 0, border: "none", fontSize: 24, letterSpacing: 2, color: "var(--neon-cyan)" }}>{roundLabel}</div>
          </div>
        </div>

        <motion.div layout className="glass-panel" style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "32px", width: "100%", maxWidth: "800px", margin: "0 auto", boxSizing: "border-box" }}>
          <div style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 24 }}>
            <div className="title-secondary" style={{ marginBottom: 0, fontSize: 20 }}>TARGET DATACRON</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
              <div style={{ color: "var(--neon-cyan)", fontSize: 10, letterSpacing: 2 }}>SAVE GEMINI LINK (FOR REFRESH)</div>
              <div style={{ display: "flex", gap: 8 }}>
                <input type="url" placeholder="Paste Gemini URL..." value={savedSessionLink || tempSessionLink} onChange={e => setTempSessionLink(e.target.value)} readOnly={!!savedSessionLink} style={{ padding: "6px 10px", background: "rgba(0,0,0,0.5)", border: "1px solid var(--neon-cyan)", color: "#fff", fontFamily: "'Share Tech Mono'", outline: "none", borderRadius: 4, width: 220, fontSize: 12, opacity: savedSessionLink ? 0.6 : 1 }} />
                {!savedSessionLink && (
                  <button className="btn-imperial" style={{ padding: "6px 12px", fontSize: 12, borderColor: "var(--neon-green)", color: "var(--neon-green)" }} onClick={() => { if (tempSessionLink.includes('gemini.google.com')) { localStorage.setItem(`gemini_session_${teamId}_${storageKey}`, tempSessionLink); setSavedSessionLink(tempSessionLink); } else { alert("Please enter a valid Gemini link."); } }}>SAVE</button>
                )}
              </div>
            </div>
          </div>

          {targetImage ? (
            <motion.div layout style={{ width: "100%", flex: 1, minHeight: 300, display: "flex", justifyContent: "center", alignItems: "center", background: "rgba(0,0,0,0.3)", borderRadius: 8, padding: 16, border: "1px solid rgba(255,255,255,0.1)", marginBottom: 24 }}>
              <motion.img layoutId="target-image" src={targetImage} alt="target" style={{ maxWidth: "100%", maxHeight: "50vh", objectFit: "contain", borderRadius: 4, boxShadow: "0 0 20px rgba(0,0,0,0.5)" }} />
            </motion.div>
          ) : (
            <div style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center", color: "var(--text-dim)", fontFamily: "'Orbitron'" }}>NO TARGET</div>
          )}

          {!uploadedImgUrl ? (
            <motion.label layout style={{ width: "100%", cursor: uploading ? "not-allowed" : "pointer" }}>
              <div style={{ width: "100%", padding: "16px", border: "1px solid rgba(0, 255, 255, 0.3)", borderRadius: 8, background: "rgba(0,0,0,0.6)", textAlign: "center", transition: "all 0.3s", boxShadow: "inset 0 0 10px rgba(0, 255, 255, 0.05)" }}>
                <span style={{ color: uploading ? "var(--text-dim)" : "var(--neon-cyan)", fontSize: 16, letterSpacing: 2, fontFamily: "'Orbitron'", fontWeight: "bold" }}>{uploading ? "UPLOADING ARTIFACT..." : "UPLOAD GENERATED IMAGE"}</span>
                <input type="file" accept="image/*" style={{ display: "none" }} onChange={handleUpload} disabled={uploading} />
              </div>
            </motion.label>
          ) : (
            <motion.div layout style={{ width: "100%" }}>
              <div className="title-secondary" style={{ marginBottom: 16, fontSize: 16 }}>REVIEW SPELL</div>
              <div style={{ width: "100%", display: "flex", justifyContent: "center", alignItems: "center", background: "rgba(0,0,0,0.3)", borderRadius: 8, padding: 16, border: "1px solid rgba(212, 175, 55, 0.4)", marginBottom: 24 }}>
                <img src={uploadedImgUrl} alt="generated preview" style={{ maxWidth: "100%", maxHeight: "30vh", objectFit: "contain", borderRadius: 4 }} />
              </div>
              <div style={{ width: "100%", marginBottom: 16 }}>
                <div style={{ color: "var(--neon-cyan)", fontSize: 12, marginBottom: 8, letterSpacing: 2 }}>{savedSessionLink ? "GEMINI CHAT LINK (SAVED):" : "GEMINI CHAT LINK (MANDATORY):"}</div>
                <input type="url" placeholder="https://gemini.google.com/app/..." value={geminiLink} onChange={e => setGeminiLink(e.target.value)} style={{ width: "100%", padding: "16px", background: "rgba(0,0,0,0.5)", border: "1px solid var(--neon-cyan)", color: "#fff", fontFamily: "'Share Tech Mono'", outline: "none", borderRadius: 4 }} />
              </div>
              <div style={{ display: "flex", gap: 16 }}>
                <button className="btn-imperial-danger" style={{ flex: 1, padding: 16 }} onClick={() => setUploadedImgUrl(null)}>RETRY</button>
                {/*
                  // Original feature: submission not allowed till timer ends
                  <button className="btn-imperial" style={{ flex: 2, padding: 16, borderColor: (!effectivelyEnded ? "var(--text-dim)" : "var(--neon-green)"), color: (!effectivelyEnded ? "var(--text-dim)" : "var(--neon-green)"), opacity: (verifying || !effectivelyEnded) ? 0.5 : 1, cursor: !effectivelyEnded ? "not-allowed" : "pointer" }} onClick={effectivelyEnded ? handleSubmit : undefined} disabled={verifying || !effectivelyEnded}>{verifying ? "VERIFYING..." : (!effectivelyEnded ? "AWAITING ROUND END..." : "SUBMIT TO DATACRON ➔")}</button>
                */}
                <button className="btn-imperial" style={{ flex: 2, padding: 16, borderColor: "var(--neon-green)", color: "var(--neon-green)", opacity: verifying ? 0.5 : 1, cursor: "pointer" }} onClick={handleSubmit} disabled={verifying}>{verifying ? "VERIFYING..." : "SUBMIT TO DATACRON ➔"}</button>
              </div>
            </motion.div>
          )}
        </motion.div>
      </motion.div>
    );
  }

  return (
    <motion.div layout className="chat-layout" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      {warningBanner}
      <div className="chat-sidebar">
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <img src={gdgLogo} alt="GDG Logo" style={{ width: 40 }} />
          <div className="title-secondary" style={{ marginBottom: 0, border: "none" }}>{roundLabel}</div>
        </div>
        <div style={{ fontFamily: "'Share Tech Mono'", color: "var(--neon-cyan)", marginBottom: 24, fontSize: 14 }}>{playerLabel} IS AT THE TERMINAL</div>
        <div style={{ textAlign: "center", marginBottom: 24, background: "rgba(0,0,0,0.5)", padding: 16, border: "1px solid rgba(212,175,55,0.2)" }}>
          <div style={{ fontSize: 32, fontFamily: "'Orbitron'", color: (isPaused || effectivelyEnded) ? "#ff2a2a" : "#D4AF37", textShadow: `0 0 10px ${(isPaused || effectivelyEnded) ? 'rgba(255,42,42,0.5)' : 'rgba(212,175,55,0.5)'}` }}>
            {(isPaused || effectivelyEnded) ? "00:00" : fmtTime(timeLeft)}
          </div>
          <div style={{ fontSize: 10, letterSpacing: 4, color: (isPaused || effectivelyEnded) ? "#ff2a2a" : "rgba(212,175,55,0.6)" }}>
            {isPaused ? "TEMPORAL HALT" : (effectivelyEnded ? "PHASE SEALED" : "TIME REMAINING")}
          </div>
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <div style={{ color: "var(--text-dim)", marginBottom: 8, fontSize: 14 }}>TARGET DATACRON:</div>
          <motion.div layout className="glass-panel" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 0, maxHeight: 400, overflow: "hidden" }}>
            {targetImage ? <motion.img layoutId="target-image" src={targetImage} alt="target" style={{ width: "100%", height: "100%", objectFit: "contain" }} /> : <div style={{ color: "var(--text-dim)", fontFamily: "'Orbitron'" }}>NO TARGET</div>}
          </motion.div>
        </div>
      </div>
      <motion.div layout className="chat-main" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 40 }}>
        {effectivelyEnded ? (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>🔒</div>
            <div style={{ fontFamily: "'Orbitron'", fontSize: 24, color: "var(--neon-red)" }}>PHASE SEALED</div>
            <div style={{ color: "var(--text-dim)", marginTop: 16 }}>This phase has been closed.</div>
          </div>
        ) : (
          <div className="glass-panel" style={{ width: "100%", maxWidth: 600, textAlign: "center", padding: 48 }}>
            <div style={{ fontSize: 48, marginBottom: 24 }}>✨</div>
            <div style={{ fontFamily: "'Orbitron'", fontSize: 24, color: "var(--neon-gold)", marginBottom: 16 }}>SPELL GENERATION</div>
            <div style={{ color: "var(--text-dim)", marginBottom: 32, lineHeight: 1.6 }}>Launch Gemini in Split-Screen Mode to generate your spell.<br />Your target image will remain visible here.</div>
            <button className="btn-imperial" onClick={launchGemini} style={{ width: "100%", padding: 20, fontSize: 16, display: "flex", justifyContent: "center", gap: 12 }}>{savedSessionLink ? "RE-CONTINUE GEMINI SESSION ➔" : "LAUNCH GEMINI (SPLIT SCREEN) ➔"}</button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
};

const SelectionScreen = ({ imgR2, imgR3, onSelect }) => (
  <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 40, position: "relative", zIndex: 1 }}>
    <img src={gdgLogo} alt="GDG Logo" style={{ width: 60, marginBottom: 20 }} />
    <div className="title-primary" style={{ marginBottom: 16 }}>FINAL SELECTION</div>
    <div style={{ fontFamily: "'Share Tech Mono'", color: "var(--text-dim)", marginBottom: 40, fontSize: 18 }}>CHOOSE THE IMAGE THAT BEST MATCHES THE TARGET</div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40, width: "100%", maxWidth: 1000 }}>
      <div className="glass-panel" style={{ textAlign: "center" }}>
        <div className="title-secondary">ROUND 2 OUTPUT</div>
        <img src={imgR2} alt="R2" style={{ width: "100%", aspectRatio: "1/1", objectFit: "contain", marginBottom: 24, borderRadius: 6 }} />
        <button className="btn" onClick={() => onSelect(imgR2)}>SELECT THIS</button>
      </div>
      <div className="glass-panel" style={{ textAlign: "center" }}>
        <div className="title-secondary">ROUND 3 OUTPUT</div>
        <img src={imgR3} alt="R3" style={{ width: "100%", aspectRatio: "1/1", objectFit: "contain", marginBottom: 24, borderRadius: 6 }} />
        <button className="btn" onClick={() => onSelect(imgR3)}>SELECT THIS</button>
      </div>
    </div>
  </div>
);

const JudgmentScreen = ({ originalImg, finalImg, score, scoreStatus, onRedirect }) => {
  const [countdown, setCountdown] = useState(60);
  const status = scoreStatus || (score === null || score === undefined ? "pending" : "revealed");

  useEffect(() => {
    if (status !== "revealed") return; // Wait until AI Siamese model finishes scoring!
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          if (onRedirect) onRedirect();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [status, onRedirect]);

  const isPending = status === "pending";
  const isError = status === "error";
  const headerColor = isError ? "#ff2a2a" : isPending ? "var(--neon-cyan)" : "var(--neon-gold)";

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 40, position: "relative", zIndex: 1 }}>
      <img src={gdgLogo} alt="GDG Logo" style={{ width: 80, marginBottom: 20 }} />
      <div className="title-primary" style={{ marginBottom: 20, color: "var(--neon-gold)", textShadow: "0 0 20px var(--neon-gold)", animation: "pulse 2s infinite" }}>SIMILARITY RESULTS</div>

      <div style={{ fontFamily: "'Orbitron'", color: headerColor, fontSize: 26, marginBottom: 16, letterSpacing: 4, textAlign: "center", textShadow: `0 0 20px ${headerColor}` }}>
        {isError ? "⚠️ VERDICT UNAVAILABLE" : isPending ? "⏳ SIAMESE NEURAL NET COMPUTING VERDICT..." : "⚡ SPELL MATCH VERDICT SEALED ⚡"}
      </div>

      <div style={{ fontFamily: "'Share Tech Mono'", color: "var(--neon-gold)", fontSize: 16, marginBottom: 40, letterSpacing: 2, background: "rgba(0,0,0,0.6)", padding: "10px 24px", borderRadius: 4, border: "1px solid rgba(212,175,55,0.4)" }}>
        {isError ? (
          <span style={{ color: "#ff2a2a" }}>
            AI SERVICE DID NOT RESPOND — NOTIFY ADMIN
          </span>
        ) : isPending ? (
          <span style={{ color: "var(--neon-cyan)", animation: "pulse 1.5s infinite" }}>
            🤖 EVALUATING HIGH-RES PIXEL MATRIX (~30-40s)... PLEASE HOLD POSITION
          </span>
        ) : (
          <span>
            AUTOMATIC REDIRECT TO LEADERBOARD IN: <span style={{ color: "#fff", fontWeight: "bold", fontSize: 18 }}>{countdown}s</span>
          </span>
        )}
      </div>

      <div style={{ display: "flex", gap: 60, alignItems: "center", width: "100%", maxWidth: 1200, perspective: 1000 }}>
        <div className="glass-panel cinematic-card" style={{ flex: 1, textAlign: "center", transform: "rotateY(10deg)" }}>
          <div className="title-secondary">TARGET DATACRON</div>
          <img src={originalImg} alt="orig" style={{ width: "100%", aspectRatio: "1/1", objectFit: "contain", borderRadius: 8, boxShadow: "0 0 30px rgba(0,0,0,0.8)" }} />
        </div>
        <div style={{ width: 300, textAlign: "center", animation: isPending ? "pulse 1.5s infinite" : "float 4s infinite" }}>
          {isError ? (
            <div style={{ padding: 20, background: "rgba(255,42,42,0.05)", borderRadius: 12, border: "1px dashed #ff2a2a" }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>⚠️</div>
              <div style={{ fontFamily: "'Orbitron'", color: "#ff2a2a", fontSize: 16, letterSpacing: 2 }}>NO VERDICT</div>
            </div>
          ) : (
            <div>
              <ScoreDigits status={status} score={score} size={84} />
              <div style={{ fontFamily: "'Share Tech Mono'", color: "var(--neon-cyan)", letterSpacing: 6, fontSize: 16, marginTop: 12, fontWeight: "bold" }}>SIAMESE MATCH</div>
            </div>
          )}
        </div>
        <div className="glass-panel cinematic-card" style={{ flex: 1, textAlign: "center", transform: "rotateY(-10deg)" }}>
          <div className="title-secondary">GENERATED SPELL</div>
          <img src={finalImg} alt="final" style={{ width: "100%", aspectRatio: "1/1", objectFit: "contain", borderRadius: 8, boxShadow: "0 0 30px rgba(0,0,0,0.8)" }} />
        </div>
      </div>

      {isError && (
        <button
          onClick={onRedirect}
          className="btn-imperial"
          style={{ marginTop: 40, padding: "16px 40px", letterSpacing: 4, fontSize: 14, cursor: "pointer" }}
        >
          RETURN TO LOBBY
        </button>
      )}
    </div>
  );
};

const LeaderboardRedirect = ({ teams }) => {
  const sorted = [...teams].filter(t => t.score).sort((a, b) => b.score - a.score).slice(0, 3);
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", position: "relative", zIndex: 1 }}>
      <img src={gdgLogo} alt="GDG Logo" style={{ width: 80, marginBottom: 20 }} />
      <div className="title-primary" style={{ marginBottom: 40 }}>FINAL LEADERBOARD</div>
      <div className="glass-panel" style={{ width: 600 }}>
        {sorted.map((t, i) => (
          <div key={t.id} style={{ display: "flex", justifyContent: "space-between", padding: "16px 0", borderBottom: i < 2 ? "1px solid var(--glass-border)" : "none", fontSize: 24, fontFamily: "'Orbitron'" }}>
            <div style={{ color: i === 0 ? "var(--neon-gold)" : i === 1 ? "silver" : "#cd7f32" }}>#{i + 1} {t.name}</div>
            <div style={{ color: "var(--neon-cyan)" }}>{t.score ? t.score.toFixed(1) : 0}%</div>
          </div>
        ))}
        {sorted.length === 0 && <div style={{ textAlign: "center", color: "var(--text-dim)", fontFamily: "'Share Tech Mono'" }}>NO TEAMS HAVE COMPLETED THE TRIAL YET</div>}
      </div>
    </div>
  );
};

const PlayerSection = ({ globalTeams, setGlobalTeams }) => {
  const [myTeam, setMyTeam] = useState(() => {
    try { const t = localStorage.getItem("maya_my_team"); return t ? JSON.parse(t) : null; } catch { return null; }
  });
  useEffect(() => {
    if (myTeam) localStorage.setItem("maya_my_team", JSON.stringify(myTeam));
  }, [myTeam]);

  const [localTeamState, setLocalTeamState] = useState({});
  const serverTeamState = globalTeams.find(t => t.id === myTeam?.id) || {};
  const currentTeamState = { ...serverTeamState, ...localTeamState };

  const phase = currentTeamState.phase || (myTeam ? "lobby" : "register");
  const disqualifiedReason = currentTeamState.disqualifiedReason || null;
  const r1Img = currentTeamState.r1Img || (myTeam?.id ? localStorage.getItem(`maya_subimg_${myTeam.id}_r1`) : null) || null;
  const r2Img = currentTeamState.r2Img || (myTeam?.id ? localStorage.getItem(`maya_subimg_${myTeam.id}_r2`) : null) || null;
  const r3Img = currentTeamState.r3Img || (myTeam?.id ? localStorage.getItem(`maya_subimg_${myTeam.id}_r3`) : null) || null;
  const finalImg = currentTeamState.finalImage || null;
  const score = currentTeamState.score || null;

  const [targetImage, setTargetImage] = useState(() => {
    try { return localStorage.getItem("maya_targetImage") || null; } catch { return null; }
  });

  useEffect(() => {
    if (targetImage) localStorage.setItem("maya_targetImage", targetImage);
  }, [targetImage]);

  // ALWAYS restore the targetImage if it's somehow missing, regardless of the round phase!
  useEffect(() => {
    if (myTeam?.id && !targetImage) {
      fetch(`${API}/api/target-image?teamId=${myTeam.id}`)
        .then(r => r.json())
        .then(d => { if (d.url) setTargetImage(d.url); })
        .catch(console.error);
    }
  }, [myTeam?.id, targetImage]);

  // Ensure previous round's image is always fetched from backend if missing in Round 2 or Round 3!
  useEffect(() => {
    if (!myTeam?.id) return;
    if ((phase === "r2" || phase === "wait_for_r2_end" || phase === "interval1") && !r1Img) {
      fetch(`${API}/api/target-image?teamId=${myTeam.id}`)
        .then(r => r.json())
        .then(d => {
          if (d.url) {
            setR1Img(d.url);
            try { localStorage.setItem(`maya_subimg_${myTeam.id}_r1`, d.url); } catch {}
          }
        })
        .catch(() => {});
    }
    if ((phase === "r3" || phase === "wait_for_r3_end" || phase === "interval2" || phase === "select" || phase === "judgment") && !r2Img) {
      fetch(`${API}/api/target-image?teamId=${myTeam.id}`)
        .then(r => r.json())
        .then(d => {
          if (d.url) {
            setR2Img(d.url);
            try { localStorage.setItem(`maya_subimg_${myTeam.id}_r2`, d.url); } catch {}
          }
        })
        .catch(() => {});
    }
  }, [phase, myTeam?.id, r1Img, r2Img]);

  const updateTeamStatus = async (updates) => {
    setLocalTeamState(prev => ({ ...prev, ...updates }));
    setGlobalTeams(prev => prev.map(t => t.id === myTeam.id ? { ...t, ...updates } : t));
    try {
      await fetch(`${API}/api/game/teams/${myTeam.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates)
      });
    } catch (e) { }
  };

  const setPhase = (p) => updateTeamStatus({ phase: p });
  const setDisqualifiedReason = (r) => updateTeamStatus({ disqualifiedReason: r, status: "banned" });
  const setR1Img = (img) => updateTeamStatus({ r1Img: img });
  const setR2Img = (img) => updateTeamStatus({ r2Img: img });
  const setR3Img = (img) => updateTeamStatus({ r3Img: img });
  const setFinalImg = (img) => updateTeamStatus({ finalImage: img });
  const setScore = (s) => updateTeamStatus({ score: s });
  const [scoreStatus, setScoreStatus] = useState("pending");

  const [session, setSession] = useState(null);

  const handleDisqualify = useCallback((reason) => {
    if (!myTeam) return;
    setDisqualifiedReason(reason);

    // Broadcast ban to admin instantly
    setGlobalTeams(prev => prev.map(t => t.id === myTeam.id ? { ...t, status: "banned" } : t));

    // Try to update backend if endpoint exists (fire and forget)
    fetch(`${API}/api/game/teams/${myTeam.id}/ban`, { method: "POST" }).catch((e) => { console.error(e); });
  }, [myTeam, setDisqualifiedReason, setGlobalTeams]);

  useEffect(() => {
    if (!myTeam) return;
    const fetchSession = async () => {
      try {
        const res = await fetch(`${API}/api/game/status`);
        const data = await res.json();
        if (data.session) setSession(data.session);
      } catch (err) { console.error(err); }
    };
    fetchSession();
    const interval = setInterval(fetchSession, 3000);
    return () => clearInterval(interval);
  }, [myTeam]);

  const [timeLeft, setTimeLeft] = useState(0);

  useEffect(() => {
    if (!session || !myTeam) return;
    const s = session?.status || 'waiting';

    if (s === 'waiting' && phase !== 'lobby' && phase !== 'register') {
      setPhase("lobby");
    }
    else if (s === 'round1_active' && !['r1', 'wait_for_r1_end', 'interval1'].includes(phase)) {
      fetch(`${API}/api/target-image?teamId=${myTeam.id}`)
        .then(r => r.json())
        .then(d => { setTargetImage(d.url); setPhase("r1"); })
        .catch(e => { console.error(e); setPhase("r1"); });
    }
    else if (phase === 'wait_for_r1_end' && timeLeft <= 0 && !s.endsWith('_ended')) {
      setPhase("interval1");
    }
    else if (s === 'round2_active' && !['r2', 'wait_for_r2_end', 'wait_for_r3'].includes(phase)) {
      setPhase("r2");
    }
    else if (phase === 'wait_for_r2_end' && timeLeft <= 0 && !s.endsWith('_ended')) {
      setPhase("wait_for_r3");
    }
    else if (s === 'round3_active' && !['r3', 'wait_for_r3_end', 'select', 'judgment', 'leaderboard'].includes(phase)) {
      setPhase("r3");
    }
    else if (phase === 'wait_for_r3_end' && timeLeft <= 0 && !s.endsWith('_ended')) {
      setPhase("select");
    }
    else if (s === 'finished' && phase !== 'leaderboard') {
      setPhase("leaderboard");
    }
  }, [session?.status, myTeam, phase, setPhase, setTargetImage, timeLeft]);

  useEffect(() => {
    if (!session?.roundEndTime) {
      const timer = setTimeout(() => setTimeLeft(0), 0);
      return () => clearTimeout(timer);
    }
    const tick = () => {
      if (session.isPaused && session.timeRemainingAtPause != null) {
        setTimeLeft(Math.floor(session.timeRemainingAtPause / 1000));
      } else {
        setTimeLeft(Math.max(0, Math.floor((new Date(session.roundEndTime) - Date.now()) / 1000)));
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [session?.roundEndTime, session?.isPaused, session?.timeRemainingAtPause, session?.status]);

  const isPaused = session?.isPaused || false;
  const forceCloseWindow = isPaused || (timeLeft <= 0 && session?.status?.includes('_active'));
  const isActiveRound = session?.status?.includes('_active') || false;

  // Anti-cheat hook — active only for player view
  const { registerGeminiWindow } = useAntiCheat({
    isPlayer: true,
    teamId: myTeam?.id || null,
    onDisqualify: handleDisqualify,
    isPaused,
    forceCloseWindow,
    isActiveRound
  });

  useEffect(() => {
    if (myTeam && phase === "register") {
      setPhase("lobby");
    }
  }, [myTeam, phase, setPhase]);

  useEventListener((eventType) => {
    if (eventType === "GLOBAL_RESET") {
      localStorage.removeItem("maya_my_team");
      localStorage.removeItem("maya_phase");
      localStorage.removeItem("maya_targetImage");
      localStorage.removeItem("maya_r1Img");
      localStorage.removeItem("maya_r2Img");
      localStorage.removeItem("maya_r3Img");
      localStorage.removeItem("maya_finalImg");
      localStorage.removeItem("maya_score");
      Object.keys(localStorage).forEach(k => {
        if (k.startsWith("maya_submitted_") || k.startsWith("maya_sublink_") || k.startsWith("maya_subimg_")) localStorage.removeItem(k);
      });
      window.location.reload();
    }
  });

  const handleRegister = (t) => {
    setTargetImage(null);
    setMyTeam(t);
    setGlobalTeams(prev => [...prev, t]);
    // The backend will have phase='lobby' initially, so we don't need to push phase="lobby" unless we want to explicitly.
    // updateTeamStatus({ phase: "lobby" }); is not strictly needed because we derive phase="lobby" if not present.
    // Wait, let's explicitly push it.
    fetch(`${API}/api/game/teams/${t._id || t.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phase: "lobby" })
    }).catch((e) => { console.error(e); });
  };

  if (!myTeam) return <RegistrationScreen onRegister={handleRegister} />;

  if (disqualifiedReason) {
    return <DisqualifiedScreen teamName={myTeam.name} reason={disqualifiedReason} />;
  }

  if (currentTeamState?.status === "banned") {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", position: "relative", zIndex: 1 }}>
        <div style={{ fontSize: 64, marginBottom: 20 }}>☠️</div>
        <div className="title-primary" style={{ color: "var(--neon-red)" }}>BANNED</div>
        <div style={{ fontFamily: "'Share Tech Mono'", color: "var(--neon-red)", marginTop: 16 }}>YOUR TEAM HAS BEEN REMOVED FROM THE TRIAL</div>
      </div>
    );
  }

  const status = session?.status || 'waiting';
  const displayTimeLeft = status.endsWith('_ended') ? 0 : timeLeft;

  // Common props passed to all RoundDisplay instances
  const roundProps = {
    teamId: myTeam.id,
    isPaused,
    timeLeft: displayTimeLeft,
    registerGeminiWindow,
    onImageUploaded: (img, key) => {
      if (key === 'r1') setR1Img(img);
      if (key === 'r2') setR2Img(img);
      if (key === 'r3') setR3Img(img);
    }
  };

  if (phase === "lobby") return <LobbyScreen />;
  if (phase === "r1") return <RoundDisplay key="r1" {...roundProps} storageKey="r1" playerLabel={`PLAYER 1 (${myTeam.player1})`} targetImage={targetImage} roundLabel="ROUND 1: INITIAL CREATION" onComplete={(img, link) => { setR1Img(img); updateTeamStatus({ round: 1, r1Link: link }); setPhase("wait_for_r1_end"); }} isRoundEnded={status === 'round1_ended'} />;
  if (phase === "wait_for_r1_end") return <IntervalScreen key="wait1" title="HOLD POSITION" message="AWAITING ADMIN PROTOCOL FOR ROUND 1 COMPLETION" timeLeft={displayTimeLeft} isPaused={isPaused} />;
  if (phase === "interval1") return <IntervalScreen key="int1" title="VERBAL TRANSFER" message={`PLAYER 1 (${myTeam.player1}), describe the target image to PLAYER 2 (${myTeam.player2}) verbally. Do not show them the screen!`} localDurationKey={`verbal_transfer_${session?.roundEndTime || '1'}`} localDuration={5} />;
  if (phase === "r2") return <RoundDisplay key="r2" {...roundProps} storageKey="r2" playerLabel={`PLAYER 2 (${myTeam.player2})`} targetImage={r1Img} roundLabel="ROUND 2: BLIND RECREATION" onComplete={(img, link) => { setR2Img(img); updateTeamStatus({ round: 2, r2Link: link }); setPhase("wait_for_r2_end"); }} isRoundEnded={status === 'round2_ended'} />;
  if (phase === "wait_for_r2_end") return <IntervalScreen key="wait2" title="HOLD POSITION" message="AWAITING ADMIN PROTOCOL FOR ROUND 2 COMPLETION" timeLeft={displayTimeLeft} isPaused={isPaused} />;
  if (phase === "wait_for_r3") return <IntervalScreen key="wait3" title="PLAYER SWITCHING" message={`PLAYER 2 (${myTeam.player2}), step back. PLAYER 1 (${myTeam.player1}), prepare for ROUND 3.`} localDurationKey={`player_switching_${session?.roundEndTime || '2'}`} localDuration={5} />;
  if (phase === "r3") return <RoundDisplay key="r3" {...roundProps} storageKey="r3" playerLabel={`PLAYER 1 (${myTeam.player1})`} targetImage={r2Img} roundLabel="ROUND 3: REFINEMENT" onComplete={(img, link) => { setR3Img(img); updateTeamStatus({ r3Link: link }); setPhase("wait_for_r3_end"); }} isRoundEnded={status === 'round3_ended'} />;
  if (phase === "wait_for_r3_end") return <IntervalScreen key="wait_r3_end" title="HOLD POSITION" message="AWAITING ADMIN PROTOCOL FOR ROUND 3 COMPLETION" timeLeft={displayTimeLeft} isPaused={isPaused} />;
  if (phase === "select") return <SelectionScreen imgR2={r2Img} imgR3={r3Img} onSelect={async (img) => {
    setFinalImg(img);
    setPhase("judgment");
    setScoreStatus("pending");

    const MAX_ATTEMPTS = 3;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const res = await fetch(`${API}/api/similarity`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ teamId: myTeam.id, original_url: targetImage, submitted_url: img })
        });
        const data = await res.json();
        if (res.ok && typeof data.similarity_score === "number") {
          setScore(data.similarity_score);
          setScoreStatus("revealed");
          updateTeamStatus({ round: 3, score: data.similarity_score, finalImage: img });
          return;
        }
        throw new Error(data.error || "Invalid similarity response");
      } catch (e) {
        console.error(`Similarity request failed (attempt ${attempt}/${MAX_ATTEMPTS}):`, e);
        if (attempt === MAX_ATTEMPTS) {
          setScoreStatus("error");
          updateTeamStatus({ round: 3, finalImage: img });
        } else {
          await new Promise(r => setTimeout(r, attempt * 1000));
        }
      }
    }
  }} />;
  if (phase === "judgment") return <JudgmentScreen originalImg={targetImage} finalImg={finalImg} score={score} scoreStatus={scoreStatus} onRedirect={() => setPhase("leaderboard")} />;
  if (phase === "leaderboard") return <LeaderboardRedirect teams={globalTeams} />;

  return null;
};

export default function App() {
  const getView = () => { const h = window.location.hash; if (h === "#admin") return "admin"; return "player"; };
  const [view, setView] = useState(getView);
  useEffect(() => { const h = () => setView(getView()); window.addEventListener("hashchange", h); return () => window.removeEventListener("hashchange", h); }, []);

  const [teams, setTeams] = useState([]);

  useEffect(() => {
    const fetchTeams = async () => {
      try {
        const res = await fetch(`${API}/api/admin/teams`);
        const data = await res.json();
        if (data.success) {
          const parsedTeams = data.teams.map(t => ({ ...t, id: t._id || t.id }));
          setTeams(parsedTeams);
          try {
            const localTeamStr = localStorage.getItem("maya_my_team");
            if (localTeamStr && window.location.hash !== "#admin") {
              const localTeam = JSON.parse(localTeamStr);
              if (!parsedTeams.find(t => t.id === localTeam.id)) {
                localStorage.removeItem("maya_my_team");
                window.location.reload();
              }
            }
          } catch (err) { }
        }
      } catch (e) { }
    };
    fetchTeams();
    const interval = setInterval(fetchTeams, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <>
      <GlobalStyles />
      {/* Anti-cheat violation banner — rendered once at root, shown by JS */}
      <div id="ac-violation-banner" className="ac-violation-banner" aria-hidden="true" />
      <SceneWrapper>
        {view === "admin" && <AdminDashboard teams={teams} setTeams={setTeams} />}
        {view === "player" && <PlayerSection globalTeams={teams} setGlobalTeams={setTeams} />}
      </SceneWrapper>
    </>
  );
}
