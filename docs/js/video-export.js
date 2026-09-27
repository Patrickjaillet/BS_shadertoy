    // =========================================================
    // Frame-by-frame video export (WebM / MP4)
    // =========================================================
    let exportFps = 30;
    let exportDuration = 5;
    let exportQuality = 0.9;
    let exportFormat = "webm";
    let exportCancelled = false;
    let exportRunning = false;

    const exportModal = document.getElementById("exportModal");
    let exportBtn; // assigned in mountViewport(), once the viewport DOM exists
    const exportCloseBtn = document.getElementById("exportCloseBtn");
    const exportStartBtn = document.getElementById("exportStartBtn");
    const exportStartLabel = document.getElementById("exportStartLabel");
    const exportCancelBtn = document.getElementById("exportCancelBtn");
    const exportProgressWrap = document.getElementById("exportProgressWrap");
    const exportProgressFill = document.getElementById("exportProgressFill");
    const exportProgressLabel = document.getElementById("exportProgressLabel");
    const exportProgressPct = document.getElementById("exportProgressPct");
    const exportFormatDesc = document.getElementById("exportFormatDesc");
    const mp4Note = document.getElementById("mp4Note");
    const durationSlider = document.getElementById("durationSlider");

    function openExportModal() {
        if (exportRunning) return;
        exportModal.classList.add("show");
    }
    function closeExportModal() {
        if (exportRunning) return;
        exportModal.classList.remove("show");
    }


    exportCloseBtn.addEventListener("click", closeExportModal);
    exportModal.addEventListener("click", (e) => {
        if (e.target === exportModal) closeExportModal();
    });

    document.getElementById("formatSeg").querySelectorAll(".seg-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            document.getElementById("formatSeg").querySelectorAll(".seg-btn").forEach(b => b.classList.remove("active"));
            e.currentTarget.classList.add("active");
            exportFormat = e.currentTarget.getAttribute("data-format");
            exportFormatDesc.innerText = "." + exportFormat;
            exportStartLabel.innerText = "Render " + exportFormat.toUpperCase();
            mp4Note.style.display = exportFormat === "mp4" ? "block" : "none";
        });
    });

    document.getElementById("fpsSeg").querySelectorAll(".seg-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            document.getElementById("fpsSeg").querySelectorAll(".seg-btn").forEach(b => b.classList.remove("active"));
            e.currentTarget.classList.add("active");
            exportFps = parseInt(e.currentTarget.getAttribute("data-fps"));
        });
    });

    document.getElementById("qualitySeg").querySelectorAll(".seg-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            document.getElementById("qualitySeg").querySelectorAll(".seg-btn").forEach(b => b.classList.remove("active"));
            e.currentTarget.classList.add("active");
            exportQuality = parseFloat(e.currentTarget.getAttribute("data-q"));
        });
    });

    attachSliderEvents(durationSlider, (val) => {
        exportDuration = Math.round(val * 10) / 10;
        document.getElementById("exportDurationVal").innerText = exportDuration.toFixed(1) + " s";
    });

    function pickMimeType(format) {
        const webmCandidates = [
            "video/webm;codecs=vp9",
            "video/webm;codecs=vp8",
            "video/webm"
        ];
        const mp4Candidates = [
            "video/mp4;codecs=avc1.42E01E",
            "video/mp4;codecs=h264",
            "video/mp4"
        ];
        const candidates = format === "mp4" ? mp4Candidates : webmCandidates;
        for (const type of candidates) {
            if (window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(type)) {
                return type;
            }
        }
        return null; // no supported mime for this format
    }

    async function renderVideoExport() {
        if (exportRunning) return;
        if (!window.MediaRecorder || !canvas.captureStream) {
            showToast("Video export is not supported in this browser");
            return;
        }

        const format = exportFormat;
        const mimeType = pickMimeType(format);

        if (!mimeType) {
            if (format === "mp4") {
                showToast("This browser can't encode MP4 directly — try WebM instead");
            } else {
                showToast("WebM export is not supported in this browser");
            }
            return;
        }

        exportRunning = true;
        exportCancelled = false;

        const totalFrames = Math.max(1, Math.round(exportDuration * exportFps));
        const frameIntervalMs = 1000 / exportFps;

        exportStartBtn.style.display = "none";
        exportCancelBtn.style.display = "flex";
        exportProgressWrap.classList.add("show");
        exportProgressFill.setAttribute("width", "0");
        exportProgressPct.innerText = "0%";
        exportProgressLabel.innerText = `Encoding frame 0 / ${totalFrames}`;

        // Remember playback state; export drives time manually for a deterministic result
        const wasPlaying = isPlaying;
        const savedTime = currentTime;
        const savedFrameCount = frameCount;
        isPlaying = false;

        const stream = canvas.captureStream(0); // manual frame pushes
        const track = stream.getVideoTracks()[0];

        const bitsPerSecond = Math.round(2_000_000 + exportQuality * 14_000_000);
        let recorder;
        try {
            recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: bitsPerSecond });
        } catch (err) {
            exportRunning = false;
            exportStartBtn.style.display = "flex";
            exportCancelBtn.style.display = "none";
            exportProgressWrap.classList.remove("show");
            showToast(format.toUpperCase() + " encoder unavailable in this browser");
            return;
        }

        const chunks = [];
        recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };

        const recordingStopped = new Promise((resolve) => {
            recorder.onstop = resolve;
        });

        recorder.start();

        currentTime = 0;
        frameCount = 0;

        for (let i = 0; i < totalFrames; i++) {
            if (exportCancelled) break;

            currentTime = i / exportFps;
            frameCount = i;

            // render exactly one frame synchronously
            if (shaderUniforms) {
                const d = new Date();
                const secondsOfDay = d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds() + d.getMilliseconds() / 1000;
                shaderUniforms.iResolution.value.set(canvas.width, canvas.height, 1.0);
                shaderUniforms.iTime.value = currentTime;
                shaderUniforms.iTimeDelta.value = 1 / exportFps;
                shaderUniforms.iFrame.value = frameCount;
                shaderUniforms.iChannelTime.value = [currentTime, currentTime, currentTime, currentTime];
                shaderUniforms.iDate.value.set(d.getFullYear(), d.getMonth(), d.getDate(), secondsOfDay);
                currentParameters.forEach((p) => {
                    if (shaderUniforms[p.name]) shaderUniforms[p.name].value = p.value;
                });
            }
            if (quadMesh) renderer.render(scene, camera);

            // push this rendered frame into the capture stream
            if (track.requestFrame) {
                track.requestFrame();
            }

            const pct = Math.round(((i + 1) / totalFrames) * 100);
            exportProgressFill.setAttribute("width", (pct / 100 * 400).toFixed(1));
            exportProgressPct.innerText = pct + "%";
            exportProgressLabel.innerText = `Encoding frame ${i + 1} / ${totalFrames}`;

            // yield to the browser so the recorder can actually capture the frame
            await new Promise(r => setTimeout(r, Math.max(1, frameIntervalMs * 0.15)));
        }

        recorder.stop();
        await recordingStopped;
        track.stop();

        isPlaying = wasPlaying;
        currentTime = savedTime;
        frameCount = savedFrameCount;

        exportStartBtn.style.display = "flex";
        exportCancelBtn.style.display = "none";
        exportProgressWrap.classList.remove("show");
        exportRunning = false;

        if (exportCancelled) {
            showToast("Export cancelled");
            return;
        }

        if (chunks.length === 0) {
            showToast("Export failed — no frames captured");
            return;
        }

        const blobType = format === "mp4" ? "video/mp4" : "video/webm";
        const extension = format === "mp4" ? "mp4" : "webm";
        const blob = new Blob(chunks, { type: blobType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "bs_shader_export." + extension;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 4000);

        exportModal.classList.remove("show");
        showToast(extension.toUpperCase() + " exported — " + totalFrames + " frames");
    }

    exportStartBtn.addEventListener("click", renderVideoExport);
    exportCancelBtn.addEventListener("click", () => { exportCancelled = true; });
