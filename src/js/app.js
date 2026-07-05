const App = (() => {
  const loginScreen = document.getElementById("login-screen");
  const appScreen = document.getElementById("app-screen");
  const scrim = document.getElementById("scrim");
  const sideMenu = document.getElementById("side-menu");
  const featureListEl = document.getElementById("feature-list");
  let isGuestSession = false;

  function showScreen(el) {
    [loginScreen, document.getElementById("onboarding-screen"), appScreen].forEach((s) => s.classList.add("hidden"));
    el.classList.remove("hidden");
  }

  function closeAllMenus() {
    document.querySelectorAll(".floating-menu").forEach((m) => m.classList.add("hidden"));
  }

  function closeSideMenu() {
    sideMenu.classList.add("hidden");
    scrim.classList.add("hidden");
  }

  async function bootAppScreen(profile, guest = false) {
    isGuestSession = guest;
    showScreen(appScreen);
    if (!map) {
      initMap();
      GisTools.wireMapEvents();
      await GisTools.loadSavedFeatures();
      HUD.initCompass();
    } else {
      // Screen was hidden (e.g. returning from sign-out); re-measure so the
      // map fills its container correctly again on both desktop and phone.
      setTimeout(() => map.invalidateSize(), 50);
    }
    document.getElementById("profile-name").textContent = profile.fullName || "Field Surveyor";
    document.getElementById("profile-country").textContent = profile.country || (guest ? "Guest (local only)" : "");
    document.getElementById("profile-pic").src = profile.photoURL || "favicon.svg";
    document.getElementById("upgrade-account-item").classList.toggle("hidden", !guest);
  }

  async function refreshFeatureList() {
    const all = await LocalStore.getAllFeatures();
    if (!all.length) {
      featureListEl.innerHTML = `<div class="feature-row">No features saved yet.</div>`;
      return;
    }
    featureListEl.innerHTML = all
      .map(
        (f) => `<div class="feature-row" data-id="${f.id}">
          <span>${f.type === "waypoint" ? "📌" : f.type === "line" || f.type === "track" ? "➖" : "⬠"} ${f.properties.name}</span>
          <button data-del="${f.id}">Delete</button>
        </div>`
      )
      .join("");
    featureListEl.querySelectorAll("button[data-del]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        const id = e.target.getAttribute("data-del");
        await GisTools.deleteFeatureById(id);
        refreshFeatureList();
      });
    });
  }

  function wireUI() {
    // --- Google sign-in (optional — see guest-continue-btn below) ---
    document.getElementById("google-signin-btn").addEventListener("click", async () => {
      try {
        await Auth.signIn();
      } catch (err) {
        Toast.show ? Toast.show("Sign-in failed: " + err.message) : alert(err.message);
      }
    });

    // --- Skip login entirely: use the app as a local-only guest ---
    document.getElementById("guest-continue-btn").addEventListener("click", () => {
      showScreen(document.getElementById("onboarding-screen"));
      Onboarding.show((profile) => bootAppScreen(profile, true), { guest: true });
    });

    document.getElementById("signout-btn").addEventListener("click", () => {
      if (isGuestSession) {
        // "Sign out" of a guest session just returns to the login screen;
        // the collected data stays safely in IndexedDB on this device.
        isGuestSession = false;
        showScreen(loginScreen);
      } else {
        Auth.signOut();
      }
    });

    document.getElementById("upgrade-account-item").addEventListener("click", async () => {
      closeSideMenu();
      try {
        await Auth.signIn(); // triggers Auth.onAuthChanged -> real onboarding with Firestore
      } catch (err) {
        Toast.show("Sign-in failed: " + err.message);
      }
    });

    // --- Top bar / side menu ---
    document.getElementById("menu-btn").addEventListener("click", () => {
      sideMenu.classList.remove("hidden");
      scrim.classList.remove("hidden");
    });
    scrim.addEventListener("click", closeSideMenu);
    document.getElementById("feature-list-item").addEventListener("click", () => {
      featureListEl.classList.toggle("hidden");
      refreshFeatureList();
    });
    document.getElementById("pdf-calibrate-item").addEventListener("click", () => {
      closeSideMenu();
      ImportExport.pickFile("pdf");
    });

    // --- FABs ---
    document.getElementById("fab-locate").addEventListener("click", () => HUD.requestPermissionAndLocate(map));
    document.getElementById("fab-layers").addEventListener("click", () => {
      const menu = document.getElementById("layers-menu");
      const willOpen = menu.classList.contains("hidden");
      closeAllMenus();
      if (willOpen) menu.classList.remove("hidden");
    });
    document.getElementById("fab-tools").addEventListener("click", () => {
      const menu = document.getElementById("tools-menu");
      const willOpen = menu.classList.contains("hidden");
      closeAllMenus();
      if (willOpen) menu.classList.remove("hidden");
    });
    document.getElementById("fab-data").addEventListener("click", () => {
      const menu = document.getElementById("data-menu");
      const willOpen = menu.classList.contains("hidden");
      closeAllMenus();
      if (willOpen) menu.classList.remove("hidden");
    });

    // --- Layer menu ---
    document.querySelectorAll('input[name="basemap"]').forEach((radio) => {
      radio.addEventListener("change", (e) => setBasemap(map, e.target.value));
    });
    document.getElementById("toggle-features").addEventListener("change", (e) => {
      if (e.target.checked) featureLayer.addTo(map); else map.removeLayer(featureLayer);
    });
    document.getElementById("toggle-pdf-overlay").addEventListener("change", (e) => {
      if (e.target.checked) pdfOverlayLayer.addTo(map); else map.removeLayer(pdfOverlayLayer);
    });

    // --- Tools menu ---
    document.querySelectorAll(".tool-btn[data-tool]").forEach((btn) => {
      btn.addEventListener("click", () => GisTools.activate(btn.getAttribute("data-tool"), btn));
    });

    // --- Coordinate system selector ---
    document.getElementById("coord-format").addEventListener("change", (e) => HUD.setCoordSystem(e.target.value));

    // --- Import / export menu ---
    document.querySelectorAll(".tool-btn[data-import]").forEach((btn) => {
      btn.addEventListener("click", () => ImportExport.pickFile(btn.getAttribute("data-import")));
    });
    document.getElementById("data-menu").querySelector('[data-export="gpx"]').addEventListener("click", ImportExport.exportGPX);
    document.getElementById("data-menu").querySelector('[data-export="kml"]').addEventListener("click", ImportExport.exportKML);
    document.getElementById("data-menu").querySelector('[data-export="csv"]').addEventListener("click", ImportExport.exportCSV);
    document.getElementById("data-menu").querySelector('[data-export="geojson"]').addEventListener("click", ImportExport.exportGeoJSON);

    // Tap on map closes open floating menus (keeps the field UI uncluttered)
    document.getElementById("map").addEventListener("click", () => closeAllMenus());
  }

  function init() {
    wireUI();

    // If this device already completed guest onboarding, skip straight to
    // the map — no Google sign-in and no network call required at all.
    // The Firebase auth listener below stays attached in case the person
    // later chooses "Sign in with Google to back up data" from the menu.
    const savedGuest = GuestProfile.get();
    if (savedGuest) {
      bootAppScreen(savedGuest, true);
    }

    Auth.onAuthChanged(async (user) => {
      if (!user) {
        if (!GuestProfile.get()) showScreen(loginScreen);
        return;
      }
      try {
        const profile = await Auth.getProfile(user.uid);
        if (!profile || !profile.fullName || !profile.country) {
          showScreen(document.getElementById("onboarding-screen"));
          Onboarding.show((savedProfile) => {
            GuestProfile.clear(); // now backed by a real account, drop the local-only flag
            bootAppScreen(savedProfile, false);
          });
        } else {
          GuestProfile.clear();
          await bootAppScreen(profile, false);
        }
      } catch (err) {
        console.error("Profile lookup failed:", err);
        Toast?.show?.("Could not reach the profile database. Working offline.");
        await bootAppScreen({ fullName: user.displayName, country: "", photoURL: user.photoURL }, false);
      }
    });
  }

  return { init, refreshFeatureList };
})();

document.addEventListener("DOMContentLoaded", App.init);
