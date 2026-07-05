const COUNTRY_LIST = [
  "Laos", "Thailand", "Vietnam", "Cambodia", "Myanmar", "China", "Malaysia",
  "Singapore", "Indonesia", "Philippines", "Japan", "South Korea", "India",
  "United States", "United Kingdom", "France", "Germany", "Australia", "Other"
];

const Onboarding = (() => {
  const screen = document.getElementById("onboarding-screen");
  const nameInput = document.getElementById("onboard-name");
  const countrySelect = document.getElementById("onboard-country");
  const saveBtn = document.getElementById("onboard-save-btn");
  const errorEl = document.getElementById("onboard-error");

  function populateCountries() {
    countrySelect.innerHTML = COUNTRY_LIST
      .map((c) => `<option value="${c}">${c}</option>`)
      .join("");
    countrySelect.value = "Laos";
  }

  /**
   * @param {(profile: object) => void} onComplete
   * @param {{guest?: boolean}} [opts] - guest: true saves the profile only to
   *   this device (localStorage) instead of Firestore, since signing in with
   *   Google is optional in this app, not required.
   */
  function show(onComplete, opts = {}) {
    populateCountries();
    screen.classList.remove("hidden");
    errorEl.classList.add("hidden");

    const existing = opts.guest ? GuestProfile.get() : null;
    if (existing) {
      nameInput.value = existing.fullName || "";
      countrySelect.value = existing.country || "Laos";
    }

    saveBtn.onclick = async () => {
      const fullName = nameInput.value.trim();
      const country = countrySelect.value;
      if (!fullName) {
        errorEl.textContent = "Please enter your full name.";
        errorEl.classList.remove("hidden");
        return;
      }
      saveBtn.disabled = true;
      saveBtn.textContent = "Saving...";
      try {
        if (opts.guest) {
          const profile = { fullName, country, email: "", photoURL: "", mode: "guest" };
          GuestProfile.save(profile);
          screen.classList.add("hidden");
          onComplete(profile);
        } else {
          const user = fbAuth.currentUser;
          const profile = {
            fullName,
            country,
            email: user.email,
            photoURL: user.photoURL || "",
            createdAt: new Date().toISOString()
          };
          await Auth.saveProfile(user.uid, profile);
          screen.classList.add("hidden");
          onComplete(profile);
        }
      } catch (err) {
        errorEl.textContent = "Could not save profile: " + err.message;
        errorEl.classList.remove("hidden");
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = "Continue";
      }
    };
  }

  return { show };
})();

/**
 * Lightweight local-only profile store for guest mode (no Google sign-in,
 * no Firebase). Keeps the app fully usable offline and without an account,
 * matching an offline-first field tool.
 */
const GuestProfile = (() => {
  const KEY = "lfg_guest_profile";
  function get() {
    try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; }
  }
  function save(profile) {
    localStorage.setItem(KEY, JSON.stringify(profile));
  }
  function clear() {
    localStorage.removeItem(KEY);
  }
  return { get, save, clear };
})();
