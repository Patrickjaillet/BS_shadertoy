    // canvas/renderer/scene/camera are created inline by mountViewport()
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
