    // =========================================================
    // Lot 3 — Buffer manager : render targets ping-pong pour Buffer A-D
    // (et, de la même façon, pour Cubemap A/Sound au sens où elles écrivent
    // aussi dans une texture plutôt qu'à l'écran — mais leur render target
    // propre arrive avec leurs lots dédiés, 6 et 7 ; ce fichier gère ici
    // uniquement les Buffer A-D 2D, seuls types déjà exploitables par le
    // render graph de ce lot).
    //
    // Chaque Buffer actif a DEUX THREE.WebGLRenderTarget (A/B) : à la frame
    // N on écrit dans l'un pendant que l'autre (résultat de la frame N-1)
    // est lu comme iChannel — c'est ce qui permet le feedback (un buffer
    // qui se lit lui-même) sans jamais lire et écrire la même texture au
    // même instant, ce que WebGL interdit de toute façon. Après le rendu
    // de la frame, on swap : le target qu'on vient d'écrire devient le
    // "read" de la frame suivante.
    //
    // Résolution : synchronisée sur le canvas principal par défaut (comme
    // sur shadertoy.com, où un Buffer suit la résolution du viewport sauf
    // réglage explicite). Le menu de résolution par buffer (mentionné dans
    // la roadmap) n'est pas encore une tâche de ce lot ; l'API est déjà
    // prête à recevoir une résolution explicite (`setBufferResolution`)
    // pour ne pas avoir à re-router les appelants quand ce réglage arrivera.
    // =========================================================

    // { [passId]: { targets: [rtA, rtB], readIndex: 0|1, width, height, explicitSize: {w,h}|null } }
    let bufferTargets = {};

    // Float32 si le GPU sait le filtrer en linéaire (OES_texture_float_linear),
    // sinon Float16 : un FloatType échantillonné en LinearFilter sans cette
    // extension est « incomplet » en WebGL et se lit noir (fréquent sur
    // mobile/Safari) — les buffers apparaissaient alors vides.
    function bufferTextureType() {
        try {
            if (typeof renderer !== "undefined" && renderer && renderer.extensions
                && renderer.extensions.has("OES_texture_float_linear")) return THREE.FloatType;
        } catch (e) { /* extension absente */ }
        return THREE.HalfFloatType;
    }

    function createRenderTarget(width, height) {
        return new THREE.WebGLRenderTarget(width, height, {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: bufferTextureType(),
            depthBuffer: false,
            stencilBuffer: false
        });
    }

    // Crée (si besoin) la paire ping-pong d'un Buffer actif. Idempotent :
    // ne recrée rien si l'entrée existe déjà à la bonne taille. `width`/
    // `height` sont ceux du canvas principal, sauf résolution explicite
    // posée via setBufferResolution.
    function ensureBufferTarget(passId, width, height) {
        const entry = bufferTargets[passId];
        const explicit = entry && entry.explicitSize;
        const w = Math.max(1, explicit ? explicit.w : width);
        const h = Math.max(1, explicit ? explicit.h : height);

        if (entry && entry.width === w && entry.height === h) {
            return entry;
        }

        if (entry) {
            entry.targets[0].dispose();
            entry.targets[1].dispose();
        }

        const created = {
            targets: [createRenderTarget(w, h), createRenderTarget(w, h)],
            readIndex: 0,
            width: w,
            height: h,
            explicitSize: explicit || null
        };
        bufferTargets[passId] = created;
        requestBufferStep(); // cible neuve (vide) : un buffer en pause doit quand même se rendre une fois
        return created;
    }

    // -------------------------------------------------------------------
    // Pause / Reset. Un Buffer est un ÉTAT (feedback) : en pause il doit
    // rester figé, comme sur shadertoy.com — sinon une accumulation, une
    // simulation ou un fondu continue de tourner pendant que iTime/iFrame
    // sont arrêtés. viewport.js:runRenderGraph ne rend donc les passes à
    // cible (Buffers, Cubemap A) que si la timeline tourne, si un export
    // vidéo est en cours, ou si un rendu ponctuel a été demandé ici
    // (recompilation, Reset, cible recréée par un redimensionnement).
    // -------------------------------------------------------------------
    let bufferStepRequests = 0;
    function requestBufferStep() { bufferStepRequests = 1; }

    // Reset de la timeline : vide les deux cibles de chaque Buffer (état
    // initial nul, comme un Buffer neuf sur shadertoy.com), pour que
    // `if (iFrame == 0)` réinitialise bien la simulation.
    function clearAllBufferTargets() {
        if (typeof renderer === "undefined" || !renderer) return;
        const prevColor = new THREE.Color();
        renderer.getClearColor(prevColor);
        const prevAlpha = renderer.getClearAlpha();
        renderer.setClearColor(0x000000, 0);
        Object.keys(bufferTargets).forEach((id) => {
            const entry = bufferTargets[id];
            if (!entry.targets) return;
            entry.targets.forEach((t) => { renderer.setRenderTarget(t); renderer.clear(); });
            entry.readIndex = 0;
        });
        renderer.setRenderTarget(null);
        renderer.setClearColor(prevColor, prevAlpha);
        requestBufferStep();
    }

    // Fixe une résolution explicite pour un Buffer (menu de résolution par
    // buffer façon shadertoy.com — pas encore d'UI dans ce lot, mais l'API
    // est prête). `null` revient au comportement par défaut (suit le canvas).
    function setBufferResolution(passId, width, height) {
        const entry = bufferTargets[passId];
        const explicitSize = (width && height) ? { w: width, h: height } : null;
        if (entry) {
            entry.explicitSize = explicitSize;
            // Force une réallocation à la bonne taille au prochain ensureBufferTarget.
            entry.width = -1;
            entry.height = -1;
        } else {
            bufferTargets[passId] = { targets: null, readIndex: 0, width: -1, height: -1, explicitSize };
        }
    }

    function getBufferReadTexture(passId) {
        const entry = bufferTargets[passId];
        if (!entry || !entry.targets) return null;
        return entry.targets[entry.readIndex].texture;
    }

    function getBufferWriteTarget(passId) {
        const entry = bufferTargets[passId];
        if (!entry || !entry.targets) return null;
        return entry.targets[1 - entry.readIndex];
    }

    // Lot 3 : résolution réelle du render target "read" d'un Buffer actif,
    // pour que le render graph puisse peupler iChannelResolution[] avec la
    // vraie taille de ce qui est effectivement échantillonné sur un
    // iChannel (ping-pong redimensionné avec le canvas, ou résolution
    // explicite via setBufferResolution) plutôt qu'une valeur figée.
    // Retourne null si le Buffer n'a pas encore de render target alloué.
    function getBufferResolution(passId) {
        const entry = bufferTargets[passId];
        if (!entry || !entry.targets) return null;
        return { width: entry.width, height: entry.height };
    }

    // À appeler après avoir rendu un Buffer dans son target d'écriture pour
    // la frame courante : le target écrit devient le "read" de la frame
    // suivante (et donc ce que lira un éventuel self-feedback ou une autre
    // passe branchée dessus).
    function swapBufferTarget(passId) {
        const entry = bufferTargets[passId];
        if (!entry) return;
        entry.readIndex = 1 - entry.readIndex;
    }

    // Libère les render targets d'un Buffer désactivé (disablePass). Sans
    // ça, activer/désactiver un Buffer en boucle fuiterait de la mémoire
    // GPU — les WebGLRenderTarget ne sont pas ramassés par le GC seul.
    function disposeBufferTarget(passId) {
        // Lot 6 : Cubemap A a sa propre cible (cubemap-pass.js), pas une paire ping-pong
        if (passId === "cubemapA" && typeof disposeCubemapTarget === "function") disposeCubemapTarget();
        // Lot 7 : idem pour Sound (arrêt du son + cible de génération)
        if (passId === "sound" && typeof disposeSoundPass === "function") disposeSoundPass();
        const entry = bufferTargets[passId];
        if (!entry) return;
        if (entry.targets) {
            entry.targets[0].dispose();
            entry.targets[1].dispose();
        }
        delete bufferTargets[passId];
    }

    function hasBufferTarget(passId) {
        return !!(bufferTargets[passId] && bufferTargets[passId].targets);
    }
