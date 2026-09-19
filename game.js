/**
 * ============================================================================
 * RACING GAME - CYBERPUNK 3D
 * Pure HTML5 Canvas + Web Audio API + Vanilla JavaScript
 * Zero external libraries or frameworks. Single-folder standalone architecture.
 * ============================================================================
 */

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // CONSTANTS & CONFIGURATION
  // ---------------------------------------------------------------------------
  const FPS = 60;
  const STEP = 1 / FPS;
  const ROAD_WIDTH = 2000;
  const SEGMENT_LENGTH = 200;
  const RUMBLE_LENGTH = 3;
  const LANES = 3;
  const FIELD_OF_VIEW = 100;
  const CAMERA_HEIGHT = 1000;
  const DRAW_DISTANCE = 300;

  // Colors
  const COLOR_PALETTE = {
    cyan: { primary: '#00f3ff', glow: 'rgba(0, 243, 255, 0.6)', dark: '#005f66' },
    magenta: { primary: '#ff007f', glow: 'rgba(255, 0, 127, 0.6)', dark: '#660033' },
    lime: { primary: '#00ff66', glow: 'rgba(0, 255, 102, 0.6)', dark: '#006622' },
    gold: { primary: '#ffe600', glow: 'rgba(255, 230, 0, 0.6)', dark: '#665c00' },
    purple: { primary: '#b700ff', glow: 'rgba(183, 0, 255, 0.6)', dark: '#480066' }
  };

  // Vehicles Specification
  const VEHICLES = [
    {
      id: 'phantom',
      name: 'APEX-01 PHANTOM',
      desc: 'Balanced high-velocity cyber interceptor',
      maxSpeed: 12000,
      accel: 5500,
      handling: 3.8,
      boostPower: 1.5,
      shieldCapacity: 100,
      color: 'cyan'
    },
    {
      id: 'hyperion',
      name: 'NEXUS HYPER-ION',
      desc: 'Experimental high-altitude rocket chassis',
      maxSpeed: 14500,
      accel: 7000,
      handling: 4.4,
      boostPower: 1.8,
      shieldCapacity: 70,
      color: 'magenta'
    },
    {
      id: 'valkyrie',
      name: 'GHOST VALKYRIE',
      desc: 'Heavy armored titanium cyber-cruiser',
      maxSpeed: 11000,
      accel: 4800,
      handling: 3.2,
      boostPower: 1.3,
      shieldCapacity: 150,
      color: 'lime'
    }
  ];

  // ---------------------------------------------------------------------------
  // PROCEDURAL WEB AUDIO SYNTHESIZER (No external audio files needed!)
  // ---------------------------------------------------------------------------
  class CyberAudio {
    constructor() {
      this.ctx = null;
      this.muted = localStorage.getItem('cyber_muted') === 'true';
      this.engineOsc = null;
      this.engineGain = null;
      this.engineSub = null;
      this.bgmPlaying = false;
      this.stepCount = 0;
      this.bpm = 128;
      this.bgmTimer = null;
    }

    init() {
      if (this.ctx) return;
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      this.ctx = new AudioContext();
      this.setupEngineSound();
    }

    resume() {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    }

    setupEngineSound() {
      if (!this.ctx) return;
      try {
        // Main turbine oscillator
        this.engineOsc = this.ctx.createOscillator();
        this.engineOsc.type = 'sawtooth';
        this.engineOsc.frequency.setValueAtTime(60, this.ctx.currentTime);

        // Sub bass rumble
        this.engineSub = this.ctx.createOscillator();
        this.engineSub.type = 'sine';
        this.engineSub.frequency.setValueAtTime(30, this.ctx.currentTime);

        // Lowpass filter for warm tone
        this.engineFilter = this.ctx.createBiquadFilter();
        this.engineFilter.type = 'lowpass';
        this.engineFilter.frequency.setValueAtTime(280, this.ctx.currentTime);

        this.engineGain = this.ctx.createGain();
        this.engineGain.gain.setValueAtTime(0, this.ctx.currentTime);

        this.engineOsc.connect(this.engineFilter);
        this.engineSub.connect(this.engineFilter);
        this.engineFilter.connect(this.engineGain);
        this.engineGain.connect(this.ctx.destination);

        this.engineOsc.start();
        this.engineSub.start();
      } catch (e) {
        console.warn('Engine audio init error', e);
      }
    }

    updateEngine(speedRatio, isAccelerating, isBoosting) {
      if (!this.ctx || !this.engineGain || this.muted) return;
      const now = this.ctx.currentTime;
      let targetFreq = 50 + speedRatio * 220;
      let targetVol = 0.04 + speedRatio * 0.12;

      if (isBoosting) {
        targetFreq *= 1.4;
        targetVol = 0.22;
      } else if (!isAccelerating) {
        targetVol *= 0.6;
      }

      this.engineOsc.frequency.setTargetAtTime(targetFreq, now, 0.05);
      this.engineSub.frequency.setTargetAtTime(targetFreq * 0.5, now, 0.05);
      this.engineFilter.frequency.setTargetAtTime(250 + speedRatio * 900, now, 0.05);
      this.engineGain.gain.setTargetAtTime(targetVol, now, 0.05);
    }

    // Play Synthwave bass and beat
    startBGM() {
      if (!this.ctx || this.bgmPlaying) return;
      this.bgmPlaying = true;
      const stepDuration = 60 / this.bpm / 4; // 16th notes

      // Bass scale (D minor cyberpunk mode)
      const bassNotes = [36.71, 36.71, 41.20, 36.71, 43.65, 36.71, 48.99, 43.65]; // D1, D1, E1, D1, F1, D1, G1, F1
      const leadNotes = [146.83, 174.61, 220.00, 261.63, 293.66, 349.23, 293.66, 220.00]; // D3, F3, A3, C4, D4, F4, D4, A3

      const tick = () => {
        if (!this.bgmPlaying || !this.ctx) return;
        if (!this.muted) {
          const now = this.ctx.currentTime;
          const s = this.stepCount % 16;

          // Kick on 0, 4, 8, 12
          if (s % 4 === 0) {
            this.playKick(now);
          }
          // Snare on 4, 12
          if (s === 4 || s === 12) {
            this.playSnare(now);
          }
          // Hi-hat on every 2nd 16th note
          if (s % 2 === 0) {
            this.playHiHat(now, s % 4 === 2 ? 0.03 : 0.015);
          }

          // Cyber Arp Bass
          const noteIndex = Math.floor(s / 2) % bassNotes.length;
          this.playBassNote(bassNotes[noteIndex], now, stepDuration * 1.5);

          // Occasional lead flourish
          if (s % 4 === 0 && Math.random() > 0.4) {
            const leadIndex = (Math.floor(s / 2) + 3) % leadNotes.length;
            this.playLeadNote(leadNotes[leadIndex], now, stepDuration * 2);
          }
        }

        this.stepCount++;
        this.bgmTimer = setTimeout(tick, stepDuration * 1000);
      };

      tick();
    }

    stopBGM() {
      this.bgmPlaying = false;
      if (this.bgmTimer) clearTimeout(this.bgmTimer);
    }

    playKick(time) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.frequency.setValueAtTime(140, time);
      osc.frequency.exponentialRampToValueAtTime(32, time + 0.12);
      gain.gain.setValueAtTime(0.3, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(time);
      osc.stop(time + 0.16);
    }

    playSnare(time) {
      // Noise burst + tone
      const bufferSize = this.ctx.sampleRate * 0.1;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(800, time);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.18, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.14);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);
      noise.start(time);
    }

    playHiHat(time, vol = 0.02) {
      const bufferSize = this.ctx.sampleRate * 0.04;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(7000, time);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(vol, time);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.04);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);
      noise.start(time);
    }

    playBassNote(freq, time, duration) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, time);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(450, time);
      filter.frequency.exponentialRampToValueAtTime(120, time + duration);

      gain.gain.setValueAtTime(0.12, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(time);
      osc.stop(time + duration);
    }

    playLeadNote(freq, time, duration) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, time);

      gain.gain.setValueAtTime(0.04, time);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(time);
      osc.stop(time + duration);
    }

    // Sound FX
    playBoost() {
      if (!this.ctx || this.muted) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(200, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.35);

      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.4);
    }

    playCollect() {
      if (!this.ctx || this.muted) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.setValueAtTime(659.25, now + 0.08); // E5
      osc.frequency.setValueAtTime(783.99, now + 0.16); // G5
      osc.frequency.setValueAtTime(1046.50, now + 0.24); // C6

      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.36);
    }

    playCrash() {
      if (!this.ctx || this.muted) return;
      const now = this.ctx.currentTime;
      const bufferSize = this.ctx.sampleRate * 0.3;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.08));
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(600, now);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);
      noise.start(now);
    }

    playCheckpoint() {
      if (!this.ctx || this.muted) return;
      const now = this.ctx.currentTime;
      [440, 554, 659, 880].forEach((freq, i) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, now + i * 0.08);

        gain.gain.setValueAtTime(0.15, now + i * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.25);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now + i * 0.08);
        osc.stop(now + i * 0.08 + 0.26);
      });
    }

    toggleMute() {
      this.muted = !this.muted;
      localStorage.setItem('cyber_muted', this.muted);
      if (this.muted && this.engineGain) {
        this.engineGain.gain.setValueAtTime(0, this.ctx ? this.ctx.currentTime : 0);
      }
      return this.muted;
    }
  }

  // ---------------------------------------------------------------------------
  // MATH & PROJECTION UTILITIES
  // ---------------------------------------------------------------------------
  function project(p, cameraX, cameraY, cameraZ, cameraDepth, width, height, roadWidth) {
    p.camera.x = (p.world.x || 0) - cameraX;
    p.camera.y = (p.world.y || 0) - cameraY;
    p.camera.z = (p.world.z || 0) - cameraZ;
    p.screen.scale = cameraDepth / p.camera.z;
    p.screen.x = Math.round((width / 2) + (p.screen.scale * p.camera.x * width / 2));
    p.screen.y = Math.round((height / 2) - (p.screen.scale * p.camera.y * height / 2));
    p.screen.w = Math.round((p.screen.scale * roadWidth * width / 2));
  }

  function easeIn(a, b, percent) {
    return a + (b - a) * Math.pow(percent, 2);
  }

  function easeOut(a, b, percent) {
    return a + (b - a) * (1 - Math.pow(1 - percent, 2));
  }

  function easeInOut(a, b, percent) {
    return a + (b - a) * ((-Math.cos(percent * Math.PI) / 2) + 0.5);
  }

  function limit(value, min, max) {
    return Math.max(min, Math.min(value, max));
  }

  function overlap(x1, w1, x2, w2, percent = 1) {
    const half = (percent || 1) / 2;
    const min1 = x1 - (w1 * half);
    const max1 = x1 + (w1 * half);
    const min2 = x2 - (w2 * half);
    const max2 = x2 + (w2 * half);
    return !((max1 < min2) || (min1 > max2));
  }

  // ---------------------------------------------------------------------------
  // 3D GAME STATE & ENGINE
  // ---------------------------------------------------------------------------
  class CyberRacingGame {
    constructor() {
      this.canvas = document.getElementById('gameCanvas');
      this.ctx = this.canvas.getContext('2d');
      this.audio = new CyberAudio();

      // Viewport
      this.width = 1280;
      this.height = 720;
      this.cameraDepth = null;

      // Track Segments
      this.segments = [];
      this.trackLength = 0;

      // Player Hovercraft
      this.selectedVehicle = VEHICLES[0];
      this.playerColor = 'cyan';
      this.playerX = 0; // Center of road = 0, Left = -1, Right = 1
      this.playerZ = 0;
      this.playerY = 0;
      this.speed = 0;
      this.maxSpeed = this.selectedVehicle.maxSpeed;
      this.accel = this.selectedVehicle.accel;
      this.handling = this.selectedVehicle.handling;
      this.nitro = 100;
      this.isBoosting = false;
      this.isDrifting = false;
      this.shield = 100;
      this.shieldActive = false;
      this.score = 0;
      this.credits = 0;
      this.cameraMode = 0; // 0 = Chase Cam, 1 = Bumper / Cockpit, 2 = Far Chase
      this.rollAngle = 0;
      this.bobTimer = 0;

      // Game Modes: 'endless' (Cyber Highway), 'timetrial', 'grandprix'
      this.gameMode = 'endless';
      this.state = 'menu'; // 'menu', 'garage', 'countdown', 'racing', 'paused', 'gameover', 'victory'
      this.countdownTimer = 3;
      this.raceTime = 0;
      this.sectorTimeLimit = 40;
      this.currentSector = 1;
      this.totalSectors = 5;
      this.lap = 1;
      this.totalLaps = 3;
      this.playerRank = 1;

      // Traffic & Rivals
      this.traffic = [];
      this.rivals = [];
      this.particles = [];
      this.speedLines = [];

      // Parallax Cityscape
      this.skyOffset = 0;
      this.hillOffset = 0;
      this.cityOffset = 0;

      // Input
      this.keyLeft = false;
      this.keyRight = false;
      this.keyFaster = false;
      this.keySlower = false;
      this.keyBoost = false;
      this.keyDrift = false;

      // Stats
      this.highScore = parseInt(localStorage.getItem('cyber_highscore') || '0', 10);
      this.bestTime = parseFloat(localStorage.getItem('cyber_besttime') || '0');

      this.initWindow();
      this.setupInput();
      this.setupDOM();
      this.resetTrack();
      this.resetPlayer();

      // Start loop
      this.lastTime = performance.now();
      requestAnimationFrame(this.loop.bind(this));
    }

    initWindow() {
      const resize = () => {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        this.cameraDepth = 1 / Math.tan((FIELD_OF_VIEW / 2) * Math.PI / 180);
      };
      window.addEventListener('resize', resize);
      resize();
    }

    // -------------------------------------------------------------------------
    // PROCEDURAL TRACK GENERATION (CYBERPUNK MEGA-CIRCUIT)
    // -------------------------------------------------------------------------
    resetTrack() {
      this.segments = [];
      this.traffic = [];
      this.rivals = [];

      // Build 5 futuristic themed sectors
      // Sector 1: Neo-Downtown Shinjuku (Skyscrapers, straightaways, glowing arches)
      this.addSectorIntro();
      this.addRoad(50, 50, 50, 0, 0); // Flat start
      this.addRoad(120, 120, 120, 2, 20); // Gentle curve up
      this.addRoad(80, 80, 80, -2, -15);
      this.addSectorCheckpoint(1, 'NEO DOWNTOWN');

      // Sector 2: Orbital Skyway (Giant roller-coaster drops, high speed banking)
      this.addRoad(100, 100, 100, 3, 50); // Huge climb
      this.addRoad(120, 120, 120, 0, -60); // Steep drop!
      this.addRoad(100, 100, 100, -4, 20);
      this.addSectorCheckpoint(2, 'ORBITAL HIGHWAY');

      // Sector 3: Industrial Smog Zone (Chicanes and tight curves)
      this.addRoad(60, 60, 60, 4, 0);
      this.addRoad(60, 60, 60, -4, 10);
      this.addRoad(80, 80, 80, 3, -10);
      this.addSectorCheckpoint(3, 'ACID SMOG BASIN');

      // Sector 4: Cyber Tunnel Matrix (Subway hyper-conduit with continuous rings)
      this.addTunnel(250);
      this.addSectorCheckpoint(4, 'QUANTUM CONDUIT');

      // Sector 5: Final Hyper-Sprint (Neon spires, boost lanes to finish)
      this.addRoad(80, 80, 80, 2, 10);
      this.addRoad(100, 100, 100, -2, -10);
      this.addRoad(150, 150, 150, 0, 0); // Sprint to finish!
      this.addSectorCheckpoint(5, 'GRID HORIZON');

      this.trackLength = this.segments.length * SEGMENT_LENGTH;

      // Populate Track with Cyber scenery, boost pads, data credits, and traffic
      this.populateTrackAssets();
    }

    addSegment(curve, y) {
      const n = this.segments.length;
      const lastY = n > 0 ? this.segments[n - 1].p2.world.y : 0;
      this.segments.push({
        index: n,
        p1: { world: { y: lastY, z: n * SEGMENT_LENGTH }, camera: {}, screen: {} },
        p2: { world: { y: y, z: (n + 1) * SEGMENT_LENGTH }, camera: {}, screen: {} },
        curve: curve,
        sprites: [],
        cars: [],
        color: Math.floor(n / RUMBLE_LENGTH) % 2 ? 'dark' : 'light',
        isCheckpoint: false,
        isTunnel: false,
        isBoostPad: false,
        isCredit: false,
        creditCollected: false
      });
    }

    addRoad(enter, hold, leave, curve, y) {
      const startY = this.segments.length > 0 ? this.segments[this.segments.length - 1].p2.world.y : 0;
      const endY = startY + (y * SEGMENT_LENGTH);
      const total = enter + hold + leave;

      for (let n = 0; n < enter; n++) {
        this.addSegment(easeIn(0, curve, n / enter), easeInOut(startY, endY, n / total));
      }
      for (let n = 0; n < hold; n++) {
        this.addSegment(curve, easeInOut(startY, endY, (enter + n) / total));
      }
      for (let n = 0; n < leave; n++) {
        this.addSegment(easeInOut(curve, 0, n / leave), easeInOut(startY, endY, (enter + hold + n) / total));
      }
    }

    addSectorIntro() {
      // Starting grid
      for (let n = 0; n < 40; n++) {
        this.addSegment(0, 0);
      }
    }

    addSectorCheckpoint(sectorNum, sectorName) {
      const n = this.segments.length - 1;
      this.segments[n].isCheckpoint = true;
      this.segments[n].sectorNum = sectorNum;
      this.segments[n].sectorName = sectorName;
      // Add overhead checkpoint arch
      this.segments[n].sprites.push({
        type: 'checkpoint_arch',
        offset: 0,
        name: sectorName
      });
    }

    addTunnel(length) {
      for (let n = 0; n < length; n++) {
        this.addSegment(Math.sin(n / 20) * 1.5, Math.cos(n / 30) * 200);
        const seg = this.segments[this.segments.length - 1];
        seg.isTunnel = true;
        if (n % 10 === 0) {
          seg.sprites.push({ type: 'tunnel_ring', offset: 0 });
        }
      }
    }

    populateTrackAssets() {
      // Add boost pads, credit orbs, billboards, and skyscrapers
      for (let i = 20; i < this.segments.length - 50; i++) {
        const seg = this.segments[i];

        // Boost pads every ~70 segments
        if (i % 75 === 0) {
          seg.isBoostPad = true;
          seg.boostOffset = (Math.random() > 0.5 ? 0.4 : -0.4);
        }

        // Cyber Credit Orbs in rows
        if (i % 45 === 0) {
          seg.isCredit = true;
          seg.creditOffset = (Math.sin(i / 10) * 0.7);
        }

        // Side Cyber Buildings and Billboards
        if (i % 8 === 0 && !seg.isTunnel) {
          const side = (i % 16 === 0) ? -1 : 1;
          const dist = 1.4 + Math.random() * 0.8;

          if (i % 32 === 0) {
            seg.sprites.push({
              type: 'billboard',
              offset: side * dist,
              text: ['NEO-TOKYO', 'CYBER-DRIVE', 'SYNTH 2099', 'HYPER-ION', 'QUANTUM'][Math.floor(Math.random() * 5)],
              color: side === 1 ? '#00f3ff' : '#ff007f'
            });
          } else {
            seg.sprites.push({
              type: 'skyscraper',
              offset: side * (dist + 0.6),
              height: 400 + Math.random() * 600,
              width: 250 + Math.random() * 200,
              color: ['#0f172a', '#180e29', '#081c24'][Math.floor(Math.random() * 3)],
              neon: ['#00f3ff', '#ff007f', '#00ff66', '#ffe600'][Math.floor(Math.random() * 4)]
            });
          }
        }

        // Overhead Cyber Street Arches
        if (i % 90 === 0 && !seg.isTunnel) {
          seg.sprites.push({ type: 'cyber_arch', offset: 0 });
        }
      }

      // Add Traffic Hovercars
      const trafficCount = this.gameMode === 'endless' ? 45 : 30;
      for (let i = 0; i < trafficCount; i++) {
        const segIndex = Math.floor(40 + (i / trafficCount) * (this.segments.length - 100));
        const car = {
          offset: (Math.random() * 1.6) - 0.8,
          z: segIndex * SEGMENT_LENGTH,
          speed: (this.maxSpeed * 0.3) + Math.random() * (this.maxSpeed * 0.4),
          type: Math.random() > 0.3 ? 'civilian' : 'police',
          color: ['#00f3ff', '#ff007f', '#ffe600', '#00ff66', '#ffffff'][Math.floor(Math.random() * 5)],
          targetOffset: 0,
          laneChangeTimer: Math.random() * 5
        };
        this.traffic.push(car);
      }

      // Add AI Grand Prix Rivals
      if (this.gameMode === 'grandprix') {
        const rivalNames = ['VORTEX', 'SYNTAX', 'RAZOR', 'ZERO-ONE', 'ECHO', 'CHROME', 'SPECTRE', 'NEXUS-7', 'TITAN'];
        for (let i = 0; i < 9; i++) {
          const rival = {
            name: rivalNames[i],
            offset: ((i % 3) - 1) * 0.6,
            z: (i + 1) * 120, // Start slightly ahead or behind on grid
            speed: this.maxSpeed * 0.85 + Math.random() * (this.maxSpeed * 0.15),
            maxSpeed: this.maxSpeed * (0.92 + Math.random() * 0.1),
            color: ['#ff007f', '#ffe600', '#00ff66', '#b700ff', '#00f3ff'][i % 5],
            handling: 3.5,
            rank: i + 2
          };
          this.rivals.push(rival);
        }
      }
    }

    findSegment(z) {
      return this.segments[Math.floor(z / SEGMENT_LENGTH) % this.segments.length];
    }

    resetPlayer() {
      this.playerX = 0;
      this.playerZ = 0;
      this.playerY = 0;
      this.speed = 0;
      this.nitro = 100;
      this.shield = 100;
      this.score = 0;
      this.credits = 0;
      this.currentSector = 1;
      this.sectorTimeLimit = 45;
      this.raceTime = 0;
      this.lap = 1;
      this.playerRank = this.gameMode === 'grandprix' ? 10 : 1;
    }

    // -------------------------------------------------------------------------
    // CONTROLS & INPUT
    // -------------------------------------------------------------------------
    setupInput() {
      window.addEventListener('keydown', (e) => {
        this.audio.init();
        this.audio.resume();

        switch (e.code) {
          case 'ArrowLeft':
          case 'KeyA':
            this.keyLeft = true;
            break;
          case 'ArrowRight':
          case 'KeyD':
            this.keyRight = true;
            break;
          case 'ArrowUp':
          case 'KeyW':
            this.keyFaster = true;
            break;
          case 'ArrowDown':
          case 'KeyS':
            this.keySlower = true;
            break;
          case 'Space':
            this.keyBoost = true;
            e.preventDefault();
            break;
          case 'ShiftLeft':
          case 'ShiftRight':
            this.keyDrift = true;
            break;
          case 'KeyC':
            this.cameraMode = (this.cameraMode + 1) % 3;
            break;
          case 'KeyM':
            const isMuted = this.audio.toggleMute();
            this.updateAudioButton(isMuted);
            break;
          case 'KeyP':
          case 'Escape':
            this.togglePause();
            break;
        }
      });

      window.addEventListener('keyup', (e) => {
        switch (e.code) {
          case 'ArrowLeft':
          case 'KeyA':
            this.keyLeft = false;
            break;
          case 'ArrowRight':
          case 'KeyD':
            this.keyRight = false;
            break;
          case 'ArrowUp':
          case 'KeyW':
            this.keyFaster = false;
            break;
          case 'ArrowDown':
          case 'KeyS':
            this.keySlower = false;
            break;
          case 'Space':
            this.keyBoost = false;
            break;
          case 'ShiftLeft':
          case 'ShiftRight':
            this.keyDrift = false;
            break;
        }
      });

      // Touch controls
      const bindTouch = (id, onDown, onUp) => {
        const btn = document.getElementById(id);
        if (!btn) return;
        const handleStart = (e) => {
          e.preventDefault();
          this.audio.init();
          this.audio.resume();
          onDown();
        };
        const handleEnd = (e) => {
          e.preventDefault();
          onUp();
        };
        btn.addEventListener('touchstart', handleStart, { passive: false });
        btn.addEventListener('touchend', handleEnd, { passive: false });
        btn.addEventListener('mousedown', handleStart);
        btn.addEventListener('mouseup', handleEnd);
      };

      bindTouch('touch-left', () => { this.keyLeft = true; }, () => { this.keyLeft = false; });
      bindTouch('touch-right', () => { this.keyRight = true; }, () => { this.keyRight = false; });
      bindTouch('touch-gas', () => { this.keyFaster = true; }, () => { this.keyFaster = false; });
      bindTouch('touch-brake', () => { this.keySlower = true; }, () => { this.keySlower = false; });
      bindTouch('touch-boost', () => { this.keyBoost = true; }, () => { this.keyBoost = false; });
    }

    setupDOM() {
      // Menu navigation
      document.getElementById('btn-play-endless')?.addEventListener('click', () => {
        this.startGame('endless');
      });
      document.getElementById('btn-play-timetrial')?.addEventListener('click', () => {
        this.startGame('timetrial');
      });
      document.getElementById('btn-play-grandprix')?.addEventListener('click', () => {
        this.startGame('grandprix');
      });
      document.getElementById('btn-garage')?.addEventListener('click', () => {
        this.showScreen('modal-garage');
      });
      document.getElementById('btn-back-garage')?.addEventListener('click', () => {
        this.showScreen('modal-main-menu');
      });

      // Pause & Audio
      document.getElementById('btn-pause')?.addEventListener('click', () => {
        this.togglePause();
      });
      document.getElementById('btn-resume')?.addEventListener('click', () => {
        this.togglePause();
      });
      document.getElementById('btn-restart')?.addEventListener('click', () => {
        this.startGame(this.gameMode);
      });
      document.getElementById('btn-quit')?.addEventListener('click', () => {
        this.audio.stopBGM();
        this.showScreen('modal-main-menu');
        this.state = 'menu';
      });

      // Game Over & Victory
      document.getElementById('btn-retry-gameover')?.addEventListener('click', () => {
        this.startGame(this.gameMode);
      });
      document.getElementById('btn-menu-gameover')?.addEventListener('click', () => {
        this.audio.stopBGM();
        this.showScreen('modal-main-menu');
        this.state = 'menu';
      });
      document.getElementById('btn-retry-victory')?.addEventListener('click', () => {
        this.startGame(this.gameMode);
      });
      document.getElementById('btn-menu-victory')?.addEventListener('click', () => {
        this.audio.stopBGM();
        this.showScreen('modal-main-menu');
        this.state = 'menu';
      });

      // Audio mute button
      const audioBtn = document.getElementById('btn-audio-toggle');
      if (audioBtn) {
        audioBtn.addEventListener('click', () => {
          this.audio.init();
          const muted = this.audio.toggleMute();
          this.updateAudioButton(muted);
        });
      }

      // Vehicle selection in Garage
      document.querySelectorAll('.vehicle-card').forEach((card) => {
        card.addEventListener('click', () => {
          const vehId = card.getAttribute('data-vehicle');
          const found = VEHICLES.find(v => v.id === vehId);
          if (found) {
            this.selectedVehicle = found;
            this.maxSpeed = found.maxSpeed;
            this.accel = found.accel;
            this.handling = found.handling;
            document.querySelectorAll('.vehicle-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');
          }
        });
      });

      // Color selection in Garage
      document.querySelectorAll('.color-dot').forEach((dot) => {
        dot.addEventListener('click', () => {
          this.playerColor = dot.getAttribute('data-color');
          document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
          dot.classList.add('active');
        });
      });

      this.updateAudioButton(this.audio.muted);
    }

    updateAudioButton(isMuted) {
      const btn = document.getElementById('btn-audio-toggle');
      if (btn) {
        btn.innerHTML = isMuted ? '<span>MUTED</span>' : '<span>AUDIO: ON</span>';
        btn.style.borderColor = isMuted ? 'rgba(255, 34, 68, 0.6)' : 'rgba(0, 243, 255, 0.4)';
      }
    }

    showScreen(screenId) {
      document.querySelectorAll('.modal-screen').forEach((el) => {
        el.classList.add('hidden');
      });
      if (screenId) {
        const target = document.getElementById(screenId);
        if (target) target.classList.remove('hidden');
      }

      const hud = document.getElementById('hud-layer');
      if (hud) {
        if (screenId === null) {
          hud.classList.remove('hud-hidden');
        } else {
          hud.classList.add('hud-hidden');
        }
      }
    }

    togglePause() {
      if (this.state === 'racing') {
        this.state = 'paused';
        this.showScreen('modal-pause');
      } else if (this.state === 'paused') {
        this.state = 'racing';
        this.showScreen(null);
      }
    }

    startGame(mode) {
      this.audio.init();
      this.audio.resume();
      this.audio.startBGM();

      this.gameMode = mode;
      this.resetTrack();
      this.resetPlayer();

      // Countdown
      this.state = 'countdown';
      this.countdownTimer = 3;
      this.showScreen(null);

      const alertBox = document.getElementById('hud-alerts');
      const bannerMsg = document.getElementById('banner-msg');
      const subMsg = document.getElementById('sub-msg');

      if (alertBox && bannerMsg) {
        alertBox.style.display = 'block';
        bannerMsg.textContent = 'READY';
        subMsg.textContent = `${this.selectedVehicle.name} ONLINE`;
      }
    }

    // -------------------------------------------------------------------------
    // PHYSICS & UPDATE LOOP
    // -------------------------------------------------------------------------
    update(dt) {
      if (this.state === 'paused' || this.state === 'menu') return;

      if (this.state === 'countdown') {
        this.countdownTimer -= dt;
        const bannerMsg = document.getElementById('banner-msg');
        const subMsg = document.getElementById('sub-msg');

        if (this.countdownTimer > 2) {
          bannerMsg.textContent = '3';
        } else if (this.countdownTimer > 1) {
          bannerMsg.textContent = '2';
        } else if (this.countdownTimer > 0) {
          bannerMsg.textContent = '1';
        } else {
          bannerMsg.textContent = 'ENGAGE!';
          subMsg.textContent = 'MAX THROTTLE';
          this.state = 'racing';
          setTimeout(() => {
            const alertBox = document.getElementById('hud-alerts');
            if (alertBox) alertBox.style.display = 'none';
          }, 1000);
        }
        return;
      }

      if (this.state !== 'racing') return;

      this.raceTime += dt;
      this.bobTimer += dt * 4;

      // Handle Nitro Boost
      this.isBoosting = false;
      let effectiveMaxSpeed = this.maxSpeed;
      let effectiveAccel = this.accel;

      if (this.keyBoost && this.nitro > 0) {
        this.isBoosting = true;
        this.nitro = Math.max(0, this.nitro - dt * 28);
        effectiveMaxSpeed *= this.selectedVehicle.boostPower;
        effectiveAccel *= 1.8;
        if (Math.random() > 0.4) this.audio.playBoost();
      } else {
        // Recharge nitro slowly
        this.nitro = Math.min(100, this.nitro + dt * 6);
      }

      // Acceleration & Braking
      if (this.keyFaster) {
        this.speed = Math.min(effectiveMaxSpeed, this.speed + effectiveAccel * dt);
      } else if (this.keySlower) {
        this.speed = Math.max(0, this.speed - (this.accel * 1.5) * dt);
      } else {
        // Natural friction deceleration
        this.speed = Math.max(0, this.speed - (this.accel * 0.4) * dt);
      }

      // Road curvature centrifugal force
      const playerSegment = this.findSegment(this.playerZ);
      const speedRatio = this.speed / this.maxSpeed;
      const dx = dt * 2 * speedRatio;

      // Steering with banking roll
      let targetRoll = 0;
      if (this.keyLeft) {
        this.playerX -= dx * this.handling;
        targetRoll = -0.35;
      } else if (this.keyRight) {
        this.playerX += dx * this.handling;
        targetRoll = 0.35;
      }
      this.rollAngle += (targetRoll - this.rollAngle) * dt * 8;

      // Centrifugal drag on curves
      this.playerX -= dx * speedRatio * playerSegment.curve * 1.2;

      // Off-road penalty
      if ((this.playerX < -1 || this.playerX > 1) && this.speed > (this.maxSpeed * 0.35)) {
        this.speed = Math.max(this.maxSpeed * 0.35, this.speed - (this.accel * 1.8) * dt);
        // Wall collision damage if crashing hard outside
        if (this.playerX < -1.4 || this.playerX > 1.4) {
          this.playerX = limit(this.playerX, -1.35, 1.35);
          this.audio.playCrash();
          this.shield = Math.max(0, this.shield - 15);
          this.triggerScreenShake();
        }
      }

      // Advance Player Position along Track
      this.playerZ = (this.playerZ + (this.speed * dt)) % this.trackLength;
      this.playerY = playerSegment.p1.world.y;

      // Update Parallax Sky & Background offsets
      this.skyOffset += playerSegment.curve * speedRatio * 0.002;
      this.cityOffset += playerSegment.curve * speedRatio * 0.004;

      // Check Checkpoints & Laps
      if (playerSegment.isCheckpoint && !playerSegment.passed) {
        playerSegment.passed = true;
        this.audio.playCheckpoint();
        this.score += 5000;
        this.sectorTimeLimit += 25; // Bonus seconds

        const alertBox = document.getElementById('hud-alerts');
        const bannerMsg = document.getElementById('banner-msg');
        const subMsg = document.getElementById('sub-msg');
        if (alertBox && bannerMsg) {
          alertBox.style.display = 'block';
          bannerMsg.textContent = `SECTOR ${playerSegment.sectorNum} CLEAR`;
          subMsg.textContent = `+25 SECONDS BONUS`;
          setTimeout(() => { alertBox.style.display = 'none'; }, 1500);
        }

        if (playerSegment.sectorNum === this.totalSectors) {
          this.lap++;
          if (this.gameMode === 'grandprix' && this.lap > this.totalLaps) {
            this.triggerVictory();
            return;
          }
        }
      }

      // Boost Pad collisions
      if (playerSegment.isBoostPad && overlap(this.playerX, 0.4, playerSegment.boostOffset, 0.5)) {
        this.speed = effectiveMaxSpeed * 1.3;
        this.nitro = Math.min(100, this.nitro + 35);
        this.audio.playBoost();
        this.audio.playCollect();
      }

      // Credit Orbs collisions
      if (playerSegment.isCredit && !playerSegment.creditCollected && overlap(this.playerX, 0.4, playerSegment.creditOffset, 0.4)) {
        playerSegment.creditCollected = true;
        this.credits += 10;
        this.score += 1000;
        this.audio.playCollect();
      }

      // Update AI Traffic
      this.updateTraffic(dt);

      // Update AI Rivals
      if (this.gameMode === 'grandprix') {
        this.updateRivals(dt);
      }

      // Time Trial Countdown
      if (this.gameMode === 'timetrial') {
        this.sectorTimeLimit -= dt;
        if (this.sectorTimeLimit <= 0) {
          this.triggerGameOver('TIME DEPLETED');
          return;
        }
      }

      // Shield Health check
      if (this.shield <= 0) {
        this.triggerGameOver('HULL INTEGRITY COMPROMISED');
        return;
      }

      // Update Engine Audio
      this.audio.updateEngine(speedRatio, this.keyFaster, this.isBoosting);

      // Update Speed Particles & Warp Lines
      this.updateParticles(dt, speedRatio);

      // Update HUD UI
      this.updateHUD(speedRatio);
    }

    updateTraffic(dt) {
      for (let i = 0; i < this.traffic.length; i++) {
        const car = this.traffic[i];
        car.z = (car.z + (car.speed * dt)) % this.trackLength;

        // Smooth lane changes
        car.laneChangeTimer -= dt;
        if (car.laneChangeTimer <= 0) {
          car.targetOffset = (Math.random() * 1.4) - 0.7;
          car.laneChangeTimer = 3 + Math.random() * 6;
        }
        car.offset += (car.targetOffset - car.offset) * dt * 0.8;

        // Collision detection with Player
        const carSegment = this.findSegment(car.z);
        const playerSegment = this.findSegment(this.playerZ);

        if (carSegment.index === playerSegment.index) {
          if (overlap(this.playerX, 0.5, car.offset, 0.5)) {
            // Collision!
            this.audio.playCrash();
            this.triggerScreenShake();
            this.speed *= 0.4;
            this.shield = Math.max(0, this.shield - 20);

            // Knock traffic car forward and sideways
            car.offset += (car.offset > this.playerX ? 0.3 : -0.3);
            car.speed += 2000;
          }
        }
      }
    }

    updateRivals(dt) {
      let playerAheadCount = 0;
      for (let i = 0; i < this.rivals.length; i++) {
        const rival = this.rivals[i];
        rival.z = (rival.z + (rival.speed * dt)) % this.trackLength;

        // Follow curves and avoid other cars
        const rivalSegment = this.findSegment(rival.z);
        rival.offset += (Math.sin(rival.z / 400) * 0.4 - rival.offset) * dt * 1.2;

        // Calculate Rank relative to player
        if (rival.z > this.playerZ) {
          playerAheadCount++;
        }

        // Collision with player
        const playerSegment = this.findSegment(this.playerZ);
        if (rivalSegment.index === playerSegment.index) {
          if (overlap(this.playerX, 0.5, rival.offset, 0.5)) {
            this.audio.playCrash();
            this.speed *= 0.75;
            this.shield = Math.max(0, this.shield - 10);
            rival.speed *= 0.8;
          }
        }
      }
      this.playerRank = playerAheadCount + 1;
    }

    updateParticles(dt, speedRatio) {
      // Thrust flame particles
      if (this.speed > 500) {
        const count = this.isBoosting ? 4 : 2;
        for (let i = 0; i < count; i++) {
          this.particles.push({
            x: (Math.random() - 0.5) * 40,
            y: 35 + (Math.random() * 10),
            z: 0,
            vx: (Math.random() - 0.5) * 80,
            vy: 20 + Math.random() * 40,
            life: 1.0,
            maxLife: 0.35 + Math.random() * 0.2,
            color: this.isBoosting ? '#ff007f' : (COLOR_PALETTE[this.playerColor]?.primary || '#00f3ff'),
            size: 4 + Math.random() * 8
          });
        }
      }

      // Update existing particles
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.life -= dt / p.maxLife;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.life <= 0) {
          this.particles.splice(i, 1);
        }
      }

      // Speed lines at high velocity
      if (speedRatio > 0.7) {
        if (this.speedLines.length < 30) {
          this.speedLines.push({
            x: (Math.random() - 0.5) * this.width * 1.5,
            y: (Math.random() - 0.5) * this.height * 1.5,
            length: 40 + Math.random() * 160,
            alpha: 0.2 + Math.random() * 0.6
          });
        }
      } else {
        this.speedLines = [];
      }
    }

    triggerScreenShake() {
      const el = document.getElementById('game-container');
      if (el) {
        el.style.transform = `translate(${(Math.random() - 0.5) * 14}px, ${(Math.random() - 0.5) * 14}px)`;
        setTimeout(() => { el.style.transform = 'none'; }, 80);
      }
    }

    triggerGameOver(reason) {
      this.state = 'gameover';
      this.audio.stopBGM();
      this.audio.playCrash();

      if (this.score > this.highScore) {
        this.highScore = this.score;
        localStorage.setItem('cyber_highscore', this.highScore.toString());
      }

      const reasonEl = document.getElementById('gameover-reason');
      if (reasonEl) reasonEl.textContent = reason || 'SYSTEM FAILURE';
      const scoreEl = document.getElementById('gameover-score');
      if (scoreEl) scoreEl.textContent = Math.floor(this.score).toLocaleString();
      const distEl = document.getElementById('gameover-distance');
      if (distEl) distEl.textContent = `${(this.playerZ / 1000).toFixed(1)} KM`;
      const creditsEl = document.getElementById('gameover-credits');
      if (creditsEl) creditsEl.textContent = this.credits.toString();
      const bestEl = document.getElementById('gameover-best');
      if (bestEl) bestEl.textContent = Math.floor(this.highScore).toLocaleString();

      this.showScreen('modal-gameover');
    }

    triggerVictory() {
      this.state = 'victory';
      this.audio.stopBGM();
      this.audio.playCheckpoint();

      this.score += 25000;
      if (this.score > this.highScore) {
        this.highScore = this.score;
        localStorage.setItem('cyber_highscore', this.highScore.toString());
      }

      document.getElementById('victory-time').textContent = `${this.raceTime.toFixed(2)}s`;
      document.getElementById('victory-rank').textContent = `#${this.playerRank}`;
      document.getElementById('victory-score').textContent = Math.floor(this.score).toLocaleString();

      this.showScreen('modal-victory');
    }

    updateHUD(speedRatio) {
      // Speed (convert internal scale to km/h)
      const kmh = Math.floor(this.speed * 0.035);
      const speedEl = document.getElementById('hud-speed');
      if (speedEl) speedEl.textContent = kmh.toString();

      // Tachometer bar
      const tachoFill = document.getElementById('hud-tacho-fill');
      if (tachoFill) tachoFill.style.width = `${Math.min(100, speedRatio * 100)}%`;

      // Nitro bar
      const nitroFill = document.getElementById('hud-nitro-fill');
      if (nitroFill) {
        nitroFill.style.width = `${this.nitro}%`;
        if (this.isBoosting) {
          nitroFill.classList.add('nitro-active-glow');
        } else {
          nitroFill.classList.remove('nitro-active-glow');
        }
      }

      // Score
      const scoreEl = document.getElementById('hud-score');
      if (scoreEl) scoreEl.textContent = Math.floor(this.score).toLocaleString();

      // Time
      const timeEl = document.getElementById('hud-time');
      if (timeEl) {
        if (this.gameMode === 'timetrial') {
          timeEl.textContent = `${Math.max(0, this.sectorTimeLimit).toFixed(1)}s`;
          timeEl.style.color = this.sectorTimeLimit < 10 ? '#ff2244' : '#ffffff';
        } else {
          timeEl.textContent = `${this.raceTime.toFixed(1)}s`;
        }
      }

      // Rank or Sector
      const rankEl = document.getElementById('hud-rank');
      if (rankEl) {
        if (this.gameMode === 'grandprix') {
          rankEl.textContent = `${this.playerRank}/10`;
        } else {
          rankEl.textContent = `ZONE 0${this.currentSector}`;
        }
      }

      // Shield indicator
      const shieldBadge = document.getElementById('hud-shield-badge');
      if (shieldBadge) {
        shieldBadge.textContent = `SHIELD: ${Math.floor(this.shield)}%`;
        if (this.shield < 30) {
          shieldBadge.style.color = '#ff2244';
          shieldBadge.style.borderColor = '#ff2244';
        } else {
          shieldBadge.style.color = '#00ff66';
          shieldBadge.style.borderColor = '#00ff66';
        }
      }

      // Mini-Radar Track Progress
      const radarFill = document.getElementById('hud-radar-fill');
      const radarDot = document.getElementById('hud-radar-player-dot');
      const progress = (this.playerZ / this.trackLength) * 100;
      if (radarFill) radarFill.style.width = `${progress}%`;
      if (radarDot) radarDot.style.left = `${progress}%`;
    }

    // -------------------------------------------------------------------------
    // 3D RENDERING PIPELINE
    // -------------------------------------------------------------------------
    render() {
      const ctx = this.ctx;
      const width = this.width;
      const height = this.height;

      // Clear Screen
      ctx.fillStyle = '#06060c';
      ctx.fillRect(0, 0, width, height);

      // 1. Cyberpunk Sky, Neon Horizon & Synthwave Sun
      this.renderSky(ctx, width, height);

      // 2. Road Projection
      const baseSegment = this.findSegment(this.playerZ);
      const basePercent = (this.playerZ % SEGMENT_LENGTH) / SEGMENT_LENGTH;
      const playerSegment = this.findSegment(this.playerZ + (CAMERA_HEIGHT * (1 / Math.tan((FIELD_OF_VIEW / 2) * Math.PI / 180))));
      const playerPercent = ((this.playerZ + (CAMERA_HEIGHT * (1 / Math.tan((FIELD_OF_VIEW / 2) * Math.PI / 180)))) % SEGMENT_LENGTH) / SEGMENT_LENGTH;

      let cameraX = this.playerX * ROAD_WIDTH;
      let cameraY = CAMERA_HEIGHT + (this.cameraMode === 1 ? -400 : (this.cameraMode === 2 ? 400 : 0));
      let cameraZ = this.playerZ - (this.cameraDepth * (this.cameraMode === 1 ? 20 : (this.cameraMode === 2 ? 380 : 240)));

      // Subtle hovercraft vertical bobbing
      cameraY += Math.sin(this.bobTimer) * 15;

      let maxY = height;
      let x = 0;
      let dx = -(baseSegment.curve * basePercent);

      // Project all visible segments
      for (let n = 0; n < DRAW_DISTANCE; n++) {
        const segment = this.segments[(baseSegment.index + n) % this.segments.length];
        const looped = segment.index < baseSegment.index;

        project(segment.p1, cameraX - x, cameraY, cameraZ - (looped ? this.trackLength : 0), this.cameraDepth, width, height, ROAD_WIDTH);
        project(segment.p2, cameraX - x - dx, cameraY, cameraZ - (looped ? this.trackLength : 0), this.cameraDepth, width, height, ROAD_WIDTH);

        x = x + dx;
        dx = dx + segment.curve;

        if ((segment.p1.camera.z <= this.cameraDepth) || (segment.p2.screen.y >= maxY) || (segment.p2.screen.y >= segment.p1.screen.y)) {
          continue;
        }

        this.renderSegment(ctx, width, segment);
        maxY = segment.p1.screen.y;
      }

      // 3. Render Sprites, Traffic, Billboards, and Pickups (Back to Front)
      for (let n = DRAW_DISTANCE - 1; n > 0; n--) {
        const segment = this.segments[(baseSegment.index + n) % this.segments.length];

        // Boost pads
        if (segment.isBoostPad) {
          this.renderBoostPad(ctx, segment);
        }

        // Credit Orbs
        if (segment.isCredit && !segment.creditCollected) {
          this.renderCreditOrb(ctx, segment);
        }

        // Side scenery sprites (skyscrapers, billboards, arches)
        for (let i = 0; i < segment.sprites.length; i++) {
          this.renderSprite(ctx, segment, segment.sprites[i]);
        }

        // AI Traffic Cars
        for (let i = 0; i < this.traffic.length; i++) {
          const car = this.traffic[i];
          const carSegment = this.findSegment(car.z);
          if (carSegment.index === segment.index) {
            this.renderTrafficCar(ctx, segment, car);
          }
        }

        // AI Grand Prix Rivals
        if (this.gameMode === 'grandprix') {
          for (let i = 0; i < this.rivals.length; i++) {
            const rival = this.rivals[i];
            const rivalSegment = this.findSegment(rival.z);
            if (rivalSegment.index === segment.index) {
              this.renderRivalCar(ctx, segment, rival);
            }
          }
        }
      }

      // 4. Render Player Hovercraft (in Chase Cam modes)
      if (this.cameraMode !== 1) {
        this.renderPlayerCraft(ctx, width, height);
      }

      // 5. Render Speed Warp Lines & Thruster Smoke
      this.renderSpeedEffects(ctx, width, height);
    }

    renderSky(ctx, width, height) {
      const horizonY = height * 0.45;

      // Deep Cyber Gradient
      const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
      skyGrad.addColorStop(0, '#04040a');
      skyGrad.addColorStop(0.5, '#160829');
      skyGrad.addColorStop(0.85, '#3b0d4d');
      skyGrad.addColorStop(1, '#ff007f');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, width, horizonY);

      // Giant Segmented Synthwave Sun
      const sunX = width * 0.5 - (this.skyOffset * 150) % width;
      const sunY = horizonY - 40;
      const sunRadius = 90;

      const sunGrad = ctx.createLinearGradient(0, sunY - sunRadius, 0, sunY + sunRadius);
      sunGrad.addColorStop(0, '#ffe600');
      sunGrad.addColorStop(0.6, '#ff007f');
      sunGrad.addColorStop(1, '#660044');

      ctx.save();
      ctx.beginPath();
      ctx.arc(sunX, sunY, sunRadius, 0, Math.PI * 2);
      ctx.fillStyle = sunGrad;
      ctx.shadowColor = '#ff007f';
      ctx.shadowBlur = 35;
      ctx.fill();

      // Cut horizontal sun slices (classic synthwave look)
      ctx.fillStyle = '#06060c';
      for (let i = 0; i < 7; i++) {
        const sliceY = sunY + 15 + (i * 10);
        const sliceH = 2 + (i * 1.5);
        ctx.fillRect(sunX - sunRadius - 10, sliceY, (sunRadius * 2) + 20, sliceH);
      }
      ctx.restore();

      // Distant Cyber City Skyline Silhouette
      ctx.fillStyle = '#090914';
      const cityStep = 45;
      const numBuildings = Math.ceil(width / cityStep) + 2;
      for (let i = -1; i < numBuildings; i++) {
        const bx = i * cityStep - (this.cityOffset * 300) % cityStep;
        const seed = Math.sin(i * 12.9898) * 43758.5453;
        const bHeight = 40 + Math.abs(seed % 120);
        const bWidth = cityStep - 4;
        ctx.fillRect(bx, horizonY - bHeight, bWidth, bHeight);

        // Flashing rooftop antennae beacons
        if (i % 3 === 0) {
          ctx.strokeStyle = '#00f3ff';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(bx + bWidth / 2, horizonY - bHeight);
          ctx.lineTo(bx + bWidth / 2, horizonY - bHeight - 16);
          ctx.stroke();

          // Flashing light
          if (Math.sin(performance.now() * 0.005 + i) > 0) {
            ctx.fillStyle = '#ff0055';
            ctx.beginPath();
            ctx.arc(bx + bWidth / 2, horizonY - bHeight - 16, 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#090914';
          }
        }
      }

      // Ground plane wireframe grid receding into horizon
      ctx.fillStyle = '#05060b';
      ctx.fillRect(0, horizonY, width, height - horizonY);

      // Neon horizon separator line
      ctx.strokeStyle = '#00f3ff';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#00f3ff';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(0, horizonY);
      ctx.lineTo(width, horizonY);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    renderSegment(ctx, width, segment) {
      const p1 = segment.p1.screen;
      const p2 = segment.p2.screen;

      const r1 = p1.w / 2;
      const r2 = p2.w / 2;
      const l1 = r1 * 0.06;
      const l2 = r2 * 0.06;

      const isLight = segment.color === 'light';

      // 1. Ground polygon
      ctx.fillStyle = isLight ? '#060710' : '#080a14';
      ctx.beginPath();
      ctx.moveTo(0, p2.y);
      ctx.lineTo(width, p2.y);
      ctx.lineTo(width, p1.y);
      ctx.lineTo(0, p1.y);
      ctx.fill();

      // 2. Road surface
      const roadGrad = ctx.createLinearGradient(p1.x, p1.y, p2.x, p2.y);
      if (segment.isTunnel) {
        roadGrad.addColorStop(0, isLight ? '#0d152b' : '#070b17');
        roadGrad.addColorStop(1, isLight ? '#070b17' : '#0d152b');
      } else {
        roadGrad.addColorStop(0, isLight ? '#121424' : '#0c0e1a');
        roadGrad.addColorStop(1, isLight ? '#0c0e1a' : '#121424');
      }
      ctx.fillStyle = roadGrad;
      this.renderPolygon(ctx, p1.x - r1, p1.y, p1.x + r1, p1.y, p2.x + r2, p2.y, p2.x - r2, p2.y);

      // 3. Glowing Laser Curb Rails
      const curbColor = segment.isTunnel ? '#ff007f' : (isLight ? '#00f3ff' : 'rgba(0, 243, 255, 0.4)');
      ctx.fillStyle = curbColor;
      this.renderPolygon(ctx, p1.x - r1 - l1, p1.y, p1.x - r1, p1.y, p2.x - r2, p2.y, p2.x - r2 - l2, p2.y);
      this.renderPolygon(ctx, p1.x + r1, p1.y, p1.x + r1 + l1, p1.y, p2.x + r2 + l2, p2.y, p2.x + r2, p2.y);

      // 4. Dashed Neon Lane Divider Lines
      if (isLight) {
        ctx.fillStyle = '#00f3ff';
        const lw1 = p1.w * 0.015;
        const lw2 = p2.w * 0.015;

        // 3-lane dividers (-0.33 and +0.33)
        const laneX1_left = p1.x - (r1 * 0.35);
        const laneX2_left = p2.x - (r2 * 0.35);
        this.renderPolygon(ctx, laneX1_left - lw1, p1.y, laneX1_left + lw1, p1.y, laneX2_left + lw2, p2.y, laneX2_left - lw2, p2.y);

        const laneX1_right = p1.x + (r1 * 0.35);
        const laneX2_right = p2.x + (r2 * 0.35);
        this.renderPolygon(ctx, laneX1_right - lw1, p1.y, laneX1_right + lw1, p1.y, laneX2_right + lw2, p2.y, laneX2_right - lw2, p2.y);
      }
    }

    renderPolygon(ctx, x1, y1, x2, y2, x3, y3, x4, y4) {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.lineTo(x3, y3);
      ctx.lineTo(x4, y4);
      ctx.closePath();
      ctx.fill();
    }

    renderBoostPad(ctx, segment) {
      const p = segment.p1.screen;
      const w = p.w * 0.25;
      const h = Math.max(4, p.w * 0.06);
      const x = p.x + (p.w * segment.boostOffset);

      ctx.save();
      ctx.fillStyle = '#ffe600';
      ctx.shadowColor = '#ffe600';
      ctx.shadowBlur = 15;

      // Glowing Chevron Arrows
      ctx.beginPath();
      ctx.moveTo(x - w / 2, p.y);
      ctx.lineTo(x, p.y - h);
      ctx.lineTo(x + w / 2, p.y);
      ctx.lineTo(x, p.y + h * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    renderCreditOrb(ctx, segment) {
      const p = segment.p1.screen;
      const radius = Math.max(3, p.w * 0.04);
      const x = p.x + (p.w * segment.creditOffset);
      const y = p.y - radius * 2 - (Math.sin(performance.now() * 0.006 + segment.index) * 10);

      ctx.save();
      ctx.fillStyle = '#00f3ff';
      ctx.shadowColor = '#00f3ff';
      ctx.shadowBlur = 12;

      // 3D Diamond Data-Cube
      ctx.beginPath();
      ctx.moveTo(x, y - radius);
      ctx.lineTo(x + radius * 0.8, y);
      ctx.lineTo(x, y + radius);
      ctx.lineTo(x - radius * 0.8, y);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x, y, radius * 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    renderSprite(ctx, segment, sprite) {
      const p = segment.p1.screen;
      const scale = p.scale;
      const x = p.x + (scale * sprite.offset * ROAD_WIDTH * this.width / 2);
      const y = p.y;

      if (sprite.type === 'skyscraper') {
        const sw = sprite.width * scale * this.width / 2;
        const sh = sprite.height * scale * this.width / 2;
        if (sw < 2 || sh < 4) return;

        // Building Body
        ctx.fillStyle = sprite.color;
        ctx.fillRect(x - sw / 2, y - sh, sw, sh);

        // Neon Edge Highlight
        ctx.strokeStyle = sprite.neon;
        ctx.lineWidth = Math.max(1, scale * 3);
        ctx.strokeRect(x - sw / 2, y - sh, sw, sh);

        // Windows Matrix (only if large enough)
        if (sw > 30) {
          ctx.fillStyle = sprite.neon;
          const rows = 6;
          const cols = 4;
          const winW = sw / (cols * 2);
          const winH = sh / (rows * 2.5);
          for (let r = 1; r < rows; r++) {
            for (let c = 1; c < cols; c++) {
              if (Math.sin(r * 5 + c * 3 + sprite.height) > -0.2) {
                ctx.fillRect(x - sw / 2 + (c * winW * 2), y - sh + (r * winH * 2), winW, winH);
              }
            }
          }
        }
      } else if (sprite.type === 'billboard') {
        const bw = 380 * scale * this.width / 2;
        const bh = 140 * scale * this.width / 2;
        if (bw < 10) return;

        // Pole
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(x - 3, y - bh * 1.5, 6, bh * 1.5);

        // Board
        ctx.fillStyle = 'rgba(10, 15, 30, 0.95)';
        ctx.fillRect(x - bw / 2, y - bh * 1.5, bw, bh);

        // Neon Border
        ctx.strokeStyle = sprite.color;
        ctx.lineWidth = Math.max(1, scale * 4);
        ctx.strokeRect(x - bw / 2, y - bh * 1.5, bw, bh);

        // Glowing Text
        if (bw > 40) {
          ctx.save();
          ctx.fillStyle = sprite.color;
          ctx.font = `bold ${Math.max(10, Math.floor(bh * 0.45))}px monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.shadowColor = sprite.color;
          ctx.shadowBlur = 10;
          ctx.fillText(sprite.text, x, y - bh);
          ctx.restore();
        }
      } else if (sprite.type === 'cyber_arch' || sprite.type === 'checkpoint_arch') {
        const archW = p.w * 1.2;
        const archH = p.w * 0.55;
        if (archW < 15) return;

        ctx.save();
        const archColor = sprite.type === 'checkpoint_arch' ? '#00ff66' : '#ff007f';
        ctx.strokeStyle = archColor;
        ctx.lineWidth = Math.max(2, scale * 6);
        ctx.shadowColor = archColor;
        ctx.shadowBlur = 15;

        // Overhead Portal Arc
        ctx.beginPath();
        ctx.moveTo(p.x - archW / 2, y);
        ctx.lineTo(p.x - archW / 2, y - archH);
        ctx.lineTo(p.x + archW / 2, y - archH);
        ctx.lineTo(p.x + archW / 2, y);
        ctx.stroke();

        if (sprite.name && archW > 80) {
          ctx.fillStyle = '#ffffff';
          ctx.font = `900 ${Math.max(12, Math.floor(archH * 0.25))}px monospace`;
          ctx.textAlign = 'center';
          ctx.fillText(sprite.name, p.x, y - archH - 8);
        }
        ctx.restore();
      } else if (sprite.type === 'tunnel_ring') {
        const ringW = p.w * 1.35;
        const ringH = p.w * 0.75;
        if (ringW < 10) return;

        ctx.save();
        ctx.strokeStyle = '#ff007f';
        ctx.lineWidth = Math.max(2, scale * 5);
        ctx.shadowColor = '#ff007f';
        ctx.shadowBlur = 12;

        // Hexagonal tunnel contour
        ctx.beginPath();
        ctx.moveTo(p.x - ringW / 2, y);
        ctx.lineTo(p.x - ringW * 0.6, y - ringH * 0.5);
        ctx.lineTo(p.x - ringW * 0.3, y - ringH);
        ctx.lineTo(p.x + ringW * 0.3, y - ringH);
        ctx.lineTo(p.x + ringW * 0.6, y - ringH * 0.5);
        ctx.lineTo(p.x + ringW / 2, y);
        ctx.stroke();
        ctx.restore();
      }
    }

    renderTrafficCar(ctx, segment, car) {
      const p = segment.p1.screen;
      const scale = p.scale;
      const x = p.x + (scale * car.offset * ROAD_WIDTH * this.width / 2);
      const y = p.y;
      const w = 180 * scale * this.width / 2;
      const h = 70 * scale * this.width / 2;
      if (w < 4) return;

      ctx.save();
      // Hovercraft Hull
      ctx.fillStyle = car.color;
      ctx.beginPath();
      ctx.moveTo(x - w / 2, y - h * 0.3);
      ctx.lineTo(x - w * 0.35, y - h);
      ctx.lineTo(x + w * 0.35, y - h);
      ctx.lineTo(x + w / 2, y - h * 0.3);
      ctx.lineTo(x + w * 0.4, y);
      ctx.lineTo(x - w * 0.4, y);
      ctx.closePath();
      ctx.fill();

      // Police Strobe Siren
      if (car.type === 'police' && w > 20) {
        const strobe = Math.sin(performance.now() * 0.02) > 0;
        ctx.fillStyle = strobe ? '#ff0033' : '#0066ff';
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 10;
        ctx.fillRect(x - w * 0.15, y - h * 1.2, w * 0.3, h * 0.25);
      }

      // Neon Thruster Glow
      ctx.fillStyle = '#00f3ff';
      ctx.shadowColor = '#00f3ff';
      ctx.shadowBlur = 8;
      ctx.fillRect(x - w * 0.25, y - h * 0.4, w * 0.15, h * 0.2);
      ctx.fillRect(x + w * 0.1, y - h * 0.4, w * 0.15, h * 0.2);
      ctx.restore();
    }

    renderRivalCar(ctx, segment, rival) {
      const p = segment.p1.screen;
      const scale = p.scale;
      const x = p.x + (scale * rival.offset * ROAD_WIDTH * this.width / 2);
      const y = p.y;
      const w = 210 * scale * this.width / 2;
      const h = 80 * scale * this.width / 2;
      if (w < 4) return;

      ctx.save();
      // Aggressive Rival Hover-Racer Chassis
      ctx.fillStyle = rival.color;
      ctx.shadowColor = rival.color;
      ctx.shadowBlur = 10;

      ctx.beginPath();
      ctx.moveTo(x - w / 2, y - h * 0.2);
      ctx.lineTo(x - w * 0.25, y - h);
      ctx.lineTo(x + w * 0.25, y - h);
      ctx.lineTo(x + w / 2, y - h * 0.2);
      ctx.lineTo(x + w * 0.35, y);
      ctx.lineTo(x - w * 0.35, y);
      ctx.closePath();
      ctx.fill();

      // Wing spoilers
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(1, scale * 3);
      ctx.stroke();

      // Pilot Canopy
      ctx.fillStyle = 'rgba(0, 243, 255, 0.8)';
      ctx.fillRect(x - w * 0.15, y - h * 0.75, w * 0.3, h * 0.3);
      ctx.restore();
    }

    renderPlayerCraft(ctx, width, height) {
      const x = width / 2;
      const y = height * (this.cameraMode === 2 ? 0.88 : 0.82) + Math.sin(this.bobTimer) * 5;
      const baseW = Math.min(320, width * 0.28);
      const baseH = baseW * 0.42;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(this.rollAngle);

      const colorData = COLOR_PALETTE[this.playerColor] || COLOR_PALETTE.cyan;

      // 1. Neon Underglow Shadow
      const underglowGrad = ctx.createRadialGradient(0, 10, 5, 0, 10, baseW * 0.6);
      underglowGrad.addColorStop(0, colorData.glow);
      underglowGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = underglowGrad;
      ctx.fillRect(-baseW * 0.8, -10, baseW * 1.6, 50);

      // 2. Dual Thruster Plasma Jet Exhaust
      const thrusterW = baseW * 0.16;
      const thrusterH = baseH * 0.3;
      const flameLen = (this.isBoosting ? 90 : 40) + Math.random() * 20;

      const flameGrad = ctx.createLinearGradient(0, 0, 0, flameLen);
      flameGrad.addColorStop(0, '#ffffff');
      flameGrad.addColorStop(0.3, this.isBoosting ? '#ff007f' : colorData.primary);
      flameGrad.addColorStop(1, 'transparent');

      ctx.fillStyle = flameGrad;
      // Left flame
      ctx.beginPath();
      ctx.moveTo(-baseW * 0.28 - thrusterW / 2, 0);
      ctx.lineTo(-baseW * 0.28, flameLen);
      ctx.lineTo(-baseW * 0.28 + thrusterW / 2, 0);
      ctx.fill();

      // Right flame
      ctx.beginPath();
      ctx.moveTo(baseW * 0.28 - thrusterW / 2, 0);
      ctx.lineTo(baseW * 0.28, flameLen);
      ctx.lineTo(baseW * 0.28 + thrusterW / 2, 0);
      ctx.fill();

      // 3. Cyber Hovercraft Chassis (Angular Aerodynamic Wings)
      // Main Hull Gradient
      const hullGrad = ctx.createLinearGradient(0, -baseH, 0, 0);
      hullGrad.addColorStop(0, '#0f172a');
      hullGrad.addColorStop(0.5, '#1e293b');
      hullGrad.addColorStop(1, '#090d16');

      ctx.fillStyle = hullGrad;
      ctx.strokeStyle = colorData.primary;
      ctx.lineWidth = 2.5;
      ctx.shadowColor = colorData.primary;
      ctx.shadowBlur = 12;

      ctx.beginPath();
      // Nose / Cockpit
      ctx.moveTo(0, -baseH * 0.95);
      // Right wingtip
      ctx.lineTo(baseW * 0.45, -baseH * 0.1);
      ctx.lineTo(baseW * 0.5, 0);
      // Right thruster bay
      ctx.lineTo(baseW * 0.2, 0);
      ctx.lineTo(baseW * 0.15, -baseH * 0.25);
      // Center rear
      ctx.lineTo(0, -baseH * 0.15);
      // Left thruster bay
      ctx.lineTo(-baseW * 0.15, -baseH * 0.25);
      ctx.lineTo(-baseW * 0.2, 0);
      // Left wingtip
      ctx.lineTo(-baseW * 0.5, 0);
      ctx.lineTo(-baseW * 0.45, -baseH * 0.1);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // 4. Glowing Pilot Canopy Glass
      const canopyGrad = ctx.createLinearGradient(0, -baseH * 0.85, 0, -baseH * 0.3);
      canopyGrad.addColorStop(0, '#ffffff');
      canopyGrad.addColorStop(0.5, colorData.primary);
      canopyGrad.addColorStop(1, 'rgba(0, 0, 0, 0.9)');

      ctx.fillStyle = canopyGrad;
      ctx.beginPath();
      ctx.moveTo(0, -baseH * 0.8);
      ctx.lineTo(baseW * 0.12, -baseH * 0.35);
      ctx.lineTo(0, -baseH * 0.28);
      ctx.lineTo(-baseW * 0.12, -baseH * 0.35);
      ctx.closePath();
      ctx.fill();

      // 5. Reactive Brake Lights
      if (this.keySlower) {
        ctx.fillStyle = '#ff0033';
        ctx.shadowColor = '#ff0033';
        ctx.shadowBlur = 20;
        ctx.fillRect(-baseW * 0.4, -4, baseW * 0.8, 6);
      }

      // 6. Shield Dome Effect (if damaged or powerup)
      if (this.shield > 80 && Math.sin(performance.now() * 0.005) > 0.8) {
        ctx.strokeStyle = 'rgba(0, 255, 102, 0.4)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, -baseH * 0.4, baseW * 0.55, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.restore();
    }

    renderSpeedEffects(ctx, width, height) {
      // Warp Speed Streaks
      if (this.speedLines.length > 0) {
        ctx.save();
        ctx.strokeStyle = 'rgba(0, 243, 255, 0.6)';
        ctx.lineWidth = 1.5;
        for (let i = 0; i < this.speedLines.length; i++) {
          const l = this.speedLines[i];
          const cx = width / 2;
          const cy = height * 0.45;
          const angle = Math.atan2(l.y - cy, l.x - cx);

          ctx.beginPath();
          ctx.moveTo(l.x, l.y);
          ctx.lineTo(l.x + Math.cos(angle) * l.length, l.y + Math.sin(angle) * l.length);
          ctx.stroke();

          // Accelerate outward
          l.x += Math.cos(angle) * 30;
          l.y += Math.sin(angle) * 30;

          if (l.x < 0 || l.x > width || l.y < 0 || l.y > height) {
            l.x = cx + (Math.random() - 0.5) * 150;
            l.y = cy + (Math.random() - 0.5) * 100;
          }
        }
        ctx.restore();
      }

      // Spark & Flame Particles
      for (let i = 0; i < this.particles.length; i++) {
        const p = this.particles[i];
        ctx.save();
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.life;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc((width / 2) + p.x, (height * 0.82) + p.y, p.size * p.life, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // -------------------------------------------------------------------------
    // MAIN GAME LOOP
    // -------------------------------------------------------------------------
    loop(currentTime) {
      const dt = Math.min(1, (currentTime - this.lastTime) / 1000);
      this.lastTime = currentTime;

      this.update(dt);
      this.render();

      requestAnimationFrame(this.loop.bind(this));
    }
  }

  // Initialize Game on DOM Load
  window.addEventListener('DOMContentLoaded', () => {
    window.game = new CyberRacingGame();
  });
})();
