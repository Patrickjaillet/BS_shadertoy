    // =========================================================
    // Transport (Lot 7) : fonctions globales — et non plus des
    // closures de mountViewport — pour que le Sound shader
    // (sound-pass.js) puisse démarrer/suivre la timeline. Comme sur
    // shadertoy.com, le son est calé sur iTime : pause/reprise/reset du
    // viewport se répercutent sur la lecture audio via
    // syncSoundToTransport().
    // =========================================================
    function setTransportPlaying(playing) {
        isPlaying = !!playing;
        const icon = document.getElementById("playIconSvg");
        if (icon) {
            icon.innerHTML = isPlaying
                ? '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>'
                : '<path d="M7 4L20 12L7 20Z"/>';
        }
        if (typeof syncSoundToTransport === "function") syncSoundToTransport();
    }

    function resetTransportTime() {
        currentTime = 0;
        frameCount = 0;
        if (typeof clearAllBufferTargets === "function") clearAllBufferTargets();
        if (typeof resetMusicPlayback === "function") resetMusicPlayback();
        if (typeof syncSoundToTransport === "function") syncSoundToTransport();
    }

    // =========================================================
    // Inline viewport: lives in the main document, docked below
    // the inspector panel (no separate popup window). Renderer
    // bootstrap (canvas/scene/camera/fallback textures) lives in
    // core/state.js's mountRenderer(); this file is just the
    // transport UI wiring + the per-frame render loop.
    // =========================================================
    function mountViewport() {
        const d = document;

        mountRenderer();

        d.getElementById("playPauseBtn").addEventListener("click", () => {
            setTransportPlaying(!isPlaying);
        });

        d.getElementById("resetTimeBtn").addEventListener("click", () => {
            resetTransportTime();
        });

        d.querySelectorAll(".scaleBtn").forEach(btn => {
            btn.addEventListener("click", (e) => {
                d.querySelectorAll(".scaleBtn").forEach(b => b.classList.remove("active"));
                e.currentTarget.classList.add("active");
                renderScale = parseFloat(e.currentTarget.getAttribute("data-scale"));
                compileShader();
            });
        });

        d.getElementById("toggleFrameBtn").addEventListener("click", () => {
            const frame = d.getElementById("goldFrameSvg");
            frame.style.display = (frame.style.display === "none") ? "block" : "none";
        });

        d.getElementById("screenshotBtn").addEventListener("click", () => {
            const a = d.createElement("a");
            a.href = canvas.toDataURL("image/png");
            a.download = "bs_shader.png";
            a.click();
            showToast("Screenshot saved");
        });

        exportBtn = d.getElementById("exportBtn");
        exportBtn.addEventListener("click", openExportModal);

        d.getElementById("fullscreenBtn").addEventListener("click", () => {
            const container = d.getElementById("viewportFrameContainer");
            if (!d.fullscreenElement) {
                container.requestFullscreen().catch(err => console.log(err));
            } else {
                d.exitFullscreen();
            }
        });

        canvas.addEventListener("mousedown", (e) => {
            isMouseDown = true;
            const rect = canvas.getBoundingClientRect();
            mouse.x = e.clientX - rect.left;
            mouse.y = rect.height - (e.clientY - rect.top);
            mouse.z = mouse.x;
            mouse.w = mouse.y;
        });

        window.addEventListener("mouseup", () => {
            isMouseDown = false;
            mouse.z = -Math.abs(mouse.z);
            mouse.w = -Math.abs(mouse.w);
        });

        canvas.addEventListener("mousemove", (e) => {
            if (isMouseDown) {
                const rect = canvas.getBoundingClientRect();
                mouse.x = e.clientX - rect.left;
                mouse.y = rect.height - (e.clientY - rect.top);
            }
        });

        function resizeToDisplaySize() {
            const rect = canvas.getBoundingClientRect();
            const w = Math.max(1, Math.round(rect.width * renderScale));
            const h = Math.max(1, Math.round(rect.height * renderScale));
            if (canvas.width !== w || canvas.height !== h) {
                renderer.setSize(w, h, false);
            }
        }

        window.addEventListener("resize", () => { resizeToDisplaySize(); });

        resizeToDisplaySize();

        let fpsFrames = 0, fpsDisplay = 60, lastFpsUpdate = performance.now();

        // Lot 3 : résout à nouveau les 4 textures d'iChannel d'une passe au
        // moment de la RENDRE (pas seulement à la compilation) : le
        // ping-pong swap une texture "read" différente chaque frame, donc
        // un branchement "pass" (self-feedback ou vers un autre Buffer)
        // doit toujours pointer sur le résultat le plus récent, pas sur la
        // texture capturée au moment du dernier compileAllPasses().
        // Lot 6 : délègue à resolveChannelBinding (shader-compiler.js) — même
        // résolution qu'à la compilation, pour que le type de texture liée
        // (2D/cube/3D) reste celui du sampler déclaré. Met aussi à jour
        // iChannelResolution avec la vraie taille de la source (Lot 3).
        function refreshPassChannelUniforms(pass, uniforms) {
            for (let i = 0; i < 4; i++) {
                const b = resolveChannelBinding(pass.inputs[i], i, pass.id);
                uniforms["iChannel" + i].value = b.texture;
                uniforms.iChannelResolution.value[i].set(b.width, b.height, b.depth);
            }
        }

        // Lot 3 : exécute le render graph pour la frame courante — une
        // passe à la fois, dans l'ordre calculé par buildRenderGraph
        // (dépendances "pass" avant leurs dépendantes ; le self-feedback
        // n'impose aucun ordre, cf. render-graph.js). Pour chaque passe
        // renderable :
        //   1. rafraîchit ses uniforms de temps/souris/date (globaux,
        //      partagés par toutes les passes, comme sur shadertoy.com) et
        //      ses iChannel (résolution dynamique du ping-pong) ;
        //   2. l'assigne au quadMesh partagé ;
        //   3. la rend vers sa cible : l'écran pour "image", son render
        //      target d'écriture pour un Buffer ;
        //   4. swap immédiatement le ping-pong du Buffer qu'on vient
        //      d'écrire, pour que la PROCHAINE passe du graphe qui le lit
        //      cette même frame (ex. Image lit Buffer A juste après l'avoir
        //      rendu) voie déjà le résultat frais plutôt que celui d'il y a
        //      deux frames.
        // Cubemap A est rendue par cubemap-pass.js (Lot 6). Sound (Lot 7)
        // n'est PAS rendue ici : c'est un rendu offline bloc par bloc,
        // piloté par sound-pass.js à chaque compilation — pas par frame.
        function runRenderGraph(delta, fpsDisplay, stepStateful) {
            const graph = window.currentRenderGraph;
            if (!graph || !quadMesh) return;

            // Lot 5 : vidéos/musique de la bibliothèque (textures dynamiques)
            if (typeof updateDynamicAssets === "function") updateDynamicAssets(currentTime);
            // Lot 9 : état du clavier → texture 256×3, une seule fois par
            // frame pour que toutes les passes voient le même état.
            if (typeof updateKeyboardTexture === "function") updateKeyboardTexture();

            const dt = new Date();
            const secondsOfDay = dt.getHours() * 3600 + dt.getMinutes() * 60 + dt.getSeconds() + dt.getMilliseconds() / 1000;

            graph.order.forEach((pass) => {
                if (pass.id === "sound") return; // rendu offline : cf. sound-pass.js
                // Buffers / Cubemap A figés quand la timeline est en pause
                // (cf. buffer-manager.js) ; Image continue (souris, sliders).
                if (pass.target && !stepStateful) return;

                const runtime = getPassRuntime(pass.id);
                if (!runtime || !runtime.material) return;

                const uniforms = runtime.uniforms;
                // Lot 6 : Cubemap A écrit dans sa propre cible 6 faces
                // (cubemap-pass.js), pas dans une paire ping-pong 2D.
                const isCube = pass.id === "cubemapA";
                const target = (pass.target && !isCube) ? getBufferWriteTarget(pass.id) : null;
                // Un Buffer dont le render target n'a pas encore été alloué
                // (ex. activé dans le même compileAllPasses qui a échoué
                // avant d'atteindre ensureBufferTarget) est sauté cette
                // frame plutôt que de planter sur un renderTarget manquant ;
                // il sera prêt à la frame suivante.
                if (pass.target && !isCube && !target) return;
                if (isCube && !getCubemapSize()) return;

                const w = isCube ? getCubemapSize() : (target ? target.width : canvas.width);
                const h = isCube ? getCubemapSize() : (target ? target.height : canvas.height);

                uniforms.iResolution.value.set(w, h, 1.0);
                uniforms.iTime.value = currentTime;
                uniforms.iTimeDelta.value = delta;
                uniforms.iFrameRate.value = fpsDisplay;
                uniforms.iFrame.value = frameCount;
                // Lot 9 : une piste Music expose son propre temps de lecture
                uniforms.iChannelTime.value = pass.inputs.map((inp) =>
                    typeof getChannelTime === "function" ? getChannelTime(inp, currentTime) : currentTime);
                uniforms.iMouse.value.set(mouse.x, mouse.y, mouse.z, mouse.w);
                uniforms.iDate.value.set(dt.getFullYear(), dt.getMonth(), dt.getDate(), secondsOfDay);
                refreshPassChannelUniforms(pass, uniforms);

                const params = getActivePass() && getActivePass().id === pass.id ? currentParameters : runtime.params;
                params.forEach((p) => {
                    if (uniforms[p.uniformName]) uniforms[p.uniformName].value = p.value;
                });

                quadMesh.material = runtime.material;
                if (isCube) {
                    renderCubemapFaces(uniforms, renderer, scene, camera);
                } else {
                    renderer.setRenderTarget(target);
                    renderer.render(scene, camera);
                    if (pass.target) swapBufferTarget(pass.id);
                }

                if (pass.id === "image") {
                    // Uniforms de la passe réellement affichée : lus par
                    // l'export vidéo (video-export.js) et par l'Inspector
                    // quand l'onglet actif est "image".
                    shaderUniforms = uniforms;
                    currentMaterial = runtime.material;
                }
            });

            renderer.setRenderTarget(null);
        }

        function renderLoop() {
            if (!renderer) return;
            resizeToDisplaySize();

            const now = performance.now();
            const delta = (now - lastTime) / 1000;
            lastTime = now;

            fpsFrames++;
            if (now - lastFpsUpdate > 400) {
                fpsDisplay = Math.round((fpsFrames * 1000) / (now - lastFpsUpdate));
                fpsFrames = 0;
                lastFpsUpdate = now;
            }

            // Les Buffer A-D actifs suivent la résolution du canvas
            // (comportement par défaut, cf. buffer-manager.js) : les
            // redimensionner ici, hors de compileAllPasses(), permet à un
            // changement de renderScale/taille de fenêtre de se répercuter
            // sans recompiler tous les shaders à chaque frame.
            getPasses().forEach((pass) => {
                if (pass.target && pass.id !== "cubemapA" && pass.id !== "sound") {
                    ensureBufferTarget(pass.id, canvas.width, canvas.height);
                }
            });

            const exporting = typeof exportRunning !== "undefined" && exportRunning;
            const stepStateful = isPlaying || exporting || bufferStepRequests > 0;
            if (!isPlaying && !exporting && bufferStepRequests > 0) bufferStepRequests = 0;
            runRenderGraph(delta, fpsDisplay, stepStateful);

            // Le temps avance APRÈS le rendu : la 1re frame (et la 1re après
            // Reset) voit iTime = 0 et iFrame = 0, comme sur shadertoy.com —
            // indispensable au motif `if (iFrame == 0)` des buffers.
            if (isPlaying) {
                currentTime += delta;
                frameCount++;
            }

            // Lot 7 : recale le son sur iTime s'il a dérivé (horloge audio
            // ≠ horloge de rendu, onglet en arrière-plan, etc.)
            if (typeof correctSoundDrift === "function") correctSoundDrift();

            document.getElementById("fpsVal").innerText = fpsDisplay;
            document.getElementById("timeVal").innerText = currentTime.toFixed(2) + "s";
            document.getElementById("resVal").innerText = canvas.width + "×" + canvas.height;
            document.getElementById("uRes").innerText = `${canvas.width}, ${canvas.height}, 1`;
            document.getElementById("uMouse").innerText = `${Math.round(mouse.x)}, ${Math.round(mouse.y)}, ${Math.round(mouse.z)}, ${Math.round(mouse.w)}`;
            document.getElementById("uFrame").innerText = frameCount;

            window.requestAnimationFrame(renderLoop);
        }

        window.requestAnimationFrame(renderLoop);

        compileShader();
    }

    mountViewport();
