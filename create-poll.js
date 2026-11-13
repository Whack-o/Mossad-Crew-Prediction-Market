(() => {
  "use strict";

  const CONFIG = window.PREDICTION_CONFIG || {};
  const SESSION_KEY = "prediction-league-username";
  const $ = (selector) => document.querySelector(selector);

  let users = [];
  let currentUser = null;
  let isSubmitting = false;

  const form = $("#create-poll-form");
  const optionsList = $("#poll-options-list");
  const addOptionButton = $("#add-option-button");
  const submitButton = $("#create-poll-submit");
  const message = $("#create-poll-message");

  function normalizeUsername(value) {
    return String(value || "").trim().toLowerCase();
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[character]);
  }

  function displayName(username) {
    const value = String(username || "");
    return value ? value.charAt(0).toUpperCase() + value.slice(1) : "Unknown";
  }

  function showMessage(text, type = "") {
    message.textContent = text;
    message.className = `create-message ${type}`.trim();
  }

  function configReady() {
    return Boolean(
      CONFIG.supabaseUrl &&
      CONFIG.supabaseKey &&
      !CONFIG.supabaseUrl.includes("YOUR-PROJECT-REF") &&
      !CONFIG.supabaseKey.includes("YOUR_SUPABASE")
    );
  }

  function supabaseHeaders(extra = {}) {
    return {
      apikey: CONFIG.supabaseKey,
      Authorization: `Bearer ${CONFIG.supabaseKey}`,
      ...extra
    };
  }

  async function loadUsers() {
    const response = await fetch(`./users.json?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Could not load users.json (${response.status}).`);
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error("users.json must contain a JSON array.");
    users = data.map((user) => ({ ...user, username: normalizeUsername(user.username) }));
    const seen = new Set();
    for (const user of users) {
      if (!user.username || !user.password || seen.has(user.username)) {
        throw new Error("Check users.json: every player needs a unique username and password.");
      }
      seen.add(user.username);
    }
  }

  function avatarMarkup(user) {
    const initial = escapeHtml(displayName(user.username).slice(0, 1).toUpperCase());
    const title = escapeHtml(displayName(user.username));
    if (!user.avatar) return `<span class="avatar" title="${title}">${initial}</span>`;
    return `<img class="avatar" src="${escapeHtml(user.avatar)}" alt="" title="${title}" data-avatar-initial="${initial}">`;
  }

  function bindAvatarFallbacks(root = document) {
    root.querySelectorAll("img[data-avatar-initial]").forEach((image) => {
      image.addEventListener("error", () => {
        const fallback = document.createElement("span");
        fallback.className = image.className;
        fallback.textContent = image.dataset.avatarInitial || "?";
        fallback.title = image.title || "Player";
        image.replaceWith(fallback);
      }, { once: true });
    });
  }

  function renderCurrentUser() {
    const area = $("#create-current-user");
    area.innerHTML = `${avatarMarkup(currentUser)}<span>Logged in as ${escapeHtml(displayName(currentUser.username))}</span>`;
    bindAvatarFallbacks(area);
  }

  function renderExcludedUsers() {
    const container = $("#excluded-users-list");
    container.innerHTML = users.map((user) => `<label class="excluded-user-choice">
      <input type="checkbox" name="excluded" value="${escapeHtml(user.username)}">
      ${avatarMarkup(user)}
      <span>${escapeHtml(displayName(user.username))}</span>
    </label>`).join("");
    bindAvatarFallbacks(container);
  }

  function optionRows() {
    return [...optionsList.querySelectorAll(".poll-option-input")];
  }

  function updateOptionRows() {
    const rows = [...optionsList.querySelectorAll(".poll-option-row")];
    rows.forEach((row, index) => {
      row.querySelector(".option-index").textContent = String(index + 1).padStart(2, "0");
      const input = row.querySelector(".poll-option-input");
      input.setAttribute("aria-label", `Option ${index + 1}`);
      input.placeholder = index === 0 ? "First option" : index === 1 ? "Second option" : `Option ${index + 1}`;
      row.querySelector(".remove-option-button").disabled = rows.length <= 2;
    });
    addOptionButton.disabled = rows.length >= 12;
    addOptionButton.textContent = rows.length >= 12 ? "Maximum of 12 options" : "+ Add another option";
  }

  function addOption(value = "") {
    if (optionRows().length >= 12) return;
    const row = document.createElement("div");
    row.className = "poll-option-row";
    row.innerHTML = `
      <span class="option-index"></span>
      <input class="poll-option-input" type="text" maxlength="100" placeholder="Option" required>
      <button class="remove-option-button" type="button" aria-label="Remove option">×</button>`;
    const input = row.querySelector("input");
    input.value = value;
    optionsList.appendChild(row);
    updateOptionRows();
    input.focus();
  }

  function makePollId(question) {
    const slug = question.toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 32) || "poll";
    const random = Math.random().toString(36).slice(2, 8);
    return `${slug}-${Date.now().toString(36)}-${random}`;
  }

  async function responseError(response) {
    let error = `Database request failed (${response.status}).`;
    try {
      const body = await response.json();
      if (body.message) error = body.message;
      else if (body.error_description) error = body.error_description;
    } catch (_) {
      // Keep the generic HTTP message.
    }
    return error;
  }

  function buildPoll() {
    const question = $("#poll-question").value.trim();
    const closingInput = $("#poll-closing-date").value;
    const description = $("#poll-description").value.trim();
    const specifications = $("#poll-specifications").value.trim();
    const options = optionRows().map((input) => input.value.trim());
    const normalizedOptions = options.map((option) => option.toLocaleLowerCase());
    const excluded = [...form.querySelectorAll('input[name="excluded"]:checked')]
      .map((input) => input.value);

    if (!question) throw new Error("Enter a question.");
    if (!closingInput) throw new Error("Choose a closing date and time.");
    const closingDate = new Date(closingInput);
    if (!Number.isFinite(closingDate.getTime())) throw new Error("The closing date is invalid.");
    if (closingDate.getTime() <= Date.now()) throw new Error("The closing date must be in the future.");
    if (options.length < 2 || options.some((option) => !option)) throw new Error("Enter at least two non-empty options.");
    if (new Set(normalizedOptions).size !== options.length) throw new Error("Each option must be unique.");

    return {
      id: makePollId(question),
      question,
      excluded,
      closing_date: closingDate.toISOString(),
      description: description || null,
      specifications: specifications || null,
      options,
      resolved: null,
      date_resolved: null
    };
  }

  async function createPoll(event) {
    event.preventDefault();
    if (isSubmitting) return;
    if (!configReady()) {
      showMessage("Add your Supabase Project URL and publishable/anon key to config.js.", "error");
      return;
    }

    let poll;
    try {
      poll = buildPoll();
    } catch (error) {
      showMessage(error.message, "error");
      return;
    }

    isSubmitting = true;
    submitButton.disabled = true;
    submitButton.textContent = "Creating poll…";
    showMessage("Saving poll…");

    try {
      const baseUrl = CONFIG.supabaseUrl.replace(/\/$/, "");
      const response = await fetch(`${baseUrl}/rest/v1/polls`, {
        method: "POST",
        headers: supabaseHeaders({
          "Content-Type": "application/json",
          Prefer: "return=minimal"
        }),
        body: JSON.stringify(poll)
      });
      if (!response.ok) throw new Error(await responseError(response));

      showMessage("Poll created. It will appear on the main page after you return.", "success");
      form.reset();
      const rows = [...optionsList.querySelectorAll(".poll-option-row")];
      rows.slice(2).forEach((row) => row.remove());
      updateOptionRows();
    } catch (error) {
      showMessage(`Could not create poll: ${error.message}`, "error");
    } finally {
      isSubmitting = false;
      submitButton.disabled = false;
      submitButton.textContent = "Create poll";
    }
  }

  async function initialize() {
    try {
      if (!configReady()) throw new Error("Supabase is not configured. Check config.js.");
      await loadUsers();
      const savedUsername = normalizeUsername(localStorage.getItem(SESSION_KEY));
      currentUser = users.find((user) => user.username === savedUsername);
      if (!currentUser) {
        window.location.replace("./index.html");
        return;
      }
      renderCurrentUser();
      renderExcludedUsers();
      updateOptionRows();
      const now = new Date();
      now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
      $("#poll-closing-date").min = now.toISOString().slice(0, 16);
    } catch (error) {
      showMessage(error.message, "error");
      submitButton.disabled = true;
    }
  }

  addOptionButton.addEventListener("click", () => addOption());
  optionsList.addEventListener("click", (event) => {
    const removeButton = event.target.closest(".remove-option-button");
    if (!removeButton || removeButton.disabled) return;
    removeButton.closest(".poll-option-row").remove();
    updateOptionRows();
  });
  form.addEventListener("submit", createPoll);

  initialize();
})();
