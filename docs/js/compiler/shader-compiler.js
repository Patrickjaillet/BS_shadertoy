    function showToast(msg) {
        const toast = document.getElementById("toast");
        document.getElementById("toastMsg").innerText = msg;
        toast.classList.add("show");
        clearTimeout(window._toastTimer);
        window._toastTimer = setTimeout(() => {
            toast.classList.remove("show");
        }, 2500);
    }

    // Lot 1 : buildShaderCode opère par passe. `pass` est un objet Pass
    // (cf. pass-model.js) plutôt que le seul editor.getValue() global
    // d'avant le Lot 1. `params` doit venir de
    // extractParams(pass.code, pass.id) pour que chaque #define soit
    // déclaré sous son uniformName préfixé (ex. bufferA_RAYON), ce qui
    // évite toute collision quand plusieurs passes actives partagent un
    // même nom de constante. Le code de la passe "common" (si active) est
    // concaténé en tête, exactement comme sur shadertoy.com.
    function buildShaderCode(pass, params, commonCode) {
        let body = pass.code;
        let uniformDecls = "";
        // Lot 6 : type de sampler déclaré par canal d'après l'input branché
        // (sampler2D / samplerCube / sampler3D).
        const samplerTypes = [0, 1, 2, 3].map((i) => getInputSamplerType(pass.inputs[i]));
        const isCubemapPass = pass.id === "cubemapA";
        const isSoundPass = pass.id === "sound";
        const loopNames = findLoopConstantNames(pass.code);
        params.forEach((p) => {
            if (loopNames.has(p.name)) return; // keep as #define, not tweakable
            const lineRegex = new RegExp('#define\\s+' + p.name + '\\s+[-+]?\\d*\\.?\\d+(?:[eE][-+]?\\d+)?');
            body = body.replace(lineRegex, `#define ${p.name} ${p.uniformName}`);
            uniformDecls += `uniform float ${p.uniformName};\n`;
        });
        body = rewriteTextureCalls(body);
        const commonPrefix = commonCode ? rewriteTextureCalls(commonCode) + "\n" : "";
        // Full Shadertoy uniform set, so code pasted verbatim from shadertoy.com
        // compiles without edits, whether or not it actually uses each one.
        // Matches Shadertoy's own wrapper: mainImage(out vec4 fragColor, in vec2 fragCoord).
        // Emitted as GLSL ES 3.00 (WebGL2) rather than 1.00: Shadertoy code often
        // relies on things 1.00 doesn't allow (tanh(), non-basic for-loop step
        // operators like /=, etc.) that 3.00 permits without rewriting the loops.
        return `precision highp float;
precision highp int;
precision mediump sampler2D;
precision mediump samplerCube;
precision mediump sampler3D;

uniform vec3       iResolution;
uniform float      iTime;
uniform float      iTimeDelta;
uniform float      iFrameRate;
uniform int        iFrame;
uniform float      iChannelTime[4];
uniform vec3       iChannelResolution[4];
uniform vec4       iMouse;
uniform ${samplerTypes[0]}  iChannel0;
uniform ${samplerTypes[1]}  iChannel1;
uniform ${samplerTypes[2]}  iChannel2;
uniform ${samplerTypes[3]}  iChannel3;
uniform vec4       iDate;
uniform float      iSampleRate;

out vec4 _glFragColor;

${isCubemapPass ? "uniform int _cubeFace;\n" : ""}${isSoundPass ? "uniform int _sampleOffset;\n" : ""}${uniformDecls}
` + commonPrefix + body + `
` + (isCubemapPass ? cubemapMainWrapper() : isSoundPass ? soundMainWrapper() : imageMainWrapper());
    }

    function imageMainWrapper() {
        return `
void main(void) {
    vec4 fragColor = vec4(0.0);
    mainImage(fragColor, gl_FragCoord.xy);
    _glFragColor = fragColor;
}
`;
    }

    // Lot 6 : wrapper de la passe Cubemap A. La direction du rayon par
    // face suit la table OpenGL des cubemaps (sc/tc de la spec) : c'est
    // ce que samplerCube utilisera pour relire la face, donc rendre avec
    // la même convention garantit qu'une direction lue tombe sur le texel
    // écrit pour cette direction. fragCoord.y = 0 est écrit sur la
    // première rangée de la face (t = 0), d'où tc = 2t-1 directement.
    function cubemapMainWrapper() {
        return `
void main(void) {
    vec2 st = gl_FragCoord.xy / iResolution.xy * 2.0 - 1.0;
    float sc = st.x;
    float tc = st.y;
    vec3 dir;
    if (_cubeFace == 0)      dir = vec3( 1.0, -tc, -sc);
    else if (_cubeFace == 1) dir = vec3(-1.0, -tc,  sc);
    else if (_cubeFace == 2) dir = vec3( sc,  1.0,  tc);
    else if (_cubeFace == 3) dir = vec3( sc, -1.0, -tc);
    else if (_cubeFace == 4) dir = vec3( sc, -tc,  1.0);
    else                     dir = vec3(-sc, -tc, -1.0);
    vec4 fragColor = vec4(0.0);
    mainCubemap(fragColor, gl_FragCoord.xy, vec3(0.0), normalize(dir));
    _glFragColor = fragColor;
}
`;
    }

    // Lot 7 : wrapper de la passe Sound. Chaque pixel d'un bloc 512×512
    // calcule UN échantillon stéréo : n° d'échantillon = décalage du bloc
    // + rangée*512 + colonne (gl_FragCoord.y = 0 → première rangée relue
    // par readRenderTargetPixels), temps = n° / iSampleRate. Sortie
    // clampée (NaN → silence) et encodée en 16 bits par canal dans un
    // RGBA8 : (L bas, L haut, R bas, R haut) — inverse dans
    // sound-pass.js:decodeSoundBlock.
    function soundMainWrapper() {
        return `
void main(void) {
    int px = int(gl_FragCoord.x);
    int py = int(gl_FragCoord.y);
    int samp = _sampleOffset + py * 512 + px;
    float t = float(samp) / iSampleRate;
    vec2 y = mainSound(samp, t);
    if (any(isnan(y))) y = vec2(0.0);
    y = clamp(y, -1.0, 1.0);
    vec2 v = floor((0.5 + 0.5 * y) * 65535.0 + 0.5);
    vec2 lo = mod(v, 256.0);
    vec2 hi = floor(v / 256.0);
    _glFragColor = vec4(lo.x, hi.x, lo.y, hi.y) / 255.0;
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

    // Lot 3 : résout les 4 slots iChannel d'une passe en textures Three.js
    // réelles, d'après pass.inputs[] (cf. pass-model.js pour la forme d'un
    // input). Un slot non branché, ou dont la passe/l'asset cible n'existe
    // plus, retombe sur le fallback noir 1×1 global (channelTextures) —
    // jamais null, pour qu'un draw call reste toujours valide même si
    // l'utilisateur débranche une source en plein rendu.
    //
    // Types résolus : "pass" (Buffer/Cubemap A sur un iChannel d'une autre
    // passe, seul type ordonnancé par le render graph), "asset" (Lot 5, via
    // asset-loader.js) et "special" — Lot 9 : uniquement kind "keyboard"
    // (texture 256×3, cf. keyboard-input.js) ; les autres entrées spéciales
    // retombent sur le fallback noir 1×1.
    // Cibler la passe elle-même (self-feedback) lit son buffer de LECTURE
    // (résultat de la frame précédente), jamais celui en cours d'écriture.
    // Lot 6 : résolution UNIQUE d'un slot en { texture, width, height,
    // depth }, partagée par la compilation (état initial) et par
    // viewport.js:refreshPassChannelUniforms (chaque frame), pour que le
    // type de texture liée corresponde toujours au sampler déclaré
    // (getInputSamplerType). `hostPassId` = passe qui possède le slot :
    // un Cubemap A ne peut pas se lire lui-même (feedback WebGL illégal).
    function resolveChannelBinding(input, i, hostPassId) {
        const type = getInputSamplerType(input);
        let texture = null, width = 1, height = 1, depth = 1;

        if (input && input.type === "pass") {
            if (input.id === "cubemapA") {
                if (hostPassId !== "cubemapA" && typeof getCubemapTexture === "function") {
                    texture = getCubemapTexture();
                    if (texture) { width = height = getCubemapSize(); }
                }
            } else if (input.id !== "image" && typeof getBufferReadTexture === "function") {
                // "image" écrit à l'écran, pas dans une texture échantillonnable.
                texture = getBufferReadTexture(input.id);
                const res = typeof getBufferResolution === "function" ? getBufferResolution(input.id) : null;
                if (texture && res) { width = res.width; height = res.height; }
            }
        } else if (input && input.type === "special") {
            // Lot 9 : seul « keyboard » a une source réelle. Tout autre
            // kind retombe sur le fallback noir 1×1 ci-dessous.
            if (input.kind === "keyboard" && typeof getKeyboardTexture === "function") {
                texture = getKeyboardTexture();
                if (texture) { width = KEYBOARD_TEX_WIDTH; height = KEYBOARD_TEX_HEIGHT; }
            }
        } else if (input && input.type === "asset") {
            if (type === "samplerCube" && typeof loadAssetCubemap === "function") {
                texture = loadAssetCubemap(input.assetId);
                if (texture) { width = height = CUBEMAP_FACE_SIZE; }
            } else if (type === "sampler3D" && typeof loadAssetVolume === "function") {
                texture = loadAssetVolume(input.assetId);
                if (texture) { width = height = depth = VOLUME_SIZE; }
            } else if (typeof loadAssetTexture === "function") {
                texture = loadAssetTexture(input.assetId);
                if (texture && texture.image) { width = texture.image.width; height = texture.image.height; }
            }
        }

        if (!texture) {
            // Fallback du BON type, toujours valide (jamais null).
            width = height = depth = 1;
            if (type === "samplerCube") texture = getFallbackCubeTexture();
            else if (type === "sampler3D") texture = getFallbackVolumeTexture() || channelTextures[i];
            else texture = channelTextures[i];
        }
        return { texture, width, height, depth };
    }

    function resolvePassChannelTextures(pass) {
        return pass.inputs.map((input, i) => resolveChannelBinding(input, i, pass.id).texture);
    }

    // Lot 3 : compile le fragment shader d'une passe donnée et tente sa
    // compilation GPU via le quadMesh partagé (rendu hors-écran + lecture
    // des diagnostics WebGLProgram). Ne modifie PAS le matériau affiché à
    // l'écran de façon durable — restaure toujours le matériau précédent du
    // quadMesh avant de retourner, y compris en cas d'échec : la boucle de
    // rendu (viewport.js) est seule responsable d'appliquer le bon matériau
    // à quadMesh à chaque frame, pour chaque passe du render graph, dans
    // l'ordre calculé. Retourne { ok, message, uniforms, params, material }.
    function compilePassMaterial(pass, commonCode) {
        const loopNames = findLoopConstantNames(pass.code);
        const params = extractParams(pass.code, pass.id).filter(p => !loopNames.has(p.name));
        const fullCode = buildShaderCode(pass, params, commonCode);
        const resolvedChannels = resolvePassChannelTextures(pass);

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
            iChannel0: { value: resolvedChannels[0] },
            iChannel1: { value: resolvedChannels[1] },
            iChannel2: { value: resolvedChannels[2] },
            iChannel3: { value: resolvedChannels[3] },
            iDate: { value: new THREE.Vector4(0, 0, 0, 0) },
            iSampleRate: { value: 44100.0 }
        };
        if (pass.id === "cubemapA") uniforms._cubeFace = { value: 0 };
        if (pass.id === "sound") uniforms._sampleOffset = { value: 0 };
        params.forEach((p) => { uniforms[p.uniformName] = { value: p.value }; });

        const vertexShader = `
in vec3 position;
void main() {
    gl_Position = vec4(position, 1.0);
}`;

        let ok = true, message = "";
        let newMaterial = null;

        try {
            newMaterial = new THREE.RawShaderMaterial({
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

            const hadMesh = !!quadMesh;
            const prevMaterial = hadMesh ? quadMesh.material : null;
            const prevTarget = renderer.getRenderTarget();
            if (!hadMesh) {
                const geometry = new THREE.PlaneGeometry(2, 2);
                quadMesh = new THREE.Mesh(geometry, newMaterial);
                scene.add(quadMesh);
            } else {
                quadMesh.material = newMaterial;
            }

            // Rendu de test hors-écran (render target jetable) : ce test ne
            // doit modifier ni le canvas visible ni un render target de
            // Buffer réel, même le temps d'une frame — seule la boucle de
            // rendu (viewport.js) écrit dans l'écran ou dans les buffers.
            const probeTarget = createRenderTarget(1, 1);
            renderer.setRenderTarget(probeTarget);
            renderer.render(scene, camera);
            renderer.setRenderTarget(prevTarget);
            probeTarget.dispose();

            console.error = prevOnError;

            let diagnostics = null;
            try { diagnostics = newMaterial.program ? newMaterial.program.diagnostics : null; } catch (e) {}
            const failed = (diagnostics && !diagnostics.runnable) || (!diagnostics && /ERROR/.test(captured));

            if (failed) {
                ok = false;
                message = captured || "Shader compilation failed";
                if (diagnostics) {
                    const fLog = diagnostics.fragmentShader && diagnostics.fragmentShader.log;
                    const pLog = diagnostics.programLog;
                    message = fLog || pLog || message;
                }
            }

            // Restaure le matériau précédent tout de suite : ce test ne doit
            // pas laisser une passe non affichable visible à l'écran, même
            // le temps d'une frame. La boucle de rendu (viewport.js) applique
            // ensuite explicitement, à chaque frame, le matériau de chaque
            // passe du render graph au moment de la rendre.
            if (hadMesh && prevMaterial) {
                quadMesh.material = prevMaterial;
            }
        } catch (err) {
            ok = false;
            message = err.message || String(err);
        }

        return { ok, message, uniforms, params, material: newMaterial };
    }

    // Lot 3 : recompile TOUTES les passes actives (pas seulement celle
    // affichée dans l'éditeur) et construit le render graph à partir de
    // leurs inputs[]. La passe "common" n'a pas de mainImage propre : son
    // code n'est testé qu'indirectement, en tête de chaque autre passe
    // (elle n'a pas d'entrée dans passCompileStatus, ni dans le render
    // graph — isRenderablePass la filtre déjà). Chaque passe renderable
    // garde désormais son propre matériau/uniforms compilés (state.js:
    // setPassRuntime) : c'est viewport.js qui les applique un par un à
    // quadMesh, dans l'ordre du render graph, à chaque frame — cette
    // fonction ne fait plus de rendu à l'écran elle-même, seulement de la
    // compilation + diagnostic.
    //
    // Une passe exclue du render graph (cycle invalide entre passes
    // différentes, cf. render-graph.js) est quand même compilée et son
    // statut GLSL mis à jour normalement — le cycle est un problème de
    // branchement iChannel, pas de syntaxe — mais n'est pas insérée dans
    // window.currentRenderGraph, donc jamais effectivement dessinée par
    // viewport.js tant que l'utilisateur n'a pas corrigé le branchement.
    function compileAllPasses(refreshInspector = true) {
        if (!renderer || !scene) { showToast("Ouvrez la fenêtre du viewport pour compiler"); return; }

        // Synchronise le code de la passe actuellement affichée dans
        // CodeMirror avant de tout recompiler — c'est la seule passe dont
        // le texte a pu changer depuis la dernière compilation.
        const activePass = getActivePass();
        if (activePass) {
            activePass.code = editor.getValue();
        }

        const commonPass = getPass("common");
        const commonCode = commonPass ? commonPass.code : "";

        // Buffer A-D actifs : (ré)alloue leurs render targets ping-pong à
        // la résolution courante du canvas AVANT de compiler, pour que
        // resolvePassChannelTextures() trouve une texture "read" déjà
        // valide pour tout branchement en self-feedback ou en croisé.
        getPasses().forEach((pass) => {
            if (pass.target && pass.id !== "cubemapA" && pass.id !== "sound") {
                ensureBufferTarget(pass.id, canvas.width, canvas.height);
            }
        });

        // Lot 6 : Cubemap A actif → cible cubemap (6 faces) allouée avant
        // de compiler, pour que les passes qui la lisent trouvent une texture.
        if (getPass("cubemapA") && typeof ensureCubemapTarget === "function") ensureCubemapTarget();

        let anyFailed = false;

        getPasses().forEach((pass) => {
            if (pass.id === "common") return; // pas de mainImage propre, rien à compiler isolément
            const result = compilePassMaterial(pass, commonCode);
            setPassCompileStatus(pass.id, result.ok, result.message);
            if (!result.ok) anyFailed = true;
            setPassRuntime(pass.id, { material: result.material, uniforms: result.uniforms, params: result.params });
            if (pass.id === getActivePass().id) currentParameters = result.params;
        });

        // Recompilation en pause : les Buffers doivent quand même se rendre
        // une fois avec le nouveau code (cf. buffer-manager.js).
        if (typeof requestBufferStep === "function") requestBufferStep();

        // Lot 3 : calcule l'ordre de rendu à partir des inputs[] actuels.
        // Exposé sur window (plutôt qu'une simple variable de module) pour
        // rester lisible depuis viewport.js sans dépendre de l'ordre de
        // <script> entre les deux fichiers.
        const graph = buildRenderGraph(getPasses());
        window.currentRenderGraph = graph;

        const imageStatus = getPassCompileStatus("image");
        const hasInvalidCycle = graph.cycles.length > 0;

        if (imageStatus && !imageStatus.ok) {
            setCompileStatus(false, "Error");
            document.getElementById("errorConsole").classList.add("show");
            document.getElementById("errorText").innerText = imageStatus.message;
        } else if (hasInvalidCycle) {
            // Un cycle de branchement iChannel entre passes différentes
            // (pas un self-feedback, légitime) empêche ces passes d'être
            // rendues du tout : priorité sur un simple "pass error" GLSL,
            // car aucune correction de code ne le résoudra — seul un
            // rebranchement (Lot 4) le peut.
            setCompileStatus(false, "Cycle error");
            document.getElementById("errorConsole").classList.add("show");
            const cycleLabels = graph.cycles.map((c) => c.map((id) => (getPass(id) || { label: id }).label).join(" → "));
            document.getElementById("errorText").innerText =
                "Branchement iChannel invalide (cycle entre passes différentes) : " + cycleLabels.join(" ; ");
        } else if (anyFailed) {
            // La passe "image" compile, mais au moins une autre passe active
            // a une erreur : le viewport reste correct à l'écran, mais on le
            // signale quand même (badge rouge sur l'onglet concerné, cf.
            // editor-tabs.js) plutôt que d'afficher un statut "Compiled" trompeur.
            setCompileStatus(false, "Pass error");
            document.getElementById("errorConsole").classList.add("show");
            const failedPass = getPasses().find((p) => {
                const s = getPassCompileStatus(p.id);
                return s && !s.ok;
            });
            const failedStatus = failedPass ? getPassCompileStatus(failedPass.id) : null;
            document.getElementById("errorText").innerText = failedPass
                ? `[${failedPass.label}] ${failedStatus.message}`
                : "Une passe active a échoué à la compilation.";
        } else {
            setCompileStatus(true, "Compiled");
            document.getElementById("errorConsole").classList.remove("show");
        }

        // Lot 7 : le Sound shader se génère offline (sound-pass.js) une
        // fois toutes les passes compilées ; no-op si le code n'a pas changé.
        if (typeof onSoundPassCompiled === "function") onSoundPassCompiled();

        // Lot 8 : toute recompilation (édition, branchement d'un input,
        // ajout/retrait de passe) est un point de sauvegarde candidat.
        if (typeof scheduleProjectAutosave === "function") scheduleProjectAutosave();

        if (!isProgrammaticChange && refreshInspector) {
            parseAndPopulateInspector();
        }

        if (typeof renderPassTabs === "function") renderPassTabs();
    }

    // Alias conservé pour compatibilité : tout le code existant (boutons,
    // auto-compile, presets…) appelle compileShader(), qui recompile
    // maintenant l'ensemble des passes actives plutôt qu'un seul shader.
    function compileShader(refreshInspector = true) {
        compileAllPasses(refreshInspector);
    }
