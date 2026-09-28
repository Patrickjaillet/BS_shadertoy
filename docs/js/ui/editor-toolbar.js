    document.getElementById("copyBtn").addEventListener("click", () => {
        const text = editor.getValue();
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text)
                .then(() => showToast("Code copied"))
                .catch(() => showToast("Clipboard access denied"));
        } else {
            const textarea = document.createElement("textarea");
            textarea.value = text;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand("copy");
            document.body.removeChild(textarea);
            showToast("Code copied");
        }
    });

    document.getElementById("pasteBtn").addEventListener("click", () => {
        navigator.clipboard.readText().then(text => {
            if (text) {
                editor.setValue(text);
                compileShader();
                showToast("Code pasted");
            }
        }).catch(() => {
            showToast("Clipboard access denied");
        });
    });

    editor.on("change", () => {
        if (!isProgrammaticChange && document.getElementById("autoCompileCheck").checked) {
            clearTimeout(window.autoCompileTimer);
            window.autoCompileTimer = setTimeout(() => {
                compileShader();
            }, 400);
        }
    });
