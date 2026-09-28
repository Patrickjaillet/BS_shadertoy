    // =========================================================
    // Lot 4 — Génération de la grille de vignettes + pagination de la
    // modale iChannel, à partir de getCurrentTabItems() (channel-picker.js).
    // Séparé de channel-picker.js pour garder la logique d'état
    // (onglet/page ouverts, sélection) distincte du pur rendu DOM, même
    // découpage que pass-registry.js (état) / editor-tabs.js (rendu) au
    // Lot 2.
    //
    // 3 colonnes, vignette au ratio 3:2, nom en gras + auteur en dessous +
    // une ligne de métadonnées, pagination à 9 items/page dès qu'un onglet
    // en dépasse 9 — mêmes règles que les captures shadertoy.com décrites
    // dans la roadmap. Style adapté à la palette sombre/laiton du reste du
    // site plutôt qu'un fond gris clair pixel-perfect : revue fidèle au
    // style exact prévue au Lot 9 une fois les vraies captures comparées
    // dans cet environnement.
    // =========================================================

    function renderChannelPickerGrid() {
        const grid = document.getElementById("channelPickerGrid");
        const pagination = document.getElementById("channelPickerPagination");
        if (!grid || !pagination) return;

        const items = getCurrentTabItems();
        grid.innerHTML = "";

        if (items.length === 0) {
            grid.innerHTML = `<div class="cp-empty">
                <span>Aucun élément dans cet onglet pour l'instant.</span>
                ${channelPickerEmptyHint()}
            </div>`;
            pagination.innerHTML = "";
            return;
        }

        const totalPages = Math.max(1, Math.ceil(items.length / CHANNEL_PICKER_PAGE_SIZE));
        const page = Math.min(pickerState.page, totalPages - 1);
        const start = page * CHANNEL_PICKER_PAGE_SIZE;
        const pageItems = items.slice(start, start + CHANNEL_PICKER_PAGE_SIZE);

        pageItems.forEach((item) => grid.appendChild(buildChannelPickerCard(item)));
        renderChannelPickerPagination(totalPages, page);
    }

    // Message d'état vide propre à l'onglet (aucun onglet n'est censé être
    // vide depuis le Lot 5 ; Music dépend des fichiers de assets/music/).
    function channelPickerEmptyHint() {
        if (pickerState.tab === "music") {
            return '<span class="cp-empty-sub">Aucune piste déclarée — voir MUSIC_ASSETS dans js/assets/asset-library.js et les fichiers de assets/music/.</span>';
        }
        return "";
    }

    function buildChannelPickerCard(item) {
        const card = document.createElement("div");
        card.className = "cp-card";

        const thumb = document.createElement("div");
        thumb.className = "cp-card-thumb";
        thumb.innerHTML = channelPickerThumbGlyph(item);
        card.appendChild(thumb);

        const name = document.createElement("div");
        name.className = "cp-card-name";
        name.textContent = item.label || item.assetId || "Untitled";
        card.appendChild(name);

        if (item.author) {
            const author = document.createElement("div");
            author.className = "cp-card-author";
            author.textContent = "by " + item.author;
            card.appendChild(author);
        }

        if (item.meta) {
            const meta = document.createElement("div");
            meta.className = "cp-card-meta";
            meta.textContent = item.meta;
            card.appendChild(meta);
        }

        card.addEventListener("click", () => selectChannelPickerItem(item));
        return card;
    }

    // Vignette 3:2 : pas de rendu de texture réel dans ce lot (les Buffers
    // n'ont pas de snapshot exporté en image, les assets réels arrivent au
    // Lot 5) — un glyphe + une teinte par type/catégorie suffit à
    // distinguer les entrées d'un coup d'œil, comme les icônes de
    // catégorie sur shadertoy.com avant chargement des vraies vignettes.
    function channelPickerThumbGlyph(item) {
        if (item.type === "pass") {
            const letter = item.id === "cubemapA" ? "CB" : item.label.replace("Buffer ", "");
            return `<span class="cp-thumb-glyph cp-thumb-pass">${letter}</span>`;
        }
        if (item.type === "special") {
            const glyphs = { keyboard: "⌨" };
            return `<span class="cp-thumb-glyph cp-thumb-special">${glyphs[item.kind] || "?"}</span>`;
        }
        if (item.thumbnailPath) {
            return `<img class="cp-thumb-img" src="${item.thumbnailPath}" alt="${item.label || ""}">`;
        }
        return `<span class="cp-thumb-glyph cp-thumb-asset">${(item.label || "?").charAt(0)}</span>`;
    }

    function renderChannelPickerPagination(totalPages, page) {
        const pagination = document.getElementById("channelPickerPagination");
        if (!pagination) return;
        pagination.innerHTML = "";
        if (totalPages <= 1) return;

        const prev = document.createElement("button");
        prev.className = "cp-page-btn";
        prev.textContent = "‹";
        prev.disabled = page === 0;
        prev.addEventListener("click", () => setChannelPickerPage(page - 1));
        pagination.appendChild(prev);

        for (let i = 0; i < totalPages; i++) {
            const dot = document.createElement("button");
            dot.className = "cp-page-btn cp-page-num" + (i === page ? " active" : "");
            dot.textContent = String(i + 1);
            dot.addEventListener("click", () => setChannelPickerPage(i));
            pagination.appendChild(dot);
        }

        const next = document.createElement("button");
        next.className = "cp-page-btn";
        next.textContent = "›";
        next.disabled = page === totalPages - 1;
        next.addEventListener("click", () => setChannelPickerPage(page + 1));
        pagination.appendChild(next);
    }
