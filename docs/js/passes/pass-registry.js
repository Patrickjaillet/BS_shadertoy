    // =========================================================
    // Lot 1 — Registre des passes actives du projet courant.
    //
    // "Image" est toujours présente. Les autres (Common, Buffer A-D,
    // Cubemap A, Sound) sont activables/désactivables — ce qui pilotera
    // les onglets de l'éditeur au Lot 2 et le render graph au Lot 3.
    // Pour l'instant, le projet démarre avec la seule passe "image" (dont
    // le code initial est DEFAULT_SHADER, cf. core/shaders-presets.js),
    // ce qui reproduit exactement le comportement mono-shader d'avant le
    // Lot 1 : rien ne change encore à l'écran, seule la donnée sous-jacente
    // est maintenant structurée en passes.
    // =========================================================

    let passes = [createPass("image", DEFAULT_SHADER)];
    let activePassId = "image";

    function getPasses() {
        return passes;
    }

    function getPass(id) {
        return passes.find((p) => p.id === id) || null;
    }

    function getActivePass() {
        return getPass(activePassId);
    }

    function setActivePassId(id) {
        if (!getPass(id)) {
            throw new Error(`setActivePassId: aucune passe active "${id}" dans le registre`);
        }
        activePassId = id;
    }

    // Active une passe optionnelle (ne fait rien si elle est déjà active).
    // "image" est toujours présente et ne passe pas par ici. Sans code
    // fourni, createPass() pose le squelette de départ du type (cf.
    // PASS_STARTER_CODE dans pass-model.js) plutôt qu'un code vide, pour
    // que la passe compile dès son activation (Lot 2).
    function enablePass(id, code) {
        if (id === "image") return getPass("image");
        if (getPass(id)) return getPass(id);
        const pass = createPass(id, code);
        passes.push(pass);
        sortPassesByCanonicalOrder();
        return pass;
    }

    // Désactive (retire) une passe optionnelle du projet. Refuse pour les
    // passes de PASS_ALWAYS_ON ("image"), qui doivent toujours exister.
    function disablePass(id) {
        if (PASS_ALWAYS_ON.includes(id)) {
            throw new Error(`disablePass: la passe "${id}" ne peut pas être désactivée`);
        }
        passes = passes.filter((p) => p.id !== id);
        clearPassCompileStatus(id);
        if (activePassId === id) {
            activePassId = "image";
        }
        // Lot 3 : une passe désactivée peut avoir été branchée en iChannel
        // d'une ou plusieurs autres passes (input de type "pass"). Un input
        // orphelin (qui pointe vers une passe qui n'existe plus) planterait
        // le tri topologique du render graph, donc on le débranche partout
        // (retombe sur le fallback 1×1 noir, comme un slot jamais branché).
        passes.forEach((p) => {
            p.inputs = p.inputs.map((input) => (input && input.type === "pass" && input.id === id) ? null : input);
        });
        // Lot 3 : libère les render targets GPU du Buffer désactivé (pas de
        // WebGLRenderTarget pour "image"/"common", disposeBufferTarget est
        // un no-op silencieux pour un passId jamais alloué — cf. buffer-manager.js)
        // ainsi que son matériau compilé (state.js:clearPassRuntime).
        if (typeof disposeBufferTarget === "function") disposeBufferTarget(id);
        if (typeof clearPassRuntime === "function") clearPassRuntime(id);
    }

    // Lot 3 : branche/débranche un iChannel de la passe `passId`. `input`
    // doit être null (débranche) ou une valeur valide selon isValidPassInput
    // (cf. pass-model.js) — { type: "pass", id } pour l'instant, { type:
    // "asset", assetId } à partir du Lot 5 une fois le picker (Lot 4) et la
    // bibliothèque d'assets écrits. Ne déclenche pas de recompilation elle-
    // même : c'est à l'appelant (le futur channel-picker.js, ou un test) de
    // rappeler compileShader()/le render graph après coup.
    function setPassInput(passId, channelIndex, input) {
        const pass = getPass(passId);
        if (!pass) {
            throw new Error(`setPassInput: passe inconnue "${passId}"`);
        }
        if (channelIndex < 0 || channelIndex > 3) {
            throw new Error(`setPassInput: index de canal invalide "${channelIndex}" (attendu 0-3)`);
        }
        if (!isValidPassInput(input)) {
            throw new Error(`setPassInput: input invalide pour ${passId}.iChannel${channelIndex}`);
        }
        pass.inputs[channelIndex] = input;
    }

    function getPassInput(passId, channelIndex) {
        const pass = getPass(passId);
        if (!pass) return null;
        return pass.inputs[channelIndex] || null;
    }

    function clearPassInput(passId, channelIndex) {
        setPassInput(passId, channelIndex, null);
    }

    function isPassEnabled(id) {
        return !!getPass(id);
    }

    // Types de passe optionnelle pas encore actifs dans le projet courant
    // — sert à peupler le menu du bouton "+" de la barre d'onglets (Lot 2).
    function getDisabledPassTypes() {
        return PASS_TYPES.filter((id) => id !== "image" && !isPassEnabled(id));
    }

    // Lot 2 : dernier résultat de compilation par passe, tenu à jour par
    // shader-compiler.js après chaque compileAllPasses(). Sert au badge
    // d'erreur sur l'onglet (editor-tabs.js) et au error-console qui
    // précise quelle passe a échoué. `{ ok: bool, message: string }` par
    // id de passe ; absence d'entrée = pas encore compilée.
    let passCompileStatus = {};

    function setPassCompileStatus(id, ok, message) {
        passCompileStatus[id] = { ok, message: message || "" };
    }

    function getPassCompileStatus(id) {
        return passCompileStatus[id] || null;
    }

    function clearPassCompileStatus(id) {
        delete passCompileStatus[id];
    }

    // Ordre canonique façon shadertoy.com : Common | Buffer A-D | Cubemap A
    // | Sound | Image. Utilisé pour l'affichage des onglets (Lot 2) et pour
    // garder un ordre stable indépendamment de l'ordre d'activation.
    function sortPassesByCanonicalOrder() {
        const order = ["common", "bufferA", "bufferB", "bufferC", "bufferD", "cubemapA", "sound", "image"];
        passes.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    }

    // Passes qui écrivent effectivement une image, dans l'ordre canonique
    // (donc hors "common", qui n'est que du texte injecté). C'est la base
    // du render graph au Lot 3 — pour l'instant simple filtrage sans tri
    // topologique par dépendances.
    function getRenderablePasses() {
        return passes.filter(isRenderablePass);
    }
