    // =========================================================
    // Inline viewport: lives in the main document, docked below
    // the inspector panel (no separate popup window).
    // =========================================================
    function mountViewport() {
        const d = document;

        canvas = d.getElementById("renderCanvas");
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

        d.getElementById("playPauseBtn").addEventListener("click", () => {
            isPlaying = !isPlaying;
            const icon = d.getElementById("playIconSvg");
            icon.innerHTML = isPlaying
                ? '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>'
                : '<path d="M7 4L20 12L7 20Z"/>';
        });

        d.getElementById("resetTimeBtn").addEventListener("click", () => {
            currentTime = 0;
            frameCount = 0;
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

        function renderLoop() {
            if (!renderer) return;
            resizeToDisplaySize();

            const now = performance.now();
            const delta = (now - lastTime) / 1000;
            lastTime = now;

            if (isPlaying) {
                currentTime += delta;
                frameCount++;
            }

            fpsFrames++;
            if (now - lastFpsUpdate > 400) {
                fpsDisplay = Math.round((fpsFrames * 1000) / (now - lastFpsUpdate));
                fpsFrames = 0;
                lastFpsUpdate = now;
            }

            if (shaderUniforms) {
                const dt = new Date();
                const secondsOfDay = dt.getHours() * 3600 + dt.getMinutes() * 60 + dt.getSeconds() + dt.getMilliseconds() / 1000;

                shaderUniforms.iResolution.value.set(canvas.width, canvas.height, 1.0);
                shaderUniforms.iTime.value = currentTime;
                shaderUniforms.iTimeDelta.value = delta;
                shaderUniforms.iFrameRate.value = fpsDisplay;
                shaderUniforms.iFrame.value = frameCount;
                shaderUniforms.iChannelTime.value = [currentTime, currentTime, currentTime, currentTime];
                shaderUniforms.iMouse.value.set(mouse.x, mouse.y, mouse.z, mouse.w);
                shaderUniforms.iDate.value.set(dt.getFullYear(), dt.getMonth(), dt.getDate(), secondsOfDay);
                for (let i = 0; i < 4; i++) {
                    shaderUniforms["iChannel" + i].value = channelTextures[i];
                }
                currentParameters.forEach((p) => {
                    if (shaderUniforms[p.name]) shaderUniforms[p.name].value = p.value;
                });
            }

            document.getElementById("fpsVal").innerText = fpsDisplay;
            document.getElementById("timeVal").innerText = currentTime.toFixed(2) + "s";
            document.getElementById("resVal").innerText = canvas.width + "×" + canvas.height;
            document.getElementById("uRes").innerText = `${canvas.width}, ${canvas.height}, 1`;
            document.getElementById("uMouse").innerText = `${Math.round(mouse.x)}, ${Math.round(mouse.y)}, ${Math.round(mouse.z)}, ${Math.round(mouse.w)}`;
            document.getElementById("uFrame").innerText = frameCount;

            if (quadMesh) renderer.render(scene, camera);

            window.requestAnimationFrame(renderLoop);
        }

        window.requestAnimationFrame(renderLoop);

        compileShader();
    }

    mountViewport();
