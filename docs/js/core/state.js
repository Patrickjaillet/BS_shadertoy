    // canvas/renderer/scene/camera are created by mountRenderer() below,
    // once the DOM (and its <canvas>) exists.
    let canvas, renderer, scene, camera;
    let quadMesh = null, currentMaterial = null, shaderUniforms = null;

    let channelTextures = [null, null, null, null];
    let isPlaying = true;
    let currentTime = 0;
    let lastTime = performance.now();
    let frameCount = 0;
    let mouse = { x: 0, y: 0, z: 0, w: 0 };
    let renderScale = 1.0;
    let isProgrammaticChange = false;
    let currentParameters = [];

    // Lot 3 : une seule scène/caméra/quad partagée (le quad plein écran ne
    // change pas de géométrie d'une passe à l'autre, seul son matériau
    // change), mais un JEU DE RUNTIME PAR PASSE ACTIVE — avant ce lot,
    // quadMesh/currentMaterial/shaderUniforms/currentParameters ne
    // décrivaient que la passe "image", seule rendue à l'écran. Le render
    // graph (render-graph.js) peut désormais devoir rendre plusieurs passes
    // dans la même frame (Buffer A puis Image, par ex.), chacune avec son
    // propre historique de compilation — recompiler un THREE.ShaderMaterial
    // à chaque frame serait bien trop coûteux, donc chaque passe garde son
    // matériau/uniforms compilés une fois par compileAllPasses(), rafraîchis
    // (temps, souris, iChannel résolus) à chaque frame dans viewport.js.
    //
    // { [passId]: { material, uniforms, params } }. `quadMesh` (déclaré plus
    // haut) reste la géométrie plein écran partagée, dont on change juste le
    // .material avant chaque appel à renderer.render() pour la passe en cours.
    let passRuntime = {};

    function getPassRuntime(id) {
        return passRuntime[id] || null;
    }

    function setPassRuntime(id, runtime) {
        const prev = passRuntime[id];
        if (prev && prev.material && prev.material !== runtime.material) {
            prev.material.dispose();
        }
        passRuntime[id] = runtime;
    }

    function clearPassRuntime(id) {
        const prev = passRuntime[id];
        if (prev && prev.material) prev.material.dispose();
        delete passRuntime[id];
    }

    let editor = CodeMirror.fromTextArea(document.getElementById("codeEditor"), {
        mode: "x-shader/x-fragment",
        theme: "dracula",
        lineNumbers: true,
        matchBrackets: true,
        indentUnit: 4,
        tabSize: 4,
        lineWrapping: true
    });

    editor.setValue(DEFAULT_SHADER);

    let isMouseDown = false;

    // =========================================================
    // Renderer bootstrap: WebGLRenderer/Scene/Camera + the 1x1
    // fallback iChannel0-3 textures. Split out of the old
    // viewport.js so viewport.js itself only holds the render
    // loop / transport wiring (lighter, orchestration-only).
    // =========================================================
    function mountRenderer() {
        canvas = document.getElementById("renderCanvas");
        renderer = new THREE.WebGLRenderer({ canvas: canvas, preserveDrawingBuffer: true, antialias: false });
        renderer.setPixelRatio(1);
        renderer.debug.checkShaderErrors = true;
        scene = new THREE.Scene();
        camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

        // Fallback 1x1 black textures so iChannel0..3 are always bound to
        // something valid, even if the pasted Shadertoy code samples them
        // without the user having assigned real media.
        for (let i = 0; i < 4; i++) {
            const data = new Uint8Array([0, 0, 0, 255]);
            const tex = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
            tex.magFilter = THREE.LinearFilter;
            tex.minFilter = THREE.LinearFilter;
            tex.needsUpdate = true;
            channelTextures[i] = tex;
        }
    }
