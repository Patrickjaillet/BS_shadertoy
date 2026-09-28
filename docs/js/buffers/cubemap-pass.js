    // =========================================================
    // Lot 6 — Passe Cubemap A : rendu de mainCubemap() vers un
    // THREE.WebGLCubeRenderTarget, une face à la fois (6 draw calls par
    // frame), puis échantillonnage par n'importe quelle autre passe via
    // `samplerCube` (cf. shader-compiler.js:getInputSamplerType).
    //
    // Convention de faces : le shader généré (buildShaderCode, wrapper
    // cubemapA) calcule lui-même la direction du rayon par face selon la
    // table OpenGL des cubemaps (+X,-X,+Y,-Y,+Z,-Z), donc on n'utilise
    // PAS THREE.CubeCamera (ses caméras suivent une convention à part,
    // pensée pour les matériaux Three intégrés, pas pour un
    // RawShaderMaterial + samplerCube natif). Chaque face est simplement
    // un plein-écran rendu avec `_cubeFace` = 0..5.
    //
    // Une seule cible (pas de ping-pong) : un Cubemap A qui se lirait
    // lui-même serait une boucle de feedback WebGL illégale (lecture et
    // écriture de la même texture) — resolveChannelBinding retombe donc
    // sur un cube noir dans ce cas.
    // =========================================================

    const CUBEMAP_PASS_SIZE = 512;
    let cubemapTarget = null;

    function ensureCubemapTarget() {
        if (cubemapTarget) return cubemapTarget;
        cubemapTarget = new THREE.WebGLCubeRenderTarget(CUBEMAP_PASS_SIZE, {
            format: THREE.RGBAFormat,
            type: THREE.HalfFloatType, // filtrage linéaire garanti en WebGL2, contrairement à FloatType
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            generateMipmaps: false
        });
        if (typeof requestBufferStep === "function") requestBufferStep();
        return cubemapTarget;
    }

    function getCubemapTexture() {
        return cubemapTarget ? cubemapTarget.texture : null;
    }

    function getCubemapSize() {
        return cubemapTarget ? CUBEMAP_PASS_SIZE : 0;
    }

    function disposeCubemapTarget() {
        if (cubemapTarget) cubemapTarget.dispose();
        cubemapTarget = null;
    }

    // Rend les 6 faces avec le matériau déjà assigné à quadMesh par
    // l'appelant (viewport.js). `uniforms._cubeFace` est un int lu par le
    // wrapper main() de la passe Cubemap A.
    function renderCubemapFaces(uniforms, renderer, scene, camera) {
        if (!cubemapTarget) return;
        for (let face = 0; face < 6; face++) {
            if (uniforms._cubeFace) uniforms._cubeFace.value = face;
            renderer.setRenderTarget(cubemapTarget, face);
            renderer.render(scene, camera);
        }
    }
