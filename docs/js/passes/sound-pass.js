    // =========================================================
    // Lot 7 — Sound shader (mainSound), comme sur shadertoy.com : PAS un
    // rendu temps réel. Le fragment shader est évalué OFFLINE sur toute la
    // durée (60 s à 44,1 kHz ≈ 2,6 M d'échantillons), par blocs de
    // 512×512 pixels = 262 144 échantillons chacun, un échantillon par
    // pixel. Chaque échantillon stéréo est encodé en 16 bits par canal
    // dans un RGBA8 (L = R+G, R = B+A, cf. soundMainWrapper dans
    // shader-compiler.js), relu avec readRenderTargetPixels, décodé en
    // Float32, puis joué via AudioBuffer + AudioBufferSourceNode.
    //
    // (La roadmap parlait d'une texture 512×2 : c'est le format des
    // entrées Keyboard/Music du picker, pas celui du Sound shader, qui
    // utilise bien des blocs 512×512 sur shadertoy.com.)
    //
    // Le son est CALÉ SUR LA TIMELINE (iTime), comme sur shadertoy.com :
    // position audio = iTime mod 60 s. Play/pause/reset du viewport se
    // répercutent sur la lecture (syncSoundToTransport, appelée par
    // viewport.js et video-export.js), et un recalage (correctSoundDrift)
    // corrige toute dérive entre horloge audio et horloge de rendu.
    //
    // La génération est asynchrone (une frame d'animation cédée entre
    // deux blocs) pour ne pas figer l'interface, annulable (une nouvelle
    // compilation supplante la génération en cours) et suivie par une
    // barre de progression (soundBar, index.html). La lecture n'est
    // jamais lancée automatiquement (autoplay bloqué par les navigateurs
    // sans geste) : bouton play/pause dédié. Si le son jouait au moment
    // d'une régénération, la lecture reprend à la position de la timeline
    // avec le nouveau son (confort de live-coding).
    // =========================================================

    const SOUND_SAMPLE_RATE = 44100;
    const SOUND_DURATION_SECONDS = 60;
    const SOUND_BLOCK_SIZE = 512;                        // côté d'un bloc
    const SOUND_BLOCK_SAMPLES = SOUND_BLOCK_SIZE * SOUND_BLOCK_SIZE;

    let soundState = {
        status: "idle",        // "idle" | "generating" | "ready" | "error"
        progress: 0,           // 0..1 pendant la génération
        message: "",
        left: null, right: null,
        signature: null,       // code+params de la dernière génération réussie/en cours
        token: 0               // incrémenté à chaque (re)génération : annule la précédente
    };
    let soundTarget = null;
    let soundAudioContext = null;
    let soundSource = null;
    let soundPlaying = false;  // le son est réellement en train de jouer
    let soundWanted = false;   // l'utilisateur a demandé le son (peut être en pause avec la timeline)
    let soundBuffer = null;    // AudioBuffer mis en cache pour la génération courante
    let soundStartedAt = 0;    // horloge AudioContext au démarrage de la lecture
    let soundOffset = 0;       // position (s) où reprendre
    const SOUND_DRIFT_TOLERANCE = 0.25; // secondes d'écart tolérées avant recalage

    function ensureSoundTarget() {
        if (soundTarget) return soundTarget;
        soundTarget = new THREE.WebGLRenderTarget(SOUND_BLOCK_SIZE, SOUND_BLOCK_SIZE, {
            format: THREE.RGBAFormat,
            type: THREE.UnsignedByteType,
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            depthBuffer: false,
            stencilBuffer: false
        });
        return soundTarget;
    }

    // Décode un bloc RGBA8 relu du GPU vers les tableaux L/R. Inverse de
    // l'encodage du wrapper : v = octet_bas + 256 * octet_haut, puis
    // y = v / 65535 * 2 - 1. `count` borne le dernier bloc (partiel).
    function decodeSoundBlock(pixels, left, right, offset, count) {
        for (let i = 0; i < count; i++) {
            const p = i * 4;
            const l = pixels[p] + pixels[p + 1] * 256;
            const r = pixels[p + 2] + pixels[p + 3] * 256;
            left[offset + i] = l / 65535 * 2 - 1;
            right[offset + i] = r / 65535 * 2 - 1;
        }
    }

    function soundNextFrame() {
        return new Promise((resolve) => requestAnimationFrame(resolve));
    }

    // Signature de ce qui influence le son : code de la passe Sound, code
    // Common (concaténé en tête), et valeurs courantes des paramètres
    // (#define exposés en sliders). Évite de régénérer 60 s d'audio quand
    // compileAllPasses() est rappelé pour une autre passe.
    function computeSoundSignature(pass) {
        const common = getPass("common");
        const runtime = getPassRuntime("sound");
        const params = (getActivePass() && getActivePass().id === "sound") ? currentParameters : (runtime ? runtime.params : []);
        return pass.code + "\n//common\n" + (common ? common.code : "") + "\n//params\n" +
            params.map((p) => p.uniformName + "=" + p.value).join(",");
    }

    // Appelé par compileAllPasses() une fois toutes les passes compilées.
    function onSoundPassCompiled() {
        const pass = getPass("sound");
        if (!pass) {
            // Passe désactivée : coupe le son et libère les ressources.
            disposeSoundPass();
            renderSoundBar();
            return;
        }
        const status = getPassCompileStatus("sound");
        if (!status || !status.ok) {
            soundState.token++; // annule une génération devenue obsolète
            soundState.status = "error";
            soundState.message = "Erreur de compilation du Sound shader";
            renderSoundBar();
            return;
        }
        const signature = computeSoundSignature(pass);
        if (signature === soundState.signature && (soundState.status === "ready" || soundState.status === "generating")) {
            renderSoundBar();
            return;
        }
        startSoundGeneration(signature);
    }

    async function startSoundGeneration(signature) {
        const runtime = getPassRuntime("sound");
        if (!runtime || !runtime.material || !renderer || !quadMesh) return;

        const token = ++soundState.token;
        soundState.status = "generating";
        soundState.progress = 0;
        soundState.message = "";
        soundState.signature = signature;
        renderSoundBar();

        // Applique les valeurs de paramètres courantes (les sliders de
        // l'onglet actif vivent dans currentParameters, cf. viewport.js).
        const uniforms = runtime.uniforms;
        const params = (getActivePass() && getActivePass().id === "sound") ? currentParameters : runtime.params;
        params.forEach((p) => { if (uniforms[p.uniformName]) uniforms[p.uniformName].value = p.value; });
        uniforms.iResolution.value.set(SOUND_BLOCK_SIZE, SOUND_BLOCK_SIZE, 1.0);
        uniforms.iSampleRate.value = SOUND_SAMPLE_RATE;

        const total = SOUND_SAMPLE_RATE * SOUND_DURATION_SECONDS;
        const blocks = Math.ceil(total / SOUND_BLOCK_SAMPLES);
        const left = new Float32Array(total);
        const right = new Float32Array(total);
        const pixels = new Uint8Array(SOUND_BLOCK_SAMPLES * 4);
        const target = ensureSoundTarget();

        try {
            for (let b = 0; b < blocks; b++) {
                await soundNextFrame();
                if (token !== soundState.token) return; // supplantée par une génération plus récente

                const offset = b * SOUND_BLOCK_SAMPLES;
                uniforms._sampleOffset.value = offset;

                const prevTarget = renderer.getRenderTarget();
                quadMesh.material = runtime.material;
                renderer.setRenderTarget(target);
                renderer.render(scene, camera);
                renderer.readRenderTargetPixels(target, 0, 0, SOUND_BLOCK_SIZE, SOUND_BLOCK_SIZE, pixels);
                renderer.setRenderTarget(prevTarget);

                decodeSoundBlock(pixels, left, right, offset, Math.min(SOUND_BLOCK_SAMPLES, total - offset));
                soundState.progress = (b + 1) / blocks;
                renderSoundBar();
            }
        } catch (err) {
            if (token !== soundState.token) return;
            soundState.status = "error";
            soundState.message = "Échec de la génération : " + (err.message || err);
            renderSoundBar();
            return;
        }

        if (token !== soundState.token) return;
        soundState.left = left;
        soundState.right = right;
        soundBuffer = null; // le cache d'AudioBuffer correspondait à l'ancien son
        soundState.status = "ready";
        soundState.message = "";
        renderSoundBar();

        // Régénération pendant la lecture (ou son demandé mais pas encore
        // prêt) : (re)démarre calé sur la timeline avec le nouveau son.
        syncSoundToTransport();
    }

    function getSoundAudioContext() {
        if (soundAudioContext) return soundAudioContext;
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        soundAudioContext = new AC();
        return soundAudioContext;
    }

    function currentSoundPosition() {
        if (!soundPlaying || !soundAudioContext) return soundOffset;
        return (soundAudioContext.currentTime - soundStartedAt) % SOUND_DURATION_SECONDS;
    }

    function stopSoundSource() {
        if (soundSource) {
            try { soundSource.stop(); } catch (e) { /* déjà arrêté */ }
            soundSource.disconnect();
            soundSource = null;
        }
    }

    // Position de la timeline dans la boucle audio (iTime mod durée).
    function timelineSoundPosition() {
        const t = (typeof currentTime === "number" && isFinite(currentTime)) ? currentTime : 0;
        return ((t % SOUND_DURATION_SECONDS) + SOUND_DURATION_SECONDS) % SOUND_DURATION_SECONDS;
    }

    function getSoundBuffer(ctx) {
        if (soundBuffer && soundBuffer.sampleRate === SOUND_SAMPLE_RATE) return soundBuffer;
        const buffer = ctx.createBuffer(2, soundState.left.length, SOUND_SAMPLE_RATE);
        buffer.copyToChannel(soundState.left, 0);
        buffer.copyToChannel(soundState.right, 1);
        soundBuffer = buffer;
        return buffer;
    }

    // Démarre la lecture à `soundOffset`. Ne touche pas à soundWanted.
    function playSound() {
        if (soundState.status !== "ready" || !soundState.left) return;
        const ctx = getSoundAudioContext();
        if (!ctx) { showToast("Web Audio non disponible dans ce navigateur"); return; }
        if (ctx.state === "suspended") ctx.resume(); // appelé depuis un clic : autorisé

        stopSoundSource();
        soundSource = ctx.createBufferSource();
        soundSource.buffer = getSoundBuffer(ctx);
        soundSource.loop = true;
        soundSource.connect(ctx.destination);
        soundSource.start(0, soundOffset % SOUND_DURATION_SECONDS);
        soundStartedAt = ctx.currentTime - soundOffset;
        soundPlaying = true;
        renderSoundBar();
    }

    // Coupe la lecture en mémorisant la position. Ne touche pas à soundWanted.
    function pauseSound() {
        if (!soundPlaying) return;
        soundOffset = currentSoundPosition();
        stopSoundSource();
        soundPlaying = false;
        renderSoundBar();
    }

    // Aligne la lecture sur l'état du transport du viewport : le son joue
    // si l'utilisateur l'a demandé ET que la timeline tourne, toujours à
    // la position iTime mod durée. Appelée à chaque play/pause/reset du
    // viewport, à la fin d'une (ré)génération et par l'export vidéo.
    function syncSoundToTransport() {
        const shouldPlay = soundWanted && typeof isPlaying !== "undefined" && isPlaying && soundState.status === "ready";
        if (shouldPlay) {
            soundOffset = timelineSoundPosition();
            playSound();
        } else if (soundPlaying) {
            pauseSound();
        }
        renderSoundBar();
    }

    // Recale le son sur iTime si l'écart dépasse la tolérance (dérive des
    // horloges, onglet mis en arrière-plan…). Appelée à chaque frame :
    // ne fait rien tant que le son ne joue pas.
    function correctSoundDrift() {
        if (!soundPlaying || !soundAudioContext) return;
        let diff = currentSoundPosition() - timelineSoundPosition();
        // écart circulaire : 59,9 s vs 0,1 s = 0,2 s d'écart, pas 59,8 s
        if (diff > SOUND_DURATION_SECONDS / 2) diff -= SOUND_DURATION_SECONDS;
        if (diff < -SOUND_DURATION_SECONDS / 2) diff += SOUND_DURATION_SECONDS;
        if (Math.abs(diff) > SOUND_DRIFT_TOLERANCE) {
            soundOffset = timelineSoundPosition();
            playSound();
        }
    }

    // Bouton play/pause de la barre Sound. Demander le son alors que la
    // timeline est en pause relance la timeline (le son ne peut pas
    // jouer hors de la timeline).
    function toggleSoundPlayback() {
        if (soundPlaying) {
            soundWanted = false;
            pauseSound();
            return;
        }
        if (soundState.status !== "ready") return;
        soundWanted = true;
        if (typeof isPlaying !== "undefined" && !isPlaying && typeof setTransportPlaying === "function") {
            setTransportPlaying(true); // appelle syncSoundToTransport()
        } else {
            syncSoundToTransport();
        }
    }

    // Passe Sound désactivée (pass-registry.js → disposeBufferTarget) ou
    // plus présente : arrête tout, annule une génération en cours, libère.
    function disposeSoundPass() {
        soundState.token++;
        stopSoundSource();
        soundPlaying = false;
        soundWanted = false;
        soundBuffer = null;
        soundOffset = 0;
        soundState.status = "idle";
        soundState.progress = 0;
        soundState.message = "";
        soundState.left = soundState.right = null;
        soundState.signature = null;
        if (soundTarget) { soundTarget.dispose(); soundTarget = null; }
    }

    // -------------------------------------------------------------------
    // Barre Sound (index.html #soundBar) : visible uniquement quand la
    // passe Sound existe dans le projet, quel que soit l'onglet affiché
    // (on veut pouvoir lancer/couper le son en éditant l'Image).
    // -------------------------------------------------------------------
    function renderSoundBar() {
        const bar = document.getElementById("soundBar");
        if (!bar) return;
        const exists = !!getPass("sound");
        bar.classList.toggle("show", exists);
        if (!exists) return;

        const btn = document.getElementById("soundPlayBtn");
        const status = document.getElementById("soundStatus");
        const fill = document.getElementById("soundProgressFill");

        const ready = soundState.status === "ready";
        btn.disabled = !ready;
        btn.innerHTML = soundPlaying
            ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>'
            : '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z"/></svg>';
        btn.title = soundPlaying ? "Pause" : "Play";

        bar.classList.toggle("error", soundState.status === "error");
        if (soundState.status === "generating") {
            status.textContent = `Génération du son… ${Math.round(soundState.progress * 100)}%`;
        } else if (ready) {
            status.textContent = `Prêt · ${SOUND_DURATION_SECONDS} s · ${SOUND_SAMPLE_RATE / 1000} kHz`;
        } else if (soundState.status === "error") {
            status.textContent = soundState.message;
        } else {
            status.textContent = "Sound : en attente de compilation";
        }
        fill.style.width = (soundState.status === "generating" ? soundState.progress * 100 : ready ? 100 : 0) + "%";
    }

    document.getElementById("soundPlayBtn").addEventListener("click", toggleSoundPlayback);
    renderSoundBar();
