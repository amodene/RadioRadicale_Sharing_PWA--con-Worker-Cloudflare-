// IMPORTANTE: Sostituire con l'endpoint URL assegnato da Cloudflare al tuo Worker
const API_BASE_URL = "https://radioradicale-api.modenese-a.workers.dev/";

// Elementi DOM Principali
const datePicker = document.getElementById("date-picker");
const btnPrev = document.getElementById("btn-prev");
const btnNext = document.getElementById("btn-next");
const btnToday = document.getElementById("btn-today");
const scheduleList = document.getElementById("schedule-list");
const statusContainer = document.getElementById("status-container");
const statusMessage = document.getElementById("status-message");
const toast = document.getElementById("toast");

// Elementi Modal Share Composer
const shareModalOverlay = document.getElementById("share-modal-overlay");
const btnModalClose = document.getElementById("btn-modal-close");
const shareNoteInput = document.getElementById("share-note");
const sharePreview = document.getElementById("share-preview");
const btnModalShare = document.getElementById("btn-modal-share");
const btnModalCopy = document.getElementById("btn-modal-copy");
const btnModalMail = document.getElementById("btn-modal-mail");

let activeShareItem = null;

// Calcolo data locale per evitare il bug UTC (off-by-one a mezzanotte)
function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

let currentDate = getLocalDateString();
datePicker.value = currentDate;

async function fetchSchedule(date) {
  setLoading(true);
  scheduleList.innerHTML = "";

  try {
    const res = await fetch(`${API_BASE_URL}?date=${encodeURIComponent(date)}`);
    if (!res.ok) {
      throw new Error(`Errore Server: HTTP ${res.status}`);
    }

    const data = await res.json();
    renderSchedule(data.items);
  } catch (err) {
    showStatus(`Impossibile caricare il palinsesto: ${err.message}`, true);
  } finally {
    setLoading(false);
  }
}

function renderSchedule(items) {
  if (!items || items.length === 0) {
    showStatus("Nessuna trasmissione trovata per questa data.");
    return;
  }

  statusContainer.hidden = true;
  scheduleList.innerHTML = "";

  items.forEach((item) => {
    const li = document.createElement("li");
    const isPlayable = Boolean(item.id);
    li.className = `schedule-item ${isPlayable ? "" : "disabled"}`;

    const itemHeader = document.createElement("div");
    itemHeader.className = "item-header";

    const timeBadge = document.createElement("span");
    timeBadge.className = "time-badge";
    timeBadge.textContent = item.time;
    itemHeader.appendChild(timeBadge);

    if (!isPlayable) {
      const tagDisabled = document.createElement("span");
      tagDisabled.className = "tag-disabled";
      tagDisabled.textContent = "Solo palinsesto (non riascoltabile)";
      itemHeader.appendChild(tagDisabled);
    }

    const titleEl = document.createElement("div");
    titleEl.className = "item-title";
    titleEl.textContent = item.title;

    li.appendChild(itemHeader);
    li.appendChild(titleEl);

    if (isPlayable) {
      const actions = document.createElement("div");
      actions.className = "item-actions";

      // 1. Apertura diretta in una nuova scheda nel browser mobile
      const btnListen = document.createElement("a");
      btnListen.className = "btn-action";
      btnListen.href = item.shareUrl;
      btnListen.target = "_blank";
      btnListen.rel = "noopener noreferrer";
      btnListen.textContent = "Ascolta";

      // 2. Apertura del Share Composer modale
      const btnShare = document.createElement("button");
      btnShare.className = "btn-action";
      btnShare.type = "button";
      btnShare.textContent = "Condividi...";
      btnShare.addEventListener("click", () => openShareComposer(item));

      actions.appendChild(btnListen);
      actions.appendChild(btnShare);
      li.appendChild(actions);
    }

    scheduleList.appendChild(li);
  });
}

function openShareComposer(item) {
  activeShareItem = item;
  shareNoteInput.value = "";
  updateSharePreview();
  shareModalOverlay.hidden = false;
  shareNoteInput.focus();
}

function closeShareComposer() {
  shareModalOverlay.hidden = true;
  activeShareItem = null;
}

function buildShareMessage(item, note) {
  const parts = [
    `📻 Radio Radicale: ${item.title}`,
    `🕒 Palinsesto: ore ${item.time}`,
  ];

  if (note && note.trim().length > 0) {
    parts.push(`⏱️ Nota: ${note.trim()}`);
  }

  parts.push(`🔗 Riascolta: ${item.shareUrl}`);
  return parts.join("\n");
}

function updateSharePreview() {
  if (!activeShareItem) return;
  const message = buildShareMessage(activeShareItem, shareNoteInput.value);
  sharePreview.textContent = message;

  const subject = encodeURIComponent(
    `Radio Radicale: ${activeShareItem.title}`,
  );
  const body = encodeURIComponent(message);
  btnModalMail.href = `mailto:?subject=${subject}&body=${body}`;
}

shareNoteInput.addEventListener("input", updateSharePreview);
btnModalClose.addEventListener("click", closeShareComposer);
shareModalOverlay.addEventListener("click", (e) => {
  if (e.target === shareModalOverlay) closeShareComposer();
});

btnModalShare.addEventListener("click", async () => {
  if (!activeShareItem) return;
  const fullText = buildShareMessage(activeShareItem, shareNoteInput.value);

  if (navigator.share) {
    try {
      await navigator.share({
        title: activeShareItem.title,
        text: fullText,
      });
      closeShareComposer();
    } catch (err) {
      if (err.name !== "AbortError") {
        copyToClipboard(fullText);
      }
    }
  } else {
    copyToClipboard(fullText);
  }
});

btnModalCopy.addEventListener("click", () => {
  if (!activeShareItem) return;
  const fullText = buildShareMessage(activeShareItem, shareNoteInput.value);
  copyToClipboard(fullText);
  closeShareComposer();
});

function copyToClipboard(text) {
  navigator.clipboard
    .writeText(text)
    .then(() => {
      showToast("Messaggio copiato negli appunti!");
    })
    .catch(() => {
      showToast("Errore nella copia del testo.");
    });
}

function showToast(msg) {
  toast.textContent = msg;
  toast.hidden = false;
  setTimeout(() => {
    toast.hidden = true;
  }, 2500);
}

function setLoading(isLoading) {
  statusContainer.hidden = !isLoading;
  document.getElementById("spinner").hidden = !isLoading;
  if (isLoading) {
    statusMessage.textContent = "Download palinsesto...";
  }
}

function showStatus(msg, isError = false) {
  statusContainer.hidden = false;
  document.getElementById("spinner").hidden = true;
  statusMessage.textContent = msg;
  statusMessage.style.color = isError ? "#f44336" : "var(--text-muted)";
}

function shiftDate(days) {
  const [y, m, d] = currentDate.split("-").map(Number);
  const current = new Date(y, m - 1, d);
  current.setDate(current.getDate() + days);
  currentDate = getLocalDateString(current);
  datePicker.value = currentDate;
  fetchSchedule(currentDate);
}

datePicker.addEventListener("change", (e) => {
  if (e.target.value) {
    currentDate = e.target.value;
    fetchSchedule(currentDate);
  }
});

btnPrev.addEventListener("click", () => shiftDate(-1));
btnNext.addEventListener("click", () => shiftDate(1));
btnToday.addEventListener("click", () => {
  currentDate = getLocalDateString();
  datePicker.value = currentDate;
  fetchSchedule(currentDate);
});

// Registrazione del Service Worker isolato a livello di cartella
if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      // Registrazione con percorso relativo: Scope confinato automaticamente a /radio-radicale/
      const registration = await navigator.serviceWorker.register("./sw.js");

      // Silent update trigger quando l'utente torna sull'app dallo sblocco schermo
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
          registration.update();
        }
      });
    } catch (err) {
      console.warn("Registrazione Service Worker non riuscita:", err);
    }
  });
}

fetchSchedule(currentDate);
