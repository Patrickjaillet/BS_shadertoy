    // =========================================================
    // Pure GLSL text transforms — no Three.js / DOM dependency.
    // Shared by shader-compiler.js (assembly) and inspector.js
    // (which re-parses the same #define set to build param cards).
    //
    // Lot 1 : ces fonctions opèrent sur un code de passe donné (plus sur
    // un unique editor.getValue() implicite) et extractParams accepte un
    // préfixe de passe pour que deux passes qui définissent la même
    // constante (ex. RAYON dans bufferA et dans image) donnent des
    // paramètres distincts, sans collision dans l'Inspector.
    // =========================================================

    function extractParams(code, passPrefix) {
        const defineRegex = /#define\s+([A-Za-z_][A-Za-z0-9_]*)\s+([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)/g;
        const params = [];
        let match;
        while ((match = defineRegex.exec(code)) !== null) {
            const name = match[1];
            const val = parseFloat(match[2]);
            if (!isNaN(val) && name !== "mainImage") {
                // `name` reste le nom du #define tel qu'il apparaît dans le
                // code de la passe (utilisé pour la ré-écriture texte via
                // commitParameterToEditor). `uniformName` est le nom
                // effectivement déclaré/utilisé comme uniform GLSL et comme
                // clé d'affichage dans l'Inspector — préfixé par passe pour
                // éviter les collisions entre passes (ex. "bufferA.RAYON").
                const uniformName = passPrefix ? `${passPrefix}_${name}` : name;
                params.push({ name, uniformName, value: val, raw: match[2] });
            }
        }
        return params;
    }

    // Names used in a for-loop's init/bound/step must stay compile-time
    // #define constants in GLSL ES 1.00 (WebGL1) — "for (float x = A; x < B; x += C)"
    // requires A, B and C to be constant expressions. Promoting them to
    // uniforms (as we do for other #define'd numbers, so they're tweakable
    // in the inspector) breaks compilation. Detect that usage and leave
    // those particular names as #define so pasted Shadertoy code just works.
    function findLoopConstantNames(code) {
        const protectedNames = new Set();
        const forRegex = /for\s*\(([^;]*);([^;]*);([^)]*)\)/g;
        let m;
        while ((m = forRegex.exec(code)) !== null) {
            const init = m[1];
            const condition = m[2];
            const increment = m[3];
            const identRegex = /[A-Za-z_][A-Za-z0-9_]*/g;
            let im;
            while ((im = identRegex.exec(init)) !== null) protectedNames.add(im[0]);
            while ((im = identRegex.exec(condition)) !== null) protectedNames.add(im[0]);
            while ((im = identRegex.exec(increment)) !== null) protectedNames.add(im[0]);
        }
        return protectedNames;
    }

    // Rewrite WebGL1-style sampling calls to their GLSL ES 3.00 equivalents,
    // since pasted Shadertoy code almost always uses the old names.
    function rewriteTextureCalls(code) {
        return code
            .replace(/\btexture2D\s*\(/g, "texture(")
            .replace(/\btexture2DProj\s*\(/g, "textureProj(")
            .replace(/\btextureCube\s*\(/g, "texture(")
            .replace(/\btexture2DLod\s*\(/g, "textureLod(")
            .replace(/\btextureCubeLod\s*\(/g, "textureLod(");
    }
