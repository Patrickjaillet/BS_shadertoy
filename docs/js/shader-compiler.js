    function showToast(msg) {
        const toast = document.getElementById("toast");
        document.getElementById("toastMsg").innerText = msg;
        toast.classList.add("show");
        clearTimeout(window._toastTimer);
        window._toastTimer = setTimeout(() => {
            toast.classList.remove("show");
        }, 2500);
    }

    function extractParams(code) {
        const defineRegex = /#define\s+([A-Za-z_][A-Za-z0-9_]*)\s+([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)/g;
        const params = [];
        let match;
        while ((match = defineRegex.exec(code)) !== null) {
            const name = match[1];
            const val = parseFloat(match[2]);
            if (!isNaN(val) && name !== "mainImage") {
                params.push({ name, value: val, raw: match[2] });
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

    function buildShaderCode(userCode, params) {
        let body = userCode;
        let uniformDecls = "";
        const loopNames = findLoopConstantNames(userCode);
        params.forEach((p) => {
            if (loopNames.has(p.name)) return; // keep as #define, not tweakable
            const lineRegex = new RegExp('#define\\s+' + p.name + '\\s+[-+]?\\d*\\.?\\d+(?:[eE][-+]?\\d+)?');
            body = body.replace(lineRegex, "");
            uniformDecls += `uniform float ${p.name};\n`;
        });
        // Rewrite WebGL1-style sampling calls to their GLSL ES 3.00 equivalents,
        // since pasted Shadertoy code almost always uses the old names.
        body = body
            .replace(/\btexture2D\s*\(/g, "texture(")
            .replace(/\btexture2DProj\s*\(/g, "textureProj(")
            .replace(/\btextureCube\s*\(/g, "texture(")
            .replace(/\btexture2DLod\s*\(/g, "textureLod(")
            .replace(/\btextureCubeLod\s*\(/g, "textureLod(");
        // Full Shadertoy uniform set, so code pasted verbatim from shadertoy.com
        // compiles without edits, whether or not it actually uses each one.
        // Matches Shadertoy's own wrapper: mainImage(out vec4 fragColor, in vec2 fragCoord).
        // Emitted as GLSL ES 3.00 (WebGL2) rather than 1.00: Shadertoy code often
        // relies on things 1.00 doesn't allow (tanh(), non-basic for-loop step
        // operators like /=, etc.) that 3.00 permits without rewriting the loops.
        return `precision highp float;
precision highp int;
precision mediump sampler2D;

uniform vec3       iResolution;
uniform float      iTime;
uniform float      iTimeDelta;
uniform float      iFrameRate;
uniform int        iFrame;
uniform float      iChannelTime[4];
uniform vec3       iChannelResolution[4];
uniform vec4       iMouse;
uniform sampler2D  iChannel0;
uniform sampler2D  iChannel1;
uniform sampler2D  iChannel2;
uniform sampler2D  iChannel3;
uniform vec4       iDate;
uniform float      iSampleRate;

out vec4 _glFragColor;

${uniformDecls}
` + body + `

void main(void) {
    vec4 fragColor = vec4(0.0);
    mainImage(fragColor, gl_FragCoord.xy);
    _glFragColor = fragColor;
}
`;
    }

    function setCompileStatus(ok, msg) {
        const el = document.getElementById("compileStatus");
        if (ok) {
            el.className = "status-ok";
            el.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/><path d="M8 12l2.5 2.5L16 9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><span>' + msg + '</span>';
        } else {
            el.className = "status-err";
            el.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/><path d="M15 9L9 15M9 9l6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><span>' + msg + '</span>';
        }
    }

    function compileShader(refreshInspector = true) {
        if (!renderer || !scene) { showToast("Ouvrez la fenêtre du viewport pour compiler"); return; }
        const code = editor.getValue();
        const loopNames = findLoopConstantNames(code);
        const params = extractParams(code).filter(p => !loopNames.has(p.name));
        currentParameters = params;
        const fullCode = buildShaderCode(code, params);

        const uniforms = {
            iResolution: { value: new THREE.Vector3(canvas.width, canvas.height, 1.0) },
            iTime: { value: currentTime },
            iTimeDelta: { value: 0 },
            iFrameRate: { value: 60 },
            iFrame: { value: frameCount },
            iChannelTime: { value: [currentTime, currentTime, currentTime, currentTime] },
            iChannelResolution: { value: [
                new THREE.Vector3(1, 1, 1), new THREE.Vector3(1, 1, 1),
                new THREE.Vector3(1, 1, 1), new THREE.Vector3(1, 1, 1)
            ] },
            iMouse: { value: new THREE.Vector4(mouse.x, mouse.y, mouse.z, mouse.w) },
            iChannel0: { value: channelTextures[0] },
            iChannel1: { value: channelTextures[1] },
            iChannel2: { value: channelTextures[2] },
            iChannel3: { value: channelTextures[3] },
            iDate: { value: new THREE.Vector4(0, 0, 0, 0) },
            iSampleRate: { value: 44100.0 }
        };
        params.forEach((p) => { uniforms[p.name] = { value: p.value }; });

        const vertexShader = `
in vec3 position;
void main() {
    gl_Position = vec4(position, 1.0);
}`;

        try {
            const newMaterial = new THREE.RawShaderMaterial({
                uniforms: uniforms,
                vertexShader: vertexShader,
                fragmentShader: fullCode,
                glslVersion: THREE.GLSL3,
                depthTest: false,
                depthWrite: false
            });

            // Force an immediate compile check by rendering once off-screen;
            // Three.js surfaces GLSL errors via console + the WebGLProgram's
            // diagnostics object (populated when debug.checkShaderErrors is on).
            const prevOnError = console.error;
            let captured = "";
            console.error = function (...args) {
                captured += args.map(a => (typeof a === "string" ? a : JSON.stringify(a))).join(" ") + "\n";
                prevOnError.apply(console, args);
            };

            if (quadMesh) {
                quadMesh.material.dispose();
                quadMesh.material = newMaterial;
            } else {
                const geometry = new THREE.PlaneGeometry(2, 2);
                quadMesh = new THREE.Mesh(geometry, newMaterial);
                scene.add(quadMesh);
            }
            shaderUniforms = uniforms;
            currentMaterial = newMaterial;

            renderer.render(scene, camera);

            console.error = prevOnError;

            let diagnostics = null;
            try { diagnostics = newMaterial.program ? newMaterial.program.diagnostics : null; } catch (e) {}
            const failed = (diagnostics && !diagnostics.runnable) || (!diagnostics && /ERROR/.test(captured));

            if (failed) {
                setCompileStatus(false, "Error");
                document.getElementById("errorConsole").classList.add("show");
                let msg = captured || "Shader compilation failed";
                if (diagnostics) {
                    const fLog = diagnostics.fragmentShader && diagnostics.fragmentShader.log;
                    const pLog = diagnostics.programLog;
                    msg = fLog || pLog || msg;
                }
                document.getElementById("errorText").innerText = msg;
            } else {
                setCompileStatus(true, "Compiled");
                document.getElementById("errorConsole").classList.remove("show");
            }
        } catch (err) {
            setCompileStatus(false, "Error");
            document.getElementById("errorConsole").classList.add("show");
            document.getElementById("errorText").innerText = err.message || err;
        }

        if (!isProgrammaticChange && refreshInspector) {
            parseAndPopulateInspector();
        }
    }
