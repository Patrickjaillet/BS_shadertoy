    // =========================================================
    // Sélecteur d'input iChannel, façon "Select input for iChannelN"
    // de shadertoy.com : 4 carrés sous l'éditeur (un par iChannel de la
    // passe active), qui ouvrent une modale à 5 onglets
    // (Textures/Cubemaps/Volumes/Vidéos/Music) et une grille de vignettes
    // paginée. Ce fichier porte l'état de la modale + la logique de
    // sélection ; la grille/pagination vit dans channel-picker-render.js.
    //
    // Les 5 onglets sont la bibliothèque d'assets (asset-library.js), lue
    // via getAssetsByCategory(). L'onglet Misc (Buffers A-D, Cubemap A,
    // Keyboard, Soundcloud) a été RETIRÉ : voir ROADMAP.md, Lot 9.
    // =========================================================

    const CHANNEL_PICKER_TABS = ["textures", "cubemaps", "volumes", "videos", "music"];
    const CHANNEL_PICKER_TAB_LABELS = Object.freeze({
        textures: "Textures",
        cubemaps: "Cubemaps",
        volumes: "Volumes",
        videos: "Vidéos",
        music: "Music"
    });

    // Kinds "special" valides pour un projet chargé (project-io.js). Plus
    // aucun n'est proposé dans le picker depuis le retrait de l'onglet
    // Misc ; « keyboard » reste reconnu (et résolu en texture 256×3) pour
    // les projets/presets qui le référencent déjà. Soundcloud (aucune
    // source réelle) a été retiré : un input soundcloud ancien est
    // débranché avec un avertissement, comme Webcam et Microphone.
    const CHANNEL_PICKER_SPECIAL_INPUTS = [
        { kind: "keyboard", label: "Keyboard", meta: "256 × 3 · touches" }
    ];

    const CHANNEL_PICKER_PAGE_SIZE = 9;

    let pickerState = {
        open: false,
        passId: null,
        channelIndex: 0,
        tab: "textures",
        page: 0
    };

    function getCurrentTabItems() {
        // Lot 5 : hook optionnel vers la bibliothèque d'assets. Chaque
        // entrée attendue : { assetId, label, author, meta, thumbnailPath }.
        if (typeof getAssetsByCategory === "function") {
            return getAssetsByCategory(pickerState.tab).map((a) => ({ type: "asset", ...a }));
        }
        return [];
    }

    // -------------------------------------------------------------------
    // Ouvre la modale pour le canal `channelIndex` (0-3) de la passe
    // `passId`. Repart toujours sur l'onglet Textures / page 0 (comme
    // shadertoy.com, qui ne mémorise pas le dernier onglet visité entre
    // deux ouvertures).
    // -------------------------------------------------------------------
    function openChannelPicker(passId, channelIndex) {
        if (!getPass(passId)) return;
        pickerState = { open: true, passId, channelIndex, tab: "textures", page: 0 };
        const modal = document.getElementById("channelPickerModal");
        if (!modal) return;
        modal.classList.add("show");
        document.getElementById("channelPickerTitle").textContent = `Select input for iChannel${channelIndex}`;
        renderChannelPickerTabs();
        renderChannelPickerGrid();
    }

    function closeChannelPicker() {
        pickerState.open = false;
        const modal = document.getElementById("channelPickerModal");
        if (modal) modal.classList.remove("show");
    }

    function switchChannelPickerTab(tabId) {
        if (pickerState.tab === tabId) return;
        pickerState.tab = tabId;
        pickerState.page = 0;
        renderChannelPickerTabs();
        renderChannelPickerGrid();
    }

    function setChannelPickerPage(page) {
        pickerState.page = page;
        renderChannelPickerGrid();
    }

    // Sélection d'une vignette : branche l'input choisi sur le canal ouvert
    // et referme la modale. Déclenche une recompilation complète (comme
    // demandé pour ce lot) — un branchement d'iChannel change le graphe de
    // rendu (render-graph.js), pas seulement une valeur d'uniform.
    function selectChannelPickerItem(item) {
        if (!pickerState.open) return;
        let input = null;
        if (item.type === "pass") input = { type: "pass", id: item.id };
        else if (item.type === "special") input = { type: "special", kind: item.kind };
        else if (item.type === "asset") input = { type: "asset", assetId: item.assetId };
        else return;

        setPassInput(pickerState.passId, pickerState.channelIndex, input);
        closeChannelPicker();
        renderChannelSlots();
        if (typeof compileShader === "function") compileShader();
        showToast(`iChannel${pickerState.channelIndex} → ${item.label}`);
    }

    // Débranche un canal sans ouvrir la modale (croix au survol d'un slot
    // déjà assigné, comme le clic droit sur shadertoy.com).
    function clearChannelSlot(passId, channelIndex, evt) {
        if (evt) evt.stopPropagation();
        clearPassInput(passId, channelIndex);
        renderChannelSlots();
        if (typeof compileShader === "function") compileShader();
    }

    function renderChannelPickerTabs() {
        const bar = document.getElementById("channelPickerTabsBar");
        if (!bar) return;
        bar.innerHTML = "";
        CHANNEL_PICKER_TABS.forEach((tabId) => {
            const tab = document.createElement("div");
            tab.className = "cp-tab" + (tabId === pickerState.tab ? " active" : "");
            tab.textContent = CHANNEL_PICKER_TAB_LABELS[tabId];
            tab.addEventListener("click", () => switchChannelPickerTab(tabId));
            bar.appendChild(tab);
        });
    }

    // -------------------------------------------------------------------
    // Les 4 carrés iChannel0-3 sous l'éditeur, pour la passe ACTIVE de
    // l'éditeur (pas nécessairement "image" — chaque passe a ses propres
    // iChannel). Appelée au chargement, à chaque switch d'onglet et après
    // toute activation/désactivation de passe (cf. editor-tabs.js:
    // renderPassTabs, qui appelle cette fonction si elle existe), et après
    // chaque sélection/débranchement dans ce fichier.
    // -------------------------------------------------------------------
    function renderChannelSlots() {
        const bar = document.getElementById("iChannelSlotsBar");
        if (!bar) return;
        const pass = getActivePass();
        bar.innerHTML = "";
        // Lot 7 : comme sur shadertoy.com, Sound (évalué offline, sans
        // texture) et Common (simple bibliothèque de fonctions) n'ont pas
        // d'iChannel : on masque les 4 carrés plutôt que d'offrir des
        // branchements sans effet.
        bar.style.display = (pass && (pass.id === "sound" || pass.id === "common")) ? "none" : "";
        if (!pass || pass.id === "sound" || pass.id === "common") return;

        for (let i = 0; i < 4; i++) {
            const input = pass.inputs[i];
            const slot = document.createElement("div");
            slot.className = "ichannel-slot" + (input ? " bound" : "");
            slot.setAttribute("data-channel", i);

            const idx = document.createElement("span");
            idx.className = "ichannel-slot-idx";
            idx.textContent = "iChannel" + i;
            slot.appendChild(idx);

            const body = document.createElement("div");
            body.className = "ichannel-slot-body";
            body.innerHTML = describeChannelInput(input);
            slot.appendChild(body);

            if (input) {
                const clear = document.createElement("span");
                clear.className = "ichannel-slot-clear";
                clear.innerHTML = '<svg width="8" height="8" viewBox="0 0 24 24" fill="none"><path d="M6 6L18 18M18 6L6 18" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>';
                clear.addEventListener("click", (e) => clearChannelSlot(pass.id, i, e));
                slot.appendChild(clear);
            }

            slot.addEventListener("click", () => openChannelPicker(pass.id, i));
            bar.appendChild(slot);
        }
    }

    // Libellé court affiché dans un slot déjà branché — pas de nom d'asset
    // réel avant le Lot 5, donc un label générique par type d'input.
    function describeChannelInput(input) {
        if (!input) return '<span class="ichannel-slot-empty">+</span>';
        if (input.type === "pass") {
            const p = getPass(input.id);
            return `<span class="ichannel-slot-label">${p ? p.label : input.id}</span>`;
        }
        if (input.type === "special") {
            const special = CHANNEL_PICKER_SPECIAL_INPUTS.find((s) => s.kind === input.kind);
            return `<span class="ichannel-slot-label">${special ? special.label : input.kind}</span>`;
        }
        if (input.type === "asset") {
            return `<span class="ichannel-slot-label">${input.assetId}</span>`;
        }
        return '<span class="ichannel-slot-empty">+</span>';
    }

    document.getElementById("channelPickerCloseBtn").addEventListener("click", closeChannelPicker);
    document.getElementById("channelPickerModal").addEventListener("click", (e) => {
        // Ferme au clic sur l'overlay, pas sur la carte elle-même.
        if (e.target.id === "channelPickerModal") closeChannelPicker();
    });
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && pickerState.open) closeChannelPicker();
    });

    renderChannelSlots();
