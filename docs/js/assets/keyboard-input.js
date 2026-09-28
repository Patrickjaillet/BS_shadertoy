    // =========================================================
    // Lot 9 — Keyboard comme input réel (entrée spéciale « Keyboard » de
    // l'onglet Misc du picker). Même contrat que shadertoy.com : une texture
    // 256×3 mono-canal (R8), où la colonne x = code de touche (0-255) et où
    // chaque ligne porte une information différente :
    //
    //   y = 0  état          1.0 tant que la touche est ENFONCÉE
    //   y = 1  pression      1.0 pendant UNE frame, au moment du keydown
    //   y = 2  bascule       alterne 0/1 à chaque nouvelle pression (toggle)
    //
    // Lecture côté GLSL, exactement comme sur shadertoy.com :
    //     float down    = texelFetch(iChannel0, ivec2(KEY, 0), 0).x;
    //     float pressed = texelFetch(iChannel0, ivec2(KEY, 1), 0).x;
    //     float toggle  = texelFetch(iChannel0, ivec2(KEY, 2), 0).x;
    // ou, en filtrage normalisé : texture(iChannel0, vec2((KEY + .5)/256., .5/3.))
    //
    // Les codes sont les `keyCode` historiques du DOM (ceux que shadertoy.com
    // expose : 37/38/39/40 = flèches, 32 = espace, 65-90 = A-Z, 48-57 = 0-9,
    // 13 = Entrée, 27 = Échap, 16/17/18 = Maj/Ctrl/Alt, 112-123 = F1-F12…).
    // `KeyboardEvent.keyCode` est déprécié mais reste le seul identifiant
    // numérique stable et identique à celui de shadertoy.com — `event.code`
    // (chaîne « KeyA ») n'a pas d'équivalent numérique, ce qui casserait le
    // code collé depuis shadertoy.com. Un code ≥ 256 est ignoré (hors texture).
    //
    // Note : la roadmap mentionnait `navigator.mediaDevices` pour cette tâche,
    // mais cette API sert à la capture caméra/micro, pas au clavier — le clavier
    // n'a besoin que de `KeyboardEvent`, sans permission ni geste utilisateur.
    // =========================================================

    const KEYBOARD_TEX_WIDTH = 256;
    const KEYBOARD_TEX_HEIGHT = 3;
    const KEYBOARD_ROW_DOWN = 0;
    const KEYBOARD_ROW_PRESS = 1;
    const KEYBOARD_ROW_TOGGLE = 2;

    // Données brutes de la texture : 3 lignes de 256 octets, ligne 0 en
    // premier (y = 0 → première rangée en mémoire, comme pour les textures
    // 512×2 de la musique dans asset-loader.js).
    const keyboardData = new Uint8Array(KEYBOARD_TEX_WIDTH * KEYBOARD_TEX_HEIGHT);
    let keyboardTexture = null;
    // Pressions « fraîches » : enregistrées depuis le dernier upload GPU, donc
    // pas encore vues par un rendu. `keyboardPressedShown` : pressions déjà
    // envoyées au GPU pour la frame qui vient d'être rendue, à effacer à
    // l'upload suivant. Ce découpage garantit qu'une pression est visible
    // pendant exactement une frame rendue (cf. updateKeyboardTexture).
    let keyboardPressedFresh = new Set();
    let keyboardPressedShown = new Set();
    let keyboardDirty = false;

    function isKeyboardTextureLoaded() {
        return keyboardTexture !== null;
    }

    // Créée à la demande (première résolution d'un slot « keyboard »), puis
    // partagée par tous les slots/passes qui la branchent : un seul clavier
    // physique, donc une seule texture. Retourne null si THREE est absent.
    function getKeyboardTexture() {
        if (keyboardTexture) return keyboardTexture;
        if (typeof THREE === "undefined") return null;
        const tex = new THREE.DataTexture(
            keyboardData, KEYBOARD_TEX_WIDTH, KEYBOARD_TEX_HEIGHT,
            THREE.RedFormat, THREE.UnsignedByteType
        );
        // NEAREST : chaque texel est un état discret. Un filtrage linéaire
        // mélangerait les 3 lignes (texture(...) en y=0.5 tomberait entre
        // deux rangées) et donnerait des états intermédiaires sans sens.
        tex.minFilter = tex.magFilter = THREE.NearestFilter;
        tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.generateMipmaps = false;
        tex.unpackAlignment = 1; // lignes de 256 octets : aucun padding requis
        tex.needsUpdate = true;
        keyboardTexture = tex;
        return tex;
    }

    // Vrai si la frappe vise un champ de saisie (CodeMirror, nom de projet,
    // sliders numériques, sélecteur…) : le clavier du shader ne doit alors
    // rien voir, sinon taper du code dans l'éditeur ferait « jouer » le
    // shader et, à l'inverse, les flèches/espace du shader n'auraient pas à
    // être avalés par l'éditeur.
    function isKeyboardEventForTextField(evt) {
        const el = evt.target;
        if (!el || el.nodeType !== 1) return false;
        const tag = el.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
        if (el.isContentEditable) return true;
        return !!(el.closest && el.closest(".CodeMirror"));
    }

    // Touches qui font défiler la page / activent un bouton par défaut :
    // espace (32), PageUp/Down (33/34), Fin/Début (35/36), flèches (37-40).
    const KEYBOARD_SCROLL_KEYS = new Set([32, 33, 34, 35, 36, 37, 38, 39, 40]);

    // Vrai si au moins une passe ACTIVE a un slot branché sur Keyboard. Sert
    // à ne bloquer le défilement de la page que lorsque le shader écoute
    // réellement le clavier (sinon la page se comporte normalement).
    function isKeyboardInputBound() {
        if (typeof getPasses !== "function") return false;
        return getPasses().some((p) => p.inputs.some((i) => i && i.type === "special" && i.kind === "keyboard"));
    }

    function keyboardKeyCode(evt) {
        const code = evt.keyCode | 0;
        return (code >= 0 && code < KEYBOARD_TEX_WIDTH) ? code : -1;
    }

    function onKeyboardKeyDown(evt) {
        if (!keyboardTexture || isKeyboardEventForTextField(evt)) return;
        const k = keyboardKeyCode(evt);
        if (k < 0) return;
        // Pas de défilement de page / clic implicite sur un bouton focalisé
        // pour espace et les flèches, mais seulement si un shader écoute.
        if (KEYBOARD_SCROLL_KEYS.has(k) && isKeyboardInputBound()) evt.preventDefault();
        const W = KEYBOARD_TEX_WIDTH;
        // L'auto-repeat du système renvoie des keydown en continu : ne
        // compte comme « pression » et ne bascule le toggle qu'à la
        // première (sinon un toggle clignoterait tant que la touche est tenue).
        if (!evt.repeat && keyboardData[KEYBOARD_ROW_DOWN * W + k] === 0) {
            keyboardData[KEYBOARD_ROW_PRESS * W + k] = 255;
            keyboardData[KEYBOARD_ROW_TOGGLE * W + k] = keyboardData[KEYBOARD_ROW_TOGGLE * W + k] ? 0 : 255;
            keyboardPressedFresh.add(k);
        }
        keyboardData[KEYBOARD_ROW_DOWN * W + k] = 255;
        keyboardDirty = true;
    }

    function onKeyboardKeyUp(evt) {
        if (!keyboardTexture) return;
        // Pas de filtre « champ de saisie » ici : si la touche a été
        // enfoncée sur le canvas puis relâchée après un changement de focus,
        // elle doit bien être relâchée côté shader (sinon touche « collée »).
        const k = keyboardKeyCode(evt);
        if (k < 0) return;
        keyboardData[KEYBOARD_ROW_DOWN * KEYBOARD_TEX_WIDTH + k] = 0;
        keyboardDirty = true;
    }

    // Perte de focus de la fenêtre/onglet : les keyup qui suivent ne nous
    // parviendront pas, donc toutes les touches seraient « collées ». On
    // relâche tout (état seulement ; le toggle est un état persistant voulu).
    function releaseAllKeyboardKeys() {
        if (!keyboardTexture) return;
        keyboardData.fill(0, KEYBOARD_ROW_DOWN * KEYBOARD_TEX_WIDTH, (KEYBOARD_ROW_DOWN + 1) * KEYBOARD_TEX_WIDTH);
        keyboardData.fill(0, KEYBOARD_ROW_PRESS * KEYBOARD_TEX_WIDTH, (KEYBOARD_ROW_PRESS + 1) * KEYBOARD_TEX_WIDTH);
        keyboardPressedFresh.clear();
        keyboardPressedShown.clear();
        keyboardDirty = true;
    }

    // Appelée UNE fois par frame par viewport.js:runRenderGraph, avant le
    // rendu des passes. La ligne « pression » doit rester à 1 pendant
    // exactement une frame rendue — ni zéro (keydown+keyup entre deux frames),
    // ni deux :
    //   1. les pressions montrées à la frame PRÉCÉDENTE sont remises à 0 ;
    //   2. les pressions fraîches (arrivées depuis) deviennent « montrées » :
    //      elles restent à 255 dans les données et partent au GPU maintenant ;
    //   3. upload si quoi que ce soit a changé.
    // Si la timeline est en pause, la fonction continue d'être appelée (la
    // boucle de rendu tourne toujours), donc les touches restent réactives.
    function updateKeyboardTexture() {
        if (!keyboardTexture) return;
        const W = KEYBOARD_TEX_WIDTH;

        if (keyboardPressedShown.size > 0) {
            keyboardPressedShown.forEach((k) => { keyboardData[KEYBOARD_ROW_PRESS * W + k] = 0; });
            keyboardPressedShown.clear();
            keyboardDirty = true;
        }
        if (keyboardPressedFresh.size > 0) {
            keyboardPressedFresh.forEach((k) => keyboardPressedShown.add(k));
            keyboardPressedFresh.clear();
        }
        if (keyboardDirty) {
            keyboardTexture.needsUpdate = true;
            keyboardDirty = false;
        }
    }

    // Les listeners sont posés une seule fois, au chargement du script, mais
    // restent inertes (test `!keyboardTexture`) tant qu'aucun slot n'a branché
    // le clavier : zéro coût et aucun effet de bord pour les projets qui ne
    // s'en servent pas.
    window.addEventListener("keydown", onKeyboardKeyDown);
    window.addEventListener("keyup", onKeyboardKeyUp);
    window.addEventListener("blur", releaseAllKeyboardKeys);
    document.addEventListener("visibilitychange", () => { if (document.hidden) releaseAllKeyboardKeys(); });
