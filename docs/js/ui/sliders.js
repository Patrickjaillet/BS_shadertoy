    // ---- custom SVG slider builder ----
    function buildSliderSVG(id, min, max, value) {
        const W = 260, H = 18, y = 9, x0 = 4, x1 = W - 4;
        const pct = Math.max(0, Math.min(1, (value - min) / (max - min || 1)));
        const cx = x0 + pct * (x1 - x0);
        return `
        <svg class="svg-slider" id="${id}" data-min="${min}" data-max="${max}" data-value="${value}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
            <line class="track" x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke-width="3" stroke-linecap="round"/>
            <line class="fill" x1="${x0}" y1="${y}" x2="${cx}" y2="${y}" stroke-width="3" stroke-linecap="round"/>
            <circle class="thumb-halo" cx="${cx}" cy="${y}" r="8" fill="#c9a15a"/>
            <circle class="thumb" cx="${cx}" cy="${y}" r="5.5" fill="#f0d28f" stroke="#4a3712" stroke-width="1.2"/>
        </svg>`;
    }

    function sliderSetValue(svg, value) {
        const min = parseFloat(svg.getAttribute("data-min"));
        const max = parseFloat(svg.getAttribute("data-max"));
        const W = 260, x0 = 4, x1 = W - 4, y = 9;
        let pct = (value - min) / ((max - min) || 1);
        pct = Math.max(0, Math.min(1, pct));
        const cx = x0 + pct * (x1 - x0);
        svg.setAttribute("data-value", value);
        svg.querySelector(".fill").setAttribute("x2", cx);
        svg.querySelector(".thumb").setAttribute("cx", cx);
        svg.querySelector(".thumb-halo").setAttribute("cx", cx);
    }

    function attachSliderEvents(svg, onChange, onCommit) {
        const W = 260, x0 = 4, x1 = W - 4;
        function posToValue(clientX) {
            const rect = svg.getBoundingClientRect();
            let pct = (clientX - rect.left) / rect.width;
            pct = Math.max(0, Math.min(1, pct));
            const min = parseFloat(svg.getAttribute("data-min"));
            const max = parseFloat(svg.getAttribute("data-max"));
            return min + pct * (max - min);
        }
        let dragging = false;
        let lastValue = null;
        function start(e) {
            dragging = true;
            svg.classList.add("dragging");
            move(e);
            window.addEventListener("pointermove", move);
            window.addEventListener("pointerup", end);
        }
        function move(e) {
            if (!dragging) return;
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const val = posToValue(clientX);
            lastValue = val;
            sliderSetValue(svg, val);
            onChange(val);
        }
        function end() {
            dragging = false;
            svg.classList.remove("dragging");
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", end);
            if (lastValue !== null && onCommit) onCommit(lastValue);
        }
        svg.addEventListener("pointerdown", start);
    }
