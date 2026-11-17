
const API_BASE = "https://api.ek.finnline.ipv64.net";

const $ = selector => document.querySelector(selector);

let categories = [];
let data = [];
let active = "";
let isAdmin = false;
let csrfToken = "";
let editingId = null;
let selectedPhotos = [];

async function api(path, options = {}) {
    const headers = new Headers(options.headers || {});

    if (options.body && !(options.body instanceof FormData)) {
        headers.set("Content-Type", "application/json");
    }

    if (csrfToken && options.method && options.method !== "GET") {
        headers.set("X-CSRF-Token", csrfToken);
    }

    const response = await fetch(API_BASE + path, {
        ...options,
        headers,
        credentials: "include"
    });

    if (!response.ok) {
        let message = "Serverfehler: " + response.status;

        try {
            const result = await response.json();
            message = result.detail || message;
        } catch (_) {}

        throw new Error(message);
    }

    if (response.status === 204) return null;

    return response.json();
}

function safe(value) {
    return String(value || "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}

function photoUrl(filename) {
    return API_BASE + "/api/photos/" + encodeURIComponent(filename);
}

function updateAdminView() {
    $("#loginButton").hidden = isAdmin;
    $("#logoutButton").hidden = !isAdmin;
    $("#add").hidden = !isAdmin;
    $("#export").hidden = !isAdmin;
    $("#first").hidden = !isAdmin;
}

async function loadCategories() {
    categories = await api("/api/categories");

    $("#tiles").replaceChildren();
    $("#catSelect").replaceChildren();

    categories.forEach(category => {
        const tile = document.createElement("a");
        tile.className = "tile";
        tile.href = "#" + encodeURIComponent(category.name);

        tile.innerHTML =
            '<span class="symbol">∿</span>' +
            '<span><strong>' + safe(category.name) +
            '</strong><small>' + safe(category.description) +
            '</small></span>';

        tile.addEventListener("click", event => {
            event.preventDefault();
            openCat(category.name);
        });

        $("#tiles").append(tile);
        $("#catSelect").add(new Option(category.name, category.id));
    });
}

async function loadItems() {
    data = await api("/api/items");
    render();
}

async function checkLogin() {
    try {
        const result = await api("/api/me");

        isAdmin = result.authenticated === true;
        csrfToken = result.csrf_token || "";
    } catch (error) {
        isAdmin = false;
        csrfToken = "";

        console.error(
            "Anmeldestatus konnte nicht geprüft werden:",
            error
        );
    }

    updateAdminView();
}

function openCat(name) {
    active = name;

    history.pushState(
        { cat: name },
        "",
        "#" + encodeURIComponent(name)
    );

    $("#landing").hidden = true;
    $("#category").hidden = false;
    $("#home").hidden = false;

    $("#catTitle").textContent = name + ".";

    const category = categories.find(item => item.name === name);
    $("#catDesc").textContent = category?.description || "";

    $("#search").value = "";

    render();
    scrollTo(0, 0);
}

function home() {
    active = "";

    history.pushState(
        { home: true },
        "",
        location.pathname
    );

    $("#landing").hidden = false;
    $("#category").hidden = true;
    $("#home").hidden = true;

    scrollTo(0, 0);
}

document.querySelectorAll("[data-home]").forEach(element => {
    element.onclick = event => {
        event.preventDefault();
        home();
    };
});

onpopstate = () => {
    const name = decodeURIComponent(location.hash.slice(1));

    if (categories.some(category => category.name === name)) {
        active = name;

        $("#landing").hidden = true;
        $("#category").hidden = false;
        $("#home").hidden = false;

        $("#catTitle").textContent = name + ".";

        $("#catDesc").textContent =
            categories.find(category => category.name === name)?.description || "";

        render();
    } else {
        active = "";

        $("#landing").hidden = false;
        $("#category").hidden = true;
        $("#home").hidden = true;
    }
};

// Geräteübersicht mit direkter Bildvorschau
function render() {
    const query = $("#search").value.toLocaleLowerCase("de");

    const items = data.filter(item => {
        const matchesCategory = item.category === active;

        const searchable = [
            item.title,
            item.manufacturer,
            item.model,
            item.year,
            item.description,
            item.origin,
            item.history
        ].join(" ").toLocaleLowerCase("de");

        return matchesCategory && searchable.includes(query);
    });

    $("#entries").replaceChildren();

    $("#empty").hidden = items.length > 0;
    $("#first").hidden = !isAdmin;

    items.forEach(item => {
        const element = document.createElement("article");
        element.className = "entry clickable-entry";

        const imageMarkup = item.first_photo
            ? '<img class="entry-preview" src="' +
              photoUrl(item.first_photo) +
              '" alt="' + safe(item.title) + '" loading="lazy">'
            : '<div class="no-photo">∿</div>';

        element.innerHTML =
            imageMarkup +
            '<p class="eyebrow">' +
            safe((item.category || "").toUpperCase()) +
            ' · ' + safe(item.year || "ZEITRAUM OFFEN") +
            '</p>' +
            '<h3>' + safe(item.title) + '</h3>' +
            (item.manufacturer
                ? '<p class="muted">' + safe(item.manufacturer) + '</p>'
                : '') +
            '<p class="muted">' +
            safe(item.description || "") +
            '</p>' +
            '<button type="button" class="detail-button">Details ansehen ↗</button>';

        const preview = element.querySelector(".entry-preview");

        if (preview) {
            preview.onerror = () => {
                const placeholder = document.createElement("div");
                placeholder.className = "no-photo";
                placeholder.textContent = "∿";
                preview.replaceWith(placeholder);
            };
        }

        element.querySelector("button").onclick = event => {
            event.stopPropagation();
            showDetail(item.id);
        };

        element.onclick = () => showDetail(item.id);

        $("#entries").append(element);
    });
}

// Detailansicht
async function showDetail(id) {
    try {
        const item = await api("/api/items/" + id);

        const photos = item.photos || [];

        $("#detailContent").innerHTML =
            '<p class="eyebrow">' +
            safe(item.category.toUpperCase()) +
            '</p>' +

            '<h2>' + safe(item.title) + '</h2>' +

            (item.manufacturer
                ? '<p class="detail-maker">' +
                  safe(item.manufacturer) +
                  '</p>'
                : '') +

            (item.model
                ? '<p class="muted">Modell: ' +
                  safe(item.model) +
                  '</p>'
                : '') +

            (photos.length
                ? '<div class="detail-photos">' +
                  photos.map(photo =>
                      '<img src="' +
                      photoUrl(photo.filename) +
                      '" alt="' + safe(item.title) + '">'
                  ).join("") +
                  '</div>'
                : '') +

            '<dl class="detail-meta">' +

            (item.year
                ? '<div><dt>Baujahr / Zeitraum</dt><dd>' +
                  safe(item.year) +
                  '</dd></div>'
                : '') +

            (item.origin
                ? '<div><dt>Herkunft</dt><dd>' +
                  safe(item.origin) +
                  '</dd></div>'
                : '') +

            '</dl>' +

            (item.description
                ? '<h3>Beschreibung</h3><p>' +
                  safe(item.description) +
                  '</p>'
                : '') +

            (item.history
                ? '<h3>Geschichte & Restaurierung</h3><p>' +
                  safe(item.history) +
                  '</p>'
                : '') +

            (isAdmin
                ? '<div class="admin-actions">' +
                  '<button type="button" id="editItem">Bearbeiten</button> ' +
                  '<button type="button" id="deleteItem">Löschen</button>' +
                  '</div>'
                : '');

        if (isAdmin) {
            $("#editItem").onclick = () => editItem(item);
            $("#deleteItem").onclick = () => deleteItem(item.id);
        }

        $("#detail").showModal();

    } catch (error) {
        alert("Gerät konnte nicht geladen werden: " + error.message);
    }
}

$("#detailClose").onclick = () => {
    $("#detail").close();
};

$("#search").oninput = render;

// Neues Gerät anlegen
function openEditor() {
    if (!isAdmin) {
        alert("Bitte zuerst als Administrator anmelden.");
        return;
    }

    if (!active) {
        alert("Bitte zuerst eine Kategorie öffnen.");
        return;
    }

    editingId = null;
    selectedPhotos = [];

    $("#form").reset();
    $("#previewList").replaceChildren();

    $("#catSelect").value =
        categories.find(category => category.name === active)?.id || "";

    $("#form").querySelector("h2").textContent = "Ein neues Stück.";

    $("#form").querySelector("button[type=submit]").textContent =
        "Im Kabinett speichern ↗";

    $("#editor").showModal();
}

$("#add").onclick = openEditor;
$("#first").onclick = openEditor;

$("#close").onclick = () => {
    $("#editor").close();
};

// Gerät bearbeiten
function editItem(item) {
    $("#detail").close();

    editingId = item.id;
    selectedPhotos = [];

    $("#form").reset();
    $("#previewList").replaceChildren();

    $("#title").value = item.title || "";
    $("#manufacturer").value = item.manufacturer || "";
    $("#model").value = item.model || "";
    $("#catSelect").value = item.category_id;
    $("#year").value = item.year || "";
    $("#origin").value = item.origin || "";
    $("#desc").value = item.description || "";
    $("#history").value = item.history || "";

    $("#form").querySelector("h2").textContent = "Stück bearbeiten.";

    $("#form").querySelector("button[type=submit]").textContent =
        "Änderungen speichern ↗";

    $("#editor").showModal();
}

// Gerät löschen
async function deleteItem(id) {
    if (!confirm("Möchtest du dieses Sammlungsstück wirklich löschen?")) {
        return;
    }

    try {
        await api("/api/items/" + id, {
            method: "DELETE"
        });

        $("#detail").close();

        await loadItems();

        alert("Das Sammlungsstück wurde gelöscht.");

    } catch (error) {
        alert("Löschen fehlgeschlagen: " + error.message);
    }
}

// Fotos auswählen und Vorschau anzeigen
$("#photo").onchange = event => {
    const files = [...event.target.files];

    if (files.length > 8) {
        alert("Bitte höchstens 8 Fotos auf einmal auswählen.");
        event.target.value = "";
        return;
    }

    for (const file of files) {
        if (file.size > 10 * 1024 * 1024) {
            alert("Jedes Foto darf maximal 10 MB groß sein.");
            event.target.value = "";
            return;
        }

        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
            alert("Bitte nur JPEG-, PNG- und WebP-Bilder verwenden.");
            event.target.value = "";
            return;
        }
    }

    selectedPhotos = files;

    $("#previewList").replaceChildren();

    for (const file of files) {
        const image = document.createElement("img");

        image.src = URL.createObjectURL(file);
        image.alt = "Foto-Vorschau";

        $("#previewList").append(image);
    }
};

// Gerät speichern oder bearbeiten
$("#form").onsubmit = async event => {
    event.preventDefault();

    if (!isAdmin) {
        alert("Keine Administrator-Anmeldung vorhanden.");
        return;
    }

    const item = {
        category_id: Number($("#catSelect").value),
        title: $("#title").value.trim(),
        manufacturer: $("#manufacturer").value.trim(),
        model: $("#model").value.trim(),
        year: $("#year").value.trim(),
        origin: $("#origin").value.trim(),
        description: $("#desc").value.trim(),
        history: $("#history").value.trim()
    };

    try {
        let result;

        if (editingId) {
            result = await api("/api/items/" + editingId, {
                method: "PUT",
                body: JSON.stringify(item)
            });
        } else {
            result = await api("/api/items", {
                method: "POST",
                body: JSON.stringify(item)
            });
        }

        const itemId = editingId || result.id;

        for (const file of selectedPhotos) {
            const formData = new FormData();

            formData.append("file", file);

            await api("/api/items/" + itemId + "/photos", {
                method: "POST",
                body: formData
            });
        }

        $("#editor").close();
        $("#form").reset();
        $("#previewList").replaceChildren();

        selectedPhotos = [];
        editingId = null;

        await loadItems();

        alert("Das Sammlungsstück wurde gespeichert.");

    } catch (error) {
        alert("Speichern fehlgeschlagen: " + error.message);
    }
};

// Administrator-Anmeldung
$("#loginButton").onclick = () => {
    $("#loginError").textContent = "";
    $("#loginForm").reset();

    $("#loginDialog").showModal();
};

$("#loginClose").onclick = () => {
    $("#loginDialog").close();
};

$("#loginForm").onsubmit = async event => {
    event.preventDefault();

    $("#loginError").textContent = "";

    try {
        const result = await api("/api/login", {
            method: "POST",
            body: JSON.stringify({
                username: $("#adminUser").value.trim(),
                password: $("#adminPassword").value
            })
        });

        isAdmin = result.authenticated === true;
        csrfToken = result.csrf_token || "";

        updateAdminView();

        $("#loginDialog").close();
        $("#loginForm").reset();

        alert("Anmeldung erfolgreich.");

    } catch (error) {
        $("#loginError").textContent =
            "Anmeldung fehlgeschlagen: " + error.message;
    }
};

// Administrator-Abmeldung
$("#logoutButton").onclick = async () => {
    try {
        await api("/api/logout", {
            method: "POST"
        });

    } catch (error) {
        console.error("Abmeldung:", error);
    }

    isAdmin = false;
    csrfToken = "";

    updateAdminView();
    render();

    alert("Du wurdest abgemeldet.");
};

// Sammlung sichern
$("#export").onclick = () => {
    if (!isAdmin) return;

    const backup = {
        format: "elektronik-kabinett-backup",
        version: 1,
        exportedAt: new Date().toISOString(),
        items: data
    };

    const blob = new Blob(
        [JSON.stringify(backup, null, 2)],
        { type: "application/json" }
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;

    link.download =
        "elektronik-kabinett-backup-" +
        new Date().toISOString().slice(0, 10) +
        ".json";

    document.body.append(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
};

// Programmstart
async function start() {
    updateAdminView();

    try {
        await loadCategories();
        await checkLogin();
        await loadItems();

        const name = decodeURIComponent(location.hash.slice(1));

        if (categories.some(category => category.name === name)) {
            openCat(name);
        }

    } catch (error) {
        console.error(error);

        $("#landing").innerHTML +=
            '<p class="muted">Die Verbindung zum Sammlungsserver ist derzeit nicht möglich. Bitte später erneut versuchen.</p>';
    }
}

start();
