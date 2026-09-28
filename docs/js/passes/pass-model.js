    // =========================================================
    // Lot 1 — Modèle de données multi-pass.
    //
    // Une "Pass" représente un onglet de l'éditeur façon shadertoy.com :
    // Common, Image, Buffer A-D, Cubemap A, Sound. Ce fichier ne fait que
    // définir la forme de l'objet + sa validation ; l'orchestration (liste
    // des passes actives, activation/désactivation) vit dans
    // pass-registry.js, et le rendu multi-pass réel (render graph,
    // ping-pong) arrive au Lot 3. Pour l'instant une seule passe ("image")
    // est réellement rendue à l'écran, exactement comme avant le Lot 1 —
    // ce fichier ne change aucun comportement runtime, il introduit juste
    // la structure de données que les lots suivants vont exploiter.
    // =========================================================

    const PASS_TYPES = Object.freeze([
        "common", "image", "bufferA", "bufferB", "bufferC", "bufferD", "cubemapA", "sound"
    ]);

    // Types de passe qui écrivent effectivement dans un render target
    // (donc peuvent être ciblées par un iChannel d'une autre passe).
    // "common" n'a pas de sortie propre : son code est concaténé en tête
    // des autres passes (voir buildShaderCode). "image" écrit à l'écran
    // (target = null par convention, cf. createPass).
    const PASS_RENDERABLE_TYPES = Object.freeze([
        "image", "bufferA", "bufferB", "bufferC", "bufferD", "cubemapA", "sound"
    ]);

    const PASS_LABELS = Object.freeze({
        common: "Common",
        image: "Image",
        bufferA: "Buffer A",
        bufferB: "Buffer B",
        bufferC: "Buffer C",
        bufferD: "Buffer D",
        cubemapA: "Cubemap A",
        sound: "Sound"
    });

    // Passes toujours présentes dans un projet, non désactivables par
    // l'utilisateur (cf. pass-registry.js). Common est optionnelle : un
    // projet sans code partagé n'a pas besoin de l'onglet.
    const PASS_ALWAYS_ON = Object.freeze(["image"]);

    // -------------------------------------------------------------------
    // Code de départ pour chaque type de passe optionnelle, utilisé quand
    // l'utilisateur active une passe (bouton "+" de la barre d'onglets,
    // Lot 2) sans code déjà fourni (ex. chargement d'un projet, Lot 8).
    // Squelettes minimaux mais compilables tels quels : chaque passe
    // renderable a un mainImage() qui produit une couleur, Common un
    // simple commentaire (rien à imposer, c'est du texte libre injecté
    // en tête des autres passes).
    // -------------------------------------------------------------------
    const PASS_STARTER_CODE = Object.freeze({
        common: `// Code partagé, injecté en tête de toutes les autres passes actives.
// Fonctions et constantes communes à Image / Buffer A-D / Cubemap A / Sound.
`,
        bufferA: `void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    fragColor = vec4(uv, 0.0, 1.0);
}`,
        bufferB: `void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    fragColor = vec4(uv, 0.0, 1.0);
}`,
        bufferC: `void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    fragColor = vec4(uv, 0.0, 1.0);
}`,
        bufferD: `void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    fragColor = vec4(uv, 0.0, 1.0);
}`,
        cubemapA: `void mainCubemap(out vec4 fragColor, in vec2 fragCoord, in vec3 rayOrigin, in vec3 rayDirection) {
    fragColor = vec4(rayDirection * 0.5 + 0.5, 1.0);
}`,
        sound: `vec2 mainSound(in int samp, in float time) {
    return vec2(sin(6.2831 * 440.0 * time)) * 0.2;
}`
    });

    // -------------------------------------------------------------------
    // Lot 3 — forme d'un slot inputs[N] une fois branché. Le picker visuel
    // façon shadertoy.com (Lot 4) écrit dans inputs[] via
    // pass-registry.js:setPassInput. Le type "pass" (brancher un Buffer/
    // Cubemap/Sound sur un iChannel d'une autre passe) est le seul
    // effectivement résolu en texture par le render graph pour l'instant :
    //   { type: "pass",    id: "bufferA" }   // lit le dernier rendu de Buffer A
    //   { type: "asset",   assetId: "..." }  // Lot 5 : texture/cubemap/etc.
    //   { type: "special", kind: "keyboard" } // Lot 4 : entrées matérielles du picker
    //                                            (Keyboard seul ; Soundcloud et l'onglet Misc retirés). Lot 9 : "keyboard" a une
    //                                            source réelle (texture 256×3) ; Webcam et
    //                                            Microphone ont été retirés du projet
    // null = slot non branché (texture noire 1×1 de secours, cf. state.js).
    // -------------------------------------------------------------------

    // -------------------------------------------------------------------
    // Construit un objet Pass valide. `id` doit être l'un des PASS_TYPES ;
    // pour bufferA-D/cubemapA/sound, `target` prend automatiquement la
    // même valeur que `id` (une passe qui écrit dans "bufferA" est ciblée
    // via id "bufferA"). "image" et "common" ont target = null : "image"
    // écrit à l'écran, "common" n'écrit nulle part.
    // -------------------------------------------------------------------
    function createPass(id, code) {
        if (!PASS_TYPES.includes(id)) {
            throw new Error(`createPass: id de passe inconnu "${id}" (attendu: ${PASS_TYPES.join(", ")})`);
        }
        const target = PASS_RENDERABLE_TYPES.includes(id) && id !== "image" ? id : null;
        const initialCode = typeof code === "string" ? code : (PASS_STARTER_CODE[id] || "");
        return {
            id: id,
            label: PASS_LABELS[id],
            code: initialCode,
            inputs: [null, null, null, null],
            target: target
        };
    }

    // -------------------------------------------------------------------
    // Vérifie qu'un objet a bien la forme d'une Pass (utilisé au chargement
    // d'un projet sérialisé, cf. Lot 8, et en garde-fou pendant le dev).
    // Ne vérifie pas que les inputs pointent vers des passes/assets qui
    // existent réellement — c'est le rôle du render graph (Lot 3).
    // -------------------------------------------------------------------
    function isValidPass(pass) {
        if (!pass || typeof pass !== "object") return false;
        if (!PASS_TYPES.includes(pass.id)) return false;
        if (typeof pass.label !== "string") return false;
        if (typeof pass.code !== "string") return false;
        if (!Array.isArray(pass.inputs) || pass.inputs.length !== 4) return false;
        if (!pass.inputs.every(isValidPassInput)) return false;
        if (pass.target !== null && !PASS_RENDERABLE_TYPES.includes(pass.target)) return false;
        return true;
    }

    // Un slot inputs[N] est soit non branché (null), soit un input "pass"
    // ({ type: "pass", id }), soit — à partir du Lot 5 — un input "asset"
    // ({ type: "asset", assetId }), soit — à partir du Lot 4 — un input
    // "special" ({ type: "special", kind }) pour les entrées matérielles
    // du picker (Keyboard ; plus proposé dans le picker). "special" est branchable dès ce lot (le
    // picker doit pouvoir le sélectionner et le stocker) mais a une
    // source réelle (texture 256×3) ; tout autre kind retombe sur le fallback noir 1×1.
    // Lot 9 : "keyboard" est résolu en texture réelle (keyboard-input.js).
    // Ne vérifie pas que `id`/`assetId`/`kind` désignent
    // quelque chose qui existe réellement : c'est le rôle du render graph
    // (passe inconnue/désactivée) et d'asset-loader (Lot 5)/Lot 9.
    function isValidPassInput(input) {
        if (input === null) return true;
        if (!input || typeof input !== "object") return false;
        if (input.type === "pass") return typeof input.id === "string";
        if (input.type === "asset") return typeof input.assetId === "string";
        if (input.type === "special") return typeof input.kind === "string";
        return false;
    }

    // Une passe "renderable" est une passe dont le code produit une image
    // (par opposition à "common", qui est seulement du texte injecté en
    // tête des autres). Utile pour l'UI et pour le futur render graph.
    function isRenderablePass(pass) {
        return PASS_RENDERABLE_TYPES.includes(pass.id);
    }
