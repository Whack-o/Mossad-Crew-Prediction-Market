(() => {
  "use strict";

  const CONFIG = window.PREDICTION_CONFIG || {};
  const $ = (selector) => document.querySelector(selector);
  const SESSION_KEY = "prediction-league-username";

  let users = [];
  let polls = [];
  let votes = [];
  let currentUser = null;
  let refreshTimer = null;
  let isSubmittingVote = false;

  const elements = {
    loginView: $("#login-view"),
    appView: $("#app-view"),
    loginForm: $("#login-form"),
    loginMessage: $("#login-message"),
    usernameInput: $("#username-input"),
    passwordInput: $("#password-input"),
    openPolls: $("#open-polls"),
    closedPolls: $("#closed-polls"),
    closedFilter: $("#closed-filter"),
    closedSort: $("#closed-sort"),
    modal: $("#spec-modal"),
    modalTitle: $("#modal-title"),
    modalContent: $("#modal-content")
  };

  function normalizeUsername(value) {
    return String(value || "").trim().toLowerCase();
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[character]);
  }

  function displayName(username) {
    const text = String(username || "");
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : "Unknown";
  }

  function isResolved(poll) {
    return poll.resolved !== undefined && poll.resolved !== null && poll.resolved !== "";
  }

  function closingTime(poll) {
    const value = Date.parse(poll.closingDate);
    return Number.isFinite(value) ? value : 0;
  }

  function pollState(poll, now = Date.now()) {
    if (isResolved(poll)) return "resolved";
    return closingTime(poll) > now ? "open" : "unresolved";
  }

  function isExcluded(poll, username = currentUser?.username) {
    const excluded = Array.isArray(poll.excluded) ? poll.excluded : [];
    const name = normalizeUsername(username);
    return excluded.some((item) => normalizeUsername(item) === name);
  }

  function formatDate(value, includeTime = false) {
    if (!value) return "Date not set";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Invalid date";
    return new Intl.DateTimeFormat(undefined, includeTime
      ? { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }
      : { month: "short", day: "numeric", year: "numeric" }
    ).format(date);
  }

  function avatarMarkup(user, extraClass = "") {
    const username = user?.username || "?";
    const initial = escapeHtml(displayName(username).slice(0, 1).toUpperCase());
    const classes = `avatar ${extraClass}`.trim();
    const avatar = String(user?.avatar || "").trim();
    if (!avatar) {
      return `<span class="${classes}" title="${escapeHtml(displayName(username))}" aria-label="${escapeHtml(displayName(username))}">${initial}</span>`;
    }
    return `<img class="${classes}" src="${escapeHtml(avatar)}" alt="${escapeHtml(displayName(username))}" title="${escapeHtml(displayName(username))}" data-avatar-initial="${initial}">`;
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

  function excludedAvatarsMarkup(poll) {
    const excludedNames = Array.isArray(poll.excluded) ? poll.excluded : [];
    const excludedUsers = excludedNames
      .map((username) => users.find((user) => normalizeUsername(user.username) === normalizeUsername(username)))
      .filter(Boolean);

    if (!excludedUsers.length) return "";

    const avatars = excludedUsers
      .map((user) => avatarMarkup(user, "excluded-avatar"))
      .join("");

    return `<div class="poll-excluded-players" aria-label="Excluded participants">
      <span class="poll-excluded-label">EXCLUDED</span>
      <span class="avatar-stack excluded-avatar-stack">${avatars}</span>
    </div>`;
  }

  function showLogin(message = "") {
    elements.loginView.hidden = false;
    elements.appView.hidden = true;
    $("#session-area").hidden = true;
    elements.loginMessage.textContent = message;
    currentUser = null;
  }

  function showApp() {
    elements.loginView.hidden = true;
    elements.appView.hidden = false;
    $("#session-area").hidden = false;
    renderAll();
  }

  function toast(message, type = "success") {
    const region = $("#toast-region");
    const item = document.createElement("div");
    item.className = `toast ${type}`;
    item.textContent = message;
    region.appendChild(item);
    window.setTimeout(() => item.remove(), 3600);
  }

  function showCurrentUser() {
    const area = $("#current-user");
    if (!currentUser) {
      area.textContent = "";
      return;
    }
    area.innerHTML = `${avatarMarkup(currentUser)}<span>Logged in as ${escapeHtml(displayName(currentUser.username))}</span>`;
    bindAvatarFallbacks(area);
  }

  function pollVotes(pollId) {
    return votes.filter((vote) => vote.poll_id === pollId);
  }

  function voteForUser(pollId, username = currentUser?.username) {
    const normalized = normalizeUsername(username);
    return votes.find((vote) => vote.poll_id === pollId && normalizeUsername(vote.username) === normalized);
  }

  function computeLeaderboard() {
    const resolvedPolls = polls.filter(isResolved);
    const stats = users.map((user) => {
      let wins = 0;
      let losses = 0;
      for (const poll of resolvedPolls) {
        if (isExcluded(poll, user.username)) continue;
        const vote = voteForUser(poll.id, user.username);
        if (vote && vote.choice === poll.resolved) wins += 1;
        else losses += 1;
      }
      const total = wins + losses;
      return { user, wins, losses, total, accuracy: total ? wins / total : null };
    });

    stats.sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      const accuracyA = a.accuracy ?? -1;
      const accuracyB = b.accuracy ?? -1;
      if (accuracyB !== accuracyA) return accuracyB - accuracyA;
      if (b.total !== a.total) return b.total - a.total;
      return a.user.username.localeCompare(b.user.username);
    });
    return { stats, resolvedCount: resolvedPolls.length };
  }

  function renderLeaderboard() {
    const { stats, resolvedCount } = computeLeaderboard();
    $("#player-count").textContent = `${users.length} players`;
    $("#resolved-count").textContent = `${resolvedCount} resolved polls`;
    const body = $("#leaderboard-body");

    if (!stats.length) {
      body.innerHTML = '<tr><td colspan="5" class="empty-cell">No players are configured in users.json.</td></tr>';
      return;
    }

    body.innerHTML = stats.map((item, index) => {
      const mine = item.user.username === currentUser?.username;
      const accuracy = item.accuracy === null ? "—" : `${(item.accuracy * 100).toFixed(1)}%`;
      return `<tr class="${mine ? "current-player" : ""}">
        <td><span class="rank-number ${index === 0 ? "rank-first" : ""}">${index + 1}</span></td>
        <td><span class="player-cell">${avatarMarkup(item.user)}<span>${escapeHtml(displayName(item.user.username))}${mine ? ' <span class="muted">(you)</span>' : ""}</span></span></td>
        <td class="numeric stat-positive">${item.wins}</td>
        <td class="numeric ${item.losses ? "stat-negative" : ""}">${item.losses}</td>
        <td class="numeric">${accuracy}</td>
      </tr>`;
    }).join("");
    bindAvatarFallbacks(body);
  }

  function optionMarkup(poll, option, optionVotes, state, myVote) {
    const totalVotes = pollVotes(poll.id).length;
    const percentage = totalVotes ? Math.round((optionVotes.length / totalVotes) * 100) : 0;
    const isMine = myVote?.choice === option;
    const isCorrect = state === "resolved" && poll.resolved === option;
    const disabled = state !== "open" || isExcluded(poll);
    const avatars = optionVotes
      .map((vote) => users.find((user) => normalizeUsername(user.username) === normalizeUsername(vote.username)))
      .filter(Boolean)
      .map((user) => avatarMarkup(user, "voter-avatar"))
      .join("");
    const classes = ["option-button", isMine ? "is-mine" : "", isCorrect ? "is-correct" : ""].filter(Boolean).join(" ");
    const label = `${option}; ${optionVotes.length} votes; ${percentage} percent${isMine ? "; your prediction" : ""}${isCorrect ? "; correct answer" : ""}`;

    return `<button type="button" class="${classes}" data-poll-id="${escapeHtml(poll.id)}" data-option="${escapeHtml(option)}" aria-label="${escapeHtml(label)}" ${disabled ? "disabled" : ""}>
      <span class="option-main">
        <span class="option-name"><span class="option-check">✓</span><span class="option-name-text">${escapeHtml(option)}</span></span>
        <span class="option-aside"><span class="avatar-stack">${avatars}</span><span class="option-percent">${percentage}%</span></span>
      </span>
      <span class="option-bar"><span class="option-bar-fill" style="width:${percentage}%"></span></span>
    </button>`;
  }

  function pollCardMarkup(poll, now = Date.now()) {
    const state = pollState(poll, now);
    const closed = state !== "open";
    const excluded = isExcluded(poll);
    const selectedVote = voteForUser(poll.id);
    const allVotes = pollVotes(poll.id);
    const options = Array.isArray(poll.options) ? poll.options : [];
    const optionButtons = options.map((option) => {
      const votesForOption = allVotes.filter((vote) => vote.choice === option);
      return optionMarkup(poll, option, votesForOption, state, selectedVote);
    }).join("");
    const eligibleCount = users.filter((user) => !isExcluded(poll, user.username)).length;
    const cardClass = state === "resolved" ? "poll-card resolved-card" : closed ? "poll-card closed-card" : "poll-card";
    const status = state === "resolved"
      ? '<span class="market-status resolved">● Resolved</span>'
      : state === "unresolved"
        ? '<span class="market-status closed">● Closed · unresolved</span>'
        : '<span class="market-status">● Open</span>';
    const dateText = state === "resolved"
      ? `Resolved ${formatDate(poll.dateResolved)}`
      : `Closes ${formatDate(poll.closingDate, true)}`;

    let footerLeft = "Choose an option to make your prediction.";
    if (excluded) footerLeft = '<span class="poll-excluded-note">You are excluded from this poll.</span>';
    else if (state === "resolved") {
      footerLeft = selectedVote
        ? `Your prediction: ${escapeHtml(selectedVote.choice)}${selectedVote.choice === poll.resolved ? " · Correct" : " · Incorrect"}`
        : "You did not submit a prediction · Loss";
    } else if (state === "unresolved") {
      footerLeft = selectedVote ? `Your prediction: ${escapeHtml(selectedVote.choice)}` : "No prediction submitted · Counts as a loss if resolved";
    } else if (selectedVote) {
      footerLeft = `<span class="your-pick">Your prediction: ${escapeHtml(selectedVote.choice)}</span> · You can change it until closing.`;
    }

    const description = poll.description
      ? `<p class="poll-description">${escapeHtml(poll.description)}</p>`
      : "";
    const specifications = poll.specifications
      ? `<div class="poll-spec-row"><button class="spec-button" type="button" data-spec-poll-id="${escapeHtml(poll.id)}">ⓘ Additional specifications</button></div>`
      : "";

    const excludedAvatars = excludedAvatarsMarkup(poll);

    return `<article class="${cardClass}${excluded ? " excluded-card" : ""}">
      <div class="poll-topline">${status}<span class="poll-date">${escapeHtml(dateText)}</span></div>
      ${excludedAvatars}
      <h2 class="poll-question">${escapeHtml(poll.question)}</h2>
      ${description}
      ${specifications}
      <div class="options-list">${optionButtons}</div>
      <div class="option-footer"><span>${footerLeft}</span><span>${allVotes.length} / ${eligibleCount} votes</span></div>
    </article>`;
  }

  function renderPolls() {
    const now = Date.now();
    const open = polls.filter((poll) => pollState(poll, now) === "open");
    let closed = polls.filter((poll) => pollState(poll, now) !== "open");
    const filter = elements.closedFilter.value;
    const sort = elements.closedSort.value;

    if (filter === "resolved") closed = closed.filter(isResolved);
    if (filter === "unresolved") closed = closed.filter((poll) => !isResolved(poll));

    closed.sort((a, b) => {
      if (sort === "closing-oldest") return closingTime(a) - closingTime(b);
      if (sort === "resolved-newest") return (Date.parse(b.dateResolved || "") || 0) - (Date.parse(a.dateResolved || "") || 0);
      if (sort === "resolved-oldest") return (Date.parse(a.dateResolved || "") || 0) - (Date.parse(b.dateResolved || "") || 0);
      return closingTime(b) - closingTime(a);
    });

    $("#open-poll-count").textContent = String(open.length);
    $("#closed-poll-count").textContent = String(polls.filter((poll) => pollState(poll, now) !== "open").length);
    elements.openPolls.innerHTML = open.length
      ? open.map((poll) => pollCardMarkup(poll, now)).join("")
      : '<div class="no-polls">There are no open polls right now.</div>';
    elements.closedPolls.innerHTML = closed.length
      ? closed.map((poll) => pollCardMarkup(poll, now)).join("")
      : '<div class="no-polls">No polls match this filter.</div>';
    bindAvatarFallbacks(elements.openPolls);
    bindAvatarFallbacks(elements.closedPolls);
  }

  function renderAll() {
    showCurrentUser();
    renderLeaderboard();
    renderPolls();
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

  async function readPolls() {
    const fields = "id,question,excluded,closing_date,description,specifications,options,resolved,date_resolved";
    const url = `${CONFIG.supabaseUrl.replace(/\/$/, "")}/rest/v1/polls?select=${fields}&order=closing_date.desc&limit=1000`;
    const response = await fetch(url, { headers: supabaseHeaders(), cache: "no-store" });
    if (!response.ok) throw new Error(await responseError(response));
    const data = await response.json();
    polls = (Array.isArray(data) ? data : []).map((row) => ({
      id: row.id,
      question: row.question,
      excluded: Array.isArray(row.excluded) ? row.excluded : [],
      closingDate: row.closing_date,
      description: row.description || "",
      specifications: row.specifications || "",
      options: Array.isArray(row.options) ? row.options : [],
      resolved: row.resolved ?? null,
      dateResolved: row.date_resolved ?? null
    }));
    validatePolls();
  }

  async function readVotes() {
    const url = `${CONFIG.supabaseUrl.replace(/\/$/, "")}/rest/v1/votes?select=username,poll_id,choice,updated_at&limit=1000`;
    const response = await fetch(url, { headers: supabaseHeaders(), cache: "no-store" });
    if (!response.ok) throw new Error(await responseError(response));
    const data = await response.json();
    votes = Array.isArray(data) ? data : [];
  }

  async function responseError(response) {
    let message = `Database request failed (${response.status}).`;
    try {
      const body = await response.json();
      if (body.message) message = body.message;
      else if (body.error_description) message = body.error_description;
    } catch (_) {
      // Keep the generic HTTP error when the response is not JSON.
    }
    return message;
  }

  async function submitVote(poll, choice) {
    if (isSubmittingVote) return;
    if (pollState(poll) !== "open") {
      toast("Voting has closed for this poll.", "error");
      await refreshData();
      return;
    }
    if (isExcluded(poll)) {
      toast("You are excluded from this poll.", "error");
      return;
    }
    if (!poll.options.includes(choice)) {
      toast("That option is not part of this poll.", "error");
      return;
    }

    isSubmittingVote = true;
    const buttons = document.querySelectorAll(`[data-poll-id="${CSS.escape(poll.id)}"]`);
    buttons.forEach((button) => { button.disabled = true; });

    try {
      const endpoint = `${CONFIG.supabaseUrl.replace(/\/$/, "")}/rest/v1/votes?on_conflict=username%2Cpoll_id`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: supabaseHeaders({
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=minimal"
        }),
        body: JSON.stringify({
          username: currentUser.username,
          poll_id: poll.id,
          choice,
          updated_at: new Date().toISOString()
        })
      });
      if (!response.ok) throw new Error(await responseError(response));
      await readVotes();
      renderAll();
      toast(`Prediction saved: ${choice}.`);
    } catch (error) {
      toast(`Could not save prediction: ${error.message}`, "error");
      await refreshData();
    } finally {
      isSubmittingVote = false;
      renderPolls();
    }
  }

  async function refreshData(showToast = false) {
    try {
      await Promise.all([readPolls(), readVotes()]);
      renderAll();
      $("#last-updated").textContent = `Updated ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
      if (showToast) toast("Polls and votes refreshed.");
    } catch (error) {
      if (showToast) toast(`Refresh failed: ${error.message}`, "error");
      else console.error("Could not refresh polls and votes:", error);
    }
  }

  function openSpecifications(pollId) {
    const poll = polls.find((item) => item.id === pollId);
    if (!poll || !poll.specifications) return;
    elements.modalTitle.textContent = poll.question;
    elements.modalContent.textContent = poll.specifications;
    elements.modal.hidden = false;
    $("#modal-close").focus();
  }

  function closeSpecifications() {
    elements.modal.hidden = true;
  }

  function validateUsers() {
    const usernames = new Set();
    for (const user of users) {
      const username = normalizeUsername(user.username);
      if (!username) throw new Error("Every user in users.json needs a username.");
      if (usernames.has(username)) throw new Error(`Duplicate username in users.json: ${username}`);
      if (typeof user.password !== "string" || !user.password) {
        throw new Error(`User "${username}" needs a password in users.json.`);
      }
      usernames.add(username);
    }
  }

  function validatePolls() {
    const pollIds = new Set();
    for (const poll of polls) {
      if (!poll.id || !poll.question || !Array.isArray(poll.options) || poll.options.length < 2) {
        throw new Error(`Poll "${poll.question || poll.id || "(unnamed)"}" needs an ID, question, and at least two options. Check the polls table in Supabase.`);
      }
      if (pollIds.has(poll.id)) throw new Error(`Duplicate poll ID in the Supabase polls table: ${poll.id}`);
      pollIds.add(poll.id);
      if (!Number.isFinite(Date.parse(poll.closingDate))) {
        throw new Error(`Poll "${poll.question}" has an invalid closing_date in Supabase.`);
      }
      if (isResolved(poll) && !poll.options.includes(poll.resolved)) {
        throw new Error(`The resolved answer for "${poll.question}" must exactly match one of its options.`);
      }
      if (!Array.isArray(poll.excluded)) {
        throw new Error(`The excluded field for "${poll.question}" must be an array of usernames.`);
      }
    }
  }

  async function loadJson(path) {
    const response = await fetch(`${path}?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Could not load ${path} (${response.status}).`);
    return response.json();
  }

  async function initialize() {
    try {
      if (!configReady()) {
        showLogin("Add your Supabase Project URL and publishable/anon key to config.js, then reload.");
        return;
      }
      users = await loadJson("./users.json");
      if (!Array.isArray(users)) throw new Error("users.json must contain a JSON array.");
      users = users.map((user) => ({ ...user, username: normalizeUsername(user.username) }));
      validateUsers();
      await Promise.all([readPolls(), readVotes()]);
      const savedUsername = normalizeUsername(localStorage.getItem(SESSION_KEY));
      const savedUser = users.find((user) => user.username === savedUsername);
      if (savedUser) {
        currentUser = savedUser;
        showApp();
      } else {
        localStorage.removeItem(SESSION_KEY);
        showLogin();
      }
      if (refreshTimer) window.clearInterval(refreshTimer);
      const interval = Math.max(10000, Number(CONFIG.refreshIntervalMs) || 15000);
      refreshTimer = window.setInterval(() => {
        if (currentUser && document.visibilityState === "visible") refreshData(false);
        if (currentUser) renderPolls(); // Update automatic closing when a deadline passes.
      }, interval);
      $("#last-updated").textContent = `Updated ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
    } catch (error) {
      console.error(error);
      showLogin(`Setup error: ${error.message}`);
    }
  }

  elements.loginForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const username = normalizeUsername(elements.usernameInput.value);
    const password = elements.passwordInput.value;
    const user = users.find((item) => item.username === username && item.password === password);
    if (!user) {
      elements.loginMessage.textContent = "Incorrect username or password.";
      elements.passwordInput.select();
      return;
    }
    currentUser = user;
    localStorage.setItem(SESSION_KEY, user.username);
    elements.passwordInput.value = "";
    elements.loginMessage.textContent = "";
    showApp();
  });

  $("#logout-button").addEventListener("click", () => {
    localStorage.removeItem(SESSION_KEY);
    showLogin();
  });

  elements.openPolls.addEventListener("click", (event) => {
    const specButton = event.target.closest("[data-spec-poll-id]");
    if (specButton) {
      openSpecifications(specButton.dataset.specPollId);
      return;
    }
    const optionButton = event.target.closest("button[data-poll-id][data-option]");
    if (!optionButton || optionButton.disabled) return;
    const poll = polls.find((item) => item.id === optionButton.dataset.pollId);
    if (poll) submitVote(poll, optionButton.dataset.option);
  });

  elements.closedPolls.addEventListener("click", (event) => {
    const specButton = event.target.closest("[data-spec-poll-id]");
    if (specButton) openSpecifications(specButton.dataset.specPollId);
  });

  elements.closedFilter.addEventListener("change", renderPolls);
  elements.closedSort.addEventListener("change", renderPolls);
  $("#refresh-button").addEventListener("click", () => refreshData(true));
  $("#modal-close").addEventListener("click", closeSpecifications);
  elements.modal.addEventListener("click", (event) => {
    if (event.target === elements.modal) closeSpecifications();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !elements.modal.hidden) closeSpecifications();
  });

  initialize();
})();
