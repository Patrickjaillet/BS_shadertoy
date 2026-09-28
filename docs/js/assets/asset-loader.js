    // =========================================================
    // Lot 5 — Chargement des assets de asset-library.js en objets THREE,
    // avec cache par assetId (un asset branché sur plusieurs slots/passes
    // n'est généré qu'une fois). Pas de THREE.TextureLoader/
    // CubeTextureLoader : les assets étant procéduraux (canvas, cf. note
    // en tête d'asset-library.js), la "charge" est synchrone — mêmes
    // objets THREE produits, sans requête réseau.
    //
    // Lot 6 : textures 2D (loadAssetTexture), cubemaps (loadAssetCubemap)
    // et volumes (loadAssetVolume) sont tous branchables sur un iChannel ;
    // getInputSamplerType() (bas de fichier) dit au compilateur quel type
    // de sampler déclarer (sampler2D/samplerCube/sampler3D) selon l'input.
    // =========================================================

    const assetTextureCache = {};
    const assetLoadFailed = {}; // évite de retenter (et de spammer la console) à chaque frame
    const assetCubemapCache = {};
    const assetVolumeCache = {};

    function loadAssetTexture(assetId) {
        if (assetTextureCache[assetId]) return assetTextureCache[assetId];
        if (assetLoadFailed[assetId] || typeof THREE === "undefined") return null;
        // Vidéos/Music : textures dynamiques (cf. bas de fichier), même
        // cache et même point d'entrée que les textures 2D statiques.
        const video = VIDEO_ASSETS.find((a) => a.assetId === assetId);
        const music = video ? null : MUSIC_ASSETS.find((a) => a.assetId === assetId);
        if (video || music) {
            try {
                const dyn = video ? loadVideoAssetTexture(video) : loadMusicAssetTexture(music);
                if (dyn) assetTextureCache[assetId] = dyn; else assetLoadFailed[assetId] = true;
                return dyn;
            } catch (err) {
                console.warn("dynamic asset failed:", assetId, err);
                assetLoadFailed[assetId] = true;
                return null;
            }
        }
        const asset = TEXTURE_ASSETS.find((a) => a.assetId === assetId);
        if (!asset) return null;
        try {
            const canvas = document.createElement("canvas");
            canvas.width = asset.width; canvas.height = asset.height;
            ASSET_TEXTURE_DRAWERS[asset.drawer](canvas.getContext("2d"), asset.width, asset.height);
            const tex = new THREE.CanvasTexture(canvas);
            tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
            tex.magFilter = THREE.LinearFilter;
            tex.minFilter = THREE.LinearMipmapLinearFilter;
            tex.needsUpdate = true;
            assetTextureCache[assetId] = tex;
            return tex;
        } catch (err) {
            console.warn("loadAssetTexture failed:", assetId, err);
            return null;
        }
    }

    function loadAssetCubemap(assetId) {
        if (assetCubemapCache[assetId]) return assetCubemapCache[assetId];
        const asset = CUBEMAP_ASSETS.find((a) => a.assetId === assetId);
        if (!asset || typeof THREE === "undefined") return null;
        try {
            // Ordre THREE.CubeTexture : +X, -X, +Y, -Y, +Z, -Z
            const faces = ["px", "nx", "py", "ny", "pz", "nz"].map((face) => {
                const c = document.createElement("canvas");
                c.width = c.height = CUBEMAP_FACE_SIZE;
                ASSET_CUBEMAP_DRAWERS[asset.drawer](c.getContext("2d"), CUBEMAP_FACE_SIZE, CUBEMAP_FACE_SIZE, face, asset.blurred);
                return c;
            });
            const tex = new THREE.CubeTexture(faces);
            tex.needsUpdate = true;
            assetCubemapCache[assetId] = tex;
            return tex;
        } catch (err) {
            console.warn("loadAssetCubemap failed:", assetId, err);
            return null;
        }
    }

    function loadAssetVolume(assetId) {
        if (assetVolumeCache[assetId]) return assetVolumeCache[assetId];
        const asset = VOLUME_ASSETS.find((a) => a.assetId === assetId);
        if (!asset || typeof THREE === "undefined") return null;
        // Data3DTexture (r125+) / DataTexture3D (plus ancien) selon la
        // version de Three chargée ; null si aucun des deux n'existe.
        const Tex3D = THREE.Data3DTexture || THREE.DataTexture3D;
        if (!Tex3D) return null;
        try {
            const data = ASSET_VOLUME_GENERATORS[asset.generator](VOLUME_SIZE);
            const tex = new Tex3D(data, VOLUME_SIZE, VOLUME_SIZE, VOLUME_SIZE);
            tex.format = asset.channels === 1 ? THREE.RedFormat : THREE.RGBAFormat;
            tex.type = THREE.UnsignedByteType;
            tex.minFilter = tex.magFilter = THREE.LinearFilter;
            tex.wrapS = tex.wrapT = tex.wrapR = THREE.RepeatWrapping;
            tex.unpackAlignment = 1;
            tex.needsUpdate = true;
            assetVolumeCache[assetId] = tex;
            return tex;
        } catch (err) {
            console.warn("loadAssetVolume failed:", assetId, err);
            return null;
        }
    }

    // -------------------------------------------------------------------
    // Assets dynamiques (Vidéos/Music, Lot 5) : textures mises à jour à
    // chaque frame. `dynamicAssets` ne contient que ceux réellement chargés
    // (donc branchés au moins une fois) — rien n'est dessiné/synthétisé
    // pour un asset que personne n'utilise. Appelé une fois par frame par
    // viewport.js:runRenderGraph avant le rendu des passes.
    // -------------------------------------------------------------------
    const dynamicAssets = [];
    let assetAudioContext = null;

    function loadVideoAssetTexture(asset) {
        const canvas = document.createElement("canvas");
        canvas.width = VIDEO_W; canvas.height = VIDEO_H;
        const ctx = canvas.getContext("2d");
        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.minFilter = tex.magFilter = THREE.LinearFilter;
        tex.generateMipmaps = false;
        dynamicAssets.push({ update(t) { ASSET_VIDEO_DRAWERS[asset.drawer](ctx, VIDEO_W, VIDEO_H, t); tex.needsUpdate = true; } });
        ASSET_VIDEO_DRAWERS[asset.drawer](ctx, VIDEO_W, VIDEO_H, 0);
        return tex;
    }

    // -------------------------------------------------------------------
    // Music (Lot 9) : vrais fichiers de assets/music/, lus par un élément
    // <audio> (streaming, pas de décodage complet en mémoire) branché sur
    // un AnalyserNode. Texture 512×2 façon shadertoy : ligne 0 = spectre
    // (FFT), ligne 1 = forme d'onde.
    //
    // Cycle de vie (comme sur shadertoy.com, où l'audio suit la timeline) :
    //  - la piste ne joue que si la timeline tourne (`isPlaying`) ET qu'elle
    //    est branchée sur un iChannel d'une passe active — débrancher la
    //    piste ou mettre en pause la coupe ; vérifié à chaque frame par
    //    updateMusicPlayback() ;
    //  - Reset (resetTransportTime) la ramène à 0 : resetMusicPlayback() ;
    //  - la piste boucle et `iChannelTime` reçoit son temps de lecture
    //    (getChannelTime), pas iTime ;
    //  - autoplay : le premier chargement suit un clic du picker (geste
    //    utilisateur). Si le navigateur refuse quand même la lecture
    //    (projet restauré au chargement de la page, sans geste), elle
    //    repart au premier clic/touche.
    // -------------------------------------------------------------------
    const musicPlayers = {}; // assetId → { audio, playing, blocked, failed }
    let musicGestureHooked = false;

    function hookMusicGestureRetry() {
        if (musicGestureHooked) return;
        musicGestureHooked = true;
        const retry = () => {
            ["pointerdown", "keydown"].forEach((ev) => window.removeEventListener(ev, retry, true));
            musicGestureHooked = false;
            if (assetAudioContext && assetAudioContext.state === "suspended") assetAudioContext.resume();
            Object.keys(musicPlayers).forEach((id) => { musicPlayers[id].blocked = false; });
        };
        ["pointerdown", "keydown"].forEach((ev) => window.addEventListener(ev, retry, true));
    }

    function loadMusicAssetTexture(asset) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        if (!assetAudioContext) assetAudioContext = new AC();
        if (assetAudioContext.state === "suspended") assetAudioContext.resume().catch(() => {});

        const audio = new Audio();
        audio.preload = "auto";
        audio.loop = true;
        audio.src = asset.src;
        const player = { audio, playing: false, blocked: false, failed: false };
        audio.addEventListener("error", () => {
            player.failed = true;
            console.warn("music asset unreadable:", asset.src, "(fichier absent ? ouvert en file:// ?)");
        });
        musicPlayers[asset.assetId] = player;

        const analyser = assetAudioContext.createAnalyser();
        analyser.fftSize = 1024; // → 512 bins de fréquence
        assetAudioContext.createMediaElementSource(audio).connect(analyser);
        analyser.connect(assetAudioContext.destination);

        const data = new Uint8Array(512 * 2);
        const freq = new Uint8Array(analyser.frequencyBinCount);
        const wave = new Uint8Array(analyser.fftSize);
        const tex = new THREE.DataTexture(data, 512, 2, THREE.RedFormat, THREE.UnsignedByteType);
        tex.minFilter = tex.magFilter = THREE.LinearFilter;
        tex.generateMipmaps = false;
        tex.needsUpdate = true;
        dynamicAssets.push({ update() {
            analyser.getByteFrequencyData(freq);
            analyser.getByteTimeDomainData(wave);
            data.set(freq.subarray(0, 512), 0);
            data.set(wave.subarray(0, 512), 512);
            tex.needsUpdate = true;
        } });
        return tex;
    }

    // Ids des pistes branchées sur un slot d'une passe active.
    function getMusicAssetIdsInUse() {
        const used = new Set();
        if (typeof getPasses !== "function") return used;
        getPasses().forEach((pass) => {
            (pass.inputs || []).forEach((inp) => {
                if (inp && inp.type === "asset" && musicPlayers[inp.assetId]) used.add(inp.assetId);
            });
        });
        return used;
    }

    // Appelée à chaque frame : aligne l'état de lecture de chaque piste sur
    // (timeline en marche ET piste branchée).
    function updateMusicPlayback() {
        const ids = Object.keys(musicPlayers);
        if (!ids.length) return;
        const used = getMusicAssetIdsInUse();
        const timelineRunning = typeof isPlaying !== "undefined" && isPlaying;
        ids.forEach((id) => {
            const p = musicPlayers[id];
            if (p.failed) return;
            const shouldPlay = timelineRunning && used.has(id);
            if (shouldPlay && !p.playing && !p.blocked) {
                if (assetAudioContext && assetAudioContext.state === "suspended") assetAudioContext.resume().catch(() => {});
                p.playing = true;
                const pr = p.audio.play();
                if (pr && pr.catch) pr.catch((err) => {
                    p.playing = false;
                    if (err && err.name === "NotAllowedError") { p.blocked = true; hookMusicGestureRetry(); }
                    else if (!(err && err.name === "AbortError")) p.failed = true;
                });
            } else if (!shouldPlay && p.playing) {
                p.playing = false;
                p.audio.pause();
            }
        });
    }

    // Reset de la timeline → les pistes repartent de 0.
    function resetMusicPlayback() {
        Object.keys(musicPlayers).forEach((id) => {
            try { musicPlayers[id].audio.currentTime = 0; } catch (e) { /* métadonnées pas encore chargées */ }
        });
    }

    // Valeur d'iChannelTime pour un slot : temps de lecture de la piste si
    // le slot est une piste Music, sinon `fallback` (iTime).
    function getChannelTime(input, fallback) {
        if (input && input.type === "asset") {
            const p = musicPlayers[input.assetId];
            if (p && !p.failed) return p.audio.currentTime || 0;
        }
        return fallback;
    }

    function updateDynamicAssets(t) {
        updateMusicPlayback();
        for (let i = 0; i < dynamicAssets.length; i++) dynamicAssets[i].update(t);
    }

    // -------------------------------------------------------------------
    // Lot 6 — type de sampler GLSL à déclarer pour un input d'iChannel.
    // Doit rester cohérent avec la texture réellement fournie par
    // resolveChannelBinding (shader-compiler.js) : déclarer samplerCube
    // et lier une Texture 2D est une erreur WebGL.
    // -------------------------------------------------------------------
    function getInputSamplerType(input) {
        if (!input) return "sampler2D";
        if (input.type === "pass" && input.id === "cubemapA") return "samplerCube";
        if (input.type === "asset") {
            if (CUBEMAP_ASSETS.some((a) => a.assetId === input.assetId)) return "samplerCube";
            if (VOLUME_ASSETS.some((a) => a.assetId === input.assetId)) return "sampler3D";
        }
        return "sampler2D";
    }

    // Fallbacks noirs 1×1 (1×1×1) pour cube/volume, créés à la demande :
    // un slot dont la source est absente (asset en échec, self-feedback
    // cubemap…) doit rester lié à une texture du BON type. Le fallback
    // 2D reste channelTextures[i] (state.js).
    let fallbackCubeTexture = null, fallbackVolumeTexture = null;
    function getFallbackCubeTexture() {
        if (fallbackCubeTexture) return fallbackCubeTexture;
        const faces = [];
        for (let i = 0; i < 6; i++) {
            const c = document.createElement("canvas"); c.width = c.height = 1;
            const ctx = c.getContext("2d"); ctx.fillStyle = "#000"; ctx.fillRect(0, 0, 1, 1);
            faces.push(c);
        }
        fallbackCubeTexture = new THREE.CubeTexture(faces);
        fallbackCubeTexture.needsUpdate = true;
        return fallbackCubeTexture;
    }
    function getFallbackVolumeTexture() {
        if (fallbackVolumeTexture) return fallbackVolumeTexture;
        const Tex3D = THREE.Data3DTexture || THREE.DataTexture3D;
        if (!Tex3D) return null;
        fallbackVolumeTexture = new Tex3D(new Uint8Array([0, 0, 0, 255]), 1, 1, 1);
        fallbackVolumeTexture.format = THREE.RGBAFormat;
        fallbackVolumeTexture.type = THREE.UnsignedByteType;
        fallbackVolumeTexture.unpackAlignment = 1;
        fallbackVolumeTexture.needsUpdate = true;
        return fallbackVolumeTexture;
    }
